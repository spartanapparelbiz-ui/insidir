/* Onboarding's order (app/onboarding): trackers ranked by followable ROI. */
import { MIN_SETTLED } from "@/lib/follow/math";
import type { Tracker, TrackerSlug } from "@/lib/trackers";
import type { TrackerStats } from "@/lib/trackers-store";

/** Bets trackers with a record, best followable ROI first; then the rest in their usual order. */
export function rankForOnboarding(trackers: readonly Tracker[], stats: Map<TrackerSlug, TrackerStats>): Array<{ t: Tracker; roi: number | null; s?: TrackerStats }> {
  const rows = trackers.map(t => {
    const s = stats.get(t.slug), r = s?.records.all;
    const roi = t.kind === "bets" && r && r.won + r.lost >= MIN_SETTLED && (r.staked ?? 0) > 0 ? r.net / r.staked! : null;
    return { t, roi, s };
  });
  return [...rows.filter(x => x.roi !== null).sort((a, b) => b.roi! - a.roi!), ...rows.filter(x => x.roi === null)];
}
