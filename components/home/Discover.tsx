/* Discover, the members' home: one headline, then the data. Top performers (1W 1M 3M 6M 1Y), Popular trackers, the
 * biggest bets today, trending markets (the most big money in the last hour) and tonight's games with big money on
 * them. Every number is a row from terminal.moves (lib/discover.ts, lib/trackers-store.ts). Server component. */
import Link from "next/link";
import { PeriodTabs } from "@/components/trackers/PeriodTabs";
import { TrackerRow } from "@/components/trackers/Tracker";
import { Section, Table } from "@/components/stats/Stats";
import type { Viewer } from "@/lib/auth/viewer";
import type { Db } from "@/lib/db";
import { isReady } from "@/lib/features";
import { biggestToday, tonightsGames, trendingMarkets, type MarketRow } from "@/lib/discover";
import { memo } from "@/lib/memo";
import { agoText, clockET, dollars } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { PERIODS, popular, topPerformers, visibleTrackers } from "@/lib/trackers";
import { trackerStats } from "@/lib/trackers-store";

const marketHref = (id: string) => `/market/${encodeURIComponent(id)}`;

export async function Discover({ db, viewer, now }: { db: Db | null; viewer: Viewer; now: number }) {
  const until = now - movePlan(viewer.plan).delayMs;
  const [stats, today, trending, tonight] = db ? await Promise.all([
    trackerStats(db, now).catch(() => new Map()),
    memo(`discover:today:${Math.floor(until / 30_000)}`, 30_000, () => biggestToday(db, now, until)).then(l => feedItems(db, l, viewer.plan, viewer.region, now)).catch(() => []),
    memo(`discover:trending:${Math.floor(until / 30_000)}`, 30_000, () => trendingMarkets(db, until - 3_600_000, until)).catch((): MarketRow[] => []),
    memo(`discover:tonight:${Math.floor(until / 60_000)}`, 60_000, () => tonightsGames(db, now, until)).catch((): MarketRow[] => []),
  ]) : [new Map(), [], [], []];
  const rows = visibleTrackers(isReady).map(t => ({ t, s: stats.get(t.slug) }));
  const tabs = PERIODS.map(p => {
    const ranked = topPerformers(rows.map(({ t, s }) => ({ t, slug: t.slug, record: s?.records[p.key] ?? null })));
    return { key: p.key, label: p.label, body: ranked.length
      ? <ol className="tlist">{ranked.slice(0, 6).map(({ t, record }) => <TrackerRow key={t.slug} t={t} r={record} />)}</ol>
      : <p className="tlist__empty">No tracker has 20 settled moves in this window yet.</p> };
  });
  const pop = popular(rows.filter(r => r.s).map(({ t, s }) => ({ t, followers: s!.followers, tracked30d: s!.tracked30d })));
  const word = viewer.user?.name?.trim().split(/\s+/)[0] ?? "";
  const first = /^[A-Z][a-z'-]{1,20}$/.test(word) ? word : null;
  return (
    <main className="wrap app2 discover">
      <header className="phead">
        <h1 className="phead__h">{first ? `Hi, ${first}.` : "Discover"}</h1>
        <p className="phead__sub">Where the big money is right now.</p>
      </header>

      <div className="tcols">
        <div className="tcol"><h2 className="sec3__h sec3__h--sm">Top performers</h2><PeriodTabs tabs={tabs} initial="1m" /></div>
        <div className="tcol">
          <h2 className="sec3__h sec3__h--sm">Popular trackers</h2>
          <p className="tcol__note">By followers, then money tracked in the last 30 days.</p>
          {pop.length ? <ol className="tlist">{pop.slice(0, 6).map(({ t, followers, tracked30d }, i) => (
            <TrackerRow key={t.slug} t={t} rank={i + 1} figure={followers > 0 ? `${followers.toLocaleString("en-US")} ${followers === 1 ? "follower" : "followers"}` : tracked30d > 0 ? dollars(tracked30d) : "No moves yet"} />
          ))}</ol> : <p className="tlist__empty">Catching up: the trackers fill in as the first moves arrive.</p>}
        </div>
      </div>

      <Section id="today-h" title="Biggest bets today" note="Since midnight, New York time.">
        {today.length ? <Table label="Biggest bets today" head={["Bet", "Amount", "When"]} numeric={[1, 2]} rows={today.map(m => [
          <Link key="b" className="dtable__link" href={marketHref(m.marketId)}>{m.sentence}</Link>, dollars(m.amount), m.ago])} />
          : <p className="dnote">No big bets yet today.</p>}
      </Section>

      <div className="dgrid2 dsec">
        <div>
          <h2 className="dsec__h">Trending markets</h2>
          <p className="dsec__note">The most big money in the last hour.</p>
          {trending.length ? <Table label="Trending markets" head={["Market", "Big money", "Moves"]} numeric={[1, 2]} rows={trending.map(m => [
            <Link key="m" className="dtable__link" href={marketHref(m.marketId)}>{m.title}<span className="dtable__sub">{m.event !== m.title ? m.event : agoText(m.lastAt, now)}</span></Link>, dollars(m.total), m.moves.toLocaleString("en-US")])} />
            : <p className="dnote">No big money in the last hour.</p>}
        </div>
        <div>
          <h2 className="dsec__h">Tonight&apos;s games</h2>
          <p className="dsec__note">Games starting before 6 a.m. ET with big money on them.</p>
          {tonight.length ? <Table label="Tonight's games" head={["Game", "Starts", "Big money"]} numeric={[1, 2]} rows={tonight.map(m => [
            <Link key="g" className="dtable__link" href={marketHref(m.marketId)}>{m.title}<span className="dtable__sub">{m.event !== m.title ? m.event : ""}</span></Link>,
            m.startAt! <= now ? "Started" : clockET(m.startAt!), dollars(m.total)])} />
            : <p className="dnote">No games tonight with big money yet.</p>}
        </div>
      </div>
    </main>
  );
}
