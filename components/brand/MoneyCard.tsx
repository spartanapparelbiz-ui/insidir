/* One market's watchlist money as a glass card: Millionaire money first (dollars per side and wallet counts; no split
 * from fewer than MIN_SPLIT_WALLETS wallets, just the total), then Pro money, the millionaire wallets' positions, then
 * the price now. Rendered complete on the server; the scroll engine builds it in place when asked (data-build: the bar
 * fills, numbers tick from zero, wallet rows slide in). `locked` hides which side the money is on: the side is never
 * sent, only a placeholder that opens the paywall sheet. */
import { category as categoryInfo } from "@/lib/brand/categories";
import { MIN_SPLIT_WALLETS, type MarketMoney, type Position } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { cents, Num, Side, TierBadge } from "./Bits";

type TierMoney = MarketMoney["millionaire"];
const total = (t: TierMoney) => t.yes.dollars + t.no.dollars;
const count = (t: TierMoney) => t.yes.wallets + t.no.wallets;
const w = (n: number) => `${n} ${n === 1 ? "wallet" : "wallets"}`;

function TierBlock({ name, t, yes, no, locked, testid }: { name: string; t: TierMoney; yes: string; no: string; locked: boolean; testid: string }) {
  const sum = total(t), n = count(t);
  if (!sum) return <div className="b-kv" data-testid={testid} data-wallet-split="none"><span className="b-label">{name}</span><span className="b-small">None yet</span></div>;
  const split = n >= MIN_SPLIT_WALLETS;
  const share = split ? t.yes.dollars / sum : 0;
  return (
    <div className="b-tierblock" data-testid={testid} data-wallet-split={split ? "true" : "false"}>
      <div className="b-kv"><span className="b-label">{name}</span><span className="b-mono"><Num value={sum} format="usd-short">{dollars(sum)}</Num> · {w(n)}</span></div>
      {!split ? <p className="b-small">Fewer than {MIN_SPLIT_WALLETS} wallets, so no split yet.</p> : locked ? (
        <button type="button" className="b-split" data-locked="split" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }} aria-label="Which side is hidden. Start for $1 to see it">
          <div><span className="b-label b-locked__blur">██████</span><span className="b-big b-locked__blur">$██K</span><span className="b-small">side 🔒</span></div>
          <div><span className="b-label b-locked__blur">██████</span><span className="b-big b-locked__blur">$██K</span><span className="b-small">side 🔒</span></div>
        </button>
      ) : (
        <>
          <div className="b-bar" role="img" aria-label={`${Math.round(share * 100)}% of it on ${yes}`}><span data-share={share} style={{ transform: `scaleX(${share})` }} /></div>
          <div className="b-split">
            <div><span className="b-label b-up">{yes}</span><Num className="b-big" value={t.yes.dollars} format="usd-short">{dollars(t.yes.dollars)}</Num><span className="b-small">{w(t.yes.wallets)}</span></div>
            <div><span className="b-label b-down">{no}</span><Num className="b-big" value={t.no.dollars} format="usd-short">{dollars(t.no.dollars)}</Num><span className="b-small">{w(t.no.wallets)}</span></div>
          </div>
        </>
      )}
    </div>
  );
}

export function MoneyCard({ m, positions = [], locked = false, className = "", testid = "money-card", build = false, footer }: {
  m: MarketMoney; positions?: Position[]; locked?: boolean; className?: string; testid?: string; build?: boolean; footer?: React.ReactNode;
}) {
  const mil = positions.filter(p => p.tier === "millionaire").slice(0, 4);
  return (
    <article className={`b-read b-glass b-glass--solid ${className}`} data-testid={testid} data-locked={locked ? "true" : "false"} data-build={build ? "" : undefined}>
      <div className="b-read__head">
        <span className="b-label">{categoryInfo(m.category).name}</span>
        <h3 className="b-read__q">{m.title}</h3>
      </div>
      <TierBlock name="Millionaire money" t={m.millionaire} yes={m.yesLabel} no={m.noLabel} locked={locked} testid="tier-millionaire" />
      <TierBlock name="Pro money" t={m.pro} yes={m.yesLabel} no={m.noLabel} locked={locked} testid="tier-pro" />
      {mil.length && !locked ? (
        <ul className="b-wrows" data-testid="wallet-rows">
          {mil.map(p => (
            <li key={`${p.wallet}:${p.side}`} className="b-wrow" data-wrow="">
              <TierBadge tier={p.tier} />
              <span className="b-wrow__side"><Side outcome={p.outcome} side={p.side} /> <span className="b-small">{p.short}</span></span>
              <span className="b-mono">{dollars(p.dollars)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {m.priceNow !== null ? (
        <div className="b-kv"><span className="b-label">Price now</span><span className="b-mono">{locked ? `${cents(m.priceNow)} / ${cents(1 - m.priceNow)}` : `${m.yesLabel} ${cents(m.priceNow)} · ${m.noLabel} ${cents(1 - m.priceNow)}`}</span></div>
      ) : null}
      {footer}
    </article>
  );
}
