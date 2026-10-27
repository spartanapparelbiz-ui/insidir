/* The home page: "serious type, wild world". Top to bottom: the trial bar and the black nav (SiteHeader); the cinematic
 * hero (components/home/Hero.tsx: seven graded photos, what Insidir is in one line, "Follow the big money.", one real big
 * move per photo on a solid card, the ticker strip of real moves); the scroll story "How Insidir works in 10 seconds"
 * (components/home/Story.tsx, one real trader); then clean white sections: a real feed preview (3 live cards and a
 * profile snippet), Results ("Real past moves. Not a promise."), where the data comes from (the trust
 * block), Pricing, FAQ, and "$1 for 3 days" once, at the end. One action everywhere above it: "See the live feed".
 * Every move and number is a row from terminal.moves on the viewer's clock (free: 30 minutes late). Nothing is made
 * up: with no moves, the card says it's catching up and the ticker and preview are hidden. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { Hero, PreviewSeen } from "@/components/home/Hero";
import { Story } from "@/components/home/Story";
import { storyFor, type Story as StoryData } from "@/lib/home/story";
import { homeCopy, isMainstream } from "@/lib/home/curate";
import { PhotoSection } from "@/components/home/PhotoSection";
import { HOME_SECTIONS } from "@/lib/photos";
import { HERO_PHOTOS } from "@/lib/photos";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { PricingCards } from "@/components/v2/Pricing";
import { MoveCard, SourceA } from "@/components/v2/MoveCard";
import { TrustBlock } from "@/components/TrustBlock";
import { LOGO } from "@/components/Wordmark";
import { trustFacts, type TrustFacts } from "@/lib/trust";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { TRIAL_LINE } from "@/lib/copy";
import { getDb, hasDatabase, type Db } from "@/lib/db";
import { isReady, liveTabs } from "@/lib/features";
import { agoText, dollars, recordLine } from "@/lib/moves/copy";
import { feedItems, feedStatus, type FeedItem, type FeedStatus } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { isTopTrader, walletLabel } from "@/lib/moves/records";
import { listMoves, recordsFor } from "@/lib/moves/store";
import { moveSource } from "@/lib/moves/source";
import { tickerItem, type TickerItem } from "@/lib/moves/ticker";
import type { Move, TraderRecord } from "@/lib/moves/types";
import { isPaid } from "@/lib/plans";
import { memo } from "@/lib/memo";
import type { Plan, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

const WEEK = 7 * 86_400_000;
const MONTH = 30 * 86_400_000;

/** The hero's moves: the biggest mainstream moves of the last week (lib/home/curate.ts), taking each live tab in turn
 *  so Sports, Markets and Stocks mix; topped up with the latest mainstream moves. Up to seven, one per photo. */
function heroPick(big: Move[], latest: Move[]): Move[] {
  const tabs = liveTabs().filter(t => t !== "crypto");
  const per = tabs.map(tab => big.filter(m => m.tab === tab));
  const out: Move[] = [];
  for (let i = 0; out.length < HERO_PHOTOS.length && per.some(l => l[i]); i++) for (const l of per) if (l[i] && out.length < HERO_PHOTOS.length) out.push(l[i]!);
  for (const m of latest) if (out.length < HERO_PHOTOS.length && !out.some(o => o.id === m.id)) out.push(m);
  return out;
}

/** A feed item said the home page's way: the short line, one line of context, no "30 min late"; a stock card's
 *  dates move into the context line. */
function homeItem(fi: FeedItem, m: Move | undefined): FeedItem {
  const c = homeCopy({ ...fi, detail: m?.detail ?? null }, fi.who.name);
  return { ...fi, sentence: c.line, context: c.context, note: fi.source === "sec" ? null : fi.note };
}

/** Results: the six best recent mainstream examples, three won and three lost when there are, biggest first. */
function resultPick(settled: Move[], now: number): Move[] {
  const pool = settled.filter(m => (m.settledAt ?? m.at) > now - MONTH && (m.result === "won" || m.result === "lost")).sort((a, b) => b.amount - a.amount);
  const won = pool.filter(m => m.result === "won"), lost = pool.filter(m => m.result === "lost");
  const w = Math.min(3, won.length), l = Math.min(3, lost.length);
  const out = [...won.slice(0, 6 - Math.min(l, 3) > w ? Math.min(won.length, 6 - l) : w), ...lost.slice(0, l)];
  return out.slice(0, 6).sort((a, b) => b.amount - a.amount);
}

/** The profile snippet: the trader behind the newest Polymarket move in the preview, from their moves we have
 *  (public), and their record for members only. */
interface Snippet { wallet: string; name: string; moves: number; total: number; biggest: number; record: string | null; top: boolean }
async function snippetFor(db: Db, items: FeedItem[], until: number, records: boolean): Promise<Snippet | null> {
  const lead = items.find(m => m.wallet);
  if (!lead?.wallet) return null;
  const theirs = await listMoves(db, { wallet: lead.wallet, until, limit: 200 });
  if (!theirs.length) return null;
  let rec: TraderRecord | null = null;
  if (records) rec = (await recordsFor(db, [lead.wallet])).get(lead.wallet) ?? null;
  return {
    wallet: lead.wallet, name: lead.walletLabel ?? lead.who.name, moves: theirs.length,
    total: theirs.reduce((s, m) => s + m.amount, 0), biggest: Math.max(...theirs.map(m => m.amount)),
    record: recordLine(rec), top: isTopTrader(rec),
  };
}

interface HomeData { hero: FeedItem[]; recent: FeedItem[]; results: FeedItem[]; status: FeedStatus | null; snippet: Snippet | null; ticker: TickerItem[]; trust: TrustFacts | null; story: StoryData | null }
const EMPTY: HomeData = { hero: [], recent: [], results: [], status: null, snippet: null, ticker: [], trust: null, story: null };

async function homeData(db: Db, plan: Plan, region: Region | null, until: number, now: number, records: boolean): Promise<HomeData> {
  let hero: FeedItem[] = [], recent: FeedItem[] = [], results: FeedItem[] = [], status: FeedStatus | null = null, snippet: Snippet | null = null;
  let ticker: TickerItem[] = [];
  let trust: TrustFacts | null = null;
  let story: StoryData | null = null;
  // Home only shows mainstream moves (lib/home/curate.ts); the feed keeps everything.
  const [bigAll, latestAll, settledAll, st] = await Promise.all([
    listMoves(db, { since: now - WEEK, until, byAmount: true, limit: 200 }).catch(() => []),
    listMoves(db, { until, limit: 200 }).catch(() => []),
    listMoves(db, { settled: true, limit: 200 }).catch(() => []),
    feedStatus(db, now).catch(() => null),
  ]);
  const [big, latest, settled] = [bigAll, latestAll, settledAll].map(l => l.filter(isMainstream));
  const byId = new Map([...big!, ...latest!].map(m => [m.id, m]));
  const [heroItems, recentItems] = await Promise.all([
    feedItems(db, heroPick(big!, latest!), plan, region, now).catch(() => []),
    feedItems(db, latest!.slice(0, 24), plan, region, now).catch(() => []),
  ]);
  hero = heroItems.map(fi => homeItem(fi, byId.get(fi.id)));
  recent = recentItems.map(fi => homeItem(fi, byId.get(fi.id)));
  ticker = recent.slice(0, 12).map(fi => tickerItem({ ...fi, company: fi.source === "sec" ? fi.sentence.replace(/^.* of /, "") : null }));
  snippet = await snippetFor(db, recent.slice(0, 12), until, records).catch(() => null);
  const picked = resultPick(settled!, now);
  results = (await feedItems(db, picked, plan, region, now, now).catch(() => [])).map(fi => homeItem(fi, picked.find(m => m.id === fi.id)));
  status = st;
  [trust, story] = await Promise.all([
    trustFacts(db).catch(() => null),
    storyFor(db, plan, region, until, now, process.env.APP_URL || "https://insidir.com").catch(() => null),
  ]);
  return { hero, recent, results, status, snippet, ticker, trust, story };
}

export default async function Home() {
  const now = Date.now();
  const [jar, viewer] = await Promise.all([cookies(), getViewer()]);
  const paid = isPaid(viewer.plan);
  const plan = movePlan(viewer.plan);
  const until = now - plan.delayMs;
  // Every visitor on the same plan and region sees the same home page data: computed once per 15 seconds.
  const { hero, recent, results, status, snippet, ticker, trust, story } = hasDatabase()
    ? await memo(`home:${viewer.plan}:${viewer.region ?? ""}`, 15_000, () => homeData(getDb(), viewer.plan, viewer.region, until, now, plan.records))
    : EMPTY;
  const preview = recent.slice(0, 3);
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined));
  const trial = unlockHref("insidir");
  const pro = unlockHref("pro");
  const follow = !isReady("follows") ? "soon" as const : paid ? "off" as const : "locked" as const;

  const record = trust?.settled ?? null;
  const cardIn = (i: number) => ({ ["--i" as string]: i });

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} offer={false} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp2">
        <Hero moves={hero} ticker={ticker} late={false} trialLine={paid ? null : TRIAL_LINE} cta="See the live feed" status={status} />
        {story ? <Story data={story} /> : null}

        <PhotoSection n={HOME_SECTIONS.seconds} id="ps-seconds" line="Big moves happen in seconds.">
          {recent[0] ? <div className="psec__card"><MoveCard m={recent[0]} follow={follow} trialHref={trial} compact /></div> : null}
        </PhotoSection>

        {preview.length ? (
          <PreviewSeen className="sec2 preview" labelledBy="preview-h">
            <div className="wrap">
              <div className="sec2__head">
                <h2 id="preview-h" className="sec2__h rv">Right now on the feed</h2>
                {status ? <p className={`status status--${status.state} rv`} style={cardIn(1)}><span className="status__dot" aria-hidden="true" />{status.text}</p> : null}
              </div>
              <div className="preview__grid">
                {preview.map((m, i) => <div key={m.id} className="rv rv--card" style={cardIn(i)}><MoveCard m={m} follow={follow} trialHref={trial} compact /></div>)}
                {snippet ? (
                  <aside className="psnip rv rv--card" style={cardIn(3)} aria-labelledby="psnip-h">
                    <p className="psnip__kicker">{snippet.top ? "Top trader" : "Trader"} profile</p>
                    <h3 id="psnip-h" className="psnip__name">{snippet.name}</h3>
                    <dl className="psnip__stats">
                      <div><dt>Big moves</dt><dd data-count={snippet.moves}>{snippet.moves}</dd></div>
                      <div><dt>Total in</dt><dd data-count={snippet.total} data-fmt="dollars">{dollars(snippet.total)}</dd></div>
                      <div><dt>Biggest</dt><dd data-count={snippet.biggest} data-fmt="dollars">{dollars(snippet.biggest)}</dd></div>
                    </dl>
                    <p className="psnip__line">{snippet.record ?? (paid ? "Not enough settled markets for a record yet." : "Their win record is for members.")}</p>
                    <Link className="psnip__link" href={`/p/${snippet.wallet}`}>See their profile</Link>
                  </aside>
                ) : null}
              </div>
              <div className="sec2__foot"><Link className="btn btn--secondary" href="/feed">See the live feed</Link></div>
            </div>
          </PreviewSeen>
        ) : null}

        <PhotoSection n={HOME_SECTIONS.wins} id="ps-wins" line="See who actually wins.">
          {record ? <p className="psec__stat"><span className="money-on-dark"><span data-count={record.won}>{record.won.toLocaleString("en-US")}</span> won</span> · <span className="loss-on-dark"><span data-count={record.lost}>{record.lost.toLocaleString("en-US")}</span> lost</span></p> : null}
        </PhotoSection>

        {results.length ? (
          <section className="sec2" aria-labelledby="res-h">
            <div className="wrap">
              <div className="sec2__head">
                <h2 id="res-h" className="sec2__h rv">Results</h2>
                <p className="sec2__sub rv" style={cardIn(1)}>Real past moves. Not a promise.</p>
                {record ? <p className="results__record rv" style={cardIn(2)}><span className="money">{record.won.toLocaleString("en-US")} won</span> · <span className="loss">{record.lost.toLocaleString("en-US")} lost</span></p> : null}
              </div>
              <ol className="rcards">
                {results.map((r, i) => (
                  <li key={r.id} className="rcard rv rv--card" style={cardIn(i)}>
                    <p className="rcard__top"><span className={`rcard__res rcard__res--${r.result}`}>{r.result === "won" ? "Won" : "Lost"}</span><span className="rcard__when">{r.ago}</span></p>
                    <p className="rcard__amt" data-count={r.amount} data-fmt="dollars">{dollars(r.amount)}</p>
                    <p className="rcard__line">{r.sentence}</p>
                    {r.context ? <p className="rcard__ctx">{r.context}</p> : null}
                    {r.sourceLink ? <SourceA link={r.sourceLink} /> : null}
                  </li>
                ))}
              </ol>
              <div className="sec2__foot"><Link className="btn btn--secondary" href="/results">See every result</Link></div>
            </div>
          </section>
        ) : null}

        <PhotoSection n={HOME_SECTIONS.alert} id="ps-alert" line="Get the alert before everyone else.">
          {story ? (
            <div className="psec__note" aria-hidden="true">
              <span className="psec__note-icon"><svg viewBox={LOGO.markViewBox}><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
              <div><p className="psec__note-head"><b>{story.alert.title}</b><span>now</span></p><p className="psec__note-text">{story.alert.body}</p></div>
            </div>
          ) : null}
        </PhotoSection>

        <TrustBlock facts={trust} />
        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={trial} proHref={pro} actions={false} />
        <FaqV2 />

        <PhotoSection n={HOME_SECTIONS.yourMove} id="ps-move" line="Your move.">
          {!paid ? (
            <div className="psec__cta">
              <a className="btn btn--onDark btn--big" href={trial} data-unlock="home-end">Try it for $1</a>
              <p className="psec__fine">{TRIAL_LINE}</p>
            </div>
          ) : <Link className="btn btn--onDark btn--big" href="/feed">See the live feed</Link>}
        </PhotoSection>
      </main>
    </>
  );
}
