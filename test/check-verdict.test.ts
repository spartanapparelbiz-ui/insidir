/* The check (lib/brand/verdict.ts): the verdict for the side someone is on, from the millionaire money in that market,
 * worded from however many wallets there are; outcome names never "Yes" beside a team; /go's teaser cards never carry
 * which side the money is on. */
import { describe, expect, it } from "vitest";
import { HEADLINE, heavierSide, verdict, type VerdictInput } from "@/lib/brand/verdict";
import { outcomeNames, type MarketMoney } from "@/lib/millionaires/queries";
import { betOnFor, lockMoney, parseCats, stakeFor } from "@/lib/go/data";
import { bannedPhrases } from "@/lib/copy";
import { FAQ, HERO, PROBLEM, STAGES } from "@/lib/brand/copy";

const m = (y: [number, number], n: [number, number], pnl: Partial<Record<"yes" | "no", number>> = {}): VerdictInput =>
  ({ yes: { dollars: y[0], wallets: y[1] }, no: { dollars: n[0], wallets: n[1] }, yesLabel: "Pelicans", noLabel: "Grizzlies", topPnl: pnl });

describe("the verdict", () => {
  it("one wallet still gets a verdict, worded from that wallet", () => {
    const one = m([0, 0], [74_000, 1], { no: 3_100_000 });
    expect(verdict(one, "no")).toEqual({ kind: "agree", headline: HEADLINE.agree, evidence: "1 wallet up $3.1M all-time has $74K on Grizzlies" });
    expect(verdict(one, "yes")).toMatchObject({ kind: "against", headline: "Millionaires are on the other side" });
  });
  it("several wallets on one side, both sides, a split, and none", () => {
    expect(verdict(m([210_000, 3], [0, 0]), "yes").evidence).toBe("3 wallets with $1M+ all-time profit have $210K on Pelicans");
    const both = m([120_000, 2], [100_000, 2]);
    expect(verdict(both, "yes")).toMatchObject({ kind: "split", evidence: "$120K on Pelicans from 2 wallets, $100K on Grizzlies from 2 wallets" });
    expect(verdict(m([65_000, 2], [35_000, 1]), "yes").kind).toBe("agree");
    expect(verdict(m([35_000, 1], [65_000, 2]), "yes").kind).toBe("against");
    expect(verdict(m([0, 0], [0, 0]), "yes")).toEqual({ kind: "none", headline: "No millionaire money here yet", evidence: null });
    expect(heavierSide(both)).toBe("yes");
  });
  it("never reads as advice", () => {
    for (const h of Object.values(HEADLINE)) expect(bannedPhrases(h)).toEqual([]);
    const all = [...HERO.h1, ...PROBLEM.h1, PROBLEM.sub, ...PROBLEM.rows.flat(), ...Object.values(STAGES).flat(), ...FAQ.flatMap(f => [f.q, f.a])].join(" ");
    expect(bannedPhrases(all)).toEqual([]);
    expect(all).not.toMatch(/guarantee/i);
  });
});

describe("outcome names", () => {
  it("never 'Yes' next to a team", () => {
    expect(outcomeNames("Pelicans vs. Grizzlies", "Yes", "Grizzlies")).toEqual({ yesLabel: "Pelicans", noLabel: "Grizzlies" });
    expect(outcomeNames("NBA: Pelicans vs Grizzlies", "Pelicans", "No")).toEqual({ yesLabel: "Pelicans", noLabel: "Grizzlies" });
    expect(outcomeNames("Will it rain?", "Yes", "No")).toEqual({ yesLabel: "Yes", noLabel: "No" });
    expect(outcomeNames("Who wins the race?", "Yes", "Verstappen")).toEqual({ yesLabel: "Other side", noLabel: "Verstappen" });
    expect(outcomeNames("Chiefs vs. Bills", "Chiefs", "Bills")).toEqual({ yesLabel: "Chiefs", noLabel: "Bills" });
  });
});

describe("/go", () => {
  it("a teaser card carries one total per tier, never the side", () => {
    const mm = { marketId: "m", title: "T", event: "E", category: "football", yesLabel: "A", noLabel: "B", priceNow: 0.5, last: 0,
      millionaire: { yes: { dollars: 10, wallets: 1 }, no: { dollars: 90, wallets: 3 } }, pro: { yes: { dollars: 5, wallets: 1 }, no: { dollars: 0, wallets: 0 } } } satisfies MarketMoney;
    const l = lockMoney(mm);
    expect(l.millionaire).toEqual({ yes: { dollars: 100, wallets: 4 }, no: { dollars: 0, wallets: 0 } });
    expect(JSON.stringify(l)).not.toContain("90");
  });
  it("answers map to the older leagues, stakes and categories", () => {
    expect(betOnFor(["football", "elections", "tech"])).toEqual(["nfl", "cfb", "elections", "other"]);
    expect(stakeFor("25-100")).toBe(50);
    expect(stakeFor(null)).toBe(100);
    expect(parseCats("football,nope,football,golf")).toEqual(["football", "golf"]);
  });
});

import { HERO_MIN, heroTotal, midnightET } from "@/lib/millionaires/queries";
describe("the hero's live line", () => {
  it("today since midnight ET; under $100K, the last 24 hours", () => {
    const p = { count: 0, window: "hour" as const, wallets: 0, millionaires: 0, countToday: 0 };
    expect(heroTotal({ ...p, today: 900_000, sinceMidnight: 4_200_000 })).toEqual({ amount: 4_200_000, window: "today" });
    expect(heroTotal({ ...p, today: 900_000, sinceMidnight: HERO_MIN - 1 })).toEqual({ amount: 900_000, window: "24h" });
  });
  it("midnight ET, in winter and summer", () => {
    expect(new Date(midnightET(Date.parse("2026-11-03T04:30:00Z"))).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(new Date(midnightET(Date.parse("2026-07-01T03:59:00Z"))).toISOString()).toBe("2026-06-30T04:00:00.000Z");
  });
});
