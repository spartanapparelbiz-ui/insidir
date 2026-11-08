/* Verify (click-to-verify): the raw sources behind a position row, each opening in a new tab.
 *   Trade    the on-chain transaction, https://polygonscan.com/tx/<hash>
 *   Wallet   the wallet's address page, https://polygonscan.com/address/<address> (never its Polymarket profile)
 *   Market   the Polymarket market page (/verify/pm/<market>: outside the US only, checked server-side) and the same
 *            market on Kalshi when Kalshi lists it
 * and when the price shown was fetched (ET). No transaction yet: "Source pending", never a broken link. A visitor gets
 * neither the transaction nor the address while the side is hidden (lib/millionaires/queries.ts redact): "Trade after
 * it settles". Safe in server and client components. */
import type { BetVerify } from "@/lib/millionaires/queries";

const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
/** "Nov 8, 3:12 PM ET". */
export const fetchedEt = (ms: number): string => `${ET.format(new Date(ms)).replace(/,(?=[^,]*$)/, ",")} ET`;
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

export function Verify({ v, marketId, polymarket = false, compact = false }: { v: BetVerify; marketId: string;
  /** The viewer is outside the US (Polymarket links are never shown in the US). */
  polymarket?: boolean; compact?: boolean }) {
  return (
    <span className={`b-verify${compact ? " b-verify--compact" : ""}`} data-testid="verify">
      <span className="b-verify__label">Verify</span>
      {v.tx ? <a href={`https://polygonscan.com/tx/${v.tx}`} {...ext} data-testid="verify-tx">Trade</a>
        : v.locked ? <span className="b-verify__off" data-testid="verify-locked">Trade after it settles</span>
        : <span className="b-verify__off" data-testid="verify-pending">Source pending</span>}
      {v.address ? <a href={`https://polygonscan.com/address/${v.address}`} {...ext} data-testid="verify-wallet">Wallet</a> : null}
      {polymarket && v.polymarket ? <a href={`/verify/pm/${encodeURIComponent(marketId)}`} {...ext} data-testid="verify-pm">Polymarket</a> : null}
      {v.kalshi ? <a href={v.kalshi} {...ext} data-testid="verify-kalshi">Kalshi</a> : null}
      {v.fetchedAt ? <span className="b-verify__at" data-testid="verify-fetched">fetched {fetchedEt(v.fetchedAt)}</span> : null}
    </span>
  );
}
