/* One row of the Terminal. Rows arrive already redacted (lib/feed.ts): when `locked`, size and dollar fields are null
 * and are drawn as solid "locked" bars, with one Unlock link per row. No hooks, so it renders on any page (the
 * landing page shows the real component) without the LiveFeed wrapper; styles live in ./deal-row.css.
 *
 * Desktop: one line in grid columns (event, the play, profit after fees, max size, profit per day, rules light,
 * freshness). Phones: a compact three-line row. The whole row is a real link to /deal/[id] (a stretched link), so it
 * works without JS; the Terminal opens it in a sheet instead when JS is on. */
import Link from "next/link";
import type { FeedRow } from "@/lib/feed";
import { pct, usd } from "@/lib/format";
import { Ago } from "./Ago";
import { SafetyLight } from "./SafetyLight";
import "./deal-row.css";

/** A locked value: a solid bar with a lock, never a loading skeleton. The value itself was never sent. */
export function LockBar({ w = 56 }: { w?: number }) {
  return (
    <span className="tr-lock" role="img" aria-label="Locked" style={{ width: w }}>
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5M2.5 5.5h7v5h-7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
    </span>
  );
}

/** Column headings, once above the rows (desktop only). */
export function DealRowHead({ locked = false }: { locked?: boolean }) {
  return (
    <div className={`tr-head${locked ? " tr-head--locked" : ""}`} aria-hidden="true">
      <span>Event</span><span>The play</span><span className="tr-r">Profit after fees</span><span className="tr-r">Max size</span>
      <span className="tr-r">Per day</span><span>Rules</span><span>Freshness</span>{locked ? <span /> : null}
    </div>
  );
}

export type RowMotion = "new" | "tick" | "closing" | null;

export function DealRow({ row, now, unlockHref, href, motion = null }: {
  row: FeedRow; now: number; unlockHref: string;
  /** Where the row links; defaults to its deal page. */
  href?: string;
  /** "new": just arrived (slides in, flashes white). "tick": its prices just moved (the new numbers flash white).
   *  "closing": just closed (fades to Dim, then the list drops it). */
  motion?: RowMotion;
}) {
  const lock = row.kind !== "second_opinion";
  const to = href ?? `/deal/${encodeURIComponent(row.id)}`;
  const stale = row.stale || motion === "closing";
  const cls = "deal tr-row" + (stale ? " deal--stale" : "") + (row.locked ? " tr-row--locked" : "") + (motion ? ` tr-row--${motion}` : "");
  const status = row.locked ? ", 30 min delay" : motion === "closing" ? ", now closed" : row.stale ? ", not live" : "";
  const size = row.cost === null ? null : usd(row.cost + (row.fees ?? 0));
  return (
    <article className={cls} data-deal={row.id}>
      <p className="tr-title"><Link className="tr-link" href={to} title={row.title}>{row.title}</Link></p>
      <p className="tr-play">{row.play}</p>
      <p className="tr-profit tr-r">
        {!lock ? <span className="tr-gap">{row.gapCents ?? 0}¢ gap</span>
          : row.profit === null ? <LockBar w={64} /> : <span className="tr-v profit">{usd(row.profit)}</span>}
        {lock ? <span className="tr-roi">{pct(row.roi)}</span> : null}
      </p>
      <p className="tr-size tr-r">{!lock ? <span className="tr-none">None</span> : size === null ? <LockBar /> : <><span className="tr-pre">Max </span>{size}</>}</p>
      <p className="tr-day tr-r">{!lock ? <span className="tr-none">None</span> : row.profitPerDay === null ? <LockBar w={48} /> : <>{usd(row.profitPerDay)}<span className="tr-pre"> a day</span></>}</p>
      <p className="tr-light"><SafetyLight safety={row.safety} /></p>
      <p className="tr-age">Found <Ago at={row.foundAt} serverNow={now} />{status}</p>
      {row.locked ? <a className="tr-unlock" href={unlockHref} data-unlock="feed-row">Unlock</a> : null}
    </article>
  );
}
