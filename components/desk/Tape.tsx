/* The tape: a 32px marquee of the last 20 millionaire bets: orb · "+$11M wallet" · "$212K Hawks @79¢" · "now 94¢ ▲15".
 * Pauses on hover; still (and scrollable) with reduced motion. Duplicated once for a seamless loop; the copy is hidden
 * from assistive tech. */
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { WalletOrb } from "./Marks";

const short = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(Math.abs(n) >= 1e7 ? 0 : 1)}M` : `${Math.round(Math.abs(n) / 1e3)}K`}`;

function Item({ b }: { b: BoardBet }) {
  const d = b.priceNow !== null && b.priceThen !== null ? Math.round((b.priceNow - b.priceThen) * 100) : null;
  return (
    <li className="d-tick">
      {b.wallet ? <WalletOrb address={b.wallet} tier={b.tier} size={16} /> : null}
      {b.pnl !== null ? <span className="d-gold d-num">{short(b.pnl)} wallet</span> : <span className="d-dim">{b.short}</span>}
      <span><b className="d-num">{dollars(b.amount)}</b> {b.outcome ?? b.title}{b.priceThen !== null ? <span className="d-num"> @{Math.round(b.priceThen * 100)}¢</span> : null}</span>
      {b.priceNow !== null ? <span className="d-num d-dim">now {Math.round(b.priceNow * 100)}¢{d ? <b className={d > 0 ? "d-up" : "d-down"}> {d > 0 ? "▲" : "▼"}{Math.abs(d)}</b> : null}</span> : null}
    </li>
  );
}

export function Tape({ bets }: { bets: BoardBet[] }) {
  if (!bets.length) return null;
  return (
    <div className="d-tape" data-testid="desk-tape" aria-label="The last millionaire bets">
      <div className="d-tape__track">
        <ul>{bets.map(b => <Item key={b.id} b={b} />)}</ul>
        <ul aria-hidden="true">{bets.map(b => <Item key={b.id} b={b} />)}</ul>
      </div>
    </div>
  );
}
