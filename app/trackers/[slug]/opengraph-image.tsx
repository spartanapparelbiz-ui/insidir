/* A tracker's link preview (lib/og/entity.tsx): its name, its rule, and its all-time followable ROI once it has a record. */
import { getDb, hasDatabase } from "@/lib/db";
import { MIN_SETTLED, roiText } from "@/lib/follow/math";
import { entityOg, OG_SIZE } from "@/lib/og/entity";
import { trackerBySlug } from "@/lib/trackers";
import { trackerStats } from "@/lib/trackers-store";

export const alt = "An Insidir tracker";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const t = trackerBySlug((await params).slug);
  if (!t) return entityOg({ kicker: "Tracker", title: "Insidir trackers", line: "Live portfolios of large positions, each with a public record." });
  const r = hasDatabase() ? (await trackerStats(getDb(), Date.now()).catch(() => null))?.get(t.slug)?.records.all : null;
  const has = t.kind === "bets" && r && r.won + r.lost >= MIN_SETTLED && (r.staked ?? 0) > 0;
  return entityOg({ kicker: "Tracker", title: t.name, line: t.line,
    figure: has ? { value: roiText(r.net, r.staked!), label: `Followable ROI, all time · ${(r.won + r.lost).toLocaleString("en-US")} settled`, tone: r.net >= 0 ? "pos" : "neg" } : null });
}
