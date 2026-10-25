import { expect } from "chai";
import DocumentationController from "../../src/controllers/Documentation";
import ResourceTypeRegistry from "../../src/ResourceTypeRegistry";
import Maybe, { Just, Nothing } from "../../src/types/Generic/Maybe";
import { entries, values } from "../../src/util/objectValueEntries";

describe("toolchain compatibility", () => {
  it("keeps Maybe's recursive default-export calls callable", () => {
    expect(Maybe(2).map(value => value + 1).getOrDefault()).to.equal(3);
    expect(Maybe(2).bind(value => value + 2).getOrDefault()).to.equal(4);
    expect(Maybe(2).bind(value => new Just(value + 3)).getOrDefault()).to.equal(5);
    expect(Maybe(undefined)).to.be.instanceof(Nothing);
    expect(Maybe(null).getOrDefault()).to.equal(null);
  });

  it("preserves own enumerable string keys and array values", () => {
    const input = Object.create({ inherited: "excluded" });
    input.list = [1, 2];
    input.value = 3;
    Object.defineProperty(input, "hidden", { value: "excluded" });
    input[Symbol("symbol")] = "excluded";
    expect(entries(input)).to.deep.equal([["list", [1, 2]], ["value", 3]]);
    expect(values(input)).to.deep.equal([[1, 2], 3]);
  });

  it("renders the real documentation template with escaped API names", async () => {
    const controller = new DocumentationController(new ResourceTypeRegistry({}), { name: "<script>fixture</script>" });
    const result = await controller.handle({ accepts: "text/html" } as any, {} as any, {} as any);
    expect(result.status).to.equal(200);
    expect(result.headers["content-type"]).to.equal("text/html");
    expect(result.body).to.contain("&lt;script&gt;fixture&lt;/script&gt; Documentation");
    expect(result.body).not.to.contain("<script>fixture</script>");
    expect(result.body).to.contain("Usage Overview");
  });

  it("preserves documentation JSON negotiation", async () => {
    const controller = new DocumentationController(new ResourceTypeRegistry({}), { name: "fixture" });
    const result = await controller.handle({ accepts: "application/vnd.api+json" } as any, {} as any, {} as any);
    expect(result.headers["content-type"]).to.equal("application/vnd.api+json");
    expect(JSON.parse(result.body as string).data).to.deep.equal([]);
  });
});
