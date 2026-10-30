/* /open: every open position from winning trackers and traders (lib/follow/open.ts): a positive followable return on
 * 30 or more settled positions. Visitors see the 3 newest (30 minutes late) and how many more; members see all of
 * them, live. Public. */
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { OpenNow } from "@/components/follow/OpenNow";
import { getViewer } from "@/lib/auth/viewer";
import { PAST } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { openFromWinners } from "@/lib/follow/open";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Open now from winning trackers", description: "Open positions from trackers and traders with a positive followable record on 30 or more settled positions. " + PAST };

export default async function OpenPage() {
  const now = Date.now();
  const viewer = await getViewer();
  const member = isPaid(viewer.plan);
  const d = hasDatabase() ? await openFromWinners(getDb(), viewer.plan, now).catch(() => ({ rows: [], total: 0 })) : { rows: [], total: 0 };
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/open" trialHref={unlockHref()} />
      <main className="wrap app2 openpage">
        <header className="phead">
          <h1 className="phead__h">Open now</h1>
          <p className="phead__sub">{d.total ? `${d.total.toLocaleString("en-US")} open ${d.total === 1 ? "position" : "positions"}` : "Open positions"} from trackers and traders that made money for anyone following them: a positive followable return on 30 or more settled positions. {PAST}</p>
        </header>
        <OpenNow rows={d.rows} total={d.total} member={member} now={now} trialHref={unlockHref()} />
      </main>
    </>
  );
}
