/* The member home's AI analyst, second on the page: the 24-hour numbers, today's brief (written by the AI from
 * Insidir's data, every number verified against it), the member's watched bets, Bet Briefing (paste a link), and Ask
 * Insidir. Each block names its source. Information, not advice. */
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import { PHOTOS } from "@/lib/brand/images";
import type { Home } from "@/lib/home/data";
import { dollars } from "@/lib/money";
import { Panel, Pill, Stage } from "@/components/system";
import { DayPicture } from "./DayPicture";

const ASKS = ["Who's the best NFL wallet this month and what's he on today?", "Is anyone big against my bet?", "Why did the odds move?"];

export function AiDesk({ d }: { d: Home }) {
  const b = d.ai.brief;
  const span = d.today ? "today" : "in 24 hours";
  const money = d.today?.money ?? d.day?.money ?? 0, bets = d.today?.bets ?? d.day?.bets ?? 0;
  const top = d.ai.topCategory && isCategory(d.ai.topCategory) ? categoryInfo(d.ai.topCategory).name : null;
  const stats = [
    money > 0 ? { v: dollars(money), k: `bet by $1M+ wallets ${span}` } : null,
    bets > 0 ? { v: bets.toLocaleString("en-US"), k: `bets of $5K+ ${span}` } : null,
    d.today?.wallets ? { v: d.today.wallets.toLocaleString("en-US"), k: "$1M+ wallets active today" } : null,
    d.ai.markets > 0 ? { v: d.ai.markets.toLocaleString("en-US"), k: "markets they bet, 24 hours" } : null,
    top ? { v: top, k: "where the most money went" } : null,
  ].filter((x): x is { v: string; k: string } => x !== null);
  return (
    <Stage bg={{ kind: "photo", photo: PHOTOS.street, dark: 0.72 }} id="ai" testid="home-ai" labelledBy="ai-h">
      <div className="b-head">
        <p className="hm-eyebrow">AI analyst</p>
        <h2 id="ai-h" className="ai-h">Your AI analyst.</h2>
        <p className="b-sub">Follows every bet from wallets up $1M+ and tells you what it means for yours. Written from Insidir&apos;s data only, every number verified against it.</p>
      </div>
      {stats.length ? (
        <dl className="ai-strip" data-testid="ai-strip">
          {stats.map(s => <div key={s.k}><dd className="b-num">{s.v}</dd><dt>{s.k}</dt></div>)}
        </dl>
      ) : null}
      <DayPicture d={d} />
      <div className="ai-grid">
        <Panel className="ai-card ai-card--wide" testid="ai-brief">
          <div className="ai-card__top"><p className="b-label">Today&apos;s brief</p><span className="ai-tag">{b?.origin === "model" ? "Written by the AI" : "From the data"}</span></div>
          {b && b.items.length ? (
            <ol className="ai-brief">
              {b.items.slice(0, 4).map(i => (
                <li key={i.key}><a href={i.href}><b>{i.lines[0]}</b><span>{i.lines[1]}</span></a></li>
              ))}
            </ol>
          ) : <p className="b-small">Nothing big from the $1M+ wallets since 8 PM ET last night yet. The brief fills as they bet.</p>}
          <p className="ai-src">Source: Polymarket public trades and Polygon transactions, since 8 PM ET.</p>
          <Pill href="/brief" kind="ghost">The full brief</Pill>
        </Panel>
        <Panel className="ai-card" testid="ai-watch">
          <div className="ai-card__top"><p className="b-label">Watch my bet</p>{d.ai.watching ? <span className="ai-tag">{d.ai.watching} watched</span> : null}</div>
          {b && b.watched.length ? (
            <ul className="ai-watch">{b.watched.slice(0, 3).map(w => <li key={w.id}><a href={w.href}><b>{w.title}</b><span>{w.lines[0]}</span><span>{w.lines[1]}</span></a></li>)}</ul>
          ) : <p className="b-small">Add your bet or your public Polymarket address. When a $1M+ wallet takes the other side, one on your side gets out, or the price moves 5¢, you get an alert with what it means for your bet in dollars.</p>}
          <Pill href="/watch" kind="ghost">{d.ai.watching ? "Your watched bets" : "Add a bet"}</Pill>
        </Panel>
        <Panel className="ai-card" testid="ai-briefing">
          <div className="ai-card__top"><p className="b-label">Bet Briefing</p>{d.ai.briefing ? <span className="ai-tag">{d.ai.briefing.origin === "model" ? "Written by the AI" : "From the data"}</span> : null}</div>
          {d.ai.briefing ? (
            <a className="ai-bb" href={d.ai.briefing.href} data-testid="ai-briefing-sample">
              <span className="ai-bb__t">Today&apos;s #1 · {d.ai.briefing.title}</span>
              {d.ai.briefing.lines.map(l => <span key={l.k} className="ai-bb__row"><b>{l.k}</b><span>{l.t}</span></span>)}
              <span className="ai-bb__more">The full briefing →</span>
            </a>
          ) : <p className="b-small">Paste a Polymarket or Kalshi link: what it needs to win, what it costs and pays, who&apos;s on each side and what the money says.</p>}
          <form className="ai-form" method="get" action="/briefing">
            <input name="url" type="url" inputMode="url" placeholder="Paste any market link" aria-label="Market link" required />
            <button type="submit">Brief me</button>
          </form>
          {!d.ai.briefing && d.top ? <a className="ai-link" href={`/briefing?m=${encodeURIComponent(d.top.bet.marketId)}`}>Or today&apos;s #1: {d.top.bet.title} →</a> : null}
        </Panel>
        <Panel className="ai-card ai-card--ask" testid="ai-ask">
          <p className="b-label">Ask Insidir</p>
          <p className="b-small">Ask about a wallet, a market or your bet. Answers come only from our data, with the rows behind them.</p>
          <form className="ai-form" method="get" action="/ask">
            <input name="q" type="text" placeholder="Ask anything" aria-label="Your question" required />
            <button type="submit">Ask</button>
          </form>
          <div className="ai-chips">{ASKS.map(q => <a key={q} href={`/ask?q=${encodeURIComponent(q)}`}>{q}</a>)}</div>
        </Panel>
      </div>
    </Stage>
  );
}
