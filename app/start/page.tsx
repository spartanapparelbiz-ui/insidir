/* Get Insidir (/start), never more than 2 steps (components/auth/AuthSplit.tsx frames it):
 *   1. Signed out: "See where the smart money is.", the price, 3 checkmarks, "Continue" to Whop's sign-in (it comes back here).
 *   2. Signed in without Insidir: the embedded Whop checkout (components/auth/StartCheckout.tsx), email prefilled,
 *      the plan line and "Change account", nothing else. On payment, /welcome.
 * Members (and FREE_ACCESS_EMAILS) go straight into the app. ?error= from a cancelled sign-in says so, with a retry. */
import { TRIAL_LINE } from "@/lib/copy";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { StartCheckout } from "@/components/auth/StartCheckout";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { getViewer } from "@/lib/auth/viewer";
import { ELEMENTS_URL } from "@/lib/billing/whop";
import { PLANS, TRIAL, isPaid } from "@/lib/plans";
import { isFreeAccess } from "@/lib/billing/free";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get Insidir", description: `Insidir: ${TRIAL_LINE}, then $${PLANS.insidir.price}/month. Cancel anytime.`, robots: { index: false } };

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
  // Accounts only if you pay: signed out, the one way in is the paywall (18+ → Whop checkout → the account).
  if (!viewer.user) redirect("/go?step=paywall");
  void recordEvent({ name: "start_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined);
  const error = sp.error ? ERRORS[sp.error] ?? ERRORS.failed : null;
  return (
    <AuthSplit step={1}>
      {error ? <p className="aerr" role="alert">{error}</p> : null}
      <StartCheckout elementsUrl={ELEMENTS_URL} signedInAs={viewer.user ? viewer.user.email ?? viewer.user.name ?? "your Whop account" : null} next={next} ageConfirmed={Boolean(viewer.user?.ageConfirmed)} />
    </AuthSplit>
  );
}
