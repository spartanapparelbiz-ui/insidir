/* The feed (/feed; /terminal redirects here). Server-renders the first page of moves for this viewer's plan and region
 * (lib/moves/feed.ts), then components/v2/Feed keeps it live. After checkout (?welcome=1) a member first sees the
 * summit (photo 6) full bleed with "You're in." in the serif and their first 3 traders to follow on solid cards: the
 * top 3 traders by all-time profit, one tap each. */
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { after } from "next/server";
import { users } from "@/lib/db/schema";
import { Photo } from "@/components/Photo";
import { SPOT } from "@/lib/photos";
import { SiteHeader } from "@/components/SiteHeader";
import { Feed } from "@/components/v2/Feed";
import { FollowButton } from "@/components/v2/FollowButton";
import { LocationPill } from "@/components/v2/LocationPill";
import { unlockHref } from "@/components/app/links";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { requireMember } from "@/lib/auth/viewer";
import { signedShort } from "@/lib/moves/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady, liveTabs } from "@/lib/features";
import { feedFor, feedStatus, type FeedItem, type FeedStatus } from "@/lib/moves/feed";
import { walletLabel } from "@/lib/moves/records";
import { followList, topTraders } from "@/lib/moves/store";
import type { TraderRecord } from "@/lib/moves/types";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live feed", description: "The biggest bets on sports and prediction markets the second they happen, in plain English." };

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ welcome?: string; tab?: string }> }) {
  const now = Date.now();
  const sp = await searchParams;
  const viewer = await requireMember("/feed");
  const jar = await cookies();
  const paid = isPaid(viewer.plan);
  const tabs = liveTabs();
  const tab = sp.tab === "markets" ? "markets" : sp.tab === "stocks" && tabs.includes("stocks") ? "stocks" : "sports";
  // The welcome shows once: after checkout (?welcome=1), or the first time a new paying member opens the feed.
  const welcome = paid && Boolean(viewer.user) && (Boolean(sp.welcome) || !viewer.user!.onboarded);
  let items: FeedItem[] = [], status: FeedStatus | null = null, follows: string[] | null = null, top: TraderRecord[] = [];
  if (hasDatabase()) {
    const db = getDb();
    [items, status, follows, top] = await Promise.all([
      feedFor(db, viewer.plan, viewer.region, { tab, min: 10_000, limit: 30 }, now).catch(() => []),
      feedStatus(db, now, tab).catch(() => null),
      viewer.user ? followList(db, viewer.user.id).then(l => l.filter(f => f.kind === "trader").map(f => f.target)).catch(() => []) : Promise.resolve(null),
      welcome ? topTraders(db, 3).catch(() => []) : Promise.resolve([]),
    ]);
    if (welcome && !viewer.user!.onboarded) {
      const id = viewer.user!.id;
      after(() => db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, id)).then(() => undefined, () => undefined));
    }
  }
  void recordEvent({ name: "feed_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null }).catch(() => undefined);
  const trial = unlockHref();
  const followsReady = isReady("follows");
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/feed" trialHref={trial} />
      {welcome ? (
        <section className="inband" aria-labelledby="welcome-h">
          <Photo n={SPOT.youreIn} className="inband__photo" eager />
          <div className="wrap inband__in">
            <h2 id="welcome-h" className="inband__h">You&apos;re in.</h2>
            <p className="inband__p">Follow your first 3 traders. We&apos;ll ping you the moment they make a big move.</p>
            {top.length ? (
              <ul className="inband__list">
                {top.map(t => (
                  <li key={t.wallet} className="inband__card">
                    <a href={`/p/${t.wallet}`} className="inband__name">{walletLabel(t.wallet, t.name)}</a>
                    <span className="inband__rec">Won {t.won} of {t.resolved} · <span className={t.profit >= 0 ? "money" : "loss"}>{signedShort(t.profit)}</span> all-time</span>
                    <FollowButton kind="trader" target={t.wallet} state={followsReady ? (follows?.includes(t.wallet) ? "on" : "off") : "soon"} trialHref={trial} />
                  </li>
                ))}
              </ul>
            ) : <p className="inband__card inband__card--note">Top traders show up here once we have 20 settled markets for them. Tap Follow on any card in the feed in the meantime.</p>}
          </div>
        </section>
      ) : null}
      <main className="wrap app2 dark">
        <Feed pill={<LocationPill region={viewer.region} />} initial={items} status={status} initialTab={tab} stocks={tabs.includes("stocks")} free={!paid} follows={follows} followsReady={followsReady} trialHref={trial} serverNow={now} />
      </main>
    </>
  );
}
