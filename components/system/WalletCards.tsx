/* Wallet cards: a short address (never a face or a name), all-time profit, the last 10 closed bets (made money / lost),
 * the money bet today (or in the last 24 hours), the biggest market, and Follow (which turns on pings for that wallet).
 * Shared by the member home and /wallets. */
import { FollowLink } from "@/components/desk/Act";
import type { WalletCard } from "@/lib/home/data";
import { dollars } from "@/lib/money";
import { Panel } from "./index";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;

export function WalletCards({ wallets, today, biggest = false, testid }: { wallets: readonly WalletCard[]; today: boolean; biggest?: boolean; testid?: string }) {
  return (
    <div className="s-cards" data-stagger="" data-testid={testid}>
      {wallets.map(w => (
        <Panel key={w.wallet} className="s-wcard" testid="wallet-card">
          <a className="s-wcard__id b-num s-link" href={`/wallet/${w.wallet}`}>{w.short}</a>
          {w.pnl !== null ? <p className="s-big b-num">{signed(w.pnl)}</p> : null}
          <p className="b-small">all-time profit</p>
          {w.last10 ? (
            <p className="s-record" aria-label={`Last ${w.last10.made + w.last10.lost} closed: ${w.last10.made} made money, ${w.last10.lost} lost`}>
              {Array.from({ length: w.last10.made }, (_, i) => <i key={`m${i}`} className="s-dot s-dot--on" />)}{Array.from({ length: w.last10.lost }, (_, i) => <i key={`l${i}`} className="s-dot" />)}
              <span className="b-small">Last {w.last10.made + w.last10.lost} closed: {w.last10.made} made money, {w.last10.lost} lost</span>
            </p>
          ) : null}
          <p className="b-small">{today ? "Today" : "Last 24 hours"}: {dollars(w.todayDollars)} across {w.todayBets} {w.todayBets === 1 ? "trade" : "trades"}</p>
          {biggest && w.biggest ? <p className="b-small">Biggest: {dollars(w.biggest.dollars)} on {w.biggest.title}</p> : null}
          <FollowLink wallet={w.wallet} initial={w.followed} />
        </Panel>
      ))}
    </div>
  );
}
