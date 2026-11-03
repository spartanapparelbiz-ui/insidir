/* Direction C, "Stage": the Sellix language. Full-width black stages, one bet per stage at huge scale (the biggest live
 * bet, then the next two smaller), then a compact list. Static preview with real values. */
import type { Metadata } from "next";
import { category as categoryInfo } from "@/lib/brand/categories";
import { dollars } from "@/lib/money";
import { Actions, BetRows, cents, Delta, Frame, MarketName, PriceChart, Status, Wallet } from "@/components/design/Parts";
import { loadDesign, todayLine } from "../load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · C", robots: { index: false } };

export default async function DeskC() {
  const d = await loadDesign();
  const [top, ...rest] = d.featured, line = todayLine(d.kpis);
  return (
    <Frame>
      <div className="dk-page dk-page--stage" data-direction="c">
        <header className="dk-head"><Status polledAt={d.polledAt} updatedAt={d.updatedAt} now={d.now} />{line ? <span className="dk-dim">{line}</span> : null}</header>
        {top ? (
          <section className="dk-stage">
            <p className="dk-kicker">The biggest live bet today · {categoryInfo(top.bet.category).name}</p>
            <h1 className="dk-huge">{dollars(top.edge?.total ?? top.bet.amount)} on {top.bet.outcome}.<br /><span className="dk-dim">In at {cents(top.edge?.avg ?? top.bet.priceThen)}. Now {cents(top.edge?.now ?? top.bet.priceNow)}.</span></h1>
            <p className="dk-meta"><MarketName title={top.bet.title} category={top.bet.category} /> · <Wallet short={top.bet.short} pnl={top.bet.pnl} tier={top.bet.tier} /> · <Delta from={top.edge?.avg ?? top.bet.priceThen} to={top.edge?.now ?? top.bet.priceNow} /> since</p>
            {top.edge ? <PriceChart edge={top.edge} height={280} /> : null}
            <Actions bet={top.bet} now={top.edge?.now ?? top.bet.priceNow} />
          </section>
        ) : null}
        {rest.map(f => (
          <section key={f.bet.id} className="dk-stage dk-stage--2">
            <div>
              <p className="dk-kicker">{categoryInfo(f.bet.category).name}</p>
              <h2 className="dk-h1x">{dollars(f.edge?.total ?? f.bet.amount)} on {f.bet.outcome}. <span className="dk-dim">Now {cents(f.edge?.now ?? f.bet.priceNow)}.</span></h2>
              <p className="dk-meta"><MarketName title={f.bet.title} category={f.bet.category} /> · <Wallet short={f.bet.short} pnl={f.bet.pnl} tier={f.bet.tier} /></p>
              <a className="dk-link" href={`/copy/${encodeURIComponent(f.bet.id)}`}>Copy at {cents(f.edge?.now ?? f.bet.priceNow)}</a>
            </div>
            {f.edge ? <PriceChart edge={f.edge} height={180} /> : null}
          </section>
        ))}
        <section className="dk-stage dk-stage--list">
          <h2 className="dk-h3">Every millionaire bet today</h2>
          <BetRows bets={d.flow.slice(0, 14)} now={d.now} />
        </section>
      </div>
    </Frame>
  );
}
