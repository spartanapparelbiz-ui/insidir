/* The public receipts log: every lock found, as it looked when found, and how it settled. Wins and misses alike;
 * unsettled rows say "Open". Shared by the landing page (section 4) and /receipts. A compact list: one line per
 * deal on desktop, two on phones. */
import { SafetyLight } from "@/components/SafetyLight";
import type { BacktestResult } from "@/lib/engines/receipts";
import { pct, usd } from "@/lib/format";
import type { ReceiptRow } from "@/lib/queries";
import { FOLLOW_STAKE, isSettled, type ReceiptTally } from "./model";

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const whenText = (ms: number): string => WHEN.format(new Date(ms));
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const dayText = (ms: number): string => DAY.format(new Date(ms));

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
      <span className="rcpt__when mono">{whenText(r.detectedAt)}</span>
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
