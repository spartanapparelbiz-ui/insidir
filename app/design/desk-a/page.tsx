/* Direction A, "Kalshi": one featured bet at the top with a big chart and a big price; below it, a clean list of today's
 * millionaire bets. Static preview with real values (dev only). */
import type { Metadata } from "next";
import { category as categoryInfo } from "@/lib/brand/categories";
import { dollars } from "@/lib/money";
import { Actions, BetRows, cents, Delta, Frame, MarketName, plural, PriceChart, Status, Wallet } from "@/components/design/Parts";
import { loadDesign, todayLine } from "../load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · A", robots: { index: false } };

export default async function DeskA() {
  const d = await loadDesign();
  const f = d.featured[0], line = todayLine(d.kpis);
  return (
    <Frame>
      <div className="dk-page" data-direction="a">
        <header className="dk-head">
          <h1 className="dk-h1">Desk</h1>
          <Status polledAt={d.polledAt} updatedAt={d.updatedAt} now={d.now} />
        </header>
        {line ? <p className="dk-lede">{line}</p> : null}
        {f ? (
          <section className="dk-feature" aria-label="The biggest live bet today">
            <div className="dk-feature__main">
              <p className="dk-kicker">Biggest live bet today · {categoryInfo(f.bet.category).name}</p>
              <h2 className="dk-h2"><MarketName title={f.bet.title} category={f.bet.category} /></h2>
              <p className="dk-meta"><Wallet short={f.bet.short} pnl={f.bet.pnl} tier={f.bet.tier} /> · bought {dollars(f.bet.amount)} of {f.bet.outcome} at {cents(f.bet.priceThen)}</p>
              <div className="dk-price">
                <span className="dk-xl dk-num">{cents(f.edge?.now ?? f.bet.priceNow)}</span>
                <span className="dk-price__side">{f.bet.outcome}<br /><Delta from={f.edge?.avg ?? f.bet.priceThen} to={f.edge?.now ?? f.bet.priceNow} /> <span className="dk-dim">since their average entry</span></span>
              </div>
              <div className="dk-narrow-only"><Actions bet={f.bet} now={f.edge?.now ?? f.bet.priceNow} /></div>
              {f.edge ? <PriceChart edge={f.edge} height={260} /> : null}
            </div>
            <aside className="dk-feature__side">
              <div className="dk-wide-only"><Actions bet={f.bet} now={f.edge?.now ?? f.bet.priceNow} /></div>
              <dl className="dk-facts">
                {f.edge ? <><div><dt>Millionaire money on {f.bet.outcome}</dt><dd className="dk-num">{dollars(f.edge.total)}</dd></div>
                  <div><dt>Their average entry</dt><dd className="dk-num">{cents(f.edge.avg)}</dd></div>
                  <div><dt>Entries</dt><dd className="dk-num">{plural(f.edge.entries.length, "bet")}</dd></div></> : null}
                <div><dt>Price now</dt><dd className="dk-num">{cents(f.edge?.now ?? f.bet.priceNow)}</dd></div>
              </dl>
              <p className="dk-fine">Information, not advice. Millionaires lose bets too.</p>
            </aside>
          </section>
        ) : null}
        <section aria-label="Today's millionaire bets">
          <h2 className="dk-h3">Today&apos;s millionaire bets</h2>
          <BetRows bets={d.flow.slice(0, 14)} now={d.now} />
        </section>
      </div>
    </Frame>
  );
}
