/* The Receipts ledger's paywall: a free viewer never gets the size or dollar profit of a deal that hasn't settled,
 * on the page or in the CSV; settled history is public. */
import { describe, expect, it } from "vitest";
import { hiddenFor, toCsv, type LedgerRow } from "@/lib/ledger";
import { VENUE_NAME, type Opportunity } from "@/lib/types";

const opp = (profit: number): Opportunity => ({
  id: "o", kind: "cross_arb", title: "Deal", legs: [
    { venue: "kalshi", marketId: "k", side: "yes", label: "Yes", url: "", contracts: 100, avgPrice: 0.55, worstPrice: 0.55, cost: 55, fee: 1 },
    { venue: "polymarket_us", marketId: "p", side: "no", label: "No", url: "", contracts: 100, avgPrice: 0.4, worstPrice: 0.4, cost: 40, fee: 1 },
  ], sets: 100, cost: 95, fees: 2, payout: 100, profit, roi: profit / 97, days: 3, profitPerDay: profit / 3, safety: "green", safetyNotes: [],
  categories: ["sports"], closeTime: null, pairId: null, gapCents: null,
});
const row = (id: number, settled: boolean, profit: number): LedgerRow => ({
  id, oppId: `o${id}`, snapshot: opp(profit), detectedAt: Date.UTC(2026, 9, 20), settledAt: settled ? Date.UTC(2026, 9, 21) : null,
  sameWay: settled ? true : null, realizedProfit: settled ? profit : null, results: null, lifeMs: null,
});

describe("ledger paywall", () => {
  it("hides an open deal's dollars from free viewers only", () => {
    expect(hiddenFor(row(1, false, 3.17), true)).toBe(true);
    expect(hiddenFor(row(1, true, 3.17), true)).toBe(false);
    expect(hiddenFor(row(1, false, 3.17), false)).toBe(false);
  });
  it("the free CSV carries no open deal's size or profit", () => {
    const csv = toCsv([row(1, false, 3.17), row(2, true, 2.25)], VENUE_NAME, true);
    const open = csv.split("\r\n")[1]!;
    expect(open).not.toContain("3.17");
    expect(open).not.toContain("97.00");
    expect(csv).toContain("2.25");
    expect(csv).toContain("members only");
    expect(toCsv([row(1, false, 3.17)], VENUE_NAME, false)).toContain("3.17");
  });
});
