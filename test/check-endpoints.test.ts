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
    ["Polymarket CLOB POST /books", "clob-books.json"],
    ["Polymarket Data GET /trades", "data-trades.json"],
  ])("%s matches %s", (prefix, file) => {
    expect(shapeErrors(fx(file), fields(prefix))).toEqual([]);
  });

  it("Polymarket Gamma GET /events/keyset matches gamma-events.json wrapped in a keyset page", () => {
    expect(shapeErrors({ events: fx("gamma-events.json"), next_cursor: "c1" }, fields("Polymarket Gamma GET /events/keyset"))).toEqual([]);
  });

  it("fails loudly on a renamed or retyped field", () => {
    const trades = fx("data-trades.json") as Array<Record<string, unknown>>;
    const renamed = trades.map(({ proxyWallet, ...t }) => ({ ...t, wallet: proxyWallet }));
    expect(shapeErrors(renamed, fields("Polymarket Data GET /trades"))).toEqual([expect.stringContaining("[].proxyWallet should be string")]);
    expect(shapeErrors([{ ...trades[0], price: "n/a" }], ["[].price:numeric"])).toHaveLength(1);
    expect(shapeErrors({ orderbook: {} }, fields("Kalshi GET /markets/{ticker}/orderbook"))).toHaveLength(1);
  });
});
