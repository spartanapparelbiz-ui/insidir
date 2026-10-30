/* Followable returns (lib/follow), Open now's grouping, plain headlines and Positioning's new rules. Pure. */
import { describe, expect, it } from "vitest";
import { crossedAt, followPrice, followRecord, followRoi, hundredLine, MIN_SETTLED, priceAt, roiText, SLIPPAGE } from "@/lib/follow/math";
import { dedupe } from "@/lib/follow/open";
import { isWinner } from "@/lib/follow/records";
import { headlineOf } from "@/lib/moves/headline";
import { bigMoneySplit, crowdSplit, edgeOf, positioningPublic, POSITION_DAYS, SCORE_MIN, smartOf } from "@/lib/smart/splits";

const H = 3_600_000, DAY = 24 * H;

describe("followable returns", () => {
  it("follows at the shown price plus one point; nothing left to win at 99%+", () => {
    expect(SLIPPAGE).toBe(0.01);
    expect(followPrice(0.4)).toBeCloseTo(0.41);
    expect(followPrice(0.99)).toBeNull();
    expect(followPrice(null)).toBeNull();
    expect(followPrice(0)).toBeNull();
  });
  it("$100 on every settled position: a win at 41¢ pays 100/0.41, a loss loses the 100; void and unpriced are left out", () => {
    const r = followRecord([{ price: 0.4, result: "won" }, { price: 0.6, result: "lost" }, { price: 0.5, result: "void" }, { price: null, result: "won" }, { price: 0.3, result: null }]);
    expect(r).toMatchObject({ n: 2, won: 1, lost: 1, staked: 200 });
    expect(r.net).toBeCloseTo(100 / 0.41 - 100 - 100);
    expect(followRoi(r)).toBeNull(); // under 30 settled
    expect(MIN_SETTLED).toBe(30);
  });
  it("the $100 line and ROI read plainly, with − for a loss", () => {
    expect(hundredLine({ staked: 3000, net: 420.4 })).toBe("$100 on every position since we started tracking: $3,000 in, +$420 back.");
    expect(hundredLine({ staked: 3000, net: -150 })).toBe("$100 on every position since we started tracking: $3,000 in, −$150 back.");
    expect(roiText(140, 1000)).toBe("+14.0%");
    expect(roiText(-55, 1000)).toBe("−5.5%");
  });
  it("a winner: positive followable net on 30+ settled", () => {
    expect(isWinner({ n: 30, won: 20, lost: 10, staked: 3000, net: 1 })).toBe(true);
    expect(isWinner({ n: 29, won: 20, lost: 9, staked: 2900, net: 500 })).toBe(false);
    expect(isWinner({ n: 40, won: 10, lost: 30, staked: 4000, net: -1 })).toBe(false);
  });
  it("the side's price at a moment, from a YES history; Momentum's crossing after it was shown", () => {
    const h = [{ t: 0, p: 0.4 }, { t: H, p: 0.42 }, { t: 2 * H, p: 0.47 }, { t: 3 * H, p: 0.5 }];
    expect(priceAt(h, 1.5 * H, "yes")).toBe(0.42);
    expect(priceAt(h, 1.5 * H, "no")).toBeCloseTo(0.58);
    expect(priceAt(h, -10 * 60_000, "yes")).toBe(0.4); // first point within 30 minutes after
    expect(priceAt(h, 20 * H, "yes")).toBeNull(); // nothing within 6 hours before
    expect(crossedAt(h, 0, "yes", 0.42, 0.05)).toEqual({ t: 2 * H, p: 0.47 });
    expect(crossedAt(h, 0, "no", 0.6, 0.05)).toBeNull();
  });
});

describe("Open now and the home page", () => {
  it("one row per account, market and side within an hour, amounts added", () => {
    const m = (id: string, wallet: string | null, marketId: string, side: "yes" | "no", amount: number, at: number) => ({ id, wallet, marketId, outcomeSide: side, amount, at });
    const out = dedupe([m("a", "w1", "x", "yes", 10, 0), m("b", "w1", "x", "yes", 5, 30 * 60_000), m("c", "w1", "x", "no", 7, 0), m("d", "w1", "x", "yes", 3, 3 * H), m("e", null, "x", "yes", 2, 0), m("f", null, "x", "yes", 2, 0)]);
    // b and a merge (same account, side and market, 30 minutes apart); d is 3 hours later; no account: never merged.
    expect(out.map(x => [x.id, x.amount])).toEqual([["d", 3], ["b", 15], ["c", 7], ["e", 2], ["f", 2]]);
  });
  it("plain headlines: present tense, surnames in politics", () => {
    const base = { id: "x", source: "polymarket", marketId: "m", amount: 1, avgPrice: 0.4, wallet: null, walletName: null, at: 0, lastAt: 0, fills: 1, tab: "markets", league: null, url: null, result: null, settledAt: null } as const;
    const h = (e: string, t: string, o: string, side: "yes" | "no", category = "politics") => headlineOf({ ...base, eventTitle: e, marketTitle: t, outcome: o, outcomeSide: side, category } as never);
    expect(h("Texas Senate Election Winner", "Will James Talarico win the Texas Senate race?", "Yes", "yes")).toBe("Talarico wins the Texas Senate race");
    expect(h("Texas Senate Election Winner", "James Talarico", "Yes", "yes")).toBe("Talarico wins the Texas Senate election");
    expect(h("Texas Senate Election Winner", "James Talarico", "No", "no")).toBe("Talarico doesn't win the Texas Senate election");
    expect(h("Who will win the 2028 Democratic nomination?", "Gavin Newsom", "Yes", "yes")).toBe("Newsom wins the 2028 Democratic nomination");
    expect(h("Fed", "Will the Fed cut rates in December?", "Yes", "yes", "economics")).toBe("The Fed will cut rates in December");
  });
});

describe("Positioning", () => {
  const now = 100 * DAY;
  const pos = (wallet: string, side: 0 | 1, moneyIn: number, ageDays = 1) => ({ wallet, outcomeIndex: side, moneyIn, firstSeenAt: now - ageDays * DAY });
  it("counts proven positions of $2K+ opened in the last 14 days, with 3+ proven traders", () => {
    expect(smartOf([pos("a", 0, 5000), pos("b", 0, 5000)], now).share).toBeNull(); // 2 traders
    expect(smartOf([pos("a", 0, 5000), pos("b", 0, 5000), pos("c", 1, 1999)], now).share).toBeNull(); // the $1,999 one doesn't count
    expect(smartOf([pos("a", 0, 5000), pos("b", 0, 5000), pos("c", 1, 5000, POSITION_DAYS + 1)], now).share).toBeNull(); // too old
    expect(smartOf([pos("a", 0, 6000), pos("b", 0, 3000), pos("c", 1, 3000)], now).share).toBeCloseTo(0.75);
  });
  it("only on a side priced 5–95%", () => {
    const smart = { yes: 9000, no: 1000, wallets: 3, share: 0.9 };
    expect(crowdSplit(0.6, smart)?.smartSide).toBe("yes");
    expect(crowdSplit(0.97, { ...smart, share: 0.99 })).toBeNull(); // YES at 97%
    expect(bigMoneySplit({ yes: 10_000, no: 40_000 }, smart, 0.96)).toBeNull();
    expect(bigMoneySplit({ yes: 10_000, no: 40_000 }, smart, 0.5)?.smartSide).toBe("yes");
  });
  it("scored as edge: their side's win rate minus its average price; public only when positive on 100+", () => {
    const row = (right: boolean, crowd: number, side: "yes" | "no" = "yes", wallets = 3) => ({ source: "polymarket", kind: "crowd", smartRight: right, smartSide: side, flaggedCrowd: crowd, detail: { wallets } });
    const e = edgeOf([row(true, 0.5), row(false, 0.5), row(true, 0.3, "no"), row(true, 0.5, "yes", 2), row(true, 0.99)]);
    expect(e.scored).toBe(3); // 2 wallets and a side at 99% are left out
    expect(e.winRate).toBeCloseTo(2 / 3);
    expect(e.avgPrice).toBeCloseTo((0.5 + 0.5 + 0.7) / 3);
    expect(e.edge).toBeCloseTo(2 / 3 - 1.7 / 3);
    expect(positioningPublic(e)).toBe(false);
    expect(positioningPublic({ ...e, scored: SCORE_MIN, edge: 0.01 })).toBe(true);
    expect(positioningPublic({ ...e, scored: SCORE_MIN, edge: -0.01 })).toBe(false);
  });
});
