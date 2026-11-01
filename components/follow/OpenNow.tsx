/* "Open now" from winners (lib/follow/open.ts): a table of open positions from trackers and traders with a positive
 * followable record on 30+ settled. Each row: who it's from and their record, the artwork and outcome, amount, the
 * price Insidir showed it at, the price now, and the time left. Visitors: the 3 newest and "38 more open" with the trial;
 * members: every one, refreshed every 30 seconds. Server component. */
import Link from "next/link";
import { Fragment } from "react";
import { MoveArt } from "@/components/MoveArt";
import { tone } from "@/components/stats/Stats";
import { Refresh } from "@/components/follow/Refresh";
import { PAST } from "@/lib/copy";
import { roiText } from "@/lib/follow/math";
import type { OpenRow } from "@/lib/follow/open";
import { AnalystNote } from "@/components/analyst/AnalystNote";
import { dollars } from "@/lib/moves/copy";

const pct = (p: number | null) => (p === null ? "—" : `${Math.round(p * 100)}%`);
const left = (end: number | null, now: number): string => {
  if (end === null) return "—";
  const ms = end - now;
  if (ms <= 0) return "Settling";
  const h = Math.floor(ms / 3_600_000), d = Math.floor(h / 24);
  return d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h` : `${Math.max(1, Math.round(ms / 60_000))}m`;
};

export function OpenNow({ rows, total, member, now, trialHref, more = true }: { rows: OpenRow[]; total: number; member: boolean; now: number; trialHref: string; more?: boolean }) {
  if (!rows.length) return <p className="dnote" data-testid="open-empty">No open positions from winning trackers right now. A tracker counts as winning with a positive followable return on 30 or more settled positions.</p>;
  return (
    <div className="opennow" data-testid="open-now">
      {member ? <Refresh /> : null}
      {/* A table on wide screens; under 640px each row is a card (app/polish.css .otable): the position (2 lines at
          most), who it's from and their record, then amount / seen at / now / left on one line. */}
      <table className="otable" aria-label="Open now from winning trackers">
        <thead><tr><th scope="col">Position</th><th scope="col">From</th><th scope="col" className="r">Amount</th><th scope="col" className="r">Seen at</th><th scope="col" className="r">Now</th><th scope="col" className="r">Left</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <Fragment key={`${r.marketId}-${i}`}>
              <tr className="otable__row">
                <th scope="row" className="otable__pos">
                  <Link className="otable__link" href={`/market/${encodeURIComponent(r.marketId)}`}><MoveArt art={r.art} /><span className="otable__what"><span className="otable__h">{r.headline}</span><span className="otable__sub">{r.subline}</span></span></Link>
                </th>
                <td className="otable__from">
                  {r.from.kind === "tracker" ? <Link href={`/trackers/${r.from.slug}`}>{r.from.name}</Link> : <Link href={`/p/${r.from.wallet}`}>{r.from.name}</Link>}
                  <span className="otable__sub"><span className={tone(r.record.net)}>{roiText(r.record.net, r.record.staked)}</span> followable · {r.record.n} settled</span>
                </td>
                <td className="r num" data-label="Amount">{r.n > 1 ? `${r.n} positions · ${dollars(r.amount)}` : dollars(r.amount)}</td>
                <td className="r num" data-label="Seen at">{pct(r.seenPrice)}</td>
                <td className="r num" data-label="Now">{r.nowPrice === null ? "—" : <span className={r.seenPrice === null ? undefined : tone(r.nowPrice - r.seenPrice)}>{pct(r.nowPrice)}</span>}</td>
                <td className="r num" data-label="Left">{left(r.endAt, now)}</td>
              </tr>
              {i === 0 && r.analyst ? (
                <tr className="otable__noterow" data-testid="open-first-note"><td colSpan={6}><AnalystNote text={r.analyst.text} facts={r.analyst.facts} at={r.analyst.at} /></td></tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="opennow__note">{PAST} Seen at is the price on their side when Insidir showed the position; following it costs about a point more.</p>
      {!member && more && total > rows.length ? (
        <p className="opennow__more" data-testid="open-more"><b>{(total - rows.length).toLocaleString("en-US")} more open.</b> Members see every one, live. <a className="tlink tlink--go" href={trialHref}>Start for $1 <span className="arrow" aria-hidden="true">→</span></a></p>
      ) : null}
    </div>
  );
}
