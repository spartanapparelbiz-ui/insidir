import { describe, expect, it } from "vitest";
import type { MarketPair } from "@/lib/types";
import { createMemoryCache, createMemoryUsageStore, createOpenRouterConfirm, matchMarkets, pairKey, type Override } from "@/lib/matching";
import { monthKey } from "@/lib/matching/llm";
import {
  KALSHI_ALL, POLY_ALL, T0, kBtc100, kBtc105, kButtigieg, kFedCut25, kFedHold, kNbaBos, kNbaLal, kNewsom, kNflKc, kNhlDay2, kWx60,
  pBtc100, pBtc105, pButtigieg, pFedCut25, pFedHold, pNba, pNewsom, pNfl, pNhlDay1, pWx60, pusNba,
} from "./fixtures/matching/markets";
import { answer, openRouterFetch } from "./fixtures/matching/openrouter";

const H = 3_600_000;
const byId = (pairs: MarketPair[]) => new Map(pairs.map(p => [p.id, p]));
const noOverrides = new Map<string, Override>();

describe("matchMarkets: deterministic", () => {
  it("matches the fixture set: both Kalshi team markets onto Polymarket's one game market, with safety lights", async () => {
    const cache = createMemoryCache();
    const { pairs, stats } = await matchMarkets(KALSHI_ALL, POLY_ALL, { cache, overrides: noOverrides, now: T0 });
    const m = byId(pairs);
    expect([...m.keys()].sort()).toEqual(
      [
        pairKey(kNbaLal, pNba), pairKey(kNbaBos, pNba), pairKey(kNflKc, pNfl), pairKey(kNewsom, pNewsom), pairKey(kButtigieg, pButtigieg),
        pairKey(kBtc100, pBtc100), pairKey(kBtc105, pBtc105), pairKey(kWx60, pWx60),
      ].sort(),
    );
    expect(m.get(pairKey(kNbaLal, pNba))).toMatchObject({ inverted: false, method: "deterministic", safety: "yellow", blocked: false });
    expect(m.get(pairKey(kNbaBos, pNba))).toMatchObject({ inverted: true, safety: "yellow" });
    expect(m.get(pairKey(kNbaBos, pNba))?.safetyNotes).toContain("Kalshi counts overtime; Polymarket's rules don't mention it");
    expect(m.get(pairKey(kNflKc, pNfl))).toMatchObject({ safety: "green", safetyNotes: [] });
    expect(m.get(pairKey(kNewsom, pNewsom))?.safety).toBe("green");
    expect(m.get(pairKey(kWx60, pWx60))?.safetyNotes).toContain("Different resolution sources: NWS/NOAA vs Weather Underground");
    expect(m.get(pairKey(kBtc100, pBtc100))?.id).toBe(`kalshi:${kBtc100.id}|polymarket:${pBtc100.id}`);
    expect(stats).toMatchObject({ deterministic: 8, llmAsked: 0, llmAccepted: 0, green: 3, yellow: 5, red: 0, cacheHits: 0 });
    expect(stats.unsure).toBe(2); // the two Fed pairs, with no LLM configured
    expect(stats.rejected).toBeGreaterThan(5);
    // Every decision is cached, accepted and rejected; LLM-band pairs without an LLM are not.
    expect(cache.writes).toBe(stats.candidates - stats.unsure);
  });

  it("orients Polymarket US's reversed listing", async () => {
    const { pairs } = await matchMarkets([kNbaLal, kNbaBos], [pusNba], { cache: createMemoryCache(), overrides: noOverrides, now: T0 });
    const m = byId(pairs);
    expect(m.get(pairKey(kNbaLal, pusNba))?.inverted).toBe(true);
    expect(m.get(pairKey(kNbaBos, pusNba))?.inverted).toBe(false);
  });

  it("assigns one-to-one: a duplicate listing does not get a second pair", async () => {
    const dup = { ...pNfl, id: "0xnfl-dup" };
    const { pairs } = await matchMarkets([kNflKc], [pNfl, dup], { cache: createMemoryCache(), overrides: noOverrides, now: T0 });
    expect(pairs).toHaveLength(1);
  });

  it("serves the second run from the cache, and re-decides a market whose rules changed", async () => {
    const cache = createMemoryCache();
    const first = await matchMarkets(KALSHI_ALL, POLY_ALL, { cache, overrides: noOverrides, now: T0 });
    const writes = cache.writes;
    const second = await matchMarkets(KALSHI_ALL, POLY_ALL, { cache, overrides: noOverrides, now: T0 + H });
    expect(second.pairs).toEqual(first.pairs);
    expect(second.stats.cacheHits).toBe(second.stats.candidates - second.stats.unsure);
    expect(cache.writes).toBe(writes);
    const edited = POLY_ALL.map(m => (m.id === pNfl.id ? { ...m, rules: `${m.rules} Edited.` } : m));
    const third = await matchMarkets(KALSHI_ALL, edited, { cache, overrides: noOverrides, now: T0 + 2 * H });
    expect(third.stats.cacheHits).toBe(second.stats.cacheHits - 1);
    expect(cache.writes).toBe(writes + 1);
  });
});

describe("matchMarkets: LLM path", () => {
  const fed = { ks: [kFedCut25, kFedHold], ps: [pFedCut25, pFedHold] };

  it("accepts on a confident same-event answer, merges its differences, and never asks twice", async () => {
    const fetch = openRouterFetch(answer(true, false, 0.93, ["Kalshi resolves on the target range; Polymarket on the upper bound"]));
    const usage = createMemoryUsageStore();
    const llm = createOpenRouterConfirm({ apiKey: "k", usage, fetch, now: () => T0 });
    const cache = createMemoryCache();
    const { pairs, stats } = await matchMarkets(fed.ks, fed.ps, { cache, llm, overrides: noOverrides, now: T0 });
    const m = byId(pairs);
    expect(m.get(pairKey(kFedCut25, pFedCut25))).toMatchObject({ method: "llm", confidence: 0.93, inverted: false, safety: "yellow" });
    expect(m.get(pairKey(kFedCut25, pFedCut25))?.safetyNotes).toContain("Kalshi resolves on the target range; Polymarket on the upper bound");
    expect(m.get(pairKey(kFedHold, pFedHold))?.method).toBe("llm");
    expect(stats).toMatchObject({ llmAsked: 2, llmAccepted: 2 });
    expect(stats.llmCostUsd).toBeCloseTo(0.0004);
    expect(usage.spend.get(monthKey(T0))).toBeCloseTo(0.0004);
    // Cut vs hold was rejected deterministically: never sent to the LLM.
    expect(fetch).toHaveBeenCalledTimes(2);
    const again = await matchMarkets(fed.ks, fed.ps, { cache, llm, overrides: noOverrides, now: T0 + H });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(again.pairs).toEqual(pairs);
    expect(again.stats.llmAsked).toBe(0);
  });

  it("rejects on a not-same answer, caches the rejection", async () => {
    const fetch = openRouterFetch(answer(false, false, 0.9, ["Different meetings"]));
    const llm = createOpenRouterConfirm({ apiKey: "k", usage: createMemoryUsageStore(), fetch, now: () => T0 });
    const cache = createMemoryCache();
    const { pairs, stats } = await matchMarkets(fed.ks, fed.ps, { cache, llm, overrides: noOverrides, now: T0 });
    expect(pairs).toEqual([]);
    expect(stats.llmAccepted).toBe(0);
    expect(cache.map.get(pairKey(kFedCut25, pFedCut25))).toMatchObject({ status: "rejected", method: "llm" });
    await matchMarkets(fed.ks, fed.ps, { cache, llm, overrides: noOverrides, now: T0 + H });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not accept a low-confidence answer or one whose orientation contradicts the matcher", async () => {
    const low = createOpenRouterConfirm({ apiKey: "k", usage: createMemoryUsageStore(), fetch: openRouterFetch(answer(true, false, 0.6)), now: () => T0 });
    expect((await matchMarkets(fed.ks, fed.ps, { cache: createMemoryCache(), llm: low, overrides: noOverrides, now: T0 })).pairs).toEqual([]);
    const flipped = createOpenRouterConfirm({ apiKey: "k", usage: createMemoryUsageStore(), fetch: openRouterFetch(answer(true, true, 0.95)), now: () => T0 });
    const cache = createMemoryCache();
    expect((await matchMarkets(fed.ks, fed.ps, { cache, llm: flipped, overrides: noOverrides, now: T0 })).pairs).toEqual([]);
    expect(cache.map.get(pairKey(kFedCut25, pFedCut25))?.reasons[0]).toMatch(/orientation disagrees/);
  });

  it("malformed answer → unsure, retried only after the retry window", async () => {
    const fetch = openRouterFetch("I think so!");
    const llm = createOpenRouterConfirm({ apiKey: "k", usage: createMemoryUsageStore(), fetch, now: () => T0 });
    const cache = createMemoryCache();
    const run = (now: number) => matchMarkets([kFedCut25], [pFedCut25], { cache, llm, overrides: noOverrides, now });
    const first = await run(T0);
    expect(first.pairs).toEqual([]);
    expect(first.stats).toMatchObject({ llmAsked: 1, llmAccepted: 0, unsure: 1 });
    expect(cache.map.get(pairKey(kFedCut25, pFedCut25))).toMatchObject({ status: "unsure", retryAt: T0 + 24 * H });
    await run(T0 + H);
    expect(fetch).toHaveBeenCalledTimes(1);
    await run(T0 + 25 * H);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("budget exceeded → no call, nothing cached, asked again next month", async () => {
    const fetch = openRouterFetch(answer(true));
    const usage = createMemoryUsageStore({ [monthKey(T0)]: 10 });
    const llm = createOpenRouterConfirm({ apiKey: "k", usage, fetch, now: () => T0, monthlyCapUsd: 10 });
    const cache = createMemoryCache();
    const { pairs, stats } = await matchMarkets([kFedCut25], [pFedCut25], { cache, llm, overrides: noOverrides, now: T0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(pairs).toEqual([]);
    expect(stats).toMatchObject({ llmAsked: 0, unsure: 1 });
    expect(cache.map.has(pairKey(kFedCut25, pFedCut25))).toBe(false);
  });

  it("caps LLM questions per run", async () => {
    const fetch = openRouterFetch(answer(true));
    const llm = createOpenRouterConfirm({ apiKey: "k", usage: createMemoryUsageStore(), fetch, now: () => T0 });
    const { stats } = await matchMarkets(fed.ks, fed.ps, { cache: createMemoryCache(), llm, overrides: noOverrides, now: T0, config: { maxLlmPerRun: 1 } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ llmAsked: 1, unsure: 1 });
  });

  it("does not ask the LLM about a pair whose slot a deterministic match already took", async () => {
    // Same matchup, no rules, closing 20h later: uncertain (LLM band) for kNbaLal, whose slot pNba already took.
    const vague = { ...pNba, id: "0xnba-vague", rules: "", closeTime: pNba.closeTime! + 20 * H };
    const fetch = openRouterFetch(answer(true));
    const llm = createOpenRouterConfirm({ apiKey: "k", usage: createMemoryUsageStore(), fetch, now: () => T0 });
    const { pairs, stats } = await matchMarkets([kNbaLal], [pNba, vague], { cache: createMemoryCache(), llm, overrides: noOverrides, now: T0 });
    expect(pairs.map(p => p.b.id)).toEqual([pNba.id]);
    expect(stats.skipped).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("matchMarkets: overrides", () => {
  it("block hides an otherwise deterministic pair", async () => {
    const overrides = new Map<string, Override>([[pairKey(kNflKc, pNfl), { action: "block" }]]);
    const { pairs, stats } = await matchMarkets([kNflKc], [pNfl], { cache: createMemoryCache(), overrides, now: T0 });
    expect(pairs).toEqual([expect.objectContaining({ id: pairKey(kNflKc, pNfl), blocked: true, method: "admin" })]);
    expect(stats).toMatchObject({ blocked: 1, green: 0 });
  });
  it("force_match pairs two markets the matcher rejected, with the given orientation, and the light still shows RED", async () => {
    const overrides = new Map<string, Override>([[pairKey(kNhlDay2, pNhlDay1), { action: "force_match", inverted: false }]]);
    const { pairs, stats } = await matchMarkets([kNhlDay2], [pNhlDay1], { cache: createMemoryCache(), overrides, now: T0 });
    expect(pairs).toEqual([expect.objectContaining({ method: "admin", confidence: 1, inverted: false, safety: "red", blocked: false })]);
    expect(stats.admin).toBe(1);
  });
  it("force_match with inverted, and a forced safety light", async () => {
    const overrides = new Map<string, Override>([
      [pairKey(kNbaLal, pNba), { action: "force_match", inverted: true, safety: "green", notes: ["Checked by hand"] }],
    ]);
    const { pairs } = await matchMarkets([kNbaLal], [pNba], { cache: createMemoryCache(), overrides, now: T0 });
    expect(pairs).toEqual([expect.objectContaining({ method: "admin", inverted: true, safety: "green", safetyNotes: ["Checked by hand"] })]);
  });
  it("force safety alone keeps the automatic match", async () => {
    const overrides = new Map<string, Override>([[pairKey(kNbaLal, pNba), { safety: "red" }]]);
    const { pairs } = await matchMarkets([kNbaLal], [pNba], { cache: createMemoryCache(), overrides, now: T0 });
    expect(pairs[0]).toMatchObject({ method: "deterministic", safety: "red" });
    expect(pairs[0]?.safetyNotes).toContain("Kalshi counts overtime; Polymarket's rules don't mention it");
  });
});
