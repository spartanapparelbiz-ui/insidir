/* Direction B, "Front page": a financial paper's front page. The biggest bet is the lead story; then two secondary
 * stories; a narrow live column at the right; the wallets active today below. Static preview with real values. */
import type { Metadata } from "next";
import { category as categoryInfo } from "@/lib/brand/categories";
import { dollars } from "@/lib/money";
import { Actions, cents, Delta, Frame, MarketName, PriceChart, signed, Status, Wallet } from "@/components/design/Parts";
import type { Featured } from "@/lib/design/desk";
import { loadDesign, todayLine } from "../load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · B", robots: { index: false } };
const DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });
const ago = (ms: number, now: number) => { const s = Math.round((now - ms) / 1000); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : `${Math.floor(s / 3600)}h`; };

function headline(f: Featured) {
  const total = f.edge?.total ?? f.bet.amount;
  return `${dollars(total)} on ${f.bet.outcome} at ${cents(f.edge?.avg ?? f.bet.priceThen)}. Now ${cents(f.edge?.now ?? f.bet.priceNow)}.`;
}

export default async function DeskB() {
  const d = await loadDesign();
  const [lead, ...second] = d.featured, line = todayLine(d.kpis);
  return (
    <Frame>
      <div className="dk-page" data-direction="b">
        <header className="dk-mast">
          <h1 className="dk-h2">The Desk</h1>
          <span className="dk-dim">{DATE.format(new Date(d.now))}</span>
          <Status polledAt={d.polledAt} updatedAt={d.updatedAt} now={d.now} />
        </header>
        <div className="dk-paper">
          <div className="dk-paper__main">
            {lead ? (
              <article className="dk-lead">
                <p className="dk-kicker">{categoryInfo(lead.bet.category).name} · <MarketName title={lead.bet.title} category={lead.bet.category} /></p>
                <h2 className="dk-h1x">{headline(lead)}</h2>
                <p className="dk-deck">{lead.edge && lead.edge.entries.length > 1 ? `${lead.edge.entries.length} millionaire bets on ${lead.bet.outcome} today. ` : ""}The biggest: <Wallet short={lead.bet.short} pnl={lead.bet.pnl} tier={lead.bet.tier} />, {dollars(lead.bet.amount)}. <Delta from={lead.edge?.avg ?? lead.bet.priceThen} to={lead.edge?.now ?? lead.bet.priceNow} /> since they bought.</p>
                {lead.edge ? <PriceChart edge={lead.edge} height={240} /> : null}
                <Actions bet={lead.bet} now={lead.edge?.now ?? lead.bet.priceNow} />
              </article>
            ) : null}
            {second.length ? (
              <div className="dk-seconds">
                {second.map(f => (
                  <article key={f.bet.id} className="dk-second">
                    <p className="dk-kicker">{categoryInfo(f.bet.category).name}</p>
                    <h3 className="dk-h3x">{headline(f)}</h3>
                    <p className="dk-meta"><MarketName title={f.bet.title} category={f.bet.category} /></p>
                    {f.edge ? <PriceChart edge={f.edge} height={96} compact /> : null}
                    <a className="dk-link" href={`/copy/${encodeURIComponent(f.bet.id)}`}>Copy at {cents(f.edge?.now ?? f.bet.priceNow)}</a>
                  </article>
                ))}
              </div>
            ) : null}
            {d.leaders.length ? (
              <section className="dk-wallets">
                <h2 className="dk-h3">Wallets active today</h2>
                <ol className="dk-rows">{d.leaders.slice(0, 8).map(l => (
                  <li key={l.wallet} className="dk-row dk-row--w">
                    <span><Wallet short={l.short} pnl={l.pnl} tier="millionaire" /></span>
                    <span className="dk-dim">{l.biggest ? <>Biggest: <MarketName title={l.biggest.title} category={l.biggest.category} /></> : null}</span>
                    <span className="dk-r dk-num">{dollars(l.todayDollars)}</span>
                    <span className="dk-r dk-dim">{l.todayBets} {l.todayBets === 1 ? "bet" : "bets"}</span>
                    <span className="dk-r"><a className="dk-link" href="/wallets">Follow</a></span>
                  </li>
                ))}</ol>
              </section>
            ) : null}
          </div>
          <aside className="dk-paper__live" aria-label="Latest bets">
            <h2 className="dk-h4">{d.polledAt !== null && d.now - d.polledAt < 5 * 60_000 ? <i className="dk-dot" aria-hidden="true" /> : null}Latest bets</h2>
            {line ? <p className="dk-dim dk-small">{line}</p> : null}
            <ol className="dk-wire">{d.flow.slice(0, 12).map(b => (
              <li key={b.id}>
                <span className="dk-dim dk-small">{ago(b.at, d.now)} · <Wallet short={b.short} pnl={null} tier={b.tier} /></span>
                <span><b className="dk-num">{dollars(b.amount)}</b> on {b.outcome} at {cents(b.priceThen)} <Delta from={b.priceThen} to={b.priceNow} /></span>
                <span className="dk-dim dk-small"><MarketName title={b.title} category={b.category} /></span>
              </li>
            ))}</ol>
          </aside>
        </div>
      </div>
    </Frame>
  );
}
