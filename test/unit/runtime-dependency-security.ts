import { expect } from "chai";
import ResourceTypeRegistry from "../../src/ResourceTypeRegistry";
import BaseStrategy from "../../src/http-strategies/Base";
import { minimalDummyAdapter } from "./fixtures";

// Exercise the actual conversion and request parsing boundaries without a DB
// or listening socket. The hostile query is deliberately bounded to 1000.
class QueryStrategy extends BaseStrategy {
  protected async getParsedBodyJSON(req: any): Promise<any> {
    return undefined;
  }

  public parse(query: string) {
    return this.buildRequestObject({
      url: "/items?" + query,
      method: "GET",
      headers: {},
      connection: {}
    } as any, "https", "example.invalid", { type: "items" });
  }
}

describe("runtime dependency security", () => {
  it("keeps description keys from changing the prototype of registry output", () => {
    const info = JSON.parse('{"description":"ordinary","__proto__":{"securityCanary":true}}');
    const registry = new ResourceTypeRegistry({ items: { info } }, {
      dbAdapter: minimalDummyAdapter
    });
    const result = registry.info("items") as any;
    expect(result.description).to.equal("ordinary");
    expect(result.securityCanary).to.equal(undefined);
    expect(Object.getPrototypeOf(result)).to.equal(Object.prototype);
  });

  it("preserves JSON API query structure through the real request strategy", async () => {
    const request = await new QueryStrategy({} as any).parse(
      "filter[name]=sample&page[offset]=2&include=owner"
    );
    expect(request.queryParams).to.deep.equal({
      filter: { name: "sample" }, page: { offset: "2" }, include: "owner"
    });
    expect(request.type).to.equal("items");
    expect(request.method).to.equal("get");
  });

  it("ignores prototype query segments without constructing a sparse array", async () => {
    const request = await new QueryStrategy({} as any).parse(
      "a[__proto__]=b&a[__proto__]&a[length]=1000"
    );
    expect(request.queryParams).to.deep.equal({ a: { length: "1000" } });
  });
});
