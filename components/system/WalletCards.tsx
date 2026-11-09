/* Wallets as a terminal table: a short address (never a face or a name), all-time profit (the row's one bold number),
 * the last 10 closed bets (made money – lost), the money bet today (or in the last 24 hours) and how many bets, the
 * biggest market, and Follow (which turns on pings for that wallet). Shared by the member home and /wallets. */
import { FollowLink } from "@/components/desk/Act";
import type { WalletCard } from "@/lib/home/data";
import { dollars } from "@/lib/money";
import "@/app/pages-terminal.css";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;

export function WalletCards({ wallets, today, biggest = false, testid }: { wallets: readonly WalletCard[]; today: boolean; biggest?: boolean; testid?: string }) {
  return (
    <div className="t-scroll" data-testid={testid}>
      <table className="t-table">
        <thead>
          <tr>
            <th>Wallet</th><th className="r">All-time</th><th className="r">Last 10 closed</th><th className="r">{today ? "Today" : "Last 24h"}</th><th className="r">Bets</th>
            {biggest ? <th>Biggest</th> : null}<th className="r"><span className="b-sr">Follow</span></th>
          </tr>
        </thead>
        <tbody>
          {wallets.map(w => (
            <tr key={w.wallet} data-testid="wallet-card">
              <td><a className="b-num s-link" href={`/wallet/${w.wallet}`}>{w.short}</a></td>
              <td className={`r b-num t-strong ${w.pnl === null ? "" : w.pnl >= 0 ? "t-up" : "t-down"}`}>{w.pnl !== null ? signed(w.pnl) : "—"}</td>
              <td className="r b-num">
                {w.last10 ? <span className="s-record" aria-label={`Last ${w.last10.made + w.last10.lost} closed: ${w.last10.made} made money, ${w.last10.lost} lost`}>{w.last10.made}–{w.last10.lost}</span> : "—"}
              </td>
              <td className="r b-num">{dollars(w.todayDollars)}</td>
              <td className="r b-num">{w.todayBets}</td>
              {biggest ? <td className="t-ell t-muted">{w.biggest ? <>{dollars(w.biggest.dollars)} on {w.biggest.title}</> : "—"}</td> : null}
              <td className="r t-follow"><FollowLink wallet={w.wallet} initial={w.followed} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
