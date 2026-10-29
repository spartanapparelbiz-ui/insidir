/* /trackers: every tracker (lib/trackers.ts) as a grid of cover cards: name, "by Insidir", one line, its record (or
 * "New" under 20 settled moves) and the money it tracked in the last 30 days. Public. */
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { TrackerTile } from "@/components/trackers/Tracker";
import { coverStats } from "@/components/trackers/TrackerCover";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { GROUPS, visibleTrackers, type TrackerSlug } from "@/lib/trackers";
import { trackerStats, type TrackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trackers", description: "Trackers of large positions: whales, top-ranked traders, long shots, momentum, every major league, the Fed, elections, CEO purchases, insider clusters and new fund positions." };

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
          <p className="phead__sub">Each tracker is a live portfolio of large positions that fit one rule, built from public trades and filings. Follow one to see its new positions in Following.</p>
        </header>
        <nav className="dfilters tgroups" aria-label="Groups">{GROUPS.map(g => <a key={g} className="tlink" href={`#g-${g.toLowerCase()}`}>{g}</a>)}</nav>
        {GROUPS.map(g => (
          <section key={g} className="tgroup" id={`g-${g.toLowerCase()}`} aria-labelledby={`gh-${g}`}>
            <h2 id={`gh-${g}`} className="tgroup__h">{g}</h2>
            <ul className="tgrid">
              {visibleTrackers(isReady).filter(t => t.group === g).map((t, i) => {
                const s = stats.get(t.slug);
                return <TrackerTile key={t.slug} t={t} r={s?.records.all ?? null} tracked30d={s?.tracked30d ?? 0} s={coverStats(s)} i={Math.min(i, 5)} />;
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
