/* How it works (/how-it-works): the scroll story with one real top trader (components/home/Story.tsx, the same as on
 * home), then the four steps in words, what you can do with it, where the numbers come from, and one action. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageBand } from "@/components/PageBand";
import { SiteHeader } from "@/components/SiteHeader";
import { TrustBlock } from "@/components/TrustBlock";
import { unlockHref } from "@/components/app/links";
import { Story } from "@/components/home/Story";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { storyFor } from "@/lib/home/story";
import { memo } from "@/lib/memo";
import { movePlan } from "@/lib/moves/gate";
import { BAND } from "@/lib/photos";
import { CANCEL_LINE, GET_CTA } from "@/lib/copy";
import { isReady } from "@/lib/features";
import { trustFacts } from "@/lib/trust";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "How it works", description: "A big position or insider trade happens, Insidir catches it in seconds and shows you who it is and whether they usually win." };

const STEPS: Array<[string, string]> = [
  ["A large position is opened", "An account opens a position of $10,000 or more on a game, an election or the Fed, or a CEO files a trade in their own stock."],
  ["Insidir catches it in seconds", "We read Polymarket, Kalshi and SEC filings all day and write every large position in one plain sentence."],
  ["See who it is", "Tap the name: every position they've made, how many they won and lost, and their all-time net P&L."],
  ...(isReady("alerts_push") ? [["Get pinged next time", "Follow accounts with a strong record. When one opens a large position, a push notification follows."] as [string, string]] : []),
];
const DO: Array<[string, string, string]> = [
  ["/feed", "Activity", "Every large position as it is opened: Sports, Markets and Stocks."],
  ["/top", "Top traders", "The wallets with the best record, this week, this month and all time."],
  ["/results", "Track record", "Every position we have shown, marked won or lost. Losses included."],
  ["/pricing", "Pricing", "Try 7 days for $1, then $39/month, everything live. Cancel anytime."],
];

export default async function HowPage() {
  const viewer = await getViewer();
  const now = Date.now();
  const until = now - movePlan(viewer.plan).delayMs;
  const [story, trust] = hasDatabase() ? await Promise.all([
    memo(`story:${viewer.plan}:${viewer.region ?? ""}`, 30_000, () => storyFor(getDb(), viewer.plan, viewer.region, until, now, process.env.APP_URL || "https://insidir.com")).catch(() => null),
    memo("trust", 60_000, () => trustFacts(getDb())).catch(() => null),
  ]) : [null, null];
  const trial = unlockHref();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/how-it-works" trialHref={trial} />
      <main className="dark mkt how">
        <PageBand n={BAND.how} title="How it works" kicker="Insidir in 10 seconds">
          <p className="pband__sub">See the largest positions and stock trades the moment they happen: who made them, how much, and whether they usually win.</p>
        </PageBand>
        {story ? <Story data={story} /> : null}
        <section className="sec2" aria-labelledby="steps-h">
          <div className="wrap">
            <h2 id="steps-h" className="sec2__h">Four steps</h2>
            <ol className="prod__grid">{STEPS.map(([h, p], i) => (
              <li key={h} className="prod__tile rv" style={{ ["--i" as string]: i }}><span className="prod__n">{i + 1}</span><p className="prod__h">{h}</p><p className="prod__p">{p}</p></li>
            ))}</ol>
          </div>
        </section>
        <section className="sec2" aria-labelledby="do-h">
          <div className="wrap">
            <h2 id="do-h" className="sec2__h">Where to go next</h2>
            <div className="prod__grid">{DO.map(([href, h, p]) => (
              <Link key={href} href={href} className="prod__tile prod__tile--link"><p className="prod__h">{h} <span aria-hidden="true">→</span></p><p className="prod__p">{p}</p></Link>
            ))}</div>
          </div>
        </section>
        <TrustBlock facts={trust} />
        <section className="sec2">
          <div className="wrap mkt__endIn">
            <h2 className="sec2__h">Follow the big money.</h2>
            <div className="mkt__ctas"><Link className="btn btn--primary" href={trial} data-checkout="how-end">{GET_CTA}</Link></div>
            <p className="mkt__fine">{CANCEL_LINE}</p>
          </div>
        </section>
      </main>
    </>
  );
}
