/* The public receipts log: every lock found, as it looked when found, and how it settled. Unsettled = "open".
 * Shared by the landing page (section 5) and /receipts. */
import { SafetyLight } from "@/components/SafetyLight";
import type { BacktestResult } from "@/lib/engines/receipts";
import { playText } from "@/lib/feed";
import { pct, usd } from "@/lib/format";
import type { ReceiptRow } from "@/lib/queries";
import { FOLLOW_STAKE, isSettled, type ReceiptTally } from "./model";

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
export const whenText = (ms: number): string => WHEN.format(new Date(ms)) + " UTC";
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const dayText = (ms: number): string => DAY.format(new Date(ms));

const signed = (v: number): string => (v > 0 ? "+" : "") + usd(v);

/** "Following every green deal with $500 would have made $X." Null result renders nothing. */
export function FollowLine({ res, period }: { res: BacktestResult | null; period: string }) {
  if (!res) return null;
  const verb = res.realizedProfit >= 0 ? "made" : "lost";
  return (
    <p className="lp-follow">
      Following every green deal {period} with {usd(FOLLOW_STAKE)} would have {verb}{" "}
      <b className={res.realizedProfit > 0 ? "profit" : undefined}>{usd(Math.abs(res.realizedProfit))}</b>
      <span className="muted small"> on {usd(res.staked)} staked across {res.count} settled green {res.count === 1 ? "deal" : "deals"}, fees included, each capped at what was fillable when found{res.broken ? `; ${res.broken} settled differently and ${res.broken === 1 ? "is" : "are"} counted at its real result` : ""}{res.pending ? `; ${res.pending} still open, not counted` : ""}.</span>
    </p>
  );
}

export function TallyLine({ t }: { t: ReceiptTally }) {
  if (!t.total) return null;
  return (
    <p className="small muted">
      {t.total} found · {t.sameWay} settled the same way · {t.differently} settled differently · {t.open} open
    </p>
  );
}

/** One receipt. `showSize`: free viewers see size and dollar profit only once a deal has settled. */
export function ReceiptItem({ r, showSize }: { r: ReceiptRow; showSize: boolean }) {
  const o = r.snapshot;
  const settled = isSettled(r);
  const sizeVisible = showSize || settled;
  const blur = <span className="blur" aria-label="Locked" />;
  return (
    <li className="lp-rcpt">
      <div className="lp-rcpt__top">
        <span className="tiny dim">{whenText(r.detectedAt)}</span>
        <SafetyLight safety={o.safety} />
      </div>
      <p className="deal__title">{o.title}</p>
      <p className="deal__play">{playText(o)}</p>
      <div className="lp-rcpt__nums">
        <span><span className="num__k">ROI when found</span><span className="num__v">{pct(o.roi)}</span></span>
        <span><span className="num__k">Size when found</span><span className="num__v">{sizeVisible ? usd(o.cost + o.fees) : blur}</span></span>
        <span><span className="num__k">Settled</span><span className="num__v">{settled ? (r.sameWay ? "Same way" : "Differently") : "open"}</span></span>
        <span><span className="num__k">Realized P&amp;L</span><span className={`num__v${settled && (r.realizedProfit ?? 0) > 0 ? " profit" : ""}`}>{settled ? signed(r.realizedProfit ?? 0) : "open"}</span></span>
      </div>
    </li>
  );
}

export function ReceiptList({ rows, showSize }: { rows: readonly ReceiptRow[]; showSize: boolean }) {
  return <ul className="lp-rcpts">{rows.map(r => <ReceiptItem key={r.id} r={r} showSize={showSize} />)}</ul>;
}
