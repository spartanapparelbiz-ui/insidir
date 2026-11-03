/* The live shape check, run over the documented response fixtures: every field it requires is one the fixtures
 * (and the parsers) use, and a renamed field is caught. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKS, shapeErrors } from "../scripts/check-endpoints";

const fx = (f: string): unknown => JSON.parse(readFileSync(join(__dirname, "fixtures", "exchanges", f), "utf8"));
const fields = (prefix: string): string[] => CHECKS.find(c => c.name.startsWith(prefix))!.fields;

describe("endpoint shape check", () => {
  it.each([
    ["Kalshi GET /markets?", "kalshi-markets-page1.json"],
    ["Kalshi GET /events", "kalshi-events.json"],
    ["Kalshi GET /series", "kalshi-series.json"],
    ["Kalshi GET /markets/{ticker}/orderbook", "kalshi-orderbook-dollars.json"],
    ["Kalshi GET /markets/{ticker}/orderbook", "kalshi-orderbook-cents.json"],
    ["Polymarket Gamma GET /events", "gamma-events.json"],
    ["Polymarket CLOB POST /books", "clob-books.json"],
    ["Polymarket Data GET /v2/trades", "data-trades-v2.json"],
  ])("%s matches %s", (prefix, file) => {
    expect(shapeErrors(fx(file), fields(prefix))).toEqual([]);
  });

  it("fails loudly on a renamed or retyped field", () => {
    const page = fx("data-trades-v2.json") as { data: Array<Record<string, unknown>> };
    const renamed = { ...page, data: page.data.map(({ proxy_wallet, ...t }) => ({ ...t, wallet: proxy_wallet })) };
    expect(shapeErrors(renamed, fields("Polymarket Data GET /v2/trades"))).toEqual([expect.stringContaining("data[].proxy_wallet should be string")]);
    expect(shapeErrors([{ ...page.data[0], price: "n/a" }], ["[].price:numeric"])).toHaveLength(1);
    expect(shapeErrors({ orderbook: {} }, fields("Kalshi GET /markets/{ticker}/orderbook"))).toHaveLength(1);
  });
});
