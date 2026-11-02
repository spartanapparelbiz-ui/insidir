/* The member home: black; a greeting in masked lines, then the five things they bought, as tabs (lib/brand/copy.ts
 * MEMBERS, the same five rows the landing promises): Check (check a bet; their checked markets; their week) · Board
 * (every millionaire bet, live, in their categories) · Brief (today's top 3 by millionaire money, how yesterday's went)
 * · Following (the wallets they follow and their bets) · Live (the races and games with the most millionaire money
 * now). Every number live (lib/brand/dashboard.ts). */
import type { CSSProperties } from "react";
import { category as categoryInfo } from "@/lib/brand/categories";
import { MEMBERS } from "@/lib/brand/copy";
import type { Dashboard as Data } from "@/lib/brand/dashboard";
import type { MarketMoney } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { agoText } from "@/lib/moves/copy";
import { AskBox } from "../AskBox";
import { BetRow } from "../BetRow";
import { Lines, signedDollars } from "../Bits";
import { LiveFeed } from "../LiveFeed";
import { Shell } from "./Shell";

export type HomeTab = "check" | "board" | "brief" | "following" | "live";
export const TABS: Array<[HomeTab, string]> = MEMBERS.map(m => [m.tab.toLowerCase() as HomeTab, m.tab]);
export const isTab = (v: unknown): v is HomeTab => TABS.some(([k]) => k === v);

const ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" });
export const greeting = (now: number): string => { const h = Number(ET.format(new Date(now))) % 24; return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const settle = (d: number) => ({ "data-m": "settle" as const, style: { "--d": `${d}s` } as CSSProperties });
const mil = (m: MarketMoney) => m.millionaire.yes.dollars + m.millionaire.no.dollars;

function MarketRows({ list, testid }: { list: MarketMoney[]; testid: string }) {
  return (
    <ol className="b-rows" style={{ paddingLeft: 0 }} data-testid={testid}>
      {list.map((m, i) => (
        <li key={m.marketId}><a className="b-row" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }} href={`/read/open?pick=polymarket:${m.marketId}`}>
          <span className="b-small">{i + 1}</span>
          <span className="b-row__main"><span className="b-row__title">{m.title}</span><span className="b-row__meta">{categoryInfo(m.category).name} · {m.millionaire.yes.wallets + m.millionaire.no.wallets} millionaire wallets</span></span>
          <span className="b-row__money"><span className="b-row__size b-num">{dollars(mil(m))}</span><span className="b-small">millionaire money</span></span>
        </a></li>
      ))}
    </ol>
  );
}

export function Dashboard({ d, firstName, tab }: { d: Data; firstName: string | null; tab: HomeTab }) {
  const cats = d.cats.length ? d.cats.map(c => categoryInfo(c).name).join(", ") : "every category";
  let body: React.ReactNode;
  switch (tab) {
    case "check":
      body = (
        <div className="b-panels">
          <div className="b-glass b-pad b-wide" id="ask" {...settle(0.5)}>
            <h2 className="b-panel-h">Check a bet</h2>
            <AskBox id="home-ask" settle={false} />
          </div>
          <div className="b-glass b-pad" data-testid="your-markets" {...settle(0.6)}>
            <h2 className="b-panel-h">Your checks</h2>
            {d.markets.length ? (
              <ul className="b-rows">{d.markets.map(x => {
                const m = x.money, total = m ? mil(m) : 0;
                return (
                  <li key={x.key}><a className="b-row" href={`/read/${x.latest.id}`} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }} data-testid="your-market">
                    <span className="b-row__main"><span className="b-row__title">{x.latest.data.question}</span><span className="b-row__meta">checked {agoText(x.latest.createdAt, d.now)}</span></span>
                    <span className="b-row__money"><span className="b-row__size b-num">{total ? dollars(total) : "–"}</span><span className="b-small">millionaire money</span></span>
                  </a></li>
                );
              })}</ul>
            ) : <p className="b-empty">Every bet you check stays here, with the millionaire money on it now.</p>}
          </div>
          <div className="b-glass b-pad" data-testid="week-recap" {...settle(0.7)}>
            <h2 className="b-panel-h">Your week</h2>
            {d.week.of ? (
              <>
                <p style={{ margin: "0 0 10px", fontWeight: 500, fontSize: 17 }}>The side with more millionaire money won <span className="b-num">{d.week.right}</span> of <span className="b-num">{d.week.of}</span> of your markets.</p>
                <ul className="b-rows">{d.week.lines.map(l => <li key={l.question} className="b-row" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}><b className={l.right ? "b-up" : "b-down"}>{l.right ? "✓" : "✕"}</b><span className="b-row__title">{l.question}: millionaire money on {l.heavier}, {l.won} won</span></li>)}</ul>
              </>
            ) : <p className="b-empty">None of your markets settled this week. When they do, this shows whether the millionaires&apos; side won, losses included.</p>}
            <p className="b-small" style={{ marginTop: 10 }}>Past results, not a promise.</p>
          </div>
        </div>
      );
      break;
    case "board":
      body = (
        <div className="b-glass b-pad" {...settle(0.5)} data-testid="tab-board">
          <h2 className="b-panel-h">Every millionaire bet in {cats}<a className="b-small" href="/go?step=cats">Change</a></h2>
          <LiveFeed initial={{ now: d.now, pulse: d.pulse, bets: d.feed }} n={20} cats={d.cats} settle={false} />
          <p className="b-small" style={{ marginTop: 10 }}>Pings go out the second one lands in your categories (Account → Alerts).</p>
        </div>
      );
      break;
    case "brief":
      body = (
        <div className="b-panels" data-testid="tab-brief">
          <div className="b-glass b-pad" {...settle(0.5)}>
            <h2 className="b-panel-h">Today&apos;s top 3 by millionaire money</h2>
            {d.brief.top.length ? <MarketRows list={d.brief.top} testid="brief-top" /> : <p className="b-empty">No millionaire money yet today.</p>}
          </div>
          <div className="b-glass b-pad" {...settle(0.6)}>
            <h2 className="b-panel-h">How yesterday&apos;s went</h2>
            {d.brief.yesterday.length ? (
              <ul className="b-rows" data-testid="brief-yesterday">{d.brief.yesterday.map(s => <li key={s.marketId} className="b-row" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}><b className={s.right ? "b-up" : "b-down"}>{s.right ? "✓" : "✕"}</b><span className="b-row__title">{s.title}: millionaire money on {s.heavier}, {s.won ?? "the other side"} won</span></li>)}</ul>
            ) : <p className="b-empty">No market with millionaire money settled yesterday.</p>}
            <p className="b-small" style={{ marginTop: 10 }}>Losses included. Past results, not a promise.</p>
          </div>
        </div>
      );
      break;
    case "following":
      body = (
        <div className="b-panels" data-testid="following-panel">
          <div className="b-glass b-pad" {...settle(0.5)}>
            <h2 className="b-panel-h">Wallets you follow<a className="b-small" href="/board">Find wallets</a></h2>
            {d.following.cards.length ? (
              <ul className="b-rows">{d.following.cards.map(c => <li key={c.wallet} className="b-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span className="b-row__title">{c.short}</span><span className="b-up b-num" style={{ fontWeight: 600 }}>{c.pnl !== null ? `${signedDollars(c.pnl)} all-time` : ""}</span></li>)}</ul>
            ) : <p className="b-empty">Follow a wallet that&apos;s up millions and every bet it makes lands here.</p>}
          </div>
          <div className="b-glass b-pad" {...settle(0.6)}>
            <h2 className="b-panel-h">Their latest bets</h2>
            {d.following.bets.length ? <ul className="b-rows">{d.following.bets.map(b => <li key={b.id}><BetRow bet={b} now={d.now} href={`/read/open?pick=polymarket:${b.marketId}`} /></li>)}</ul>
              : <p className="b-empty">{d.following.wallets ? "The wallets you follow haven't bet $5K+ lately." : "Nothing yet."}</p>}
          </div>
        </div>
      );
      break;
    case "live":
      body = (
        <div className="b-panels" data-testid="tab-live">
          <div className="b-glass b-pad" {...settle(0.5)}>
            <h2 className="b-panel-h">The races and games that matter now</h2>
            {d.live.markets.length ? <MarketRows list={d.live.markets} testid="live-markets" /> : <p className="b-empty">No race or game has millionaire money right now.</p>}
          </div>
          <div className="b-glass b-pad" {...settle(0.6)}>
            <h2 className="b-panel-h">Their bets, the last 6 hours</h2>
            {d.live.bets.length ? <ul className="b-rows">{d.live.bets.map(b => <li key={b.id}><BetRow bet={b} now={d.now} href={`/read/open?pick=polymarket:${b.marketId}`} /></li>)}</ul> : <p className="b-empty">Nothing in the last 6 hours.</p>}
          </div>
        </div>
      );
      break;
  }
  return (
    <Shell current="home">
      <section className="b-stage" data-testid="member-home" data-tab={tab}>
        <div style={{ display: "grid", gap: 16, marginBottom: 18 }}>
          <Lines as="h1" lines={[`${greeting(d.now)}${firstName ? `, ${firstName}` : ""}.`]} size={52} />
          <nav className="b-chips" style={{ justifyContent: "flex-start" }} aria-label="Your home" data-testid="home-tabs">
            {TABS.map(([k, label], i) => <a key={k} className="b-btn b-panel-pill" aria-current={tab === k ? "page" : undefined} data-on={tab === k ? "true" : "false"} href={k === "check" ? "/" : `/?tab=${k}`} {...settle(0.3 + i * 0.04)}>{label}</a>)}
          </nav>
        </div>
        {body}
      </section>
    </Shell>
  );
}
