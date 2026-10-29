/* Top traders (docs/INSIDIR-V2.md §6): the top 50 Polymarket wallets by profit, among wallets with 20+ resolved
 * markets, this week, this month or all time, Sports or Markets (lib/profiles/store.ts topRanking). Win rate, profit
 * and best category are over the same markets. Names are for everyone; the numbers are for members and are never sent
 * to a free viewer's browser. */
import { GET_CTA } from "@/lib/copy";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { FollowButton } from "@/components/v2/FollowButton";
import { followState, pct } from "@/components/v2/profiles/shared";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { signedShort } from "@/lib/moves/copy";
import { walletLabel } from "@/lib/moves/records";
import { walletFace } from "@/lib/moves/avatar";
import { avatarsOrNone } from "@/lib/moves/avatar-store";
import { Avatar } from "@/components/v2/Avatar";
import { followList } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";
import { memo } from "@/lib/memo";
import { topRanking, type TopRow, type TopWindow } from "@/lib/profiles/store";
import { PageBand } from "@/components/PageBand";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Top traders", description: "The top Polymarket traders by net P&L, from their public record. 20+ resolved markets only." };

const WINDOWS: Array<[TopWindow, string]> = [["week", "This week"], ["month", "This month"], ["all", "All time"]];
const TABS: Array<["" | "sports" | "markets", string]> = [["", "All"], ["sports", "Sports"], ["markets", "Markets"]];

export default async function TopPage({ searchParams }: { searchParams: Promise<{ window?: string; tab?: string }> }) {
  const sp = await searchParams;
  const window: TopWindow = sp.window === "week" || sp.window === "month" ? sp.window : "all";
  const tab = sp.tab === "sports" || sp.tab === "markets" ? sp.tab : null;
  const viewer = await requireMember("/top");
  const paid = isPaid(viewer.plan);
  const trial = unlockHref();
  const now = Date.now();
  let rows: TopRow[] = [];
  let follows: Array<{ kind: string; target: string }> = [];
  let avatars = new Map<string, string>();
  if (hasDatabase()) {
    const db = getDb();
    rows = await memo(`top:${window}:${tab ?? ""}`, 60_000, () => topRanking(db, window, tab, now)).catch(() => []);
    // Pictures are read fresh (not memoized), so one hidden in /admin is gone on the next page view.
    [follows, avatars] = await Promise.all([viewer.user ? followList(db, viewer.user.id).catch(() => []) : Promise.resolve([]), avatarsOrNone(db, rows.map(r => r.wallet))]);
  }
  const q = (o: { window?: string; tab?: string }) => {
    const p = new URLSearchParams();
    const w = o.window ?? window, t = o.tab ?? tab ?? "";
    if (w !== "all") p.set("window", w);
    if (t) p.set("tab", t);
    const s = p.toString();
    return s ? `/top?${s}` : "/top";
  };
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} trialHref={trial} current="/top" />
      <main className="wrap app2 top dark">
        <PageBand n={BAND.top} title="Top traders" />
        <p className="note">Polymarket wallets ranked by profit on markets that resolved {window === "all" ? "so far" : window === "week" ? "in the last 7 days" : "in the last 30 days"}. Only wallets with 20 or more resolved markets. Past results, not a promise.</p>
        <nav className="chips" aria-label="Time">
          {WINDOWS.map(([w, label]) => <Link key={w} className="chip2" href={q({ window: w })} aria-current={w === window ? "true" : undefined}>{label}</Link>)}
        </nav>
        <nav className="chips" aria-label="Category">
          {TABS.map(([t, label]) => <Link key={label} className="chip2" href={q({ tab: t })} aria-current={(t || null) === tab ? "true" : undefined}>{label}</Link>)}
        </nav>
        {!paid && rows.length ? (
          <aside className="upsell" data-locked="top">
            <p className="upsell__text">Win rates, net P&L and best categories are for members.</p>
            <a className="btn btn--primary" href={trial} data-unlock="top">{GET_CTA}</a>
          </aside>
        ) : null}
        {rows.length ? (
          <ol className="toplist">
            {rows.map((r, i) => {
              const following = follows.some(f => f.kind === "trader" && f.target === r.wallet);
              return (
                <li key={r.wallet} className="toplist__row rv" style={{ ["--i" as string]: Math.min(i, 6) }}>
                  <span className="toplist__rank">{i + 1}</span>
                  <span className="facerow">
                    <Avatar face={walletFace(r.wallet, r.name, avatars)} />
                    <span className="toplist__who">
                      <Link className="toplist__name" href={`/p/${r.wallet}`}>{walletLabel(r.wallet, r.name)}</Link>
                      {paid ? <span className="toplist__stats">
                        <span>Won {r.won} of {r.resolved} ({pct(r.won / r.resolved)})</span>
                        {r.best ? <span>Best: {r.best}</span> : null}
                      </span> : null}
                    </span>
                  </span>
                  {paid ? <span className="toplist__profit money" data-count={r.profit} data-fmt="signed">{signedShort(r.profit)}</span> : null}
                  <FollowButton kind="trader" target={r.wallet} state={followState(viewer, following)} trialHref={trial} />
                </li>
              );
            })}
          </ol>
        ) : <p className="note empty__p">No wallets with 20 or more resolved markets {window === "all" ? "yet" : "in this window yet"}.</p>}
      </main>
    </>
  );
}
