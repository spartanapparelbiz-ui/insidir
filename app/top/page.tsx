/* The leaderboard (/top), public: trackers and traders ranked by followable ROI, what $100 on every position would
 * have made bought at the price Insidir showed it plus a point of slippage (lib/follow), over the last 30 days or all
 * time. Only records of 30+ settled positions are ranked; losing ones stay on the list (honesty), at the bottom. Each
 * row: the $100 line and, for members, what it holds now. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { Avatar } from "@/components/v2/Avatar";
import { tone } from "@/components/stats/Stats";
import { TrackerCover, coverStats } from "@/components/trackers/TrackerCover";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { PAST } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { hundredLine, MIN_SETTLED, roiText, type FollowRecord } from "@/lib/follow/math";
import { traderFollowAll, type TraderFollow } from "@/lib/follow/records";
import { walletFace } from "@/lib/moves/avatar";
import { avatarsOrNone } from "@/lib/moves/avatar-store";
import { dollars } from "@/lib/moves/copy";
import { walletLabel } from "@/lib/moves/records";
import { visibleTrackers, type Tracker, type TrackerRecord } from "@/lib/trackers";
import { trackerHoldings, trackerStats, type TrackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard", description: `Trackers and traders ranked by what following them would have made, on 30 or more settled positions. ${PAST}` };

const WINDOWS = [["30d", "Last 30 days"], ["all", "All time"]] as const;
type Win = (typeof WINDOWS)[number][0];
const asFollow = (r: TrackerRecord | null | undefined): FollowRecord | null => (r ? { n: r.won + r.lost, won: r.won, lost: r.lost, staked: r.staked ?? 0, net: r.net } : null);
const ranked = <T,>(rows: Array<T & { r: FollowRecord | null }>) => rows.filter(x => x.r && x.r.n >= MIN_SETTLED).sort((a, b) => b.r!.net / b.r!.staked - a.r!.net / a.r!.staked);

export default async function TopPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const sp = await searchParams;
  const win: Win = sp.window === "all" ? "all" : "30d";
  const viewer = await getViewer();
  const member = isPaid(viewer.plan);
  const now = Date.now();
  const locked = <a className="board__hold board__hold--lock" href={unlockHref()}>Members see what it holds now</a>;
  let stats = new Map<string, TrackerStats>(), holdings = new Map<string, { open: number; amount: number }>(), traders: TraderFollow[] = [], avatars = new Map();
  if (hasDatabase()) {
    const db = getDb();
    [stats, holdings, traders] = await Promise.all([
      trackerStats(db, now).catch(() => new Map()), trackerHoldings(db, now, now).catch(() => new Map()),
      traderFollowAll(db, now).then(m => [...m.values()]).catch(() => []),
    ]);
  }
  const trackers = ranked(visibleTrackers(isReady).filter((t: Tracker) => t.kind === "bets").map(t => ({ t, s: stats.get(t.slug), r: asFollow(stats.get(t.slug)?.records[win === "all" ? "all" : "1m"]) })));
  const people = ranked(traders.map(x => ({ x, r: win === "all" ? x.all : x.d30 }))).slice(0, 50);
  if (hasDatabase() && people.length) avatars = await avatarsOrNone(getDb(), people.map(p => p.x.wallet)).catch(() => new Map());
  const roi = (r: FollowRecord) => <b className={tone(r.net)}>{roiText(r.net, r.staked)}</b>;
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/top" trialHref={unlockHref()} />
      <main className="wrap app2 board">
        <header className="phead">
          <h1 className="phead__h">Leaderboard</h1>
          <p className="phead__sub">Ranked by followable ROI: what $100 on every position would have made, bought at the price Insidir showed it plus a point of slippage, held until it settled. 30 or more settled positions only. {PAST}</p>
          <nav className="seg" aria-label="Window">{WINDOWS.map(([k, l]) => <Link key={k} className={`seg__b${k === win ? " is-on" : ""}`} aria-current={k === win ? "page" : undefined} href={k === "30d" ? "/top" : `/top?window=${k}`}>{l}</Link>)}</nav>
        </header>

        <section className="board__sec" aria-labelledby="board-trackers">
          <h2 id="board-trackers" className="sec2__h">Trackers</h2>
          {trackers.length ? (
            <ol className="board__list" data-testid="board-trackers">
              {trackers.map(({ t, s, r }, i) => {
                const h = holdings.get(t.slug);
                return (
                  <li key={t.slug} className="board__row">
                    <span className="board__rank">{i + 1}</span>
                    <Link href={`/trackers/${t.slug}`} className="board__art"><TrackerCover t={t} s={coverStats(s)} small /></Link>
                    <span className="board__who"><Link href={`/trackers/${t.slug}`} className="board__name">{t.name}</Link>
                      <span className="board__line">{hundredLine(r!)}</span>
                      {member ? <span className="board__hold">{h?.open ? `Holds ${h.open.toLocaleString("en-US")} open ${h.open === 1 ? "position" : "positions"}, ${dollars(h.amount)}` : "Nothing open now"}</span> : locked}</span>
                    <span className="board__fig">{roi(r!)}<span>{r!.n.toLocaleString("en-US")} settled</span></span>
                  </li>
                );
              })}
            </ol>
          ) : <p className="dnote">No tracker has 30 settled positions {win === "all" ? "yet" : "in the last 30 days"}. Each tracker&apos;s page shows its record so far.</p>}
        </section>

        <section className="board__sec" aria-labelledby="board-traders">
          <h2 id="board-traders" className="sec2__h">Traders</h2>
          {people.length ? (
            <ol className="board__list" data-testid="board-traders">
              {people.map(({ x, r }, i) => (
                <li key={x.wallet} className="board__row">
                  <span className="board__rank">{i + 1}</span>
                  <Link href={`/p/${x.wallet}`} className="board__art"><Avatar face={walletFace(x.wallet, x.name, avatars)} /></Link>
                  <span className="board__who"><Link href={`/p/${x.wallet}`} className="board__name">{walletLabel(x.wallet, x.name)}</Link>
                    <span className="board__line">{hundredLine(r!)}</span>
                    {member ? <span className="board__hold">{x.open ? `Holds ${x.open.toLocaleString("en-US")} open ${x.open === 1 ? "position" : "positions"}, ${dollars(x.openAmount)}` : "Nothing open now"}</span> : locked}</span>
                  <span className="board__fig">{roi(r!)}<span>{r!.n.toLocaleString("en-US")} settled</span></span>
                </li>
              ))}
            </ol>
          ) : <p className="dnote">No trader has 30 settled positions tracked by Insidir {win === "all" ? "yet" : "in the last 30 days"}.</p>}
        </section>
      </main>
    </>
  );
}
