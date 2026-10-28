/* Onboarding (/onboarding): straight after the first payment, three quick screens, every one skippable
 * (components/app/FirstRun.tsx): what to follow, three top traders to follow, and getting it on the phone. Then the
 * feed, filtered to what they picked. Members only; someone already onboarded goes to the feed. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FirstRun } from "@/components/app/FirstRun";
import { SiteHeader } from "@/components/SiteHeader";
import { requireMember } from "@/lib/auth/viewer";
import { isReady, liveTabs } from "@/lib/features";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const viewer = await requireMember("/onboarding");
  if (viewer.user?.onboarded && !(await searchParams).again) redirect("/feed");
  return (
    <>
      <SiteHeader signedIn plan={viewer.plan} offer={false} />
      <main className="dark start start--welcome">
        <div className="wrap start__in start__in--one">
          <FirstRun stocks={liveTabs().includes("stocks")} follows={isReady("follows")} />
        </div>
      </main>
    </>
  );
}
