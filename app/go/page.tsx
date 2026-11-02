/* /go: the funnel every "Start for $1", DM link and ad lands on (UTM tags are kept by middleware.ts on the way in).
 * Full screen, one question per screen, a progress bar, a back arrow, no site nav (components/go/Go.tsx):
 *   1 hook (a real millionaire bet, an hour old, and the live count) → 2–4 the quiz → 5 building (real queries) →
 *   6 their aha (3 real cards, the first unlocked) → 7 the personal paywall → 8 the enclosed Whop checkout.
 * Back from paying (?unlocked=1): the same cards, all unlocked, "You're in". A visitor who left at the paywall comes
 * back to their own picks (the insidir_go cookie, 7 days), never to the start. Members go home. */
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Go } from "@/components/go/Go";
import { getViewer } from "@/lib/auth/viewer";
import { ELEMENTS_URL } from "@/lib/billing/whop";
import { getDb, hasDatabase } from "@/lib/db";
import { GO_COOKIE, readAnswers } from "@/lib/go/answers";
import { hookData, type Hook } from "@/lib/go/data";
import { memo } from "@/lib/memo";
import { recordWindows, type RecordRow } from "@/lib/nx/data";
import { isPaid, PLANS, TRIAL } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "See what millionaires are betting", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#070B14" };

export default async function GoPage({ searchParams }: { searchParams: Promise<{ unlocked?: string }> }) {
  const [viewer, jar, sp] = await Promise.all([getViewer(), cookies(), searchParams]);
  const now = Date.now();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  if (member && sp.unlocked !== "1") redirect("/");
  const answers = readAnswers(jar.get(GO_COOKIE)?.value, now);
  const db = hasDatabase() ? getDb() : null;
  const [hook, record]: [Hook, RecordRow[]] = db ? await Promise.all([
    memo("go:hook", 30_000, () => hookData(db, now)).catch((): Hook => ({ bet: null, hour: 0 })),
    memo("sky:landing:record", 5 * 60_000, () => recordWindows(db, now, 6)).then(r => r.all).catch(() => [] as RecordRow[]),
  ]) : [{ bet: null, hour: 0 }, []];
  // Proof on the paywall: real tracker records, the best two and, if there is one, a losing one.
  const proof = [...record.filter(r => r.returnPct >= 0).slice(0, 2), ...record.filter(r => r.returnPct < 0).slice(0, 1)];
  // Only what the hook shows goes to the browser: never the wallet's address.
  const bet = hook.bet ? { amount: hook.bet.amount, side: hook.bet.side, priceThen: hook.bet.priceThen, pnl: hook.bet.pnl, title: hook.bet.title, at: hook.bet.at, art: hook.bet.art } : null;
  return (
    <Go now={now} hook={{ bet, hour: hook.hour }} answers={answers} unlocked={member && sp.unlocked === "1"} proof={proof} elementsUrl={ELEMENTS_URL}
      price={PLANS.insidir.price} trial={TRIAL} signedInAs={viewer.user ? viewer.user.email ?? viewer.user.name ?? "your Whop account" : null} ageConfirmed={Boolean(viewer.user?.ageConfirmed)} />
  );
}
