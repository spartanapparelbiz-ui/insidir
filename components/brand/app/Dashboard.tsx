/* The member home: black; a greeting in masked lines and the ask pill ("Check a bet"), then glass panels: the live
 * feed in their categories, their checked markets (with the millionaire money on each now), the wallets they follow,
 * and their week. Every number live (lib/brand/dashboard.ts). */
import type { CSSProperties } from "react";
import { category as categoryInfo } from "@/lib/brand/categories";
import type { Dashboard as Data } from "@/lib/brand/dashboard";
import { dollars } from "@/lib/money";
import { agoText } from "@/lib/moves/copy";
import { AskBox } from "../AskBox";
import { BetRow } from "../BetRow";
import { Lines } from "../Bits";
import { LiveFeed } from "../LiveFeed";
import { Shell } from "./Shell";

const ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" });
export const greeting = (now: number): string => { const h = Number(ET.format(new Date(now))) % 24; return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const settle = (d: number) => ({ "data-m": "settle" as const, style: { "--d": `${d}s` } as CSSProperties });

export function Dashboard({ d, firstName }: { d: Data; firstName: string | null }) {
  return (
    <Shell current="home">
      <section className="b-stage" data-testid="member-home">
        <div style={{ display: "grid", gap: 18, marginBottom: 18 }} id="ask">
          <Lines as="h1" lines={[`${greeting(d.now)}${firstName ? `, ${firstName}` : ""}.`]} size={52} />
          <div style={{ maxWidth: 680, width: "100%" }}><AskBox autoFocus={false} id="home-ask" /></div>
        </div>
        <div className="b-panels">
          <div className="b-glass b-pad b-wide" {...settle(0.5)}>
            <h2 className="b-panel-h">Millionaire bets {d.cats.length ? `in ${d.cats.map(c => categoryInfo(c).name).join(", ")}` : "everywhere"}<a className="b-small" href="/go?step=cats">Change</a></h2>
            <LiveFeed initial={{ now: d.now, pulse: d.pulse, bets: d.feed }} n={8} cats={d.cats} settle={false} />
          </div>
          <div className="b-glass b-pad" data-testid="your-markets" {...settle(0.6)}>
            <h2 className="b-panel-h">Your markets</h2>
            {d.markets.length ? (
              <ul className="b-rows">{d.markets.map(x => {
                const m = x.money, mil = m ? m.millionaire.yes.dollars + m.millionaire.no.dollars : 0;
                return (
                  <li key={x.key}><a className="b-row" href={`/read/${x.latest.id}`} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }} data-testid="your-market">
                    <span className="b-row__main"><span className="b-row__title">{x.latest.data.question}</span><span className="b-row__meta">checked {agoText(x.latest.createdAt, d.now)}</span></span>
                    <span className="b-row__money"><span className="b-row__size b-num">{mil ? dollars(mil) : "–"}</span><span className="b-small">millionaire money</span></span>
                  </a></li>
                );
              })}</ul>
            ) : <p className="b-empty">Every bet you check stays here, with the millionaire money on it now.</p>}
          </div>
          <div className="b-glass b-pad" data-testid="following-panel" {...settle(0.7)}>
            <h2 className="b-panel-h">Following<a className="b-small" href="/board">Find wallets</a></h2>
            {d.following.bets.length ? <ul className="b-rows">{d.following.bets.map(b => <li key={b.id}><BetRow bet={b} now={d.now} href={`/read/open?pick=polymarket:${b.marketId}`} /></li>)}</ul>
              : <p className="b-empty">{d.following.wallets ? "The wallets you follow haven't bet $5K+ lately." : "Follow a millionaire from the board and every bet they make lands here."}</p>}
          </div>
          <div className="b-glass b-pad b-wide" data-testid="week-recap" {...settle(0.8)}>
            <h2 className="b-panel-h">Your week</h2>
            {d.week.of ? (
              <>
                <p style={{ margin: "0 0 10px", fontWeight: 500, fontSize: 18 }}>The side with more millionaire money won <span className="b-num">{d.week.right}</span> of <span className="b-num">{d.week.of}</span> of your markets.</p>
                <ul className="b-rows">{d.week.lines.map(l => <li key={l.question} className="b-row" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}><b className={l.right ? "b-up" : "b-down"}>{l.right ? "✓" : "✕"}</b><span className="b-row__title">{l.question}: millionaire money on {l.heavier}, {l.won} won</span></li>)}</ul>
              </>
            ) : <p className="b-empty">None of your markets settled this week. When they do, this shows whether the millionaires&apos; side won, losses included.</p>}
            <p className="b-small" style={{ marginTop: 10 }}>Past results, not a promise.</p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
