/* lib/home/curate.ts: what a newcomer sees on the home page, and how it is said. */
import { describe, expect, it } from "vitest";
import { compactDollars, homeCopy, isMainstream, niceName, trimTitle } from "@/lib/home/curate";
import type { Move } from "@/lib/moves/types";

const mv = (o: Partial<Move>): Move => ({
  id: "x", source: "polymarket", marketId: "m", eventTitle: "", marketTitle: "", outcome: "Yes", outcomeSide: "yes", amount: 50_000, avgPrice: 0.5,
  wallet: "0x1", walletName: null, at: 0, lastAt: 0, fills: 1, tab: "markets", league: null, category: "other", url: null, result: null, settledAt: null, ...o,
} as Move);

describe("home curation", () => {
  it("keeps major leagues, major soccer, politics, the economy and well-known stocks", () => {
    expect(isMainstream(mv({ tab: "sports", league: "NBA", marketTitle: "Spread: Thunder (-8.5)", outcome: "Suns" }))).toBe(true);
    expect(isMainstream(mv({ marketTitle: "Torino FC vs. Como 1907: O/U 2.5", outcome: "Over" }))).toBe(true);
    expect(isMainstream(mv({ marketTitle: "Will the Democratic Party control the House after the 2026 midterms?" }))).toBe(true);
    expect(isMainstream(mv({ marketTitle: "Will the Fed increase interest rates by 25 bps after the December meeting?" }))).toBe(true);
    expect(isMainstream(mv({ tab: "stocks", source: "sec", detail: { kind: "insider", company: "Apple Inc.", ticker: "AAPL" } as Move["detail"] }))).toBe(true);
  });
  it("drops esports, crypto, parlays, small leagues, obscure stocks and anything under $10k", () => {
    expect(isMainstream(mv({ marketTitle: "Counter-Strike: Vitality vs Natus Vincere (BO3)", outcome: "Vitality" }))).toBe(false);
    expect(isMainstream(mv({ marketTitle: "Dota 2: BetBoom Team vs LEGION (BO1)" }))).toBe(false);
    expect(isMainstream(mv({ marketTitle: "Will Bitcoin dip to $50,000 by December 31, 2026?" }))).toBe(false);
    expect(isMainstream(mv({ marketTitle: "yes San Antonio,yes Drake Batherson: 1+" }))).toBe(false);
    expect(isMainstream(mv({ marketTitle: "Will Bradford City AFC win on 2026-10-27?" }))).toBe(false);
    expect(isMainstream(mv({ tab: "sports", league: "other", marketTitle: "Arthur Fils wins", outcome: "Arthur Fils" }))).toBe(false);
    expect(isMainstream(mv({ tab: "stocks", source: "sec", detail: { kind: "insider", company: "Pluri Inc.", ticker: "PLUR" } as Move["detail"] }))).toBe(false);
    expect(isMainstream(mv({ tab: "sports", league: "NFL", amount: 9_999 }))).toBe(false);
  });
  it("says it short, with company names in normal case and the ticker", () => {
    expect(niceName("NIPPON LIFE INSURANCE")).toBe("Nippon Life");
    expect(niceName("Corebridge Financial, Inc.")).toBe("Corebridge");
    expect(homeCopy(mv({ tab: "stocks", source: "sec", amount: 8_700_000, detail: { kind: "insider", company: "Corebridge Financial, Inc.", ticker: "CRBG", ownerName: "NIPPON LIFE INSURANCE", tradeDate: "2026-10-22", filedAt: Date.parse("2026-10-24T15:00:00Z"), pricePerShare: 35 } as Move["detail"] }), "x"))
      .toEqual({ line: "Nippon Life bought $8.7M of Corebridge (CRBG)", context: "Traded Oct 22 · filed Oct 24" });
    expect(homeCopy(mv({ tab: "sports", league: "NBA", amount: 566_682, marketTitle: "Spread: Thunder (-8.5)", outcome: "Suns" }), "googleplay"))
      .toEqual({ line: "googleplay put $566,682 on Suns", context: "Spread: Thunder (-8.5)" });
    expect(trimTitle("Will the Democratic Party control the House after the 2026 midterm elections?")).toBe("Democratic Party control the House after the…");
    expect(trimTitle("Will AS Roma win on 2026-10-27?")).toBe("AS Roma win");
    expect(compactDollars(48_120)).toBe("$48K");
    expect(compactDollars(1_240_000)).toBe("$1.2M");
  });
});
