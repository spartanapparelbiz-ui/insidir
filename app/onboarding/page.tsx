/* Onboarding (/onboarding): one question after paying, "What do you bet on?" (NFL, NBA, CFB, NHL, MLB, Soccer,
 * Elections, Other; any number). The member home then shows tonight's markets in those leagues. Continue (or Skip)
 * goes on to ?next (their Read, or home). Works without JavaScript. Members only; someone already onboarded goes on. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { requireMember } from "@/lib/auth/viewer";
import { safeNext } from "@/lib/auth/next";
import { BET_ON } from "@/lib/read/member";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What do you bet on?", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ again?: string; next?: string }> }) {
  const viewer = await requireMember("/onboarding");
  const sp = await searchParams;
  const next = safeNext(sp.next ?? "/");
  if (viewer.user?.onboarded && !sp.again) redirect(next);
  const chosen = new Set(viewer.user?.settings.betOn ?? []);
  return (
    <>
      <SiteHeader signedIn plan={viewer.plan} offer={false} tone="light" />
      <main className="pg onb" data-testid="onboarding">
        <h1 className="onb__h">What do you bet on?</h1>
        <p className="onb__sub">Pick any. Your home page shows tonight&apos;s markets for them, ready to read.</p>
        <form method="post" action="/onboarding/pick" className="onbq">
          <input type="hidden" name="next" value={next} />
          <fieldset className="onbq__opts">
            <legend className="sr-only">What do you bet on?</legend>
            {BET_ON.map(([k, label]) => (
              <label key={k} className="onbq__opt"><input type="checkbox" name="bet" value={k} defaultChecked={chosen.has(k)} /><span>{label}</span></label>
            ))}
          </fieldset>
          <div className="cpick__ctas">
            <button type="submit" className="btn btn--primary btn--big">Continue</button>
            <button type="submit" name="skip" value="1" className="onb__skip">Skip</button>
          </div>
        </form>
      </main>
    </>
  );
}
