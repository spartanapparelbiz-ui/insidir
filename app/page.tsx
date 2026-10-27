/* The landing page (docs/INSIDIR-V2.md §6). Bright, phone first. Top to bottom: the trial bar and nav (SiteHeader); the hero
 * ("Follow the big money.", copy left, the real biggest move of the last 24 hours on the right with two more stacked
 * behind it); the tab strip; how it works (three steps, each with a small piece of real UI); Results (the last 10
 * settled moves from top traders, "Real past moves. Not a promise."); pricing; FAQ; the one dark band; the footer.
 * Every move and number is a row from terminal.moves on the viewer's clock (free: 30 minutes late). A section with
 * nothing real to show is hidden. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { ComingSoon } from "@/components/v2/ComingSoon";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { MoveCard } from "@/components/v2/MoveCard";
import { PricingCards } from "@/components/v2/Pricing";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { TRIAL_LINE, TRY_CTA } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { agoText, dollars } from "@/lib/moves/copy";
import { feedItems, feedStatus, type FeedItem, type FeedStatus } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { isTopTrader, walletLabel } from "@/lib/moves/records";
import { listMoves, recordsFor } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const now = Date.now();
  const [jar, viewer] = await Promise.all([cookies(), getViewer()]);
  const paid = isPaid(viewer.plan);
  const until = now - movePlan(viewer.plan).delayMs;
  let hero: FeedItem[] = [], recent: FeedItem[] = [], results: Move[] = [], status: FeedStatus | null = null, heroIsLatest = false;
  let resultRecs = new Map<string, Parameters<typeof isTopTrader>[0] & object>();
  if (hasDatabase()) {
    const db = getDb();
    const [big, latest, settled, st] = await Promise.all([
      listMoves(db, { since: now - 86_400_000, until, byAmount: true, limit: 3 }).catch(() => []),
      listMoves(db, { until, limit: 3 }).catch(() => []),
      listMoves(db, { settled: true, limit: 120 }).catch(() => []),
      feedStatus(db, now).catch(() => null),
    ]);
    // The hero: the biggest move of the last 24 hours (and the next two); if the last day had none, the latest ones.
    heroIsLatest = !big.length;
    hero = await feedItems(db, big.length ? big : latest, viewer.plan, viewer.region, now).catch(() => []);
    recent = await feedItems(db, latest, viewer.plan, viewer.region, now).catch(() => []);
    resultRecs = await recordsFor(db, settled.map(m => m.wallet ?? "")).catch(() => new Map());
    results = settled.filter(m => m.wallet && isTopTrader(resultRecs.get(m.wallet))).slice(0, 10);
    status = st;
  }
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined));
  const trial = unlockHref("insidir");
  const pro = unlockHref("pro");
  const follow = !isReady("follows") ? "soon" as const : paid ? "off" as const : "locked" as const;

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp2">
        <section className="hero2" aria-labelledby="hero-h">
          <div className="wrap hero2__in">
            <div className="hero2__copy">
              <h1 id="hero-h" className="hero2__h">Follow the big money.</h1>
              <p className="hero2__sub">Insidir shows you the biggest bets on sports and prediction markets the second they happen. In plain English. With alerts.</p>
              <div className="hero2__ctas">
                <Link className="btn btn--primary" href="/feed" data-cta="hero">See the live feed</Link>
                {!paid ? <a className="btn btn--secondary" href={trial} data-unlock="hero">{TRY_CTA}</a> : null}
              </div>
              {!paid ? <p className="hero2__fine">{TRIAL_LINE}</p> : null}
            </div>
            <div className="hero2__visual">
              {hero.length ? (
                <div className="stack" data-count={hero.length}>
                  {hero.map((m, i) => (
                    <div key={m.id} className={`stack__card stack__card--${i}`} aria-hidden={i > 0 ? true : undefined} inert={i > 0 ? true : undefined}>
                      {i === 0 ? <p className="stack__label">{heroIsLatest ? "Latest big move" : "Biggest move in the last 24 hours"}{!paid ? " (30 min late)" : ""}</p> : null}
                      <MoveCard m={m} follow={follow} trialHref={trial} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="stack stack--empty">
                  <p className={`status status--${status?.state ?? "behind"}`}><span className="status__dot" aria-hidden="true" />{status?.text ?? "Catching up. Showing the latest moves we have."}</p>
                  <p className="stack__wait">The next big bet shows up here the second it happens.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <nav className="wrap tabstrip" aria-label="What we watch">
          <Link className="tabstrip__tab" href="/feed?tab=sports">Sports</Link>
          <Link className="tabstrip__tab" href="/feed?tab=markets">Markets</Link>
          {isReady("stocks") ? <Link className="tabstrip__tab" href="/feed?tab=stocks">Stocks</Link>
            : <ComingSoon feature="stocks" className="tabstrip__tab tabstrip__tab--soon">Stocks</ComingSoon>}
          <ComingSoon feature="crypto" className="tabstrip__tab tabstrip__tab--soon">Crypto</ComingSoon>
        </nav>

        <section className="sec2" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <h2 id="how-h" className="sec2__h">How it works</h2>
            <ol className="how2">
              <li className="how2__step how2__step--violet">
                <p className="how2__n">1</p>
                <h3 className="how2__h">We watch every big bet</h3>
                <p className="how2__p">Every few seconds we check Polymarket and Kalshi for bets of $10,000 or more.</p>
                <div className="how2__mock" aria-hidden="true">
                  <p className={`status status--${status?.state ?? "behind"}`}><span className="status__dot" />{status?.state === "live" ? "Live" : "Catching up"}</p>
                  {recent.length ? recent.map(m => <p key={m.id} className="how2__amt"><span>{dollars(m.amount)}</span><span className="how2__ago">{agoText(m.at, now)}</span></p>)
                    : [0, 1, 2].map(i => <p key={i} className="how2__skel" />)}
                </div>
              </li>
              <li className="how2__step how2__step--green">
                <p className="how2__n">2</p>
                <h3 className="how2__h">You see it in plain English</h3>
                <p className="how2__p">No charts to read. One sentence: who put how much on what, and what it pays.</p>
                <div className="how2__mock" aria-hidden="true">
                  {recent[0] ? <><p className="how2__sentence">{recent[0].sentence}</p>{recent[0].payout ? <p className="how2__payout">{recent[0].payout}</p> : null}</>
                    : <><p className="how2__skel how2__skel--wide" /><p className="how2__skel" /></>}
                </div>
              </li>
              <li className="how2__step how2__step--peach">
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
          <section className="sec2 sec2--alt" aria-labelledby="res-h">
            <div className="wrap">
              <h2 id="res-h" className="sec2__h">Results</h2>
              <p className="results__label">Real past moves. Not a promise.</p>
              <ol className="rlist">
                {results.map(r => (
                  <li key={r.id} className="rlist__row">
                    <span className={`rlist__res rlist__res--${r.result}`}>{r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "Refunded"}</span>
                    <span className="rlist__what"><span className="rlist__amt">{dollars(r.amount)}</span> on {r.outcome} · {r.marketTitle}
                      <span className="rlist__who">Top trader {walletLabel(r.wallet!, r.walletName)}</span></span>
                    <time className="rlist__when" dateTime={new Date(r.settledAt ?? r.at).toISOString()}>{agoText(r.settledAt ?? r.at, now)}</time>
                  </li>
                ))}
              </ol>
              <Link className="btn btn--secondary" href="/results">See every result</Link>
            </div>
          </section>
        ) : null}

        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={trial} proHref={pro} />
        <FaqV2 />

        <section className="band2" aria-labelledby="band-h">
          <div className="wrap band2__in">
            <h2 id="band-h" className="band2__h">The next big bet is happening right now.</h2>
            {!paid ? <a className="btn btn--primary btn--onDark" href={trial} data-unlock="band">{TRY_CTA}</a> : <Link className="btn btn--primary btn--onDark" href="/feed">See the live feed</Link>}
          </div>
        </section>
      </main>
    </>
  );
}
