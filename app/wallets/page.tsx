/* /wallets (members): the millionaire wallets active today, by dollars bet today: all-time profit, $ and bets today,
 * the biggest position today, Follow (followed wallets ping when they bet). Short addresses only, never a name.
 * Visitors go to /go. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { Leaders } from "@/components/desk/Panels";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { leaders } from "@/lib/desk/data";
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
      <div className="d-root">
        <header className="d-top"><div className="d-top__id"><h1 className="d-title">Wallets</h1><span className="d-live"><i aria-hidden="true" />Millionaire wallets with a bet today</span></div></header>
        {list.length ? <Leaders list={list} full /> : (
          <div className="d-panel"><div className="d-panel__h"><span>Millionaires active today</span></div>
            <p className="b-empty" style={{ padding: 14 }}>No millionaire wallet has bet yet today (since midnight ET). <a href="/board">See the latest bets</a>.</p></div>
        )}
      </div>
    </Frame>
  );
}
