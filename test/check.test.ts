/* Check my bet (lib/check): prices to chances, matching legs to markets and sides, verdicts and the parlay summary,
 * pasted links and tickers, and reading a slip (the API stood in by recorded readings of the ten test slips,
 * scripts/slips/fixtures.ts; scripts/check-slips.ts reads the same images with the real model). */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "@/lib/moves/copy";
import { CheckError, readPasted, readSlip, SLIP_JSON_SCHEMA, toLeg, CHECK_MODEL } from "@/lib/check/extract";
import { bestMatch, kindOf, sideOf, type Candidate } from "@/lib/check/match";
import { asChance, chanceFrom } from "@/lib/check/odds";
import { legVerdict, parlaySummary, stockVerdict, VERDICT_TEXT } from "@/lib/check/verdict";
import { SLIPS } from "../scripts/slips/fixtures";

const NOW = Date.UTC(2026, 8, 12, 15);
const cand = (o: Partial<Candidate> & Pick<Candidate, "marketId" | "title">): Candidate => ({ source: "polymarket", eventTitle: null, yesLabel: "Yes", noLabel: "No", closeTime: NOW + 6 * 3_600_000, yesPrice: 0.5, ...o });
const MARKETS: Candidate[] = [
  cand({ marketId: "ml", title: "Brewers vs. Cubs", eventTitle: "Brewers vs. Cubs", yesLabel: "Brewers", noLabel: "Cubs", yesPrice: 0.55 }),
  cand({ marketId: "tot", title: "Brewers vs. Cubs: O/U 8.5", eventTitle: "Brewers vs. Cubs", yesLabel: "Over", noLabel: "Under", yesPrice: 0.48 }),
  cand({ marketId: "tot9", title: "Brewers vs. Cubs: O/U 9.5", eventTitle: "Brewers vs. Cubs", yesLabel: "Over", noLabel: "Under" }),
  cand({ marketId: "sp", title: "Spread: Chiefs (-3.5)", eventTitle: "Chiefs vs. Bills", yesLabel: "Chiefs", noLabel: "Bills", closeTime: NOW + 30 * 3_600_000 }),
  cand({ marketId: "fed", title: "Will the Fed cut rates in December?", eventTitle: "Fed decision in December", closeTime: NOW + 90 * 86_400_000 }),
  cand({ marketId: "nfl", title: "Chiefs vs. Bills", eventTitle: "Chiefs vs. Bills", yesLabel: "Chiefs", noLabel: "Bills", closeTime: NOW + 30 * 3_600_000 }),
];
const draftkings = SLIPS.find(s => s.book === "DraftKings")!.expect.legs.map(toLeg);

describe("the slip's price as a chance", () => {
  it("American, decimal, fractional, cents and percent", () => {
    expect(chanceFrom("+150")).toBeCloseTo(0.4);
    expect(chanceFrom("-200")).toBeCloseTo(2 / 3);
    expect(chanceFrom("−110")).toBeCloseTo(110 / 210);
    expect(chanceFrom("2.50")).toBeCloseTo(0.4);
    expect(chanceFrom("3/2")).toBeCloseTo(0.4);
    expect(chanceFrom("45¢")).toBeCloseTo(0.45);
    expect(chanceFrom("$0.62")).toBeCloseTo(0.62);
    expect(chanceFrom("45%")).toBeCloseTo(0.45);
    expect([chanceFrom(null), chanceFrom("even"), chanceFrom("0.5")]).toEqual([null, null, null]);
    expect(asChance(0.4)).toBe("40%");
    expect(asChance(2 / 3)).toBe("66.7%");
  });
});

describe("matching each leg to a market", () => {
  it("the DraftKings parlay: moneyline, total and spread each find their own market and side", () => {
    const [ml, total, spread] = draftkings;
    expect(bestMatch(ml!, MARKETS, NOW)?.c.marketId).toBe("ml");
    expect(sideOf(ml!, MARKETS[0]!)).toBe("yes");
    expect(bestMatch(total!, MARKETS, NOW)?.c.marketId).toBe("tot"); // 8.5, never the 9.5 line
    expect(sideOf(total!, MARKETS[1]!)).toBe("yes");
    expect(bestMatch(spread!, MARKETS, NOW)?.c.marketId).toBe("sp"); // the line market, not the winner
    expect(sideOf(spread!, MARKETS[3]!)).toBe("yes");
  });

  it("yes/no contracts, under on a total, and nothing when nothing fits", () => {
    const kalshi = toLeg(SLIPS.find(s => s.book === "Kalshi")!.expect.legs[0]!);
    expect(bestMatch(kalshi, MARKETS, NOW)?.c.marketId).toBe("fed");
    expect(sideOf({ ...kalshi, selection: "No" }, MARKETS[4]!)).toBe("no");
    expect(sideOf({ ...draftkings[1]!, selection: "Under", overUnder: "under" }, MARKETS[1]!)).toBe("no");
    const nhl = SLIPS.find(s => s.book === "Fanatics Sportsbook")!.expect.legs.map(toLeg);
    expect(bestMatch(nhl[0]!, MARKETS, NOW)).toBeNull();
    // A game that closed days before the slip's date isn't it.
    expect(bestMatch(ml(draftkings[0]!, "2026-10-12"), MARKETS, NOW)).toBeNull();
  });

  it("kinds of venue markets", () => {
    expect(MARKETS.map(kindOf)).toEqual(["moneyline", "total", "total", "spread", "yes_no", "moneyline"]);
  });
});
function ml(l: ReturnType<typeof toLeg>, date: string) { return { ...l, date }; }

describe("verdicts", () => {
  it("proven money first, else all big money, else nothing", () => {
    expect(legVerdict("yes", 0.81, null)).toEqual({ verdict: "with", basis: "proven", share: 0.81 });
    expect(legVerdict("no", 0.81, null).verdict).toBe("against");
    expect(legVerdict("yes", 0.5, { yes: 1e6, no: 0 }).verdict).toBe("split");
    expect(legVerdict("yes", null, { yes: 70_000, no: 30_000 })).toMatchObject({ verdict: "with", basis: "big" });
    expect(legVerdict("yes", null, { yes: 7_000, no: 0 })).toEqual({ verdict: "none", basis: null, share: null });
    expect(stockVerdict({ insiderBuys: 3, insiderSells: 0, fundsAdding: 1, fundsCutting: 0 })).toBe("with");
    expect(stockVerdict({ insiderBuys: 0, insiderSells: 2, fundsAdding: 0, fundsCutting: 1 })).toBe("against");
    expect(stockVerdict({ insiderBuys: 1, insiderSells: 0, fundsAdding: 0, fundsCutting: 2 })).toBe("split");
    expect(stockVerdict({ insiderBuys: 0, insiderSells: 0, fundsAdding: 0, fundsCutting: 0 })).toBe("none");
  });

  it("the parlay in one line", () => {
    expect(parlaySummary(["against", "with", "against"])).toBe("2 of 3 legs have smart money against you.");
    expect(parlaySummary(["against", "with", "with"])).toBe("1 of 3 legs has smart money against you.");
    expect(parlaySummary(["with", "with"])).toBe("Smart money is with you on every leg.");
    expect(parlaySummary(["none", "none"])).toBe("No big money on any leg yet.");
    expect(parlaySummary(["split", "none"])).toBe("1 of 2 legs is split.");
    expect(parlaySummary(["with"])).toBe("Smart money with you.");
    for (const t of [...Object.values(VERDICT_TEXT), parlaySummary(["against", "with", "split"])]) for (const b of BANNED_WORDS) expect(t).not.toMatch(b);
  });
});

describe("pasted links and tickers", () => {
  it("Polymarket and Kalshi links, tickers, and anything else", () => {
    expect(readPasted("https://polymarket.com/event/fed-decision-in-december/will-the-fed-cut-25bps")).toEqual({ kind: "polymarket", slug: "fed-decision-in-december", market: "will-the-fed-cut-25bps" });
    expect(readPasted("polymarket.com/event/nba-lal-bos-2026-10-30")).toEqual({ kind: "polymarket", slug: "nba-lal-bos-2026-10-30", market: null });
    expect(readPasted("https://kalshi.com/markets/kxfeddecision/fed-meeting/kxfeddecision-26dec-c25")).toEqual({ kind: "kalshi", ticker: "KXFEDDECISION-26DEC-C25" });
    expect(readPasted("$nvda")).toEqual({ kind: "ticker", ticker: "NVDA" });
    expect(readPasted("BRK.B")).toEqual({ kind: "ticker", ticker: "BRK.B" });
    expect(readPasted("who wins tonight?")).toBeNull();
  });
});

describe("reading a slip", () => {
  const spendStore = () => { const s = { spent: 0, month: async () => 0, add: async (u: number) => { s.spent += u; } }; return s; };
  const stand = (reply: unknown, stop = "end_turn") => {
    const calls: Array<Record<string, unknown>> = [];
    return { calls, beta: { messages: { create: async (p: Record<string, unknown>) => { calls.push(p); return { stop_reason: stop, usage: { input_tokens: 1500, output_tokens: 400 }, content: [{ type: "text", text: JSON.stringify(reply) }] }; } } } };
  };

  it("all ten test slips exist and their readings are in the required shape", async () => {
    expect(SLIPS).toHaveLength(10);
    expect(new Set(SLIPS.map(s => s.book)).size).toBe(10);
    for (const s of SLIPS) {
      expect(existsSync(`test/fixtures/slips/${s.file}`), s.file).toBe(true);
      const api = stand(s.expect);
      const got = await readSlip({ data: "AAAA", mediaType: "image/png" }, spendStore(), api as never);
      expect(got).toEqual(s.expect);
    }
  });

  it("asks the right model with the image, a fixed JSON shape and a fallback; records what it cost", async () => {
    const api = stand(SLIPS[0]!.expect), spend = spendStore();
    await readSlip({ data: "AAAA", mediaType: "image/jpeg" }, spend, api as never);
    const p = api.calls[0]!;
    expect(p.model).toBe(CHECK_MODEL);
    expect(CHECK_MODEL).toBe("claude-sonnet-5-5");
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect((p.output_config as { format: { schema: unknown } }).format.schema).toBe(SLIP_JSON_SCHEMA);
    expect(JSON.stringify(p.messages)).toContain(`"media_type":"image/jpeg"`);
    expect(spend.spent).toBeCloseTo((1500 * 2 + 400 * 10) / 1e6);
  });

  it("not a slip, a refusal, a broken reply, the monthly cap", async () => {
    await expect(readSlip({ data: "A", mediaType: "image/png" }, spendStore(), stand({ is_bet_slip: false, book: null, legs: [], total_stake: null }) as never)).rejects.toMatchObject({ code: "not_a_slip" });
    await expect(readSlip({ data: "A", mediaType: "image/png" }, spendStore(), stand({}, "refusal") as never)).rejects.toMatchObject({ code: "refused" });
    await expect(readSlip({ data: "A", mediaType: "image/png" }, spendStore(), stand({ legs: "x" }) as never)).rejects.toBeInstanceOf(CheckError);
    const capped = { month: async () => 1e9, add: async () => undefined };
    await expect(readSlip({ data: "A", mediaType: "image/png" }, capped, stand(SLIPS[0]!.expect) as never)).rejects.toMatchObject({ code: "budget" });
  });
});
