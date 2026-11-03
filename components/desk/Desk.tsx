/* The Desk: the member home as a dense live desk. No greeting, no hero box.
 *   Tape      the last 20 millionaire bets, scrolling.
 *   Top bar   "Desk" · Live, updated Xs ago · KPIs (money, bets, wallets, biggest; hourly sparklines) · search (⌘K) · ET clock.
 *   Row 1     Live flow (8 cols, 12+ rows above the fold at 1440) | EdgeChart for the selected row (default: today's
 *             biggest) and Your desk (4 cols).
 *   Row 2     Millionaires active today (8) | Election Night: the top 5 races with their split and price (4).
 * Phones: tape, KPIs 2×2, EdgeChart, flow (cards), Your desk, leaderboard, election. Real data only (lib/desk). */
import type { Edge } from "@/lib/desk/edge";
import type { Desk as Data } from "@/lib/desk/data";
import type { Race } from "@/lib/brand/pulse";
import { dollars } from "@/lib/money";
import { Shell } from "@/components/brand/app/Shell";
import { CommandBar } from "./CommandBar";
import { EtClock, LivePulse } from "./Clock";
import { LiveFlow } from "./Flow";
import { TeamMark } from "./Marks";
import { Leaders, YourDesk } from "./Panels";
import { KpiRow } from "./Sparks";
import { Tape } from "./Tape";

function SplitBar({ r }: { r: Race }) {
  const y = r.millionaire.yes.dollars, n = r.millionaire.no.dollars, t = y + n;
  if (!t) return null;
  const pct = Math.round((y / t) * 100);
  return (
    <div className="d-split" role="img" aria-label={`Millionaire money: ${r.yesLabel} ${dollars(y)}, ${r.noLabel} ${dollars(n)}`}>
      <span className="d-split__y" style={{ width: `${pct}%` }} /><span className="d-split__n" style={{ width: `${100 - pct}%` }} />
    </div>
  );
}

function ElectionNight({ races }: { races: Race[] }) {
  const top = races.slice(0, 5);
  if (!top.length) return null;
  return (
    <section className="d-panel" data-testid="desk-election">
      <div className="d-panel__h"><span>Election Night</span><a className="b-small" href="/election">Every race</a></div>
      <ul className="d-races">{top.map(r => {
        const lead = r.millionaire.yes.dollars >= r.millionaire.no.dollars ? "yes" : "no";
        return (
          <li key={r.marketId}>
            <a href="/election" className="d-race">
              <TeamMark title={r.title} category="elections" outcome={lead === "yes" ? r.yesLabel : r.noLabel} size={22} />
              <span className="d-mkt__t" title={r.title}>{r.title}</span>
              {r.priceNow !== null ? <span className="d-num">{r.yesLabel} {Math.round(r.priceNow * 100)}¢</span> : null}
            </a>
            <SplitBar r={r} />
            {r.millionaire.yes.dollars + r.millionaire.no.dollars > 0
              ? <span className="d-race__m b-small"><span className="d-yes">{r.yesLabel} {dollars(r.millionaire.yes.dollars)}</span><span className="d-no">{r.noLabel} {dollars(r.millionaire.no.dollars)}</span></span>
              : <span className="d-race__m b-small d-dim">{dollars(r.total)} from Pro wallets, no millionaire money yet</span>}
          </li>
        );
      })}</ul>
    </section>
  );
}

export function Desk({ d, edge, search }: { d: Data; edge: Edge | null; search: boolean }) {
  const races = d.election?.free ?? [];
  return (
    <Shell current="home">
      <div className="d-root" data-testid="member-home" data-home="desk">
        <Tape bets={d.tape} />
        <header className="d-top">
          <div className="d-top__id">
            <h1 className="d-title">Desk</h1>
            <LivePulse updatedAt={d.updatedAt} now={d.now} />
            <EtClock now={d.now} />
          </div>
          <KpiRow kpis={d.kpis} />
          <CommandBar open={search} />
        </header>
        {d.flow.length ? (
          <LiveFlow initial={d.flow.slice(0, 16)} now={d.now} initialEdge={edge} n={16} aside={<YourDesk key="your-desk" desk={d.desk} suggest={d.leaders} />} />
        ) : (
          <div className="d-grid"><div className="d-col8"><div className="d-panel"><div className="d-panel__h"><span>Live flow</span></div><p className="b-empty">No millionaire bet in the last day. The second one lands, it shows here.</p></div></div>
            <div className="d-col4"><YourDesk desk={d.desk} suggest={d.leaders} /></div></div>
        )}
        <div className="d-grid">
          {d.leaders.length ? <div className={races.length ? "d-col8" : "d-col12"}><Leaders list={d.leaders} /></div> : null}
          {races.length ? <div className={d.leaders.length ? "d-col4" : "d-col12"}><ElectionNight races={races} /></div> : null}
        </div>
      </div>
    </Shell>
  );
}
