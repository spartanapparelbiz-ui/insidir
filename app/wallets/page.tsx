/* /wallets (members): the millionaire wallets active today, by dollars bet today: all-time profit, $ and bets today,
 * the biggest position today, Follow (followed wallets ping when they bet). Short addresses only, never a name.
 * Rows in the Desk's language (components/desk/Parts.tsx). Visitors go to /go. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { FollowLink } from "@/components/desk/Act";
import { MarketName, Wallet } from "@/components/desk/Parts";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { leaders } from "@/lib/desk/data";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallets: millionaires active today", robots: { index: false } };

export default async function Wallets() {
  const viewer = await getViewer();
  if (!isPaid(viewer.plan)) redirect("/go");
  const now = Date.now();
  const list = hasDatabase() ? await leaders(getDb(), now, viewer.user?.id ?? null, 60).catch(() => []) : [];
  return (
    <Frame member current="wallets" testid="wallets-page">
      <div className="dk-page">
        <header className="dk-head"><div><h1 className="dk-h1">Wallets</h1><p className="dk-lede">Wallets up $1M+ all-time that bet today, by dollars bet today. Follow one and we ping you when it bets.</p></div></header>
        {list.length ? (
          <ol className="dk-rows" data-testid="desk-leaders">
            <li className="dk-row dk-row--w dk-row--head" aria-hidden="true"><span>Wallet</span><span>Biggest bet today</span><span className="dk-r">Today</span><span className="dk-r">Bets</span><span /></li>
            {list.map(l => (
              <li key={l.wallet} className="dk-row dk-row--w" data-testid="leader-row">
                <span><Wallet short={l.short} pnl={l.pnl} tier="millionaire" /></span>
                <span className="dk-dim">{l.biggest ? <><MarketName title={l.biggest.title} category={l.biggest.category} /> · {dollars(l.biggest.dollars)}</> : null}</span>
                <span className="dk-r dk-num dk-size">{dollars(l.todayDollars)}</span>
                <span className="dk-r dk-dim">{l.todayBets} {l.todayBets === 1 ? "bet" : "bets"}</span>
                <span className="dk-r"><FollowLink wallet={l.wallet} initial={l.followed} short /></span>
              </li>
            ))}
          </ol>
        ) : <p className="dk-dim">No millionaire wallet has bet yet today (since midnight ET). <a className="dk-link" href="/board">See the latest bets</a></p>}
      </div>
    </Frame>
  );
}
