/* The home page: one tool. "Paste any bet. See where the smart money is." and the box (components/read/ReadBox.tsx):
 * a Polymarket or Kalshi link, a market in plain words, or a sportsbook slip, read in seconds (lib/read).
 *   Visitors  the box (one free Read), what a Read shows, the $1 block and the FAQ.
 *   Members   the box and their recent Reads.
 * Everything else Insidir has stays live by URL; it just isn't on this page or in the nav. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { Sec } from "@/components/page/Page";
import { unlockHref } from "@/components/app/links";
import { ReadBox } from "@/components/read/ReadBox";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { HEADLINE, INCLUDED, PAST } from "@/lib/copy";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { cleanRef, REF_COOKIE } from "@/lib/home/ref";
import { agoText } from "@/lib/moves/copy";
import { isPaid, PLANS, TRIAL } from "@/lib/plans";
import { pct } from "@/lib/read/math";
import { readsOf, type StoredRead } from "@/lib/read/store";

export const dynamic = "force-dynamic";

/** What a Read shows, in the order the card shows it. Words only: no numbers on this page are made up. */
const PARTS = [
  ["Proven money", "How the dollars of proven wallets split between the two sides, and how many wallets. Proven means 30+ settled positions and a positive followable return."],
  ["Big bets, last 24 hours", "Every large position: its size, side, price and time. Unusual ones are flagged: a fresh wallet, a size big for that market, or the long-shot side."],
  ["Price now", "Each side on Kalshi and Polymarket, the better price marked. In the US, Kalshi only."],
  ["One analyst line", "What the data shows, in one sentence, checked against the numbers. Never a tip."],
] as const;

function Recent({ list, now }: { list: StoredRead[]; now: number }) {
  if (!list.length) return <p className="rpage__none">Your Reads show up here.</p>;
  return (
    <ul className="rrecent" data-testid="recent-reads">
      {list.map(r => (
        <li key={r.id}>
          <Link href={`/read/${r.id}`} className="rrecent__a">
            <span className="rrecent__q">{r.data.question}</span>
            <span className="rrecent__s">{r.data.proven.yesShare !== null ? `Proven money ${pct(r.data.proven.yesShare)} ${r.data.yesLabel}` : "No proven money"} · {agoText(r.createdAt, now)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DollarBlock({ trial }: { trial: string }) {
  return (
    <section className="sec3 hprice" aria-labelledby="price-h">
      <div className="pg">
        <h2 id="price-h" className="sec3__h">$1 for your first week</h2>
        <div className="hprice__card" data-testid="home-plan">
          <p className="hprice__name">Insidir</p>
          <p className="hprice__price"><b className="num">${PLANS.insidir.price}</b><span>/mo</span></p>
          <p className="hprice__trial">${TRIAL.fee} for your first week</p>
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
    const recent = hasDatabase() && viewer.user ? await readsOf(getDb(), viewer.user.id, 10).catch(() => []) : [];
    return (
      <>
        <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={unlockHref()} />
        <main className="pg rhome rhome--member" data-testid="member-home">
          <h1 className="rhome__h rhome__h--small">{HEADLINE}</h1>
          <ReadBox autoFocus />
          <section className="rpage__next" aria-labelledby="recent-h">
            <h2 id="recent-h" className="rpage__h">Your recent Reads</h2>
            <Recent list={recent} now={now} />
          </section>
        </main>
      </>
    );
  }
  const trial = unlockHref();
  const ref = cleanRef(typeof sp.ref === "string" ? sp.ref : null) ?? cleanRef(jar.get(REF_COOKIE)?.value);
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null, props: ref ? { ref } : undefined }).catch(() => undefined));
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/" trialHref={trial} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2() }} />
      <main className="lp3">
        <section className="hero3 rhome" aria-labelledby="hero-h" data-hero="">
          <div className="pg hero3__in">
            <h1 id="hero-h" className="rhome__h">{HEADLINE}</h1>
            <p className="rhome__sub">Paste a Polymarket or Kalshi link, or type the market. In a few seconds: where proven money sits, the big bets, and the best price.</p>
            <ReadBox />
            <p className="rhome__fine">Your first Read is free. No account needed.</p>
          </div>
        </section>
        <Sec id="parts-h" title="What a Read shows" className="steps">
          <ol className="steps__list">
            {PARTS.map(([h, p], i) => <li key={h} className="steps__item"><span className="steps__n num">{i + 1}</span><h3 className="steps__h">{h}</h3><p className="steps__p">{p}</p></li>)}
          </ol>
        </Sec>
        <DollarBlock trial={trial} />
        <FaqV2 />
      </main>
    </>
  );
}
