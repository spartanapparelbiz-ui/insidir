/* The home page, Autopilot-style: one centred hero (the logo mark in a black rounded square, "Follow the big money.",
 * one line, one black pill "Explore trackers →", then five real app screens in phone frames fanned across); "Featured"
 * (four wide photo cards); two columns, "Top performers" by window and "Popular"; pricing; FAQ.
 * Every number is a row from terminal.moves on the viewer's clock (free: 30 minutes late), and a tracker's record is
 * its settled moves (lib/trackers-store.ts). Nothing is made up: a phone with nothing to show is left out, and a
 * tracker with under 20 settled moves says "New". */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { HeroCta } from "@/components/home/HeroCta";
import { Phones, type PhoneData } from "@/components/home/Phones";
import { PeriodTabs } from "@/components/trackers/PeriodTabs";
import { TrackerFeature, TrackerRow } from "@/components/trackers/Tracker";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { PricingCards } from "@/components/v2/Pricing";
import { LOGO } from "@/components/Wordmark";
import { homeCopy, isMainstream } from "@/lib/home/curate";
import { countsToRecord } from "@/lib/trust";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase, type Db } from "@/lib/db";
import { clockET, dollars } from "@/lib/moves/copy";
import { feedItems, type FeedItem } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { listMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { isPaid } from "@/lib/plans";
import { memo } from "@/lib/memo";
import { FEATURED, PERIODS, popular, topPerformers, trackerBySlug, TRACKERS, type TrackerSlug } from "@/lib/trackers";
import { trackerMoves, trackerStats, type TrackerStats } from "@/lib/trackers-store";
import type { Plan, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

const MONTH = 30 * 86_400_000;

/** A feed item said the home page's short way. */
function homeItem(fi: FeedItem, m: Move | undefined): FeedItem {
  const c = homeCopy({ ...fi, detail: m?.detail ?? null }, fi.who.name);
  return { ...fi, sentence: c.line, context: c.context };
}

/** Results' phone: recent settled bets that count toward the record, won ones and lost ones, biggest first. */
function resultPick(settled: Move[], now: number): Move[] {
  const pool = settled.filter(m => (m.settledAt ?? m.at) > now - MONTH && countsToRecord(m)).sort((a, b) => b.amount - a.amount);
  const won = pool.filter(m => m.result === "won").slice(0, 2), lost = pool.filter(m => m.result === "lost").slice(0, 2);
  return [...won, ...lost].sort((a, b) => b.amount - a.amount);
}

interface HomeData { phones: PhoneData; stats: Map<TrackerSlug, TrackerStats> }
const EMPTY: HomeData = { phones: { feed: [], results: [], tracker: null, list: [], alert: null }, stats: new Map() };

async function homeData(db: Db, plan: Plan, region: Region | null, until: number, now: number): Promise<HomeData> {
  const lead = trackerBySlug("biggest-bets")!;
  const [latestAll, settledAll, stats, leadMoves] = await Promise.all([
    listMoves(db, { until, limit: 60 }).catch(() => []),
    listMoves(db, { settled: true, source: "polymarket", limit: 200 }).catch(() => []),
    trackerStats(db, now).catch(() => new Map<TrackerSlug, TrackerStats>()),
    trackerMoves(db, lead, { until, limit: 3 }).catch(() => []),
  ]);
  const latest = latestAll.filter(isMainstream).slice(0, 4);
  const picked = resultPick(settledAll, now);
  const byId = new Map([...latest, ...picked, ...leadMoves].map(m => [m.id, m]));
  const [feed, results, leadItems] = await Promise.all([
    feedItems(db, latest, plan, region, now).catch(() => []),
    feedItems(db, picked, plan, region, now, now).catch(() => []),
    feedItems(db, leadMoves, plan, region, now).catch(() => []),
  ]);
  const short = (l: FeedItem[]) => l.map(fi => homeItem(fi, byId.get(fi.id)));
  const leadShort = short(leadItems);
  const ranked = topPerformers(TRACKERS.map(t => ({ t, slug: t.slug, record: stats.get(t.slug)?.records["1m"] ?? null })));
  const list = [...ranked, ...TRACKERS.filter(t => !ranked.some(r => r.slug === t.slug)).map(t => ({ t, slug: t.slug, record: stats.get(t.slug)?.records.all ?? null }))];
  return {
    stats,
    phones: {
      feed: short(feed), results: short(results),
      tracker: leadShort.length ? { t: lead, record: stats.get(lead.slug)?.records.all ?? null, moves: leadShort } : null,
      list: stats.size ? list : [],
      alert: leadShort[0] ? { tracker: lead.name, body: leadShort[0].sentence, time: clockET(leadShort[0].at).replace(/ (AM|PM) ET$/, "") } : null,
    },
  };
}

export default async function Home() {
  const now = Date.now();
  const [jar, viewer] = await Promise.all([cookies(), getViewer()]);
  const paid = isPaid(viewer.plan);
  const plan = movePlan(viewer.plan);
  const until = now - plan.delayMs;
  // Every visitor on the same plan and region sees the same home page: computed once per 15 seconds.
  const { phones, stats } = hasDatabase()
    ? await memo(`home:${viewer.plan}:${viewer.region ?? ""}`, 15_000, () => homeData(getDb(), viewer.plan, viewer.region, until, now))
    : EMPTY;
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined));
  const trial = unlockHref();

  const rows = TRACKERS.map(t => ({ t, s: stats.get(t.slug) }));
  const periodTabs = PERIODS.map(p => {
    const ranked = topPerformers(rows.map(({ t, s }) => ({ t, slug: t.slug, record: s?.records[p.key] ?? null })));
    return {
      key: p.key, label: p.label,
      body: ranked.length ? <ol className="tlist">{ranked.slice(0, 6).map(({ t, record }) => <TrackerRow key={t.slug} t={t} r={record} />)}</ol>
        : <p className="tlist__empty">No tracker has 20 settled moves in this window yet.</p>,
    };
  });
  const pop = popular(rows.filter(r => r.s).map(({ t, s }) => ({ t, followers: s!.followers, tracked30d: s!.tracked30d })));

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} offer={false} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp3">
        <section className="hero3" aria-labelledby="hero-h">
          <div className="wrap hero3__in">
            <span className="hero3__mark" aria-hidden="true"><svg viewBox={LOGO.markViewBox}><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
            <h1 id="hero-h" className="hero3__h">Follow the big money.</h1>
            <p className="hero3__sub">Pick a tracker. See every big move. That&apos;s it.</p>
            <HeroCta />
          </div>
          <Phones d={phones} />
        </section>

        <section className="sec3" aria-labelledby="feat-h">
          <div className="wrap">
            <h2 id="feat-h" className="sec3__h">Featured</h2>
            <div className="tfeats">
              {FEATURED.map((s, i) => <TrackerFeature key={s} t={trackerBySlug(s)!} i={i} />)}
            </div>
          </div>
        </section>

        <section className="sec3 sec3--tight" aria-label="Trackers">
          <div className="wrap tcols">
            <div className="tcol">
              <h2 className="sec3__h sec3__h--sm">Top performers</h2>
              <PeriodTabs tabs={periodTabs} initial="1m" />
            </div>
            <div className="tcol">
              <h2 className="sec3__h sec3__h--sm">Popular</h2>
              <p className="tcol__note">By followers, then money tracked in the last 30 days.</p>
              {pop.length ? (
                <ol className="tlist">
                  {pop.slice(0, 6).map(({ t, followers, tracked30d }, i) => (
                    <TrackerRow key={t.slug} t={t} rank={i + 1}
                      figure={followers > 0 ? `${followers.toLocaleString("en-US")} ${followers === 1 ? "follower" : "followers"}` : tracked30d > 0 ? dollars(tracked30d) : "No moves yet"} />
                  ))}
                </ol>
              ) : <p className="tlist__empty">Catching up: the trackers fill in as the first moves arrive.</p>}
            </div>
          </div>
          <div className="wrap sec3__foot"><Link className="btn btn--secondary" href="/trackers">See all trackers <span className="arrow" aria-hidden="true">→</span></Link></div>
        </section>

        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} href={trial} actions={false} title="One plan. Every tracker." />
        <FaqV2 />
      </main>
    </>
  );
}
