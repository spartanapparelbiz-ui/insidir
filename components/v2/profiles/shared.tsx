/* Pieces every profile shares: the members-only lock and the follow state. Server components. */
import type { Viewer } from "@/lib/auth/viewer";
import { isReady } from "@/lib/features";
import { isPaid } from "@/lib/plans";
import type { FollowState } from "../FollowButton";

/** Shown instead of a profile's numbers to free viewers: the numbers are never sent to their browser. */
export function Locked({ trial, what }: { trial: string; what: string }) {
  return (
    <aside className="upsell upsell--big" data-locked="profile">
      <p className="upsell__text">{what}</p>
      <a className="btn btn--primary" href={trial} data-unlock="profile">See their full record for $1</a>
    </aside>
  );
}

export function followState(viewer: Viewer, following: boolean): FollowState {
  if (!isReady("follows")) return "soon";
  if (!isPaid(viewer.plan)) return "locked";
  return following ? "on" : "off";
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "2026-09-30" → "Sep 30, 2026" (a calendar date, no time zone shift). */
export const calDate = (d: string): string => DAY.format(new Date(`${d}T12:00:00Z`));
export const pct = (v: number): string => `${Math.round(v * 100)}%`;
export const signedPct = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
/** Exact whole dollars for profile numbers ("$1,401,811"): the filing's figure, not a rounded "$1.4M". */
export const exactDollars = (v: number): string => `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
