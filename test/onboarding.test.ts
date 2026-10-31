/* Onboarding's order (lib/onboarding.ts): trackers with a record (30+ settled) by followable ROI, best first; the rest
 * after, in their usual order. */
import { describe, expect, it } from "vitest";
import { rankForOnboarding } from "@/lib/onboarding";
import { TRACKERS, type TrackerSlug } from "@/lib/trackers";
import type { TrackerStats } from "@/lib/trackers-store";

const stat = (won: number, lost: number, net: number, staked: number) => ({ records: { all: { won, lost, net, staked, oddsPct: null } } }) as unknown as TrackerStats;

describe("onboarding order", () => {
  it("ranks by followable ROI, needs 30 settled, keeps the rest after", () => {
    const bets = TRACKERS.filter(t => t.kind === "bets");
    const [a, b, c, d] = bets;
    const stats = new Map<TrackerSlug, TrackerStats>([
      [a!.slug, stat(20, 20, 400, 4000)], [b!.slug, stat(30, 10, 1200, 4000)], [c!.slug, stat(5, 5, 900, 1000)], [d!.slug, stat(10, 25, -700, 3500)],
    ]);
    const ranked = rankForOnboarding(bets, stats);
    expect(ranked.slice(0, 3).map(x => x.t.slug)).toEqual([b!.slug, a!.slug, d!.slug]);
    expect(ranked[0]!.roi).toBeCloseTo(0.3);
    expect(ranked.find(x => x.t.slug === c!.slug)!.roi).toBeNull();
    expect(ranked).toHaveLength(bets.length);
  });
});
