/* Get Insidir (/start), never more than 2 steps (components/auth/AuthSplit.tsx frames it):
 *   1. Signed out: "Follow the big money.", the price, 3 checkmarks, "Continue" to Whop's sign-in (it comes back here).
 *   2. Signed in without Insidir: the embedded Whop checkout (components/auth/StartCheckout.tsx), email prefilled,
 *      the plan line and "Change account", nothing else. On payment, /welcome.
 * Members (and FREE_ACCESS_EMAILS) go straight into the app. ?error= from a cancelled sign-in says so, with a retry. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { ContinueButton } from "@/components/auth/ContinueButton";
import { StartCheckout } from "@/components/auth/StartCheckout";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { getViewer } from "@/lib/auth/viewer";
import { ELEMENTS_URL } from "@/lib/billing/whop";
import { PLANS, TRIAL, isPaid } from "@/lib/plans";
import { isFreeAccess } from "@/lib/billing/free";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get Insidir", description: `Insidir: $${TRIAL.fee} for your first week, then $${PLANS.insidir.price}/month. Cancel anytime.`, robots: { index: false } };

const CHECKS = [
  "Every large position across sports, prediction markets and stocks",
  "Verified records and followable returns for every tracker and trader",
  "What the winning trackers hold right now",
];
const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Continue when you're ready.",
  failed: "Sign-in didn't go through. Try again.",
  expired: "That sign-in took too long. Try again.",
  network: "We couldn't reach Whop. Check your connection and try again.",
};

export default async function StartPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const [viewer, jar, sp] = await Promise.all([getViewer(), cookies(), searchParams]);
  const next = safeNext(sp.next ?? "/");
  if (viewer.user && (isPaid(viewer.plan) || isFreeAccess(viewer.user.email))) redirect(next === "/" ? "/" : next);
  void recordEvent({ name: "start_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined);
  const error = sp.error ? ERRORS[sp.error] ?? ERRORS.failed : null;
  return (
    <AuthSplit step={viewer.user ? 2 : 1}>
      {viewer.user ? (
        <StartCheckout elementsUrl={ELEMENTS_URL} signedInAs={viewer.user.email ?? viewer.user.name ?? "your Whop account"} next={next} />
      ) : (
        <div className="astart rise-in" data-testid="start-continue">
          <h1 className="astart__h">Follow the big money.</h1>
          <p className="astart__sub">${TRIAL.fee} for your first week, then ${PLANS.insidir.price}/month. Cancel anytime.</p>
          <ul className="astart__checks" data-testid="start-list">{CHECKS.map(c => <li key={c}>{c}</li>)}</ul>
          {error ? <p className="aerr" role="alert">{error}</p> : null}
          <div className="astart__cta"><ContinueButton next={next === "/" ? "/start" : `/start?next=${encodeURIComponent(next)}`} /></div>
        </div>
      )}
    </AuthSplit>
  );
}
