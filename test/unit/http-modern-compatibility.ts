import { expect } from "chai";
import BaseStrategy from "../../src/http-strategies/Base";
import ExpressStrategy from "../../src/http-strategies/Express";
import KoaStrategy from "../../src/http-strategies/Koa";

class RequestStrategy extends BaseStrategy {
  public request(encrypted: boolean, url: string, protocol = "") {
    return this.buildRequestObject({ url, method: "GET", headers: {}, socket: { encrypted } } as any,
      protocol, "example.invalid", { type: "items" });
  }
}

describe("modern HTTP compatibility", () => {
  it("keeps socket protocol fallback and raw query slicing exact", async () => {
    const strategy = new RequestStrategy({} as any);
    const secure = await strategy.request(true, "/items?filter[name]=a=b");
    expect(secure.uri).to.equal("https://example.invalid/items?filter[name]=a=b");
    expect(secure.rawQueryString).to.equal("filter[name]=a=b");
    expect(secure.queryParams).to.deep.equal({ filter: { name: "a=b" } });
    const plain = await strategy.request(false, "/items");
    expect(plain.uri).to.equal("http://example.invalid/items");
    expect(plain.rawQueryString).to.equal(undefined);
    expect((await strategy.request(false, "/items?", "https")).uri).to.equal("https://example.invalid/items?");
  });

  it("preserves Express UTF-8 response bytes and bodyless completion", () => {
    const sent: Buffer[] = [];
    let ends = 0;
    let status: number | undefined;
    const transport = {
      status(code) { status = code; }, set() { return; },
      send(body) { sent.push(body); return transport; }, end() { ends++; }
    };
    const strategy = new ExpressStrategy({} as any) as any;
    strategy.sendResponse({ status: 201, headers: {}, body: "é 😀" }, transport, () => undefined);
    expect(status).to.equal(201);
    expect(sent[0]).to.deep.equal(Buffer.from("é 😀", "utf8"));
    strategy.sendResponse({ status: 204, headers: {} }, transport, () => undefined);
    expect(sent.length).to.equal(1);
    expect(ends).to.equal(2);
  });

  it("preserves the existing Koa strategy byte conversion and status callback", () => {
    let status: number | undefined;
    const context: any = { status(code) { status = code; }, res: { set() { return; } } };
    const strategy = new KoaStrategy({} as any) as any;
    strategy.sendResources({ status: 200, headers: {}, body: "é 😀" }, context);
    expect(context.body).to.deep.equal(Buffer.from("é 😀", "utf8"));
    const empty: any = { status(code) { status = code; }, res: { set() { return; } } };
    strategy.sendResources({ status: 204, headers: {} }, empty);
    expect(status).to.equal(204);
    expect(empty.body).to.equal(undefined);
  });
});
