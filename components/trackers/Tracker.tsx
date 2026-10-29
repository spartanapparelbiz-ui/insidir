/* Tracker pieces (lib/trackers.ts): the wide photo card (home "Featured"), the ranked row (Top performers, Popular),
 * the grid card (/trackers) and the record line. Every number comes from TrackerStats (lib/trackers-store.ts); a
 * tracker with under 20 settled moves shows "New", never a record. */
import Link from "next/link";
import { Cover, Thumb } from "@/components/Photo";
import { dollars, signedShort } from "@/lib/moves/copy";
import { coverVariant, hasTrackerRecord, recordPill, trackerHref, winPct, type Tracker, type TrackerRecord } from "@/lib/trackers";

export const BY = "by Insidir";

export function RecordPill({ r }: { r: TrackerRecord | null | undefined }) {
  const p = recordPill(r);
  return <span className={`rpill rpill--${p.tone}`}>{p.text}</span>;
}

/** "Won 63% · 412 settled · avg 41% chance · +$1.2M net", or why there's no record yet. */
export function recordText(r: TrackerRecord | null | undefined, kind: Tracker["kind"]): string {
  if (kind === "filings") return "Filings don't settle, so there's no win record.";
  if (!hasTrackerRecord(r)) return "New: under 20 settled moves, no record yet.";
  const price = r.oddsPct !== null ? ` · avg ${Math.round(r.oddsPct)}% chance` : "";
  return `Won ${r.won}, lost ${r.lost} (${winPct(r)}%)${price} · ${signedShort(r.net)} net`;
}

const Chevron = () => (
  <svg className="trow__chev" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Home "Featured": a wide photo card, the name and "by Insidir" on the photo. */
export function TrackerFeature({ t, eager = false, i = 0 }: { t: Tracker; eager?: boolean; i?: number }) {
  return (
    <Link className="tfeat rv" style={{ ["--i" as string]: i }} href={trackerHref(t.slug)}>
      <Cover n={t.photo} className={`tfeat__photo ${coverVariant(t.slug)}`} eager={eager} sizes="(min-width: 900px) 290px, 72vw" />
      <span className="tfeat__copy">
        <span className="tfeat__name">{t.name}</span>
        <span className="tfeat__by">{BY}</span>
      </span>
    </Link>
  );
}

/** A ranked row: round cover, the record pill (or a figure), name, "by Insidir", chevron. */
export function TrackerRow({ t, r, figure, rank }: { t: Tracker; r?: TrackerRecord | null; figure?: string; rank?: number }) {
  return (
    <li>
      <Link className="trow" href={trackerHref(t.slug)}>
        {rank !== undefined ? <span className="trow__rank">{rank}</span> : null}
        <Thumb n={t.photo} className={`trow__thumb ${coverVariant(t.slug)}`} />
        <span className="trow__who">
          <span className="trow__name">{t.name}</span>
          <span className="trow__by">{BY}</span>
        </span>
        {figure ? <span className="trow__fig">{figure}</span> : <RecordPill r={r} />}
        <Chevron />
      </Link>
    </li>
  );
}

/** /trackers: the cover, name, "by Insidir", the line and its record. */
export function TrackerTile({ t, r, tracked30d, i = 0, eager = false }: { t: Tracker; r: TrackerRecord | null; tracked30d: number; i?: number; eager?: boolean }) {
  return (
    <li className="ttile rv" style={{ ["--i" as string]: i }}>
      <Link className="ttile__link" href={trackerHref(t.slug)}>
        <span className="ttile__cover"><Cover n={t.photo} className={coverVariant(t.slug)} eager={eager} sizes="(min-width: 1100px) 380px, (min-width: 700px) 46vw, 100vw" /></span>
        <span className="ttile__body">
          <span className="ttile__top"><span className="ttile__name">{t.name}</span>{t.kind === "bets" ? <RecordPill r={r} /> : null}</span>
          <span className="ttile__by">{BY}</span>
          <span className="ttile__line">{t.line}</span>
          <span className="ttile__meta">{tracked30d > 0 ? `${dollars(tracked30d)} tracked in 30 days` : "No moves in the last 30 days"}</span>
        </span>
      </Link>
    </li>
  );
}
