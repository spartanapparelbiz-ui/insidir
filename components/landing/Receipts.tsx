/* The public receipts log: every lock found, as it looked when found, and how it settled. Wins and misses alike;
 * unsettled rows say "Open". On the landing page it is printed like a statement on a light section (Statement):
 * the period, the tally, then one ruled line per deal with its exact time found (UTC). One line per deal on
 * desktop, two on phones. */
import type { ReactNode } from "react";
import { SafetyLight } from "@/components/SafetyLight";
import type { BacktestResult } from "@/lib/engines/receipts";
import { pct, usd } from "@/lib/format";
import type { ReceiptRow } from "@/lib/queries";
import { FOLLOW_STAKE, isSettled, type ReceiptTally } from "./model";

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const whenText = (ms: number): string => WHEN.format(new Date(ms));
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const dayText = (ms: number): string => DAY.format(new Date(ms));

const STAMP = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
/** "Oct 26, 14:32": the exact minute a deal was found, in UTC. */
export const stampText = (ms: number): string => STAMP.format(new Date(ms));

const signed = (v: number): string => (v > 0 ? "+" : "") + usd(v);

/** "Following every green deal with $500 would have made $X." Null result renders nothing. */
export function FollowLine({ res, period }: { res: BacktestResult | null; period: string }) {
  if (!res) return null;
  const made = res.realizedProfit >= 0;
  return (
    <div className="lp-follow">
      <p className="lp-follow__line">Following every green deal {period} with {usd(FOLLOW_STAKE)} would have {made ? "made" : "lost"}{" "}
        <span className={`mono${made && res.realizedProfit > 0 ? " profit" : ""}`}>{usd(Math.abs(res.realizedProfit))}</span>.</p>
      <p className="lp-follow__note">
        That&apos;s {usd(res.staked)} staked across {res.count} settled green {res.count === 1 ? "deal" : "deals"}, after fees, each capped at what you could buy when we found it.
        {res.broken ? ` ${res.broken} settled differently and ${res.broken === 1 ? "counts" : "count"} at the real result.` : ""}
        {res.pending ? ` ${res.pending} still open, not counted.` : ""}
      </p>
    </div>
  );
}

export function TallyLine({ t }: { t: ReceiptTally }) {
  if (!t.total) return null;
  return (
    <p className="lp-tally">
      {t.total} found. {t.sameWay} settled the same way{t.differently ? `, ${t.differently} settled differently` : ""}{t.open ? `, ${t.open} still open` : ""}.
    </p>
  );
}

/** One receipt: when it was found, the deal, its light, ROI when found, and how it ended (dollars only once settled). */
export function ReceiptItem({ r }: { r: ReceiptRow }) {
  const o = r.snapshot;
  const settled = isSettled(r);
  const won = settled && r.sameWay === true;
  const result = !settled ? "Open" : won ? signed(r.realizedProfit ?? 0) : "Settled differently";
  return (
    <li className={`rcpt${settled && !won ? " rcpt--miss" : ""}`}>
      <time className="rcpt__when mono" dateTime={new Date(r.detectedAt).toISOString()}>{stampText(r.detectedAt)}</time>
      <span className="rcpt__title">{o.title}</span>
      <span className="rcpt__light"><SafetyLight safety={o.safety} /></span>
      <span className="rcpt__roi mono"><span className="sr-only">ROI when found: </span>{pct(o.roi)}</span>
      <span className={`rcpt__result mono${won && (r.realizedProfit ?? 0) > 0 ? " profit" : ""}`}><span className="sr-only">Result: </span>{result}</span>
    </li>
  );
}

export function ReceiptList({ rows }: { rows: readonly ReceiptRow[] }) {
  return (
    <div className="rcpts">
      <p className="rcpts__head" aria-hidden="true"><span>Found</span><span>Deal</span><span>Light</span><span>ROI</span><span>Result</span></p>
      <ul className="rcpts__list">{rows.map(r => <ReceiptItem key={r.id} r={r} />)}</ul>
    </div>
  );
}

/** The landing page's receipts, printed like an audited statement: the period and time zone, the tally (zeros
 *  hidden), the lines, and a note that rows are never edited (receipts are snapshots taken when found). */
export function Statement({ from, to, t, children }: { from: number; to: number; t: ReceiptTally; children: ReactNode }) {
  const tallies = [["Found", t.total], ["Settled the same way", t.sameWay], ["Settled differently", t.differently], ["Still open", t.open]] as const;
  return (
    <div className="stmt">
      <div className="stmt__head">
        <p className="stmt__brand">Insidir · Receipts</p>
        <p className="stmt__period mono">{whenText(from)} – {dayText(to)} · times in UTC</p>
      </div>
      <dl className="stmt__tally">
        {tallies.filter(([, n]) => n > 0).map(([k, n]) => <div key={k}><dt>{k}</dt><dd className="mono">{n}</dd></div>)}
      </dl>
      {children}
      <p className="stmt__foot">Each line is the deal as we found it, saved at that moment and never edited. Misses stay in.</p>
    </div>
  );
}
