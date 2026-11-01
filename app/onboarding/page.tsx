/* Onboarding (/onboarding): straight after the first payment, one step: "Pick a winner to copy", the top 5 copyable
 * wallets and trackers (30+ settled positions, by followable return) with their record, the best one already chosen.
 * Copy (or Skip for now) lands on My copies (POST /copies/pick). Works without JavaScript. Members only; someone
 * already onboarded goes home. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { CopyPicker } from "@/components/copies/CopyPicker";
import { requireMember } from "@/lib/auth/viewer";
import { safeNext } from "@/lib/auth/next";
import { copyable } from "@/lib/copies/store";
import { getDb, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pick a winner to copy", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ again?: string; next?: string }> }) {
  const viewer = await requireMember("/onboarding");
  const sp = await searchParams;
  if (viewer.user?.onboarded && !sp.again) redirect("/");
  const list = hasDatabase() ? (await copyable(getDb(), Date.now()).catch(() => [])).slice(0, 5) : [];
  return (
    <>
      <SiteHeader signedIn plan={viewer.plan} offer={false} tone="light" />
      <main className="pg onb" data-testid="onboarding">
        <h1 className="onb__h">Pick a winner to copy</h1>
        <p className="onb__sub">The five wallets and trackers with the best record you could have followed. Every bet your pick makes from now on shows up on your home page.</p>
        <CopyPicker list={list} next={safeNext(sp.next ?? "/copies")} onboarding cta="Copy this winner" />
      </main>
    </>
  );
}
