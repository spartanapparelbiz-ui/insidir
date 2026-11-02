/* Millionaire tiers, money on a market, the board's line, and the ping rules (pure). */
import { describe, expect, it } from "vitest";
import { MIN_SPLIT_WALLETS, tierCountLine, tierMoney, tierOf } from "@/lib/millionaire/tiers";
import { boardLine } from "@/lib/millionaire/board";
import { dayET, PING_DAILY_MAX, pingCatsOf, pingJobs, pingText, receiptLine } from "@/lib/millionaire/pings-pure";

const NOW = Date.parse("2026-11-02T22:00:00Z");

describe("profit tiers", () => {
  it("$1M+ is Millionaire, $100K up to $1M is Pro, anything else none", () => {
    expect(tierOf(1_000_000)).toBe("millionaire");
    expect(tierOf(5_060_000)).toBe("millionaire");
    expect(tierOf(999_999)).toBe("pro");
    expect(tierOf(100_000)).toBe("pro");
    expect(tierOf(99_999)).toBeNull();
    expect(tierOf(-2_000_000)).toBeNull();
    expect(tierOf(null)).toBeNull();
    expect(tierOf(Number.NaN)).toBeNull();
  });

  it("millionaire money by side, each wallet once per side (the larger of its open position and its tracked bets)", () => {
    const pnl = new Map<string, number | null>([["a", 2e6], ["b", 1.5e6], ["c", 3e6], ["d", 400_000], ["e", 50_000], ["f", null]]);
    const t = tierMoney([
      { wallet: "a", side: "yes", dollars: 100_000 }, { wallet: "a", side: "yes", dollars: 140_000 },
      { wallet: "b", side: "no", dollars: 50_000 }, { wallet: "c", side: "yes", dollars: 10_000 },
      { wallet: "d", side: "no", dollars: 20_000 }, { wallet: "e", side: "yes", dollars: 900_000 }, { wallet: "f", side: "yes", dollars: 1 },
    ], pnl);
    expect(t.millionaire).toEqual({ yes: { dollars: 150_000, wallets: 2 }, no: { dollars: 50_000, wallets: 1 }, wallets: 3, yesShare: 0.75 });
    expect(t.pro).toMatchObject({ no: { dollars: 20_000, wallets: 1 }, wallets: 1, yesShare: null });
  });

  it(`no split under ${MIN_SPLIT_WALLETS} wallets: the count line instead`, () => {
    const t = tierMoney([{ wallet: "a", side: "yes", dollars: 139_771 }, { wallet: "b", side: "yes", dollars: 34_004 }], new Map([["a", 2.4e6], ["b", 3.2e6]]));
    expect(t.millionaire.yesShare).toBeNull();
    expect(t.millionaire.wallets).toBe(2);
    expect(tierCountLine("millionaire", 2)).toBe("2 millionaire wallets in this market");
    expect(tierCountLine("millionaire", 1)).toBe("1 millionaire wallet in this market");
    expect(tierCountLine("pro", 1)).toBe("1 $100K+ wallet in this market");
  });

  it("a wallet on both sides counts once in the tier", () => {
    const t = tierMoney([{ wallet: "a", side: "yes", dollars: 10 }, { wallet: "a", side: "no", dollars: 20 }, { wallet: "b", side: "no", dollars: 5 }, { wallet: "c", side: "yes", dollars: 5 }],
      new Map([["a", 2e6], ["b", 2e6], ["c", 2e6]]));
    expect(t.millionaire.wallets).toBe(3);
    expect(t.millionaire.yes.wallets + t.millionaire.no.wallets).toBe(4);
  });
});

describe("the board and pings", () => {
  it("says the bet with the price then and now", () => {
    expect(boardLine({ amount: 120_000, side: "Rams", priceThen: 0.69, priceNow: 0.7 })).toBe("$120K on Rams at 69¢ (now 70¢)");
    expect(boardLine({ amount: 2_500_000, side: "Yes", priceThen: 0.3, priceNow: null })).toBe("$2.5M on Yes at 30¢");
    expect(pingText({ amount: 120_000, side: "Rams", priceThen: 0.69, priceNow: 0.7, title: "Chargers vs. Rams" }))
      .toEqual({ title: "Chargers vs. Rams", body: "A $1M+ wallet just put $120K on Rams at 69¢ (now 70¢)" });
  });

  it("ping categories: the member's own picks, else their onboarding sports and elections, else everything", () => {
    expect([...pingCatsOf({ pingCats: ["elections"] })]).toEqual(["elections"]);
    expect([...pingCatsOf({ pingCats: [] })]).toEqual([]);
    expect([...pingCatsOf({ betOn: ["nfl", "nba", "elections"] })].sort()).toEqual(["elections", "sports"]);
    expect(pingCatsOf({ betOn: ["other"] }).size).toBe(5);
    expect(pingCatsOf({}).size).toBe(5);
    expect([...pingCatsOf({ pingCats: ["sports", "bogus"] })]).toEqual(["sports"]);
  });

  it(`at most ${PING_DAILY_MAX} a day, largest first, only $25K+, fresh, in their categories, never in quiet hours`, () => {
    const bets = Array.from({ length: 8 }, (_, i) => ({ moveId: `m${i}`, cat: "sports" as const, amount: 25_000 + i * 1_000, at: NOW - 60_000 }));
    const extra = [{ moveId: "small", cat: "sports" as const, amount: 24_999, at: NOW }, { moveId: "old", cat: "sports" as const, amount: 900_000, at: NOW - 60 * 60_000 },
      { moveId: "pol", cat: "elections" as const, amount: 50_000, at: NOW }];
    const users = [
      { id: "u1", cats: new Set(["sports" as const]), sentToday: 0, quiet: false },
      { id: "u2", cats: new Set(["sports" as const]), sentToday: 4, quiet: false },
      { id: "u3", cats: new Set(["sports" as const, "elections" as const]), sentToday: 0, quiet: true },
      { id: "u4", cats: new Set(["elections" as const]), sentToday: 0, quiet: false },
    ];
    const jobs = pingJobs(users, [...bets, ...extra], NOW);
    expect(jobs.filter(j => j.userId === "u1").map(j => j.moveId)).toEqual(["m7", "m6", "m5", "m4", "m3"]);
    expect(jobs.filter(j => j.userId === "u2").map(j => j.moveId)).toEqual(["m7"]);
    expect(jobs.filter(j => j.userId === "u3")).toEqual([]);
    expect(jobs.filter(j => j.userId === "u4").map(j => j.moveId)).toEqual(["pol"]);
    expect(jobs.some(j => j.moveId === "small" || j.moveId === "old")).toBe(false);
  });

  it("the daily cap counts Eastern days; receipts count losses and skip unsettled", () => {
    expect(dayET(Date.parse("2026-11-03T03:30:00Z"))).toBe("2026-11-02");
    expect(dayET(Date.parse("2026-11-03T05:30:00Z"))).toBe("2026-11-03");
    expect(receiptLine({ won: 7, lost: 4 })).toBe("Millionaire pings: 7 won of 11 settled");
    expect(receiptLine({ won: 0, lost: 0 })).toBeNull();
  });
});
