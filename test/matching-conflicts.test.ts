/* Matcher rules that keep different outcomes apart (Price gaps): the vice presidency is not the presidency, and a
 * price that reaches a level at any time is not a price measured at a set time. Both reject before any LLM. */
import { describe, expect, it } from "vitest";
import { extractEntities, findCandidates, hardConflictsFor } from "./helpers/conflicts";
import { mk } from "./fixtures/matching/markets";

const close = Date.UTC(2028, 10, 7, 12);

describe("vice president vs president", () => {
  const pres = mk("kalshi", "PRES-VANCE", { title: "Will JD Vance win the 2028 presidential election?", closeTime: close, category: "Politics" });
  const vp = mk("polymarket", "vp-vance", { title: "Will JD Vance be elected Vice President in 2028?", closeTime: close, category: "Politics" });
  const vpShort = mk("polymarket", "vp-nominee", { title: "Republican VP nominee 2028: JD Vance?", closeTime: close, category: "Politics" });
  it("marks the office", () => {
    expect(extractEntities(vp).conditions).toContain("vice-president");
    expect(extractEntities(vp).conditions).not.toContain("president");
    expect(extractEntities(vpShort).conditions).toContain("vice-president");
    expect(extractEntities(pres).conditions).not.toContain("vice-president");
  });
  it("never pairs them", () => {
    expect(hardConflictsFor(pres, vp).join()).toMatch(/different conditions/);
    expect(findCandidates([pres], [vp]).every(c => c.decision === "reject")).toBe(true);
  });
  it("still pairs the same office", () => {
    const vp2 = mk("kalshi", "VP-VANCE", { title: "Will JD Vance be the next Vice President?", closeTime: close, category: "Politics" });
    expect(hardConflictsFor(vp2, vp).join()).not.toMatch(/different conditions/);
  });
});

describe("at a set time vs any time", () => {
  const at5 = mk("kalshi", "KXBTC-5PM", { title: "Bitcoin above $100,000 on Nov 1, 2026 at 5pm ET?", closeTime: Date.UTC(2026, 10, 1, 21), category: "Crypto",
    rules: "If the price of Bitcoin is above $100,000 at 5:00 PM ET on November 1, 2026, the market resolves to Yes." });
  const reach = mk("polymarket", "btc-reach-100k", { title: "Will Bitcoin reach $100,000 by November 1?", closeTime: Date.UTC(2026, 10, 1, 21), category: "Crypto",
    rules: "This market resolves to Yes if any Binance 1 minute candle for BTCUSDT has a final High price equal to or above $100,000 before the deadline." });
  const closeOnly = mk("polymarket", "btc-close", { title: "Bitcoin closing price above $100,000 on November 1?", closeTime: Date.UTC(2026, 10, 1, 21), category: "Crypto" });
  it("reads how the price is measured", () => {
    expect(extractEntities(at5).measure).toBe("at_time");
    expect(extractEntities(reach).measure).toBe("any_time");
    expect(extractEntities(closeOnly).measure).toBe("at_time");
  });
  it("rejects a set time against any time", () => {
    expect(hardConflictsFor(at5, reach)).toContain("any time vs a set time");
    expect(findCandidates([at5], [reach]).every(c => c.decision === "reject")).toBe(true);
  });
  it("leaves two set-time markets alone", () => {
    expect(hardConflictsFor(at5, closeOnly)).not.toContain("any time vs a set time");
  });
});
