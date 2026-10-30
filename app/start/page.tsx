/* Get Insidir (/start). Left: what you get (only what's live) and one real big move from the last 24 hours, its
 * trader's record locked. Right: signed out, one button, "Continue", to Whop's sign-in (it comes back here); signed in
 * without Insidir, the embedded Whop checkout opens in place (components/auth/StartCheckout.tsx), 7 days for $1, then
 * $39/month, carrying our account id so the billing webhook links the membership. Members go straight to the feed. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContinueButton } from "@/components/auth/ContinueButton";
import { StartCheckout } from "@/components/auth/StartCheckout";
import { SiteHeader } from "@/components/SiteHeader";
import { MoveCard } from "@/components/v2/MoveCard";
import { StartList } from "@/components/v2/Pricing";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { ELEMENTS_URL } from "@/lib/billing/whop";
import { getDb, hasDatabase } from "@/lib/db";
import { feedFor, type FeedItem } from "@/lib/moves/feed";
import { PLANS, TRIAL, isPaid } from "@/lib/plans";
import { CANCEL_LINE } from "@/lib/copy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get Insidir", description: `Try Insidir 7 days for $${TRIAL.fee}, then $${PLANS.insidir.price}/month. Cancel anytime.`, robots: { index: false } };

const DAY = 86_400_000;

export default async function StartPage() {
  const viewer = await getViewer();
  if (viewer.user && isPaid(viewer.plan)) redirect("/");
  const jar = await cookies();
  const now = Date.now();
  let move: FeedItem | null = null;
  if (hasDatabase()) {
    // The biggest real move of the last 24 hours that a visitor may see (30 minutes late, the record locked).
    move = (await feedFor(getDb(), "free", viewer.region, { byAmount: true, since: now - DAY, limit: 1 }, now).catch(() => []))[0] ?? null;
  }
  void recordEvent({ name: "start_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/start" offer={false} />
      <main className="dark start">
        <div className="wrap start__in">
          <section className="start__what" aria-labelledby="start-h">
            <p className="start__kicker">Insidir</p>
            <h1 id="start-h" className="start__h">Try Insidir 7 days for $1.</h1>
            <p className="start__price"><span className="plan2__amt">${TRIAL.fee}</span> <span className="plan2__unit">for {TRIAL.days} days</span></p>
            <p className="start__then">{CANCEL_LINE}</p>
            <StartList />
            <p className="start__fine">Already a member? <Link href="/login">Log in</Link>.</p>
          </section>
          <div className="start__checkout">
            {move ? (
              <div className="start__move" data-testid="start-move">
                <p className="start__movelabel">A real position from the last 24 hours</p>
                <MoveCard m={move} follow="locked" trialHref="/start" compact />
              </div>
            ) : null}
            {viewer.user
              ? <StartCheckout elementsUrl={ELEMENTS_URL} signedInAs={viewer.user.email ?? viewer.user.name ?? "your Whop account"} />
              : <div className="start__flow start__signin" data-testid="start-continue"><ContinueButton next="/start" /></div>}
          </div>
        </div>
      </main>
    </>
  );
}
