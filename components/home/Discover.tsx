/* Trackers, the members' home (/ and /discover): first, every open position from winning trackers and traders, live
 * (lib/follow/open.ts); then every tracker ranked by followable ROI, each with its record and what it holds now (open
 * positions, the money in them and the largest one). Trackers under 30 settled follow with "Building record · N of 30".
 * Below: the largest positions today (one row per account, market and side within an hour), the most active markets
 * and tonight's games. Every number is a row from
 * terminal.moves (lib/trackers-store.ts, lib/discover.ts). Server component. */
import Link from "next/link";
import { RecordResult } from "@/components/trackers/Tracker";
import { coverStats, TrackerCover } from "@/components/trackers/TrackerCover";
import { Section, Table } from "@/components/stats/Stats";
import { OpenNow } from "@/components/follow/OpenNow";
import { PAST } from "@/lib/copy";
import { dedupe, openFromWinners } from "@/lib/follow/open";
import { MoveArt } from "@/components/MoveArt";
import { Result } from "@/components/ui/Result";
import type { Viewer } from "@/lib/auth/viewer";
import type { Db } from "@/lib/db";
import { isReady } from "@/lib/features";
import { biggestToday, tonightsGames, trendingMarkets, type MarketRow } from "@/lib/discover";
import { memo } from "@/lib/memo";
import { agoText, clockET, dollars } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { headlineOf } from "@/lib/moves/headline";
import { hasTrackerRecord, returnPct, returnTone, topPerformers, trackerHref, visibleTrackers } from "@/lib/trackers";
import { trackerHoldings, trackerStats, type TrackerHolding } from "@/lib/trackers-store";

const marketHref = (id: string) => `/market/${encodeURIComponent(id)}`;


/** "12 open · $4.1M · largest: Warriors to beat the Timberwolves", or that it holds nothing right now. */
export function holdingLine(h: TrackerHolding | undefined): string {
  if (!h || h.open === 0) return "No open positions";
  return `${h.open.toLocaleString("en-US")} open · ${dollars(h.amount)}${h.top ? ` · largest: ${headlineOf(h.top)}` : ""}`;
}

export async function Discover({ db, viewer, now }: { db: Db | null; viewer: Viewer; now: number }) {
  const until = now - movePlan(viewer.plan).delayMs;
  const [stats, holdings, today, trending, tonight, open] = db ? await Promise.all([
    trackerStats(db, now).catch(() => new Map()),
    trackerHoldings(db, until, now).catch(() => new Map()),
    memo(`discover:today:${Math.floor(until / 30_000)}`, 30_000, () => biggestToday(db, now, until)).then(l => feedItems(db, dedupe(l), viewer.plan, viewer.region, now)).catch(() => []),
    memo(`discover:trending:${Math.floor(until / 30_000)}`, 30_000, () => trendingMarkets(db, until - 3_600_000, until)).catch((): MarketRow[] => []),
    memo(`discover:tonight:${Math.floor(until / 60_000)}`, 60_000, () => tonightsGames(db, now, until)).catch((): MarketRow[] => []),
    openFromWinners(db, viewer.plan, now).catch(() => ({ rows: [], total: 0 })),
  ]) : [new Map(), new Map(), [], [], [], { rows: [], total: 0 }];
  const rows = visibleTrackers(isReady).map(t => ({ t, slug: t.slug, s: stats.get(t.slug), record: stats.get(t.slug)?.records.all ?? null }));
  const ranked = topPerformers(rows);
  const rest = rows.filter(r => !hasTrackerRecord(r.record));
  return (
    <main className="wrap app2 discover">
      <header className="phead">
        <h1 className="phead__h">Trackers</h1>
        <p className="phead__sub">Each tracker is a live portfolio of large positions, ranked by followable ROI: what $100 on every position would have made, bought at the price Insidir showed it. A record starts at 30 settled. {PAST}</p>
      </header>

      <Section id="open-h" title="Open now from winning trackers" note={`${open.total.toLocaleString("en-US")} open from trackers and traders with a positive followable return on 30+ settled.`}>
        <OpenNow rows={open.rows.slice(0, 8)} total={open.total} member now={now} trialHref="/start" />
        {open.total > 8 ? <p className="tsec__foot"><Link className="tlink tlink--go" href="/open">All {open.total.toLocaleString("en-US")} open <span className="arrow" aria-hidden="true">→</span></Link></p> : null}
      </Section>

      <ol className="tbook" aria-label="Trackers by ROI">
        {[...ranked, ...rest].map(({ t, s, record }, i) => (
          <li key={t.slug}>
            <Link className="tbook__row" href={trackerHref(t.slug)}>
              <span className="tbook__rank">{hasTrackerRecord(record) ? i + 1 : ""}</span>
              <TrackerCover t={t} s={coverStats(s)} small className="tbook__thumb" />
              <span className="tbook__who">
                <span className="tbook__name">{t.name}</span>
                <span className="tbook__hold">{holdingLine(holdings.get(t.slug))}</span>
              </span>
              {t.kind === "filings"
                ? <Result className="tbook__roi" amount={s?.tracked30d ? dollars(s.tracked30d) : null} status="30-day volume" dash />
                : <Result className="tbook__roi" amount={returnPct(record)} tone={returnTone(record)} status="Followable ROI" dash />}
              {t.kind === "filings" ? <Result amount={null} status="Filings" dash /> : <RecordResult r={record} dash />}
            </Link>
          </li>
        ))}
      </ol>
      <p className="tsec__foot"><Link className="tlink tlink--go" href="/trackers">Browse trackers by group <span className="arrow" aria-hidden="true">→</span></Link></p>

      <Section id="today-h" title="Largest positions today" note="Since midnight, New York time.">
        {today.length ? <Table label="Largest positions today" head={["Position", "Size", "Opened"]} numeric={[1, 2]} rows={today.map(m => [
          <Link key="b" className="dtable__link dtable__link--art" href={marketHref(m.marketId)}><MoveArt art={m.art} /><span>{m.headline}<span className="dtable__sub">{m.subline}</span></span></Link>, dollars(m.amount), m.ago])} />
          : <p className="dnote">No large positions yet today.</p>}
      </Section>

      <div className="dgrid2 dsec">
        <div>
          <h2 className="dsec__h">Most active markets</h2>
          <p className="dsec__note">The most volume in large positions in the last hour.</p>
          {trending.length ? <Table label="Most active markets" head={["Market", "Volume", "Positions"]} numeric={[1, 2]} rows={trending.map(m => [
            <Link key="m" className="dtable__link" href={marketHref(m.marketId)}>{m.title}<span className="dtable__sub">{m.event !== m.title ? m.event : agoText(m.lastAt, now)}</span></Link>, dollars(m.total), m.moves.toLocaleString("en-US")])} />
            : <p className="dnote">No large positions in the last hour.</p>}
        </div>
        <div>
          <h2 className="dsec__h">Tonight&apos;s games</h2>
          <p className="dsec__note">Games starting before 6 a.m. ET with large positions on them.</p>
          {tonight.length ? <Table label="Tonight's games" head={["Game", "Starts", "Volume"]} numeric={[1, 2]} rows={tonight.map(m => [
            <Link key="g" className="dtable__link" href={marketHref(m.marketId)}>{m.title}<span className="dtable__sub">{m.event !== m.title ? m.event : ""}</span></Link>,
            m.startAt! <= now ? "Started" : clockET(m.startAt!), dollars(m.total)])} />
            : <p className="dnote">No games tonight with large positions yet.</p>}
        </div>
      </div>
    </main>
  );
}
