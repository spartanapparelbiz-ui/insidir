/* The Terminal table: one real table row per deal, dense and aligned. No hooks (the landing page renders it too);
 * the live behaviour (selection, keyboard, motion) is driven by LiveFeed through props and data attributes.
 *
 * Columns: Rules (check / alert / x badge) | Event | The play ("YES Kalshi 55¢ + NO Polymarket US 40¢", with a mini
 * $1 bar, the 30-minute gap sparkline and "Pays out in 2d 4h") | Profit after fees (the one bold number) | ROI |
 * Max size | Per day | Open for. Numbers are mono, right-aligned, fixed decimals per column (3.40%, $7.52).
 * Phones: Rules, Event (the play and its bar under it) and Profit (ROI under it).
 * Free rows arrive redacted (lib/feed.ts): their paid cells are lock bars with no value in the DOM at all. Every row's
 * event is a real link to /deal/[id], so it works without JS; the Terminal opens the drawer instead. */
import type { FeedRow } from "@/lib/feed";
import { clock2, money2, pct2 } from "@/lib/format";
import { playShort } from "@/lib/terminal-table";
import { SafetyLight } from "@/components/SafetyLight";
import { DollarBar } from "@/components/ui/DollarBar";
import { Sparkline } from "@/components/ui/Sparkline";
import "./terminal.css";

export type RowMotion = "new" | "tick" | "closing" | "gone" | null;

/** A locked value: a bar with a lock, never a loading skeleton. The value itself was never sent. */
export function LockBar({ w = 56 }: { w?: number }) {
  return (
    <span className="lockbar" role="img" aria-label="Locked: members only" style={{ width: w }}>
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5M2.5 5.5h7v5h-7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
    </span>
  );
}

/** "Pays out in 2d 4h": when the markets resolve and the $1 per set comes back. */
export function paysOut(closeTime: number | null, now: number): string | null {
  if (!closeTime || closeTime <= now) return null;
  const m = Math.round((closeTime - now) / 60_000);
  if (m < 60) return `Pays out in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `Pays out in ${h}h ${m % 60}m`;
  return `Pays out in ${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Fees per $1 payout, in cents, when the row carries them (paid rows). */
const feesPerDollar = (r: FeedRow): number => (r.fees !== null && r.sets ? (100 * r.fees) / r.sets : 0);

export function DealTable({ rows, now, motion = {}, selected = null, compact = false, caption, linkRows = true }: {
  rows: readonly FeedRow[];
  now: number;
  motion?: Readonly<Record<string, RowMotion>>;
  /** The keyboard-selected row (J/K): it holds the roving tabindex. */
  selected?: string | null;
  compact?: boolean;
  caption: string;
  /** Rows link to /deal/[id] (off in the landing phone mockup). */
  linkRows?: boolean;
}) {
  const sel = selected ?? rows[0]?.id ?? null;
  return (
    <div className={`dt-wrap${compact ? " dt--compact" : ""}`}>
      <table className="dt">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="dt-c-rules" data-tip="rules">Same rules?</th>
            <th scope="col" className="dt-c-event">Event</th>
            <th scope="col" className="dt-c-play">The play</th>
            <th scope="col" className="dt-r dt-c-profit" data-tip="profit">Profit after fees</th>
            <th scope="col" className="dt-r dt-c-roi">ROI</th>
            <th scope="col" className="dt-r dt-c-size">Max size</th>
            <th scope="col" className="dt-r dt-c-day" data-tip="perday">Per day</th>
            <th scope="col" className="dt-r dt-c-open">Open for</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const m = motion[r.id] ?? null;
            const lock = r.kind !== "second_opinion";
            const stale = r.stale || m === "closing" || m === "gone";
            const size = r.cost === null ? null : r.cost + (r.fees ?? 0);
            const pays = paysOut(r.closeTime, now);
            const href = `/deal/${encodeURIComponent(r.id)}`;
            const open = r.locked ? `Found ${clock2(now - r.foundAt)} ago`
              : m === "closing" || m === "gone" ? "Closed" : r.stale ? "Not live" : clock2(now - r.foundAt);
            const legs = r.legs.map(l => ({ label: `${l.side.toUpperCase()} on ${l.venueName}`, cents: l.priceCents }));
            return (
              <tr key={r.id} className={`dt-row${stale ? " dt-row--stale" : ""}${r.locked ? " dt-row--locked" : ""}${m ? ` dt-row--${m}` : ""}`}
                data-deal={r.id} tabIndex={sel === r.id ? 0 : -1} aria-selected={sel === r.id}>
                <td className="dt-c-rules"><SafetyLight safety={r.safety} bare /></td>
                <th scope="row" className="dt-c-event">
                  {linkRows ? <a className="dt-link" href={href} tabIndex={-1}>{r.title}</a> : <span className="dt-link">{r.title}</span>}
                  <span className="dt-sub dt-sub--sm">{playShort(r)}</span>
                </th>
                <td className="dt-c-play">
                  <span className="dt-play">{playShort(r)}</span>
                  <span className="dt-viz">
                    {lock && r.legs.length >= 2 ? <span className="dt-bar"><DollarBar legs={legs} feesCents={feesPerDollar(r)} size="inline" /></span> : null}
                    {r.spark ? <Sparkline points={r.spark} label={`Gap over the last 30 minutes, now ${r.spark[r.spark.length - 1]!.v}`} /> : null}
                    {pays ? <span className="dt-chip">{pays}</span> : null}
                  </span>
                </td>
                <td className="dt-r dt-c-profit">
                  {!lock ? <span className="dt-muted">{r.gapCents ?? 0}¢ gap</span> : r.profit === null ? <LockBar w={64} /> : <span className="dt-profit">{money2(r.profit)}</span>}
                  <span className="dt-sub dt-sub--sm dt-num">{lock ? pct2(r.roi) : "Not a lock"}</span>
                </td>
                <td className="dt-r dt-c-roi dt-num">{lock ? pct2(r.roi) : <span className="dt-muted">None</span>}</td>
                <td className="dt-r dt-c-size dt-num">{!lock ? <span className="dt-muted">None</span> : size === null ? <LockBar /> : money2(size)}</td>
                <td className="dt-r dt-c-day dt-num">{!lock ? <span className="dt-muted">None</span> : r.profitPerDay === null ? <LockBar w={48} /> : money2(r.profitPerDay)}</td>
                <td className="dt-r dt-c-open dt-num dt-time">{open}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
