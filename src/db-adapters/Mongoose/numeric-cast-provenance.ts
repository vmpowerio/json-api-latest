import mongoose = require("mongoose");
import { AssertionError } from "assert";

// Only the actual built-in caster's primitive-input failures are display-safe.
// Names/stacks and user-defined coercion methods cannot establish provenance.
// The canonical function identity is unavailable through Mongoose's public API.
// tslint:disable-next-line no-submodule-imports
import builtInCast = require("mongoose/lib/cast/number");
const failures = new WeakMap<object, unknown>();
const numberType = mongoose.Schema.Types.Number;

if(mongoose.version === "6.13.11" && numberType.cast() === builtInCast) {
  numberType.cast((value: unknown) => {
    try {
      return builtInCast(value);
    } catch(error) {
      if((typeof value === "number" || typeof value === "string" || typeof value === "boolean")
        && error instanceof AssertionError) {
        failures.set(error, value);
      }
      throw error;
    }
  });
}

export function isBuiltInNumericCastFailure(error): boolean {
  return error instanceof mongoose.Error.CastError && error.kind === "Number"
    && !!error.reason && failures.has(error.reason)
    && Object.is(failures.get(error.reason), error.value);
}
