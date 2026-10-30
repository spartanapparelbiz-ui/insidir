/* Where the checkout lands (/welcome): waits for Whop to say the account has Insidir (components/auth/Welcome.tsx),
 * then on to onboarding. A buyer who paid signed out goes straight through Whop's sign-in first and lands back here
 * signed in (they've just used their Whop account to pay, so it's usually one tap). */
import type { Metadata } from "next";
import { Welcome } from "@/components/auth/Welcome";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You're in", robots: { index: false } };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const failed = sp.status === "failed" || sp.status === "canceled";
  if (!failed && !(await getViewer()).user) redirect(`/login/start?next=${encodeURIComponent(`/welcome${sp.status ? `?status=${sp.status}` : ""}`)}`);
  return (
    <>
      <SiteHeader signedIn={false} offer={false} />
      <main className="dark start start--welcome">
        <div className="wrap start__in start__in--one"><Welcome status={sp.status ?? null} /></div>
      </main>
    </>
  );
}
