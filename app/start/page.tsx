/* Get Insidir (/start) = sign up and pay on one screen. Left: what you get (only what's live, five lines at most, and
 * one quiet line for what's coming) and one real big move from the last 24 hours, its trader's record locked. Right:
 * "Continue with Google" or an email and password, then the secure checkout opens in place under them (components/auth/
 * StartCheckout.tsx): Apple Pay and Google Pay first where the device has them, then card. Someone who made their
 * account but didn't pay sees "Finish getting Insidir" with their email filled in. Members go straight to the feed. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StartCheckout } from "@/components/auth/StartCheckout";
import { SiteHeader } from "@/components/SiteHeader";
import { MoveCard } from "@/components/v2/MoveCard";
import { StartList } from "@/components/v2/Pricing";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { PENDING_COOKIE, readPending } from "@/lib/billing/pending";
import { CLAIM_COOKIE, claimSignup } from "@/lib/billing/claims";
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
  const pending = viewer.user ? null : readPending(jar.get(PENDING_COOKIE)?.value);
  const now = Date.now();
  let move: FeedItem | null = null;
  // Back from "Continue with Google" without a membership: their Google account is waiting in a checkout claim.
  let googleEmail: string | null = null;
  const claim = viewer.user ? undefined : jar.get(CLAIM_COOKIE)?.value;
  if (claim && hasDatabase()) {
    const c = await claimSignup(getDb(), claim).catch(() => null);
    if (c?.googleId && c.email) googleEmail = c.email;
  }
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
            <h1 id="start-h" className="start__h">{pending ? "Finish getting Insidir." : "Try Insidir 7 days for $1."}</h1>
            <p className="start__price"><span className="plan2__amt">${TRIAL.fee}</span> <span className="plan2__unit">for {TRIAL.days} days</span></p>
            <p className="start__then">{CANCEL_LINE}</p>
            <StartList />
            <p className="start__fine">Already a member? <Link href="/login">Log in</Link>.</p>
          </section>
          <div className="start__checkout">
            {move ? (
              <div className="start__move" data-testid="start-move">
                <p className="start__movelabel">A real move from the last 24 hours</p>
                <MoveCard m={move} follow="locked" trialHref="/start" compact />
              </div>
            ) : null}
            <StartCheckout elementsUrl={ELEMENTS_URL} signedInEmail={viewer.user?.email ?? null} pendingEmail={pending} googleEmail={googleEmail} />
          </div>
        </div>
      </main>
    </>
  );
}
