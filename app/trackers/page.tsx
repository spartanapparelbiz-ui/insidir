/* /trackers: every tracker (lib/trackers.ts) as a grid of cover cards: name, "by Insidir", one line, its record (or
 * "New" under 20 settled moves) and the money it tracked in the last 30 days. Public. */
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { TrackerTile } from "@/components/trackers/Tracker";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { TRACKERS, type TrackerSlug } from "@/lib/trackers";
import { trackerStats, type TrackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trackers", description: "Follow the big money by tracker: biggest bets, top traders, NBA, NFL, soccer, the Fed, the 2026 elections, CEO buys and big funds." };

export default async function TrackersPage() {
  const now = Date.now();
  const viewer = await getViewer();
  const stats = hasDatabase() ? await trackerStats(getDb(), now).catch(() => new Map<TrackerSlug, TrackerStats>()) : new Map<TrackerSlug, TrackerStats>();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/trackers" trialHref={unlockHref()} />
      <main className="wrap app2 trackers">
        <header className="phead">
          <h1 className="phead__h">Trackers</h1>
          <p className="phead__sub">Each one follows a kind of big money, built from public trades and filings. Follow one to get its moves in Following, and an alert when it moves.</p>
        </header>
        <ul className="tgrid">
          {TRACKERS.map((t, i) => {
            const s = stats.get(t.slug);
            return <TrackerTile key={t.slug} t={t} r={s?.records.all ?? null} tracked30d={s?.tracked30d ?? 0} i={Math.min(i, 5)} />;
          })}
        </ul>
      </main>
    </>
  );
}
