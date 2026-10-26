/* Incremental candidates equal a from-scratch findCandidates after markets appear, change and go away. */
import { describe, expect, it } from "vitest";
import type { VMarket } from "@/lib/types";
import { DEFAULT_MATCH_CONFIG, findCandidates } from "@/lib/matching/candidates";
import { IncrementalCandidates } from "@/lib/matching/incremental";
import { KALSHI_ALL, POLY_ALL, at, mk } from "./fixtures/matching/markets";

const H = 3_600_000;
const base = at(2026, 11, 1);
const people = ["Trump", "Newsom", "Musk", "Powell", "Vance", "Harris"];
const topics = ["visit China", "sign the bill", "meet the Pope", "announce a run", "speak at the UN"];
const ks: VMarket[] = [...KALSHI_ALL];
const ps: VMarket[] = [...POLY_ALL];
for (let i = 0; i < 300; i++) ks.push(mk("kalshi", `K-${i}`, { title: `Will ${people[i % 6]} ${topics[(i >> 2) % 5]} by week ${i % 12}?`, category: "politics", closeTime: base + (i % 40) * 6 * H }));
for (let i = 0; i < 400; i++) ps.push(mk("polymarket", `P-${i}`, { title: `Will ${people[i % 6]} ${topics[(i >> 2) % 5]} before week ${i % 12}?`, category: "politics", closeTime: base + (i % 50) * 5 * H }));

const view = (cs: ReturnType<typeof findCandidates>) => cs.map(c => `${c.key} ${c.score.toFixed(6)} ${c.decision} ${c.orientation}`).sort();

describe("IncrementalCandidates", () => {
  it("matches findCandidates on the first run and after changes", () => {
    const inc = new IncrementalCandidates();
    const cfg = DEFAULT_MATCH_CONFIG;
    const first = inc.run(ks, ps, cfg);
    expect(view(first.candidates)).toEqual(view(findCandidates(ks, ps, cfg)));
    expect(first.stats.rescored).toBe(ks.length);

    // Nothing changed (new objects, new prices): nothing re-scored, same result.
    const same = inc.run(ks.map(m => ({ ...m, volume24h: 123 })), ps.map(m => ({ ...m })), cfg);
    expect(same.stats).toMatchObject({ changedA: 0, changedB: 0, rescored: 0 });
    expect(view(same.candidates)).toEqual(view(first.candidates));

    // Some markets change title or close, some appear, some go away.
    const ks2 = ks.filter((_, i) => i % 37 !== 0).map((m, i) => (i % 29 === 0 ? { ...m, title: m.title.replace("Trump", "Rubio") } : m));
    ks2.push(mk("kalshi", "K-new", { title: "Will Musk visit China by week 3?", category: "politics", closeTime: base + 12 * H }));
    const ps2 = ps.filter((_, i) => i % 41 !== 0).map((m, i) => (i % 31 === 0 ? { ...m, closeTime: (m.closeTime ?? base) + 30 * H } : m));
    ps2.push(mk("polymarket", "P-new", { title: "Will Musk visit China before week 3?", category: "politics", closeTime: base + 14 * H }));
    const next = inc.run(ks2, ps2, cfg);
    expect(view(next.candidates)).toEqual(view(findCandidates(ks2, ps2, cfg)));
    expect(next.stats.rescored).toBeGreaterThan(0);
    expect(next.stats.rescored).toBeLessThan(ks2.length);
    expect(next.candidates.some(c => c.a.id === "K-new" && c.b.id === "P-new")).toBe(true);
  });
});
