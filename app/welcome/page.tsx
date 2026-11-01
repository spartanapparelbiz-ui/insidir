/* Where the checkout lands (/welcome): pay first, then sign in. A buyer who paid signed out goes straight through
 * Whop's sign-in (one redirect: they've just used their Whop account to pay) and lands back here signed in; it waits
 * for Whop to say the account has Insidir (components/auth/Welcome.tsx), then goes back to ?next (their Read). */
import type { Metadata } from "next";
import { Welcome } from "@/components/auth/Welcome";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { safeNext } from "@/lib/auth/next";
import { getViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You're in", robots: { index: false } };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ status?: string; next?: string }> }) {
  const sp = await searchParams;
  const failed = sp.status === "failed" || sp.status === "canceled";
  if (!failed && !(await getViewer()).user) {
    const q = new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.next ? { next: safeNext(sp.next) } : {}) }).toString();
    redirect(`/login/start?next=${encodeURIComponent(`/welcome${q ? `?${q}` : ""}`)}`);
  }
  return <AuthSplit step={2}><Welcome status={sp.status ?? null} next={safeNext(sp.next ?? "/")} /></AuthSplit>;
}
