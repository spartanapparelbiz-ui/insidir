/* The home page: "serious type, wild world". Top to bottom: the trial bar and the black nav (SiteHeader); the cinematic
 * hero (components/home/Hero.tsx: six black-and-white photos, "Follow the big money.", one real big move per photo on
 * a solid card, the ticker strip of real moves); then clean white sections: a real feed preview (3 live cards and a
 * profile snippet), How it works, Results ("Real past moves. Not a promise."), where the data comes from (the trust
 * block), Pricing, FAQ, and "$1 for 3 days" once, at the end. One action everywhere above it: "See the live feed".
 * Every move and number is a row from terminal.moves on the viewer's clock (free: 30 minutes late). Nothing is made
 * up: with no moves, the card says it's catching up and the ticker and preview are hidden. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { Hero, PreviewSeen } from "@/components/home/Hero";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { PricingCards } from "@/components/v2/Pricing";
import { MoveCard, SourceA } from "@/components/v2/MoveCard";
import { TrustBlock } from "@/components/TrustBlock";
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

export const dynamic = "force-dynamic";

const WEEK = 7 * 86_400_000;

/** The hero's moves: the biggest recent ones from each live tab (Sports, Markets, Stocks), taken in turn so they mix.
 *  A tab with nothing in the last week gives its latest moves instead. Up to six, one per photo. */
async function heroMoves(db: Db, until: number, now: number): Promise<Move[]> {
  const tabs = liveTabs().filter(t => t !== "crypto");
  const per = await Promise.all(tabs.map(async tab => {
    const big = await listMoves(db, { tab, since: now - WEEK, until, byAmount: true, limit: 2 });
    return big.length ? big : listMoves(db, { tab, until, limit: 2 });
  }));
  const out: Move[] = [];
  for (let i = 0; i < 2; i++) for (const list of per) if (list[i] && out.length < 6) out.push(list[i]!);
  return out;
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

export default async function Home() {
  const now = Date.now();
  const [jar, viewer] = await Promise.all([cookies(), getViewer()]);
  const paid = isPaid(viewer.plan);
  const plan = movePlan(viewer.plan);
  const until = now - plan.delayMs;
  let hero: FeedItem[] = [], recent: FeedItem[] = [], results: Move[] = [], status: FeedStatus | null = null, snippet: Snippet | null = null;
  let ticker: TickerItem[] = [];
  let trust: TrustFacts | null = null;
  if (hasDatabase()) {
    const db = getDb();
    const [big, latest, settled, st] = await Promise.all([
      heroMoves(db, until, now).catch(() => []),
      listMoves(db, { until, limit: 24 }).catch(() => []),
      listMoves(db, { settled: true, limit: 120 }).catch(() => []),
      feedStatus(db, now).catch(() => null),
    ]);
    [hero, recent] = await Promise.all([
      feedItems(db, big, viewer.plan, viewer.region, now).catch(() => []),
      feedItems(db, latest, viewer.plan, viewer.region, now).catch(() => []),
    ]);
    ticker = recent.map(tickerItem);
    snippet = await snippetFor(db, recent.slice(0, 12), until, plan.records).catch(() => null);
    const resultRecs = await recordsFor(db, settled.map(m => m.wallet ?? "")).catch(() => new Map<string, TraderRecord>());
    results = settled.filter(m => m.wallet && isTopTrader(resultRecs.get(m.wallet))).slice(0, 10);
    status = st;
    trust = await trustFacts(db).catch(() => null);
  }
  const preview = recent.slice(0, 3);
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined));
  const trial = unlockHref("insidir");
  const pro = unlockHref("pro");
  const follow = !isReady("follows") ? "soon" as const : paid ? "off" as const : "locked" as const;

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} offer={false} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp2">
        <Hero moves={hero} ticker={ticker} late={!paid} trialLine={paid ? null : TRIAL_LINE} cta="See the live feed" status={status} />

        {preview.length ? (
          <PreviewSeen className="sec2 preview" labelledBy="preview-h">
            <div className="wrap">
              <div className="preview__head">
                <h2 id="preview-h" className="sec2__h">Right now on the feed</h2>
                {status ? <p className={`status status--${status.state}`}><span className="status__dot" aria-hidden="true" />{status.text}{!paid ? " · 30 min late on free" : ""}</p> : null}
              </div>
              <div className="preview__grid">
                {preview.map(m => <MoveCard key={m.id} m={m} follow={follow} trialHref={trial} compact />)}
                {snippet ? (
                  <aside className="psnip" aria-labelledby="psnip-h">
                    <p className="psnip__kicker">{snippet.top ? "Top trader" : "Trader"} profile</p>
                    <h3 id="psnip-h" className="psnip__name serif">{snippet.name}</h3>
                    <dl className="psnip__stats">
                      <div><dt>Big moves</dt><dd>{snippet.moves}</dd></div>
                      <div><dt>Total in</dt><dd>{dollars(snippet.total)}</dd></div>
                      <div><dt>Biggest</dt><dd>{dollars(snippet.biggest)}</dd></div>
                    </dl>
                    <p className="psnip__line">{snippet.record ?? (paid ? "Not enough settled markets for a record yet." : "Their win record is for members.")}</p>
                    <Link className="psnip__link" href={`/p/${snippet.wallet}`}>See their profile</Link>
                  </aside>
                ) : null}
              </div>
              <Link className="btn btn--primary preview__more" href="/feed">See the live feed</Link>
            </div>
          </PreviewSeen>
        ) : null}

        <section className="sec2 sec2--alt" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <h2 id="how-h" className="sec2__h">How it works</h2>
            <ol className="how2">
              <li className="how2__step">
                <p className="how2__n">1</p>
                <h3 className="how2__h">We watch every big bet and trade</h3>
                <p className="how2__p">Every few seconds we check Polymarket and Kalshi for bets of $10,000 or more, and the SEC for insider buys and big fund adds.</p>
                <div className="how2__mock" aria-hidden="true">
                  <p className={`status status--${status?.state ?? "behind"}`}><span className="status__dot" />{status?.state === "live" ? "Live" : "Catching up"}</p>
                  {recent.length ? recent.slice(0, 3).map(m => <p key={m.id} className="how2__amt"><span>{dollars(m.amount)}</span><span className="how2__ago">{agoText(m.at, now)}</span></p>)
                    : [0, 1, 2].map(i => <p key={i} className="how2__skel" />)}
                </div>
              </li>
              <li className="how2__step">
                <p className="how2__n">2</p>
                <h3 className="how2__h">You see it in plain English</h3>
                <p className="how2__p">No charts to read. One sentence: who put how much on what, and what it pays.</p>
                <div className="how2__mock" aria-hidden="true">
                  {recent[0] ? <><p className="how2__sentence">{recent[0].sentence}</p>{recent[0].payout ? <p className="how2__payout">{recent[0].payout}</p> : null}</>
                    : <><p className="how2__skel how2__skel--wide" /><p className="how2__skel" /></>}
                </div>
              </li>
              <li className="how2__step">
                <p className="how2__n">3</p>
                <h3 className="how2__h">You get pinged when your traders move</h3>
                <p className="how2__p">Follow a trader or a market. We send a push or an email the moment they make a big move.</p>
                <div className="how2__mock how2__mock--push" aria-hidden="true">
                  <p className="push__app">Insidir · now</p>
                  <p className="push__text">{recent[0] ? recent[0].sentence : "A trader you follow just made a big move."}</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {results.length ? (
          <section className="sec2" aria-labelledby="res-h">
            <div className="wrap">
              <h2 id="res-h" className="sec2__h">Results</h2>
              <p className="results__label">Real past moves. Not a promise.</p>
              <ol className="rlist">
                {results.map(r => (
                  <li key={r.id} className="rlist__row">
                    <span className={`rlist__res rlist__res--${r.result}`}>{r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "Refunded"}</span>
                    <span className="rlist__what"><span className="rlist__amt">{dollars(r.amount)}</span> on {r.outcome} · {r.marketTitle}
                      <span className="rlist__who">Top trader {walletLabel(r.wallet!, r.walletName)}</span></span>
                    <span className="rlist__when"><time dateTime={new Date(r.settledAt ?? r.at).toISOString()}>{agoText(r.settledAt ?? r.at, now)}</time>
                      {moveSource(r) ? <SourceA link={moveSource(r)!} className="source rlist__src" /> : null}</span>
                  </li>
                ))}
              </ol>
              <Link className="btn btn--secondary" href="/results">See every result</Link>
            </div>
          </section>
        ) : null}

        <TrustBlock facts={trust} />
        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={trial} proHref={pro} actions={false} />
        <FaqV2 />
        {!paid ? (
          <section className="band2" aria-labelledby="band-h">
            <div className="wrap band2__in">
              <h2 id="band-h" className="band2__h">Follow the big money for $1.</h2>
              <p className="band2__p">{TRIAL_LINE}</p>
              <a className="btn btn--onDark btn--big" href={trial} data-unlock="home-end">Try it for $1</a>
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
