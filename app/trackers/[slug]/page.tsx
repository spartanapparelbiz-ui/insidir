/* A tracker (lib/trackers.ts): its cover, name, "by Insidir", the line and Follow (the one action: its moves in
 * Following and an alert when it moves); then its record from settled moves (won, lost, win rate, average price paid,
 * net), or "New" under 20 settled moves; then its latest moves and its latest results. Public: visitors see moves 30
 * minutes late (lib/moves/feed.ts), like the rest of the free preview. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Photo";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { BY, recordText, TrackerRow } from "@/components/trackers/Tracker";
import { FollowButton, type FollowState } from "@/components/v2/FollowButton";
import { MoveCard } from "@/components/v2/MoveCard";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { dollars, signedShort } from "@/lib/moves/copy";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { followList } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";
import { countsToRecord } from "@/lib/trust";
import { hasTrackerRecord, settledOf, trackerBySlug, TRACKERS, winPct } from "@/lib/trackers";
import { trackerMoves, trackerStats, type TrackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = trackerBySlug((await params).slug);
  return t ? { title: t.name, description: `${t.name}, by Insidir: ${t.line}` } : { title: "Tracker" };
}

export default async function TrackerPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = trackerBySlug((await params).slug);
  if (!t) notFound();
  const now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const until = now - movePlan(viewer.plan).delayMs;
  const trial = unlockHref();
  let allStats: Map<string, TrackerStats> | null = null;
  let stats: TrackerStats | null = null, recent: FeedItem[] = [], results: FeedItem[] = [], following = false;
  if (hasDatabase()) {
    const db = getDb();
    const [all, moves, settled, mine] = await Promise.all([
      trackerStats(db, now).catch(() => null),
      trackerMoves(db, t, { until, limit: 8 }).catch(() => []),
      t.kind === "bets" ? trackerMoves(db, t, { settled: true, limit: 40 }).catch(() => []) : Promise.resolve([]),
      viewer.user ? followList(db, viewer.user.id).catch(() => []) : Promise.resolve([]),
    ]);
    allStats = all;
    stats = all?.get(t.slug) ?? null;
    following = mine.some(f => f.kind === "tracker" && f.target === t.slug);
    [recent, results] = await Promise.all([
      feedItems(db, moves, viewer.plan, viewer.region, now).catch(() => []),
      feedItems(db, settled.filter(m => countsToRecord(m)).slice(0, 8), viewer.plan, viewer.region, now, now).catch(() => []),
    ]);
  }
  const follow: FollowState = !isReady("follows") ? "soon" : !paid ? "locked" : following ? "on" : "off";
  const cardFollow: FollowState = !isReady("follows") ? "soon" : paid ? "off" : "locked";
  const r = stats?.records.all ?? null;
  const others = TRACKERS.filter(o => o.slug !== t.slug).slice(0, 4);

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/trackers" trialHref={trial} />
      <main className="wrap app2 tracker">
        <header className="thead">
          <div className="thead__cover"><Cover n={t.photo} eager sizes="(min-width: 900px) 520px, 100vw" /></div>
          <div className="thead__copy">
            <p className="thead__by">{BY}</p>
            <h1 className="thead__h">{t.name}</h1>
            <p className="thead__line">{t.line}</p>
            <div className="thead__act">
              <FollowButton kind="tracker" target={t.slug} state={follow} trialHref={trial} />
              {stats && stats.followers > 0 ? <span className="thead__meta">{stats.followers.toLocaleString("en-US")} {stats.followers === 1 ? "follower" : "followers"}</span> : null}
            </div>
          </div>
        </header>

        <section className="tsec" aria-labelledby="rec-h">
          <h2 id="rec-h" className="tsec__h">Record</h2>
          {t.kind === "filings" ? <p className="tsec__note">{recordText(r, t.kind)}</p> : hasTrackerRecord(r) ? (
            <>
              <dl className="record tstats">
                <div><dt>Win rate</dt><dd className={winPct(r) >= 50 ? "money" : "loss"} data-count={winPct(r)} data-fmt="int">{winPct(r)}%</dd></div>
                <div><dt>Won</dt><dd>{r.won.toLocaleString("en-US")}</dd></div>
                <div><dt>Lost</dt><dd>{r.lost.toLocaleString("en-US")}</dd></div>
                <div><dt>Avg price paid</dt><dd>{r.oddsPct !== null ? `${Math.round(r.oddsPct)}¢` : "—"}</dd></div>
                <div><dt>Net</dt><dd className={r.net >= 0 ? "money" : "loss"}>{signedShort(r.net)}</dd></div>
              </dl>
              <p className="tsec__note">From {(r.won + r.lost).toLocaleString("en-US")} settled Polymarket bets, checked against each wallet&apos;s own trades. Past results, not a promise.</p>
            </>
          ) : (
            <div className="tnew"><span className="rpill rpill--new">New</span><p>{settledOf(stats?.records.all) > 0 ? `${settledOf(stats?.records.all)} settled so far.` : "No settled moves yet."} A record shows once 20 of its moves have settled.</p></div>
          )}
          {stats ? (
            <dl className="record tstats tstats--sub">
              <div><dt>Tracked, last 30 days</dt><dd>{dollars(stats.tracked30d)}</dd></div>
              <div><dt>Moves, last 30 days</dt><dd>{stats.moves30d.toLocaleString("en-US")}</dd></div>
              <div><dt>Moves, all time</dt><dd>{stats.moves.toLocaleString("en-US")}</dd></div>
            </dl>
          ) : null}
        </section>

        <section className="tsec" aria-labelledby="moves-h">
          <h2 id="moves-h" className="tsec__h">Latest moves</h2>
          {!paid ? <p className="tsec__note">You&apos;re seeing moves 30 minutes late. <a href={trial} data-unlock="tracker">Members see them live.</a></p> : null}
          {recent.length ? (
            <ol className="feed2__list tmoves">{recent.map(m => <li key={m.id}><MoveCard m={m} follow={cardFollow} trialHref={trial} /></li>)}</ol>
          ) : <div className="tempty"><p className="tempty__h">No moves yet</p><p>The next big move that fits this tracker shows up here.</p></div>}
        </section>

        {results.length ? (
          <section className="tsec" aria-labelledby="res-h">
            <h2 id="res-h" className="tsec__h">Latest results</h2>
            <ol className="rlist">
              {results.map(m => (
                <li key={m.id} className="rlist__row">
                  <span className={`rlist__res rlist__res--${m.result}`}>{m.result === "won" ? "Won" : "Lost"}</span>
                  <span className="rlist__what">{m.sentence}</span>
                  <span className="rlist__amt">{dollars(m.amount)}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="tsec" aria-labelledby="more-h">
          <h2 id="more-h" className="tsec__h">More trackers</h2>
          <ol className="tlist tlist--grid">{others.map(o => <TrackerRow key={o.slug} t={o} r={allStats?.get(o.slug)?.records.all ?? null} />)}</ol>
          <p className="tsec__foot"><Link className="btn btn--secondary" href="/trackers">All trackers <span className="arrow" aria-hidden="true">→</span></Link></p>
        </section>
      </main>
    </>
  );
}
