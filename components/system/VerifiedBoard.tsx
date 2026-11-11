/* The Verified leaderboard (lib/verified/board.ts) and a wallet's check results.
 *   VerifiedBoard   Verified wallets first: total profit, 30 and 90-day profit, win rate, record by category, average
 *                   position as a share of its bankroll, its last 10 trades with results (losses as plain as wins), Follow
 *   VerifiedChecks  the four checks with pass or fail and the numbers behind each, so members see why
 *   TopVerified     the homepage's live top five, names hidden (no address, no link) until signup
 * Server markup. Real numbers only; information, not financial advice. */
import { FollowLink } from "@/components/desk/Act";
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import type { BoardWallet } from "@/lib/verified/board";
import { dollars } from "@/lib/money";
import { pctText } from "@/lib/copies/sizing";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
const catName = (c: string) => (isCategory(c) ? categoryInfo(c).name : c);
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

export function VerifiedBadge({ on }: { on: boolean }) {
  return on ? <span className="vb-badge" data-testid="verified-badge">Verified</span> : <span className="vb-badge vb-badge--off">Not verified</span>;
}

export function Last10({ rows }: { rows: BoardWallet["last10"] }) {
  if (!rows.length) return <p className="b-small">No settled trade in 90 days.</p>;
  return (
    <ol className="vb-last" data-testid="last10">
      {rows.map((r, i) => (
        <li key={i} className={r.pnl > 0 ? "vb-last__w" : r.pnl < 0 ? "vb-last__l" : undefined}>
          <span className="vb-last__r">{r.pnl > 0 ? "WON" : r.pnl < 0 ? "LOST" : "EVEN"}</span>
          <span className="vb-last__t">{r.outcome ? `${r.outcome} · ` : ""}{r.title}</span>
          <span className="b-num b-small">{dollars(r.moneyIn)} in</span>
          <b className="b-num">{signed(r.pnl)}</b>
        </li>
      ))}
    </ol>
  );
}

export function VerifiedChecks({ w }: { w: BoardWallet }) {
  return (
    <div className="vb-checks" data-testid="verified-checks">
      <p className="s-strong"><VerifiedBadge on={w.verified} /> {w.verified ? `Passes all four checks${w.verifiedSince ? `, Verified since ${ET.format(new Date(w.verifiedSince))}` : ""}.` : "Doesn't pass every check, so it isn't Verified."}</p>
      <ul>
        {w.checks.map(c => (
          <li key={c.key} className={c.pass ? "vb-check vb-check--pass" : "vb-check vb-check--fail"} data-testid={`check-${c.key}`}>
            <span className="vb-check__mark" aria-hidden="true">{c.pass ? "✓" : "✕"}</span>
            <span><b>{c.label}</b><span className="sr-only">{c.pass ? " passed" : " failed"}</span><br /><span className="b-small">{c.detail}</span></span>
          </li>
        ))}
      </ul>
      <p className="b-small">Rechecked daily from its public Polymarket record (last {ET.format(new Date(w.checkedAt))}). A wallet that stops passing loses the badge and its followers are told.</p>
    </div>
  );
}

export function VerifiedBoard({ rows, member }: { rows: BoardWallet[]; member: boolean }) {
  if (!rows.length) return <p className="b-empty">The first daily check is running. Verified wallets show here as each one is read.</p>;
  return (
    <ol className="vb" data-testid="verified-board">
      {rows.map((w, i) => (
        <li key={w.wallet} className="vb-row" data-testid="verified-row" data-verified={w.verified}>
          <div className="vb-row__head">
            <span className="b-num vb-rank">{i + 1}</span>
            <VerifiedBadge on={w.verified} />
            <a className="vb-addr" href={`/wallet/${w.wallet}`}>{w.short}</a>
            {member ? <FollowLink wallet={w.wallet} initial={w.following} /> : null}
          </div>
          <dl className="vb-stats">
            <div><dt>Total profit</dt><dd className="b-num">{signed(w.pnl)}</dd></div>
            <div><dt>30 days</dt><dd className={`b-num ${w.pnl30 < 0 ? "b-down" : ""}`}>{signed(w.pnl30)}</dd></div>
            <div><dt>90 days</dt><dd className={`b-num ${w.pnl90 < 0 ? "b-down" : ""}`}>{signed(w.pnl90)}</dd></div>
            <div><dt>Win rate (90 days)</dt><dd className="b-num">{w.winRate !== null ? `${Math.round(w.winRate * 100)}%` : "None"} <small>{w.won}–{w.lost}</small></dd></div>
            <div><dt>Avg trade, of bankroll</dt><dd className="b-num">{w.avgSizePct !== null ? pctText(w.avgSizePct) : "Unknown"}</dd></div>
          </dl>
          {w.byCategory.length ? <p className="b-small vb-cats">By category: {w.byCategory.slice(0, 4).map(c => `${catName(c.category)} ${c.won}–${c.lost} (${signed(c.pnl)})`).join(" · ")}</p> : null}
          <details className="vb-more"><summary className="b-small">Last 10 trades and the checks</summary><Last10 rows={w.last10} /><VerifiedChecks w={w} /></details>
        </li>
      ))}
    </ol>
  );
}

/** The homepage's top five Verified wallets: real profit, names and addresses hidden until signup. */
export function TopVerified({ rows }: { rows: BoardWallet[] }) {
  if (!rows.length) return null;
  return (
    <ol className="vb-top" data-testid="top-verified">
      {rows.slice(0, 5).map((w, i) => (
        <li key={w.wallet} className="vb-top__row" data-testid="top-verified-row">
          <span className="b-num vb-rank">{i + 1}</span>
          <span className="vb-top__who"><VerifiedBadge on /> <span className="vb-hidden" aria-label="Wallet hidden until you sign up">0x••••…••••</span></span>
          <span className="vb-top__n"><small>All time</small><b className="b-num">{signed(w.pnl)}</b></span>
          <span className="vb-top__n"><small>90 days</small><b className={`b-num ${w.pnl90 < 0 ? "b-down" : ""}`}>{signed(w.pnl90)}</b></span>
          <span className="vb-top__n"><small>Win rate</small><b className="b-num">{w.winRate !== null ? `${Math.round(w.winRate * 100)}%` : "None"}</b></span>
        </li>
      ))}
    </ol>
  );
}
