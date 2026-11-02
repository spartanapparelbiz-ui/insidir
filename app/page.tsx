/* The home page: one tool. "Paste any bet. See where the smart money is." and the box (components/read/ReadBox.tsx):
 * a Polymarket or Kalshi link, a market in plain words, or a sportsbook slip, read in seconds (lib/read).
 *   Visitors  the box (one free Read), what a Read shows, the $1 block and the FAQ.
 *   Members   the box, tonight's markets in the leagues they bet on, Your markets (every market they've read, with its
 *             latest Read, marked when proven money moved since their last visit) and the week: "proven money was
 *             right on X of Y" over their markets that settled (lib/read/member.ts).
 * Everything else Insidir has stays live by URL; it just isn't on this page or in the nav. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { Sec } from "@/components/page/Page";
import { unlockHref } from "@/components/app/links";
import { ReadBox } from "@/components/read/ReadBox";
import { TonightReads } from "@/components/read/TonightReads";
import { isLive } from "@/lib/sports/team-names";
import { tonightReadsCached, type TonightRead } from "@/lib/read/tonight";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { HEADLINE, INCLUDED, PAST, TRIAL_LINE } from "@/lib/copy";
import { AB_COOKIE, readUtm, recordEvent, UTM_COOKIE } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { cleanRef, REF_COOKIE } from "@/lib/home/ref";
import { agoText } from "@/lib/moves/copy";
import { isPaid, PLANS, TRIAL } from "@/lib/plans";
import { pct, usd } from "@/lib/read/math";
import { tonightFor, weeklyRecap, yourMarkets, type TonightRow, type WeekRecap, type YourMarket } from "@/lib/read/member";
import { ReadPick } from "@/components/read/ReadPick";
import { Landing } from "@/components/brand/landing/Landing";
import { emptyLanding, landingData } from "@/lib/brand/landing";

export const dynamic = "force-dynamic";

/** What a Read shows, in the order the card shows it. Words only: no numbers on this page are made up. */
const PARTS = [
  ["Proven money", "Which side winning trackers and proven wallets are on, each with its record. Winning: 30+ settled and a positive all-time return. Proven wallets: 30+ closed Polymarket markets and positive all-time profit."],
  ["Big bets, last 24 hours", "Every large position: its size, side, price and time. Unusual ones are flagged: a fresh wallet, a size big for that market, or the long-shot side."],
  ["Price now", "Each side on Kalshi and Polymarket, the better price marked. In the US, Kalshi only."],
  ["One analyst line", "What the data shows, in one sentence, checked against the numbers. Never a tip."],
] as const;

const AT_ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function Tonight({ rows, asked, now }: { rows: TonightRow[]; asked: boolean; now: number }) {
  if (!asked) return <p className="rpage__none">Tell us what you bet on and tonight&apos;s markets show up here. <Link href="/onboarding?again=1">Pick your leagues</Link></p>;
  if (!rows.length) return <p className="rpage__none" data-testid="tonight-none">Nothing with big money on it tonight in your leagues yet. <Link href="/onboarding?again=1">Change your leagues</Link></p>;
  return (
    <ul className="rrecent" data-testid="tonight">
      {rows.map(r => (
        <li key={`${r.venue}:${r.marketId}`}>
          <ReadPick venue={r.venue} id={r.marketId} className="rrecent__a rrecent__btn">
            <span className="rrecent__q">{r.title}</span>
            <span className="rrecent__s">{r.label}{isLive(r.startAt, now) ? " · Live" : r.startAt ? ` · ${AT_ET.format(new Date(r.startAt))} ET` : ""} · {usd(r.total)} in big bets · Read it</span>
          </ReadPick>
        </li>
      ))}
    </ul>
  );
}

function YourMarkets({ list, now }: { list: YourMarket[]; now: number }) {
  if (!list.length) return <p className="rpage__none">Every market you read stays here with its latest Read.</p>;
  return (
    <ul className="rrecent" data-testid="your-markets">
      {list.map(({ key, latest: r, moved }) => {
        const d = r.data, s = d.proven.yesShare;
        return (
          <li key={key} className={moved ? "is-moved" : undefined}>
            <Link href={`/read/${r.id}`} className="rrecent__a">
              <span className="rrecent__q">{d.question}</span>
              <span className="rrecent__s">{s !== null ? `Proven money ${pct(s)} ${d.yesLabel}, ${pct(1 - s)} ${d.noLabel}` : "No proven money yet"} · read {agoText(r.createdAt, now)}</span>
              {moved ? <span className="rrecent__moved" data-testid="moved">Proven money moved since your last visit{moved.from !== null && moved.to !== null ? `: ${pct(moved.from)} → ${pct(moved.to)} ${d.yesLabel}` : ""}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Week({ w }: { w: WeekRecap }) {
  return (
    <section className="recap" aria-labelledby="week-h" data-testid="week-recap">
      <h2 id="week-h" className="recap__h">{w.of ? `Your markets this week: proven money was right on ${w.right} of ${w.of}` : "Your markets this week"}</h2>
      {w.of ? (
        <ul className="recap__list">{w.lines.map(l => <li key={l.key}><b className={l.right ? "pos" : "neg"}>{l.right ? "Right" : "Wrong"}</b> {l.question}: proven money on {l.provenSide}, {l.won} won.</li>)}</ul>
      ) : <p className="recap__sub">None of your markets settled this week. When they do, this shows whether proven money&apos;s side won, losses included.</p>}
      <p className="recap__share">Proven money&apos;s side as your last Read before the result showed it. {PAST}</p>
    </section>
  );
}

function DollarBlock({ trial }: { trial: string }) {
  return (
    <section className="sec3 hprice" aria-labelledby="price-h">
      <div className="pg">
        <h2 id="price-h" className="sec3__h">{TRIAL_LINE}</h2>
        <div className="hprice__card" data-testid="home-plan">
          <p className="hprice__name">Insidir</p>
          <p className="hprice__price"><b className="num">${PLANS.insidir.price}</b><span>/mo</span></p>
          <p className="hprice__trial">{TRIAL_LINE}</p>
          <ul className="hprice__list">{INCLUDED.map(x => <li key={x}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{x}</li>)}</ul>
          <a className="btn btn--primary hprice__cta" href={trial} data-checkout="home-pricing">Start for ${TRIAL.fee}</a>
          <p className="hprice__fine">Pay first with Apple Pay, Google Pay or card, then sign in. Then ${PLANS.insidir.price}/month. Cancel anytime. Secure payments by Whop. {PAST}</p>
        </div>
      </div>
    </section>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const [jar, viewer, sp] = await Promise.all([cookies(), getViewer(), searchParams]);
  const member = isPaid(viewer.plan);
  if (member) {
    const db = hasDatabase() ? getDb() : null, uid = viewer.user?.id ?? null, betOn = viewer.user?.settings.betOn ?? [];
    const [taps, tonight, mine, week] = db && uid ? await Promise.all([
      tonightReadsCached(db, now).catch((): TonightRead[] => []),
      tonightFor(db, betOn, now).catch((): TonightRow[] => []),
      yourMarkets(db, uid, now).catch((): YourMarket[] => []),
      weeklyRecap(db, uid, now).catch((): WeekRecap => ({ right: 0, of: 0, lines: [] })),
    ]) : [[], [], [], { right: 0, of: 0, lines: [] } as WeekRecap];
    return (
      <>
        <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={unlockHref()} />
        <main className="pg rhome rhome--member" data-testid="member-home">
          <h1 className="rhome__h rhome__h--small">{HEADLINE}</h1>
          <ReadBox autoFocus />
          <TonightReads rows={taps} now={now} />
          <section className="rpage__next" aria-labelledby="tonight-h">
            <h2 id="tonight-h" className="rpage__h">Tonight in your leagues</h2>
            <Tonight rows={tonight} asked={betOn.length > 0} now={now} />
          </section>
          <section className="rpage__next" aria-labelledby="mine-h">
            <h2 id="mine-h" className="rpage__h">Your markets</h2>
            <YourMarkets list={mine} now={now} />
          </section>
          <div className="rpage__next"><Week w={week} /></div>
        </main>
      </>
    );
  }
  const ref = cleanRef(typeof sp.ref === "string" ? sp.ref : null) ?? cleanRef(jar.get(REF_COOKIE)?.value);
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  // The post they came from (per-post funnel on /admin): this link's UTM tags, else the first-touch ones kept in the cookie.
  const fromLink = Object.fromEntries((["utm_source", "utm_campaign", "utm_content"] as const).flatMap(k => typeof sp[k] === "string" && sp[k] ? [[k, (sp[k] as string).slice(0, 100)]] : []));
  const utm = Object.keys(fromLink).length ? fromLink : readUtm(jar.get(UTM_COOKIE)?.value) ?? {};
  const tags = Object.fromEntries((["utm_source", "utm_campaign", "utm_content"] as const).flatMap(k => utm[k] ? [[k, utm[k]!]] : []));
  const props = { ...(ref ? { ref } : {}), ...tags };
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null, props: Object.keys(props).length ? props : undefined }).catch(() => undefined));
  const d = hasDatabase() ? await landingData(getDb(), now, false) : emptyLanding(now);
  return <Landing d={d} />;
}
