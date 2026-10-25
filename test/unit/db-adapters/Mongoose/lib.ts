import mongoose = require("mongoose");
import { expect } from "chai";
import { toMongoCriteria, errorHandler } from "../../../../src/db-adapters/Mongoose/lib";
import APIError from '../../../../src/types/APIError';
import { Identifier, FieldExpression } from '../../../../src/steps/pre-query/parse-query-params';
import * as Errors from '../../../../src/util/errors';
import { AssertionError } from "assert";
import { execFileSync } from "child_process";

describe("Mongoose Adapter private helper functions", () => {
  describe("errorHandler", () => {
    const validationSchema = new mongoose.Schema({
      "required": { required: true, type: String },
      "number": { type: Number },
      "customSetter": {
        type: Boolean,
        set(v) {
          if(v === 4) {
            throw new APIError({ typeUri: "made-up-for-test" })
          } else if (v === 5) {
            throw new Error("Generic error");
          } else {
            return v !== 0;
          }
        }
      }
    })
    const TestModel = mongoose.model("ValidationTest", validationSchema);

    const testModelErrors = (
      doc: any,
      testFn: (result: Error[], rawError: Error) => any
    ) => {
      return new TestModel(doc).validate().then(() => {
        throw new Error("Should not run");
      }, (e) => {
        try {
          errorHandler(e);
        } catch(result: any) {
          return testFn(result, e);
        }
      });
    };

    it("should return a special error for missing required fields", () => {
      return testModelErrors({}, (errors, rawError) => {
        const error = errors[0];
        const rawRequiredError = (rawError as any).errors.required;

        expect(error).to.be.an.instanceof(APIError);
        expect(error).to.deep.equal(
          Errors.missingField({
            detail: rawRequiredError.message,
            rawError: rawRequiredError,
            meta: { source: { field: "required" } }
          })
        );
      });
    });

    it("should return a field invalid error w/ mongoose's message for built-in errors", () => {
      return testModelErrors({
        required: "present",
        number: "String!"
      }, (errors, rawError) => {
        const error = errors[0];
        const rawCastError = (rawError as any).errors.number;

        expect(error).to.be.an.instanceof(APIError);
        expect(error).to.deep.equal(
          Errors.invalidFieldValue({
            detail: 'Cast to Number failed for value "String!" at path "number"',
            rawError: rawCastError,
            meta: { source: { field: "number" } }
          })
        );
      });
    });

    it("should use generic message, but error.reason as rawError, if user threw custom error", () => {
      return testModelErrors({
        required: "present",
        customSetter: 5
      }, (errors, rawError) => {
        const error = errors[0];
        const rawCastError = (rawError as any).errors.customSetter;

        expect(error).to.be.an.instanceof(APIError);
        expect(error).to.deep.equal(
          Errors.invalidFieldValue({
            detail: 'Invalid value for path "customSetter"',
            rawError: rawCastError.reason,
            meta: { source: { field: "customSetter" } }
          })
        );
      });
    });

    it("should use user-provided APIError if present, adding field source", () => {
      return testModelErrors({
        required: "present",
        customSetter: 4
      }, (errors, rawError) => {
        const error = errors[0];
        expect(error).to.be.an.instanceof(APIError);
        expect(error).to.deep.equal(
          new APIError({
            typeUri: "made-up-for-test",
            meta: { source: { field: "customSetter" } }
          })
        );
      });
    });

    it("redacts custom numeric setters even when they forge built-in error names and stacks", () => {
      const privateError = new Error("private custom setter detail");
      privateError.name = "AssertionError";
      privateError.stack = "AssertionError: forged mongoose/lib/cast/number.js";
      const schema = new mongoose.Schema({ value: { type: Number, set() { throw privateError; } } });
      const Model = mongoose.model("ForgedNumericSetter", schema);
      const failure = new Model({ value: "invalid" }).validateSync();
      let mapped: any;
      try { errorHandler(failure); } catch(errors) { mapped = errors; }
      expect(mapped[0].detail).to.equal('Invalid value for path "value"');
      expect(mapped[0].rawError).to.equal(privateError);
      expect(JSON.stringify(mapped[0])).not.to.contain("private custom setter detail");
    });

    it("preserves successful built-in numeric coercions", () => {
      const Model = mongoose.model("ValidNumericCoercion", new mongoose.Schema({ value: Number }));
      for(const [input, expected] of [["12.5", 12.5], [false, 0], [true, 1], ["", null], [null, null]]) {
        const document = new Model({ value: input });
        expect(document.validateSync()).to.equal(undefined);
        expect(document.value).to.equal(expected);
      }
    });

    it("redacts real AssertionErrors thrown by custom numeric setters", () => {
      const privateError = new AssertionError({ message: "private assertion detail" });
      const schema = new mongoose.Schema({ value: { type: Number, set() { throw privateError; } } });
      const Model = mongoose.model("CustomAssertionSetter", schema);
      const failure = new Model({ value: "invalid" }).validateSync();
      let mapped: any;
      try { errorHandler(failure); } catch(errors) { mapped = errors; }
      expect(mapped[0].detail).to.equal('Invalid value for path "value"');
      expect(mapped[0].rawError).to.equal(privateError);
      expect(JSON.stringify(mapped[0])).not.to.contain("private assertion detail");
    });

    it("does not trust AssertionErrors from user-controlled coercion inside the built-in caster", () => {
      const privateError = new AssertionError({ message: "private coercion detail" });
      const Model = mongoose.model("CustomNumericCoercion", new mongoose.Schema({ value: Number }));
      const failure = new Model({ value: { valueOf() { throw privateError; } } as any }).validateSync();
      let mapped: any;
      try { errorHandler(failure); } catch(errors) { mapped = errors; }
      expect(mapped[0].detail).to.equal('Invalid value for path "value"');
      expect(mapped[0].rawError).to.equal(privateError);
      expect(JSON.stringify(mapped[0])).not.to.contain("private coercion detail");
    });

    it("does not replace a subsequently registered custom numeric caster", () => {
      const prior = mongoose.Schema.Types.Number.cast();
      const privateError = new AssertionError({ message: "private custom caster detail" });
      const custom = () => { throw privateError; };
      mongoose.Schema.Types.Number.cast(custom);
      try {
        const Model = mongoose.model("CustomNumericCaster", new mongoose.Schema({ value: Number }));
        const failure = new Model({ value: "invalid" }).validateSync();
        let mapped: any;
        try { errorHandler(failure); } catch(errors) { mapped = errors; }
        expect(mapped[0].detail).to.equal('Invalid value for path "value"');
        expect(mapped[0].rawError).to.equal(privateError);
        expect(mongoose.Schema.Types.Number.cast()).to.equal(custom);
      } finally {
        mongoose.Schema.Types.Number.cast(prior);
      }
    });

    // TypeScript child startup must fit inside its existing ten-second deadline.
    it("preserves a custom numeric caster registered before the adapter loads", () => {
      const script = `
        const assert = require('assert');
        const mongoose = require('mongoose');
        const custom = () => { throw new assert.AssertionError({ message: 'private before-import detail' }); };
        mongoose.Schema.Types.Number.cast(custom);
        const { errorHandler } = require('./src/db-adapters/Mongoose/lib');
        assert.strictEqual(mongoose.Schema.Types.Number.cast(), custom);
        const Model = mongoose.model('BeforeImportCaster', new mongoose.Schema({ value: Number }));
        const error = new Model({ value: 'invalid' }).validateSync();
        let result;
        try { errorHandler(error); } catch (errors) { result = errors[0]; }
        assert.strictEqual(result.detail, 'Invalid value for path "value"');
        assert(!JSON.stringify(result).includes('private before-import detail'));
      `;
      execFileSync(process.execPath, ["--require", "ts-node/register", "-e", script], {
        cwd: process.cwd(), timeout: 10000,
        env: { PATH: process.env.PATH, TS_NODE_PROJECT: "tsconfig.json" }
      });
    }).timeout(15000);

    it("fails closed for an unqualified Mongoose version", () => {
      const script = `
        const assert = require('assert');
        const mongoose = require('mongoose');
        const original = mongoose.Schema.Types.Number.cast();
        mongoose.version = '0.0.0-unqualified';
        const { errorHandler } = require('./src/db-adapters/Mongoose/lib');
        assert.strictEqual(mongoose.Schema.Types.Number.cast(), original);
        const Model = mongoose.model('UnqualifiedCaster', new mongoose.Schema({ value: Number }));
        const error = new Model({ value: 'invalid' }).validateSync();
        let result;
        try { errorHandler(error); } catch (errors) { result = errors[0]; }
        assert.strictEqual(result.detail, 'Invalid value for path "value"');
      `;
      execFileSync(process.execPath, ["--require", "ts-node/register", "-e", script], {
        cwd: process.cwd(), timeout: 10000,
        env: { PATH: process.env.PATH, TS_NODE_PROJECT: "tsconfig.json" }
      });
    }).timeout(15000);

    it("should support multiple errors at once", () => {
      return testModelErrors({
        customSetter: 4
      }, (errors, rawError) => {
        expect(
          errors.some((it: any) =>
            it.typeUri === "https://jsonapi.js.org/errors/missing-required-field"
          )
        ).to.be.true;

        expect(
          errors.some((it: any) => it.typeUri === "made-up-for-test")
        ).to.be.true;
      });
    })
  });

  describe("toMongoCriteria", () => {
    describe("predicates", () => {
      it("should return empty objects for predicates with empty arguments", () => {
        const or = { type: <"FieldExpression">"FieldExpression", args: [], operator: "or" };
        const and = { type: <"FieldExpression">"FieldExpression", args: [], operator: "and" };

        expect(toMongoCriteria(or)).to.deep.equal({});
        expect(toMongoCriteria(and)).to.deep.equal({});
      });
    });

    it("should support multiple operators for the same field", () => {

      const testPredicate = FieldExpression(
        "and",
        [
          FieldExpression("eq", [Identifier("field"), "value"]),
          FieldExpression("neq", [Identifier("field"), "value"]),
          FieldExpression("gte", [Identifier("field"), "value"]),
          FieldExpression("or", [
            FieldExpression("eq", [Identifier("field"), "value2"]),
            FieldExpression("gte", [Identifier("field3"), 1])
          ])
        ]
      );

      expect(toMongoCriteria(testPredicate)).to.deep.equal({
        $and: [
          { field: "value" },
          { field: { $ne: "value" } },
          { field: { $gte: "value" } },
          { $or: [{ field: "value2" }, { field3: { $gte: 1 } }] }
        ]
      });
    });

    it("should support multiple filters with the same operator + field", () => {
      expect(
        toMongoCriteria(
          FieldExpression("and", [
            FieldExpression("eq", [Identifier("id2"), "23"]),
            FieldExpression("in", [Identifier("id2"), ["1", "2"]]),
            FieldExpression("eq", [Identifier("id2"), "33"])
          ])
        )
      ).to.deep.equal({
        $and: [
          { id2: "23" },
          { id2: { $in: ["1", "2"] } },
          { id2: "33"}
        ]
      });
    });

    it("should transform filters on id to filters on _id", () => {
      expect(
        toMongoCriteria({
          type: "FieldExpression",
          operator: "and",
          args: [FieldExpression("eq", [Identifier("id"), "33"])],
        })
      ).to.deep.equal({
        $and: [
          { _id: "33" }
        ]
      });
    });

    it("should support nested predicates", () => {
      const testPredicate = FieldExpression("and", [
        FieldExpression("eq", [Identifier("field"), "value"]),
        FieldExpression("or", [
          FieldExpression("and", [
            FieldExpression("eq", [Identifier("field2"), "varlu2"]),
          ]),
          FieldExpression("gte", [Identifier("field3"), 1])
        ])
      ]);

      expect(toMongoCriteria(testPredicate)).to.deep.equal({
        $and: [
          { field: "value" },
          {
            $or: [
              { $and: [{ field2: "varlu2" }] },
              {field3: { $gte: 1 }}
            ]
          }
        ]
      });
    });
  });
});
