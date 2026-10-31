/* "Open now" from winners (lib/follow/open.ts): a table of open positions from trackers and traders with a positive
 * followable record on 30+ settled. Each row: who it's from and their record, the artwork and outcome, amount, the
 * price Insidir showed it at, the price now, and the time left. Visitors: the 3 newest and "38 more open" with the trial;
 * members: every one, refreshed every 30 seconds. Server component. */
import Link from "next/link";
import { MoveArt } from "@/components/MoveArt";
import { Table, tone } from "@/components/stats/Stats";
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
      <Table label="Open now from winning trackers" head={["Position", "From", "Amount", "Seen at", "Now", "Left"]} numeric={[2, 3, 4, 5]}
        rows={rows.map(r => [
          <Link key="m" className="dtable__link dtable__link--art" href={`/market/${encodeURIComponent(r.marketId)}`}><MoveArt art={r.art} /><span>{r.headline}<span className="dtable__sub">{r.subline}</span></span></Link>,
          <span key="f" className="opennow__from">{r.from.kind === "tracker" ? <Link href={`/trackers/${r.from.slug}`}>{r.from.name}</Link> : <Link href={`/p/${r.from.wallet}`}>{r.from.name}</Link>}
            <span className="dtable__sub"><span className={tone(r.record.net)}>{roiText(r.record.net, r.record.staked)}</span> followable · {r.record.n} settled</span></span>,
          r.n > 1 ? <span key="a">{r.n} positions · {dollars(r.amount)}</span> : dollars(r.amount), pct(r.seenPrice), r.nowPrice === null ? "—" : <span className={r.seenPrice === null ? undefined : tone(r.nowPrice - r.seenPrice)}>{pct(r.nowPrice)}</span>, left(r.endAt, now),
        ])} />
      {rows[0]?.analyst ? (
        <div className="opennow__first" data-testid="open-first-note">
          <p className="opennow__firsth">{rows[0].headline}</p>
          <AnalystNote text={rows[0].analyst.text} facts={rows[0].analyst.facts} at={rows[0].analyst.at} />
        </div>
      ) : null}
      <p className="opennow__note">{PAST} Seen at is the price on their side when Insidir showed the position; following it costs about a point more.</p>
      {!member && more && total > rows.length ? (
        <p className="opennow__more" data-testid="open-more"><b>{(total - rows.length).toLocaleString("en-US")} more open.</b> Members see every one, live. <a className="tlink tlink--go" href={trialHref}>Try 7 days for $1 <span className="arrow" aria-hidden="true">→</span></a></p>
      ) : null}
    </div>
  );
}
