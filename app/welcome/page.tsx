/* Where the embedded checkout lands (/welcome): logs the buyer in once their payment has made the account
 * (components/auth/Welcome.tsx), then on to the feed's "You're in." */
import type { Metadata } from "next";
import { Welcome } from "@/components/auth/Welcome";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You're in", robots: { index: false } };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <SiteHeader signedIn={false} offer={false} />
      <main className="dark start start--welcome">
        <div className="wrap start__in start__in--one"><Welcome status={sp.status ?? null} /></div>
      </main>
    </>
  );
}
