/* The home page, for visitors (members open on My copies). One product: copy the winners on Polymarket and Kalshi.
 * Every figure is real and rendered final on the server (nothing counts up or animates in):
 *   1. Hero: "Insidir finds the wallets that actually win on Polymarket and Kalshi. Pick one, and every bet they make
 *      shows up for you." and Start for $1.
 *   2. Three steps: Pick a winner. Copy their bets. Watch your number.
 *   3. The live top wallet: the #1 copyable wallet (30+ settled, by followable return), its real record and latest
 *      bets.  4. New moves from the winners (the first row's analyst note under it).  5. The $1 block.  6. FAQ.
 * One call to action everywhere: Start for $1. The hero renders first; the data sections stream in (Suspense), each
 * cached for 20 seconds. */
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Sec } from "@/components/page/Page";
import { unlockHref } from "@/components/app/links";
import { AsOf, SOURCES } from "@/components/data/AsOf";
import { MyCopies } from "@/components/copies/MyCopies";
import { HeroCta } from "@/components/home/HeroCta";
import { OpenNow } from "@/components/follow/OpenNow";
import { tone } from "@/components/stats/Stats";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { LOGO } from "@/components/Wordmark";
import { INCLUDED, PAST } from "@/lib/copy";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase, type Db } from "@/lib/db";
import { hundredLine, roiText } from "@/lib/follow/math";
import { openFromWinners } from "@/lib/follow/open";
import { cleanRef, REF_COOKIE } from "@/lib/home/ref";
import { copyable, recentMovesOf, type Copyable } from "@/lib/copies/store";
import { headlineOf, short } from "@/lib/moves/headline";
import { agoText } from "@/lib/moves/copy";
import { movePlan } from "@/lib/moves/gate";
import { isPaid, PLANS, TRIAL } from "@/lib/plans";
import { memo } from "@/lib/memo";
import type { Plan, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Every section's data is read once per plan and region, then served to everyone for 20 seconds. */
const TTL = 20_000;
type Ctx = { db: Db; plan: Plan; region: Region | null; now: number; live: boolean; trial: string };
const key = (c: Ctx, k: string) => `home:${k}:${c.plan}:${c.region ?? ""}`;

const STEPS = [
  ["Pick a winner.", "Insidir ranks every wallet and tracker on Polymarket and Kalshi by the return you could actually have followed: the price we showed plus one point, losses included. 30 settled positions before anyone qualifies.", "/methodology#followable"],
  ["Copy their bets.", "Every new bet they make shows up for you with the price they got, the price you can still get and a one-line note. In the US it opens the same market on Kalshi.", "/open"],
  ["Watch your number.", "Pick $10, $50 or $100 a move. Your home page shows what copying has made at that size since you started, down when it's down.", "/methodology#followable"],
] as const;

/* ---------- sections ---------- */
/** What a streaming section shows until its data arrives: its title and a block of its usual height. */
const Wait = ({ id, title, h }: { id: string; title: string; h: number }) => <Sec id={id} title={title}><div className="sec3__wait" style={{ minHeight: h }} aria-busy="true" /></Sec>;

async function TopWallet({ c }: { c: Ctx }) {
  const list = await memo("home:copyable", TTL, () => copyable(c.db, c.now)).catch((): Copyable[] => []);
  const top = list.find(x => x.kind === "trader") ?? list[0];
  const until = c.now - movePlan(c.plan).delayMs;
  const recent = top ? await memo(key(c, `top:${top.target}`), TTL, () => recentMovesOf(c.db, top, until, 3)).catch(() => []) : [];
  return (
    <Sec id="top-h" title="The top wallet right now" sub={<>Ranked by the return you could have followed on 30 or more settled positions. {PAST}</>}>
      {top ? (
        <article className="mcard topw" data-testid="top-wallet">
          <p className="mcard__top">{top.kind === "trader" ? "Polymarket wallet" : "Tracker"} · #1 of {list.length.toLocaleString("en-US")} copyable</p>
          <h3 className="mcard__h">{top.label}</h3>
          <p className="mcard__amt"><span className={tone(top.record.net)}>{roiText(top.record.net, top.record.staked)}</span> <span className="mcard__sub">followable return</span></p>
          <p className="mcard__sub">{hundredLine(top.record)}</p>
          <dl className="mcard__facts">
            <div><dt>Settled</dt><dd className="num">{top.record.n.toLocaleString("en-US")}</dd></div>
            <div><dt>Won</dt><dd className="num">{top.record.won.toLocaleString("en-US")}</dd></div>
            <div><dt>Lost</dt><dd className="num">{top.record.lost.toLocaleString("en-US")}</dd></div>
          </dl>
          {recent.length ? (
            <ul className="topw__moves" data-testid="top-wallet-moves">
              {recent.map(m => (
                <li key={m.id}><span className="topw__h">{headlineOf(m)}<span>{agoText(m.at, c.now)}</span></span><b className="num">{short(m.amount)} at {Math.round(m.avgPrice * 100)}¢</b></li>
              ))}
            </ul>
          ) : null}
          <p className="mcard__rec">Shown by its address only. We never say who is behind a wallet.</p>
        </article>
      ) : <p className="tlist__empty">No wallet has 30 settled positions yet. When one does, it shows up here with its record.</p>}
      <AsOf at={until} live={c.live} sources={[SOURCES.polymarket, SOURCES.kalshi, SOURCES.methodology]} />
      <div className="sec3__foot"><Link className="tlink tlink--go" href="/top">Every winner <span className="arrow" aria-hidden="true">→</span></Link></div>
    </Sec>
  );
}

async function NewMoves({ c }: { c: Ctx }) {
  const open = await memo(key(c, "open"), TTL, () => openFromWinners(c.db, c.plan, c.now)).catch(() => ({ rows: [], total: 0 }));
  return (
    <Sec id="open-h" title="New moves from the winners" sub={<>Bets still open from wallets and trackers with a positive followable return on 30 or more settled. {PAST}</>}>
      <OpenNow rows={open.rows} total={open.total} member={false} now={c.now} trialHref={c.trial} />
      <AsOf at={c.now - movePlan(c.plan).delayMs} live={c.live} sources={[SOURCES.polymarket, SOURCES.kalshi, SOURCES.methodology]} />
    </Sec>
  );
}

/** One plan, one card: the price, the $1 week, what's included and the button. */
function PricingCard({ trial }: { trial: string }) {
  return (
    <section className="sec3 hprice" aria-labelledby="price-h">
      <div className="pg">
        <h2 id="price-h" className="sec3__h">$1 for your first week</h2>
        <div className="hprice__card" data-testid="home-plan">
          <p className="hprice__name">Insidir</p>
          <p className="hprice__price"><b className="num">${PLANS.insidir.price}</b><span>/mo</span></p>
          <p className="hprice__trial">${TRIAL.fee} for your first week</p>
          <ul className="hprice__list">{INCLUDED.map(x => <li key={x}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{x}</li>)}</ul>
          <Link className="btn btn--primary hprice__cta" href={trial} data-checkout="home-pricing">Start for ${TRIAL.fee}</Link>
          <p className="hprice__fine">Then ${PLANS.insidir.price}/month. Cancel anytime. Insidir never places a bet for you. Secure sign-in and payments by Whop. <Link href="/pricing">Visitor vs. member</Link></p>
        </div>
      </div>
    </section>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const [jar, viewer, sp] = await Promise.all([cookies(), getViewer(), searchParams]);
  const paid = isPaid(viewer.plan);
  // Members open the app on My copies; a new member picks a winner to copy first, once.
  if (paid && viewer.user && !viewer.user.onboarded) redirect("/onboarding");
  if (paid) {
    return (
      <>
        <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/discover" trialHref={unlockHref()} />
        <MyCopies db={hasDatabase() ? getDb() : null} viewer={viewer} now={now} />
      </>
    );
  }
  const live = movePlan(viewer.plan).delayMs === 0;
  const trial = unlockHref();
  // Where they came from: this link's ?ref=, else the first-touch one (middleware.ts keeps it).
  const ref = cleanRef(typeof sp.ref === "string" ? sp.ref : null) ?? cleanRef(jar.get(REF_COOKIE)?.value);
  const c: Ctx | null = hasDatabase() ? { db: getDb(), plan: viewer.plan, region: viewer.region, now, live, trial } : null;
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null, props: ref ? { ref } : undefined }).catch(() => undefined));

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp3">
        <section className="hero3" aria-labelledby="hero-h" data-hero="">
          <div className="pg hero3__in">
            <span className="hero3__mark" aria-hidden="true"><svg viewBox={LOGO.markViewBox}><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
            <h1 id="hero-h" className="hero3__h hero3__h--long">Insidir finds the wallets that actually win on Polymarket and Kalshi. Pick one, and every bet they make shows up for you.</h1>
            <div className="hero3__acts"><HeroCta trialHref={trial} /></div>
          </div>
        </section>

        <Sec id="steps-h" title="How it works" className="steps">
          <ol className="steps__list">
            {STEPS.map(([h, p, href], i) => <li key={h} className="steps__item"><span className="steps__n num">{i + 1}</span><h3 className="steps__h"><Link href={href}>{h}</Link></h3><p className="steps__p">{p}</p></li>)}
          </ol>
        </Sec>

        {c ? <>
          <Suspense fallback={<Wait id="top-h" title="The top wallet right now" h={420} />}><TopWallet c={c} /></Suspense>
          <Suspense fallback={<Wait id="open-h" title="New moves from the winners" h={420} />}><NewMoves c={c} /></Suspense>
        </> : null}

        <PricingCard trial={trial} />
        <FaqV2 />
      </main>
    </>
  );
}
