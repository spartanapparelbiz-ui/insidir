/* A tracker's artwork, Apple Music style: its photo is the artwork (lib/photos.ts trackerPhoto, from Unsplash's CDN), edge
 * to edge at every size, with no colour fill, no badge and no curve. 1:1 thumbnails (radius 12, a 0.5px ring) carry
 * nothing else; 4:3 cards and the 21:9 page header carry their words (the return, the name) over a soft scrim for
 * contrast. The P&L curve lives only in the performance chart. Every figure is from TrackerStats
 * (lib/trackers-store.ts): the followable return, or "Building record · N of 30" under 30 settled. */
import type { ReactNode } from "react";
import { Photo, type PhotoRatio } from "@/components/Photo";
import { dollars } from "@/lib/moves/copy";
import { trackerPhoto } from "@/lib/photos";
import { returnPct, settledOf, TRACKER_MIN_SETTLED, type Tracker, type TrackerRecord } from "@/lib/trackers";
import type { TrackerStats } from "@/lib/trackers-store";

export interface CoverStats { record: TrackerRecord | null; curve: readonly number[]; tracked30d: number }

/** What a cover needs from a tracker's stats (its all-time record). */
export const coverStats = (s: TrackerStats | null | undefined): CoverStats | null => (s ? { record: s.records.all, curve: s.curve, tracked30d: s.tracked30d } : null);

/** The figure on the cover and its label: the followable return, money tracked for filings, or "Building record · N
 *  of 30" (never "New"). */
export function coverFigure(t: Pick<Tracker, "kind">, s: CoverStats | null | undefined): { figure: string; label: string | null } {
  if (t.kind === "filings") return s && s.tracked30d > 0 ? { figure: dollars(s.tracked30d), label: "30-day volume" } : { figure: "No filings yet", label: null };
  const r = returnPct(s?.record);
  return r ? { figure: r, label: "Followable ROI" } : { figure: "Building record", label: `${settledOf(s?.record)} of ${TRACKER_MIN_SETTLED} settled` };
}

export function TrackerCover({ t, s, small = false, ratio, sizes, priority = false, figure = true, className, children }: {
  t: Tracker; s?: CoverStats | null;
  /** A 1:1 thumbnail: the photo alone. */
  small?: boolean;
  /** The crop: 4:3 cards by default, 21:9 for the page header. */
  ratio?: PhotoRatio; sizes?: string; priority?: boolean;
  /** Show the return over a top scrim (cards and the header). */
  figure?: boolean;
  className?: string;
  /** Words over a bottom scrim (the name on a card). */
  children?: ReactNode;
}) {
  const f = small || !figure ? null : coverFigure(t, s);
  const r: PhotoRatio = small ? "1:1" : ratio ?? "4:3";
  return (
    <span className={`tcover${small ? " tcover--sm" : ""}${f ? " tcover--top" : ""}${children ? " tcover--bottom" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden={small || undefined}>
      <Photo name={trackerPhoto(t.slug)} ratio={r} priority={priority}
        sizes={sizes ?? (small ? "56px" : r === "21:9" ? "(min-width: 1200px) 1168px, 100vw" : "(min-width: 900px) 400px, 90vw")} className="tcover__photo" />
      {f ? <span className="tcover__fig"><span className="tcover__n">{f.figure}</span>{f.label ? <span className="tcover__l">{f.label}</span> : null}</span> : null}
      {children}
    </span>
  );
}
