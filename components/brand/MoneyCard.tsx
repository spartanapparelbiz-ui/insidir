/* One market's watchlist money as a glass card: Millionaire money first (dollars per side and wallet counts; no split
 * from fewer than MIN_SPLIT_WALLETS wallets, just the total), then Pro money, then the price now. `locked` blurs which
 * side the money is on (the funnel's teaser cards): the side is never sent as text, only a placeholder. */
import { category as categoryInfo } from "@/lib/brand/categories";
import { MIN_SPLIT_WALLETS, type MarketMoney } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { cents } from "./Bits";

type TierMoney = MarketMoney["millionaire"];
const total = (t: TierMoney) => t.yes.dollars + t.no.dollars;
const wallets = (t: TierMoney) => t.yes.wallets + t.no.wallets;

function TierBlock({ name, t, yes, no, locked, testid }: { name: string; t: TierMoney; yes: string; no: string; locked: boolean; testid: string }) {
  const sum = total(t), n = wallets(t);
  if (!sum) return <div className="b-kv" data-testid={testid}><span className="b-label">{name}</span><span className="b-muted">None yet</span></div>;
  const split = n >= MIN_SPLIT_WALLETS;
  const share = split ? t.yes.dollars / sum : 0.5;
  return (
    <div style={{ display: "grid", gap: 10 }} data-testid={testid} data-split={split ? "true" : "false"}>
      <div className="b-kv"><span className="b-label">{name}</span><span className="b-num">{dollars(sum)} · {n} {n === 1 ? "wallet" : "wallets"}</span></div>
      {split ? (
        locked ? (
          <div className="b-lock" data-testid="side-locked">
            <div className="b-split b-blur" aria-hidden="true">
              <div><span className="b-label">██████</span><span className="b-big">$██K</span></div>
              <div><span className="b-label">██████</span><span className="b-big">$██K</span></div>
            </div>
          </div>
        ) : (
          <>
            <div className="b-bar" role="img" aria-label={`${Math.round(share * 100)}% of it on ${yes}`}><span style={{ width: `${share * 100}%` }} /></div>
            <div className="b-split">
              <div><span className="b-label b-up">{yes}</span><span className="b-big b-num">{dollars(t.yes.dollars)}</span><span className="b-small">{t.yes.wallets} {t.yes.wallets === 1 ? "wallet" : "wallets"}</span></div>
              <div><span className="b-label b-down">{no}</span><span className="b-big b-num">{dollars(t.no.dollars)}</span><span className="b-small">{t.no.wallets} {t.no.wallets === 1 ? "wallet" : "wallets"}</span></div>
            </div>
          </>
        )
      ) : <p className="b-small" style={{ margin: 0 }}>Fewer than {MIN_SPLIT_WALLETS} wallets, so no split yet.</p>}
    </div>
  );
}

export function MoneyCard({ m, locked = false, title, className = "", testid = "money-card" }: { m: MarketMoney; locked?: boolean; title?: string; className?: string; testid?: string }) {
  return (
    <article className={`b-read b-glass b-glass--solid ${className}`} data-testid={testid} data-locked={locked ? "true" : "false"}>
      <span className="b-label">{categoryInfo(m.category).name}{m.event && m.event !== m.title ? ` · ${m.event}` : ""}</span>
      <h3 className="b-read__q">{title ?? m.title}</h3>
      <TierBlock name="Millionaire money" t={m.millionaire} yes={m.yesLabel} no={m.noLabel} locked={locked} testid="tier-millionaire" />
      <TierBlock name="Pro money" t={m.pro} yes={m.yesLabel} no={m.noLabel} locked={locked} testid="tier-pro" />
      {m.priceNow !== null ? (
        <div className="b-kv"><span className="b-label">Price now</span><span className="b-num">{m.yesLabel} {cents(m.priceNow)} · {m.noLabel} {cents(1 - m.priceNow)}</span></div>
      ) : null}
    </article>
  );
}
