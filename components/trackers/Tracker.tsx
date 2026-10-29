/* Tracker pieces (lib/trackers.ts): the 4:3 cover card (home "Featured"), the ranked row (Top performers, Popular),
 * the grid card (/trackers) and the record line. Every number comes from TrackerStats (lib/trackers-store.ts); a
 * tracker with under 20 settled moves shows "New", never a record. */
import Link from "next/link";
import { Result } from "@/components/ui/Result";
import { dollars, signedShort } from "@/lib/moves/copy";
import { hasTrackerRecord, recordResult, trackerHref, winPct, type Tracker, type TrackerRecord } from "@/lib/trackers";
import { TrackerCover, type CoverStats } from "./TrackerCover";

export const BY = "by Insidir";

/** The record on the right: the net in green or red, "Won 63%" in grey under it, or just "New". */
export function RecordResult({ r }: { r: TrackerRecord | null | undefined }) {
  const p = recordResult(r);
  return <Result amount={p.amount} tone={p.tone} status={p.status} />;
}

/** "Won 63% · 412 settled · avg 41% chance · +$1.2M net", or why there's no record yet. */
export function recordText(r: TrackerRecord | null | undefined, kind: Tracker["kind"]): string {
  if (kind === "filings") return "Filings don't settle, so there's no win record.";
  if (!hasTrackerRecord(r)) return "New: under 20 settled positions, no record yet.";
  const price = r.oddsPct !== null ? ` · average entry ${Math.round(r.oddsPct)}%` : "";
  return `Won ${r.won}, lost ${r.lost} (${winPct(r)}%)${price} · ${signedShort(r.net)} net`;
}

const Chevron = () => (
  <svg className="trow__chev" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Home "Featured": the 4:3 cover (colour, curve, return), the name and "by Insidir" on it. */
export function TrackerFeature({ t, s, i = 0 }: { t: Tracker; s?: CoverStats | null; i?: number }) {
  return (
    <Link className="tfeat rv" style={{ ["--i" as string]: i }} href={trackerHref(t.slug)}>
      <TrackerCover t={t} s={s} className="tfeat__cover">
        <span className="tfeat__copy">
          <span className="tfeat__name">{t.name}</span>
          <span className="tfeat__by">{BY}</span>
        </span>
      </TrackerCover>
    </Link>
  );
}

/** A ranked row: the small cover, name, "by Insidir", the record (or a figure) on the right, chevron. */
export function TrackerRow({ t, r, s, figure, rank }: { t: Tracker; r?: TrackerRecord | null; s?: CoverStats | null; figure?: string; rank?: number }) {
  return (
    <li>
      <Link className="trow" href={trackerHref(t.slug)}>
        {rank !== undefined ? <span className="trow__rank">{rank}</span> : null}
        <TrackerCover t={t} s={s} small className="trow__thumb" />
        <span className="trow__who">
          <span className="trow__name">{t.name}</span>
          <span className="trow__by">{BY}</span>
        </span>
        {figure ? <span className="trow__fig">{figure}</span> : <RecordResult r={r} />}
        <Chevron />
      </Link>
    </li>
  );
}

/** /trackers: the cover, name, "by Insidir", the line and its record. */
export function TrackerTile({ t, r, tracked30d, s, i = 0 }: { t: Tracker; r: TrackerRecord | null; tracked30d: number; s?: CoverStats | null; i?: number }) {
  return (
    <li className="ttile rv" style={{ ["--i" as string]: i }}>
      <Link className="ttile__link" href={trackerHref(t.slug)}>
        <TrackerCover t={t} s={s ?? { record: r, curve: [], tracked30d }} className="ttile__cover" />
        <span className="ttile__body">
          <span className="ttile__top"><span className="ttile__name">{t.name}</span>{t.kind === "bets" ? <RecordResult r={r} /> : null}</span>
          <span className="ttile__by">{BY}</span>
          <span className="ttile__line">{t.line}</span>
          <span className="ttile__meta">{tracked30d > 0 ? `${dollars(tracked30d)} 30-day volume` : "No positions in the last 30 days"}</span>
        </span>
      </Link>
    </li>
  );
}
