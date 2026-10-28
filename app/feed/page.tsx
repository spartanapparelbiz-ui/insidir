/* The feed (/feed; /terminal redirects here). Server-renders the first page of moves for this viewer's plan and region
 * (lib/moves/feed.ts), then components/v2/Feed keeps it live. A new member goes through onboarding first
 * (/onboarding) and lands here filtered to what they picked ("Your picks"), with a one-time hint on the first card
 * (?first=1). */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { Feed } from "@/components/v2/Feed";
import { LocationPill } from "@/components/v2/LocationPill";
import { unlockHref } from "@/components/app/links";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady, liveTabs } from "@/lib/features";
import { feedFor, feedStatus, type FeedItem, type FeedStatus } from "@/lib/moves/feed";
import { followList } from "@/lib/moves/store";
import { parsePicks, topicCategories } from "@/lib/picks";
import { redirect } from "next/navigation";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live feed", description: "The biggest bets on sports and prediction markets the second they happen, in plain English." };

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ first?: string; welcome?: string; tab?: string }> }) {
  const now = Date.now();
  const sp = await searchParams;
  const viewer = await requireMember("/feed");
  const jar = await cookies();
  const paid = isPaid(viewer.plan);
  // A new member goes through onboarding first (three skippable screens), once.
  if (paid && viewer.user && !viewer.user.onboarded) redirect("/onboarding");
  const tabs = liveTabs();
  const picks = parsePicks(viewer.user?.settings.picks);
  const firstPick = picks?.tabs.find(t => tabs.includes(t));
  const tab = sp.tab === "markets" ? "markets" : sp.tab === "stocks" && tabs.includes("stocks") ? "stocks" : sp.tab === "sports" ? "sports" : firstPick ?? "sports";
  const pickFilter = picks ? { leagues: tab === "sports" ? picks.leagues : [], categories: tab === "markets" ? topicCategories(picks.topics) : [] } : { leagues: [], categories: [] };
  let items: FeedItem[] = [], status: FeedStatus | null = null, follows: string[] | null = null;
  if (hasDatabase()) {
    const db = getDb();
    [items, status, follows] = await Promise.all([
      feedFor(db, viewer.plan, viewer.region, { tab, min: 10_000, limit: 30, ...pickFilter }, now).catch(() => []),
      feedStatus(db, now, tab).catch(() => null),
      viewer.user ? followList(db, viewer.user.id).then(l => l.map(f => `${f.kind}:${f.target}`)).catch(() => []) : Promise.resolve(null),
    ]);
  }
  void recordEvent({ name: "feed_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined);
  const trial = unlockHref();
  const followsReady = isReady("follows");
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/feed" trialHref={trial} />
      <main className="wrap app2 dark">
        <Feed pill={<LocationPill region={viewer.region} />} initial={items} status={status} initialTab={tab} stocks={tabs.includes("stocks")} free={!paid} follows={follows} followsReady={followsReady} trialHref={trial} serverNow={now}
          picks={picks} firstHint={Boolean(sp.first)} />
      </main>
    </>
  );
}
