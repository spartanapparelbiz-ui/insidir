/* One market's watchlist money as a glass panel: Millionaire money first (dollars per side and wallet counts; no split
 * from fewer than MIN_SPLIT_WALLETS wallets, just the total), then Pro money, the millionaire wallets' positions, the
 * price now. `locked` hides which side: never sent, only a placeholder that opens the paywall. `build` makes the
 * panel's blocks settle in one after another (the auto-building free Read). */
import type { CSSProperties, ReactNode } from "react";
import { category as categoryInfo } from "@/lib/brand/categories";
import { MIN_SPLIT_WALLETS, type MarketMoney, type Position } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { cents, Side, TierBadge } from "./Bits";

type TierMoney = MarketMoney["millionaire"];
const w = (n: number) => `${n} ${n === 1 ? "wallet" : "wallets"}`;
const st = (on: boolean, d: number) => (on ? { "data-m": "settle" as const, style: { "--d": `${d}s` } as CSSProperties } : {});

function TierBlock({ name, t, yes, no, locked, testid, build, d }: { name: string; t: TierMoney; yes: string; no: string; locked: boolean; testid: string; build: boolean; d: number }) {
  const sum = t.yes.dollars + t.no.dollars, n = t.yes.wallets + t.no.wallets;
  if (!sum) return <div className="b-kv" data-testid={testid} data-wallet-split="none" {...st(build, d)}><span className="b-label">{name}</span><span className="b-small">None yet</span></div>;
  const split = n >= MIN_SPLIT_WALLETS, share = split ? t.yes.dollars / sum : 0;
  return (
    <div className="b-tierblock" data-testid={testid} data-wallet-split={split ? "true" : "false"} {...st(build, d)}>
      <div className="b-kv"><span className="b-label">{name}</span><span className="b-num" style={{ fontWeight: 500 }}>{dollars(sum)} · {w(n)}</span></div>
      {!split ? <p className="b-small">Fewer than {MIN_SPLIT_WALLETS} wallets, so no split yet.</p> : locked ? (
        <button type="button" className="b-locked-split b-split" data-locked="split" aria-label="Which side is hidden: start for $1 to see it">
          <div><span className="b-label b-blur">Yes side</span><span className="b-big b-blur">$00K</span><span className="b-small">Side locked</span></div>
          <div><span className="b-label b-blur">No side</span><span className="b-big b-blur">$00K</span><span className="b-small">Side locked</span></div>
        </button>
      ) : (
        <>
          <div className="b-bar" role="img" aria-label={`${Math.round(share * 100)}% of it on ${yes}`}><span style={{ transform: `scaleX(${share})` }} /></div>
          <div className="b-split">
            <div><span className="b-label b-up">{yes}</span><span className="b-big b-num">{dollars(t.yes.dollars)}</span><span className="b-small">{w(t.yes.wallets)}</span></div>
            <div><span className="b-label b-down">{no}</span><span className="b-big b-num">{dollars(t.no.dollars)}</span><span className="b-small">{w(t.no.wallets)}</span></div>
          </div>
        </>
      )}
    </div>
  );
}

export function MoneyCard({ m, positions = [], locked = false, className = "", testid = "money-card", build = false, footer, title = true }: {
  m: MarketMoney; positions?: Position[]; locked?: boolean; className?: string; testid?: string; build?: boolean; footer?: ReactNode; title?: boolean;
}) {
  const mil = positions.filter(p => p.tier === "millionaire").slice(0, 4);
  // A team market where only one side was bet on knows only that side's name: the other is "Other side", never a wrong "Yes".
  const named = (l: string, other: string, def: string) => (l === def && other !== (def === "Yes" ? "No" : "Yes") ? "Other side" : l);
  const yes = named(m.yesLabel, m.noLabel, "Yes"), no = named(m.noLabel, m.yesLabel, "No");
  return (
    <article className={`b-read b-glass b-pad ${className}`} data-testid={testid} data-locked={locked ? "true" : "false"}>
      {title ? <div style={{ display: "grid", gap: 4 }} {...st(build, 0.4)}><span className="b-label">{categoryInfo(m.category).name}</span><h3 className="b-read__q">{m.title}</h3></div> : null}
      <TierBlock name="Millionaire money" t={m.millionaire} yes={yes} no={no} locked={locked} testid="tier-millionaire" build={build} d={0.6} />
      <TierBlock name="Pro money" t={m.pro} yes={yes} no={no} locked={locked} testid="tier-pro" build={build} d={0.8} />
      {mil.length && !locked ? (
        <ul className="b-wrows" data-testid="wallet-rows">
          {mil.map((p, i) => (
            <li key={`${p.wallet}:${p.side}`} className="b-wrow" {...st(build, 1 + i * 0.08)}>
              <TierBadge tier={p.tier} />
              <span><Side outcome={p.outcome} side={p.side} /> <span className="b-small">{p.short}</span></span>
              <span className="b-num" style={{ fontWeight: 600 }}>{dollars(p.dollars)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {m.priceNow !== null ? (
        <div className="b-kv" {...st(build, 1.3)}><span className="b-label">Price now</span><span className="b-num" style={{ fontWeight: 500 }}>{locked ? `${cents(m.priceNow)} / ${cents(1 - m.priceNow)}` : `${yes} ${cents(m.priceNow)} · ${no} ${cents(1 - m.priceNow)}`}</span></div>
      ) : null}
      {footer}
    </article>
  );
}
