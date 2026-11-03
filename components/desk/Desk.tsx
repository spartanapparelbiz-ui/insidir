/* The Desk (direction A, picked in PR #109): one job, in five seconds: what wallets up $1M+ are betting right now and
 * whether they're winning, then act (copy, follow, pings).
 *   Head       "Desk", Live (the worker polled within 5 minutes) and the last bet; today's one-line summary; search.
 *   Featured   today's biggest live bet: market, wallet, the price now at 72px with its move since their average entry,
 *              the price chart (their entries in gold, their average dotted), and at the side the one white pill (Copy
 *              at the price now), Follow this wallet, Turn on pings, and the facts.
 *   Rows       today's millionaire bets, live (components/desk/LiveRows.tsx).
 * Rules: qa/design/desk-notes.md. Real data only (lib/desk). */
import { Shell } from "@/components/brand/app/Shell";
import { category as categoryInfo } from "@/lib/brand/categories";
import type { DeskDesign } from "@/lib/desk/featured";
import { dollars } from "@/lib/money";
import { CommandBar } from "./CommandBar";
import { LiveRows } from "./LiveRows";
import { Actions, cents, Delta, MarketName, plural, PriceChart, Status, Wallet } from "./Parts";

/** "Today: $1.3M from 9 millionaire wallets across 67 bets." Only figures that exist. */
export function todayLine(k: Array<{ key: string; value: number }>): string | null {
  const v = (key: string) => k.find(x => x.key === key)?.value ?? 0;
  const money = v("money"), wallets = v("wallets"), bets = v("bets");
  if (!money) return null;
  return `Today: ${dollars(money)} from ${plural(wallets, "millionaire wallet")} across ${plural(bets, "bet")}.`;
}

export function Desk({ d, search }: { d: DeskDesign; search: boolean }) {
  const f = d.featured[0], line = todayLine(d.kpis);
  const now = f ? f.edge?.now ?? f.bet.priceNow : null;
  const followed = f?.bet.wallet ? d.leaders.some(l => l.wallet === f.bet.wallet && l.followed) : false;
  return (
    <Shell current="home">
      <div className="dk-page" data-testid="member-home" data-home="desk">
        <header className="dk-head">
          <div>
            <h1 className="dk-h1">Desk</h1>
            {line ? <p className="dk-lede" data-testid="desk-today">{line}</p> : null}
          </div>
          <div className="dk-head__r">
            <Status polledAt={d.polledAt} updatedAt={d.updatedAt} now={d.now} />
            <CommandBar open={search} />
          </div>
        </header>
        {f ? (
          <section className="dk-feature" aria-label="The biggest live bet today" data-testid="desk-featured" data-bet={f.bet.id}>
            <div className="dk-feature__main">
              <p className="dk-kicker">Biggest live bet today · {categoryInfo(f.bet.category).name}</p>
              <h2 className="dk-h2"><MarketName title={f.bet.title} category={f.bet.category} /></h2>
              <p className="dk-meta"><Wallet short={f.bet.short} pnl={f.bet.pnl} tier={f.bet.tier} /> · bought {dollars(f.bet.amount)} of {f.bet.outcome} at {cents(f.bet.priceThen)}</p>
              <div className="dk-price" data-testid="edge-head">
                <span className="dk-xl dk-num">{cents(now)}</span>
                <span className="dk-price__side">{f.bet.outcome}<br /><Delta from={f.edge?.avg ?? f.bet.priceThen} to={now} /> <span className="dk-dim">since their average entry of {cents(f.edge?.avg ?? f.bet.priceThen)}</span></span>
              </div>
              <div className="dk-narrow-only"><Actions bet={f.bet} now={now} followed={followed} /></div>
              {f.edge ? <PriceChart edge={f.edge} height={260} /> : null}
            </div>
            <aside className="dk-feature__side">
              <div className="dk-wide-only"><Actions bet={f.bet} now={now} followed={followed} /></div>
              <dl className="dk-facts">
                {f.edge ? <>
                  <div><dt>Millionaire money on {f.bet.outcome}</dt><dd className="dk-num">{dollars(f.edge.total)}</dd></div>
                  <div><dt>Their average entry</dt><dd className="dk-num">{cents(f.edge.avg)}</dd></div>
                  <div><dt>Millionaire bets on it</dt><dd className="dk-num">{f.edge.entries.length}</dd></div>
                </> : null}
                <div><dt>Price now</dt><dd className="dk-num">{cents(now)}</dd></div>
              </dl>
              <p className="dk-fine">Information, not advice. Millionaires lose bets too.</p>
            </aside>
          </section>
        ) : null}
        <section aria-label="Today's millionaire bets">
          <h2 className="dk-h3">Today&apos;s millionaire bets<a className="dk-link dk-small" href="/board">The full board</a></h2>
          <LiveRows initial={d.flow.slice(0, 14)} now={d.now} n={14} />
        </section>
      </div>
    </Shell>
  );
}
