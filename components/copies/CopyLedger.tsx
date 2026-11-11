/* My copies (lib/copies/mine.ts): the running totals (this week, this month, all time; placed copies only: settled at
 * their result, open at today's price), then every trade the member tapped Copy on: their entry, the price now, the
 * wallet they copied and whether it's still in, and Placed / Skipped. Losses as plain as wins. Server markup. */
import type { MyCopy, Totals } from "@/lib/copies/mine";
import { dollars } from "@/lib/money";
import { MarkCopy } from "./MarkCopy";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const cents = (p: number | null) => (p === null ? "No price" : `${Math.round(p * 100)}¢`);
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

/** "Your copies this month: +$212." for the top of the home screen. */
export function CopyTotal({ t }: { t: Totals }) {
  return (
    <a className="cl-total" href="/copies" data-testid="copies-total">
      Your copies this month: <b className={`b-num ${t.month < 0 ? "b-down" : ""}`}>{signed(t.month)}</b>
      <span className="b-small"> · this week {signed(t.week)} · all time {signed(t.all)}</span>
    </a>
  );
}

export function CopyLedger({ list, totals }: { list: MyCopy[]; totals: Totals }) {
  return (
    <div className="cl" data-testid="copy-ledger">
      <dl className="cl-totals" data-testid="copy-totals">
        <div><dt>This week</dt><dd className={`b-num ${totals.week < 0 ? "b-down" : ""}`}>{signed(totals.week)}</dd></div>
        <div><dt>This month</dt><dd className={`b-num ${totals.month < 0 ? "b-down" : ""}`}>{signed(totals.month)}</dd></div>
        <div><dt>All time</dt><dd className={`b-num ${totals.all < 0 ? "b-down" : ""}`}>{signed(totals.all)}</dd></div>
      </dl>
      <p className="b-small">Placed copies only ({totals.placed}, {totals.open} open): settled ones at their result, open ones at today&apos;s price on your venue. Mark each copy placed or skipped so this stays true.</p>
      {list.length ? (
        <ol className="cl-rows">
          {list.map(c => (
            <li key={c.id} className="cl-row" data-testid="copy-row" data-status={c.status}>
              <div className="cl-row__main">
                <span className="s-strong">{c.outcome} · {c.title}</span>
                <span className="b-small">{DAY.format(new Date(c.at))} on {c.venue === "kalshi" ? "Kalshi" : "Polymarket"} · ${c.amount.toLocaleString("en-US")} · copied {c.short ?? "a wallet"}{c.stillIn === null ? "" : c.stillIn ? " · still in" : " · it sold"}</span>
              </div>
              <span className="cl-px b-num"><small>Entry</small>{cents(c.entry)}</span>
              <span className="cl-px b-num"><small>{c.result ? "Result" : "Now"}</small>{c.result ? c.result.toUpperCase() : cents(c.now)}</span>
              <b className={`b-num cl-val ${c.value !== null && c.value < 0 ? "b-down" : ""}`}>{c.status === "skipped" ? "Skipped" : c.value !== null ? signed(c.value) : ""}</b>
              <MarkCopy id={c.id} status={c.status} />
            </li>
          ))}
        </ol>
      ) : <p className="b-empty">No copies yet. Tap Copy on an alert or on a wallet&apos;s trade and it shows here.</p>}
    </div>
  );
}
