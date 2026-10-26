/* Following (docs/V2.md §6): the traders and markets a member follows, the alert switches (push, email) and quiet
 * hours. Alert switches show Coming soon until alerts are live on production. Free viewers see what following does and
 * the $1 trial. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { ComingSoon } from "@/components/v2/ComingSoon";
import { FollowButton } from "@/components/v2/FollowButton";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { signedShort } from "@/lib/moves/copy";
import { movePlan } from "@/lib/moves/gate";
import { hasRecord, walletLabel } from "@/lib/moves/records";
import { followList, recordsFor } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Following" };

export default async function FollowingPage() {
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const trial = unlockHref("insidir");
  const list = viewer.user && hasDatabase() ? await followList(getDb(), viewer.user.id).catch(() => []) : [];
  const recs = hasDatabase() ? await recordsFor(getDb(), list.filter(f => f.kind === "trader").map(f => f.target)).catch(() => new Map()) : new Map();
  const max = movePlan(viewer.plan).maxFollows;
  const alertsReady = isReady("alerts_push") || isReady("alerts_email");
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/following" trialHref={trial} />
      <main className="wrap app2 following">
        <h1 className="feed2__h">Following</h1>
        {!paid ? (
          <section className="upsell upsell--big">
            <p className="upsell__text">Follow top traders and markets, and get a ping on your phone when they move. Following is for members.</p>
            <a className="btn btn--primary" href={trial} data-unlock="following">Try it for $1</a>
          </section>
        ) : (
          <>
            <p className="note">{max === null ? `You follow ${list.length}.` : `You follow ${list.length} of ${max}.`}</p>
            <section className="block" aria-labelledby="alerts-h">
              <h2 id="alerts-h" className="block__h">Alerts</h2>
              {alertsReady ? <p className="note">Turn alerts on or off, and set quiet hours, in <Link href="/alerts">Alert settings</Link>.</p> : (
                <div className="soonrow">
                  <ComingSoon feature="alerts_push" className="btn btn--secondary">Phone alerts</ComingSoon>
                  <ComingSoon feature="alerts_email" className="btn btn--secondary">Email alerts</ComingSoon>
                </div>
              )}
            </section>
            <section className="block" aria-labelledby="tr-h">
              <h2 id="tr-h" className="block__h">Traders</h2>
              {list.some(f => f.kind === "trader") ? (
                <ul className="flist">
                  {list.filter(f => f.kind === "trader").map(f => {
                    const r = recs.get(f.target);
                    return (
                      <li key={f.target} className="flist__row">
                        <span><Link className="flist__name" href={`/trader/${f.target}`}>{walletLabel(f.target, r?.name ?? null)}</Link>
                          <span className="flist__rec">{hasRecord(r) ? `Won ${r.won} of ${r.resolved} · ${signedShort(r.profit)} all-time` : "Not enough history yet"}</span></span>
                        <FollowButton kind="trader" target={f.target} state="on" trialHref={trial} />
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="note">No traders yet. Tap Follow on any card in the <Link href="/feed">feed</Link>.</p>}
            </section>
            <section className="block" aria-labelledby="mk-h">
              <h2 id="mk-h" className="block__h">Markets</h2>
              {list.some(f => f.kind === "market") ? (
                <ul className="flist">
                  {list.filter(f => f.kind === "market").map(f => (
                    <li key={f.target} className="flist__row">
                      <Link className="flist__name" href={`/market/${encodeURIComponent(f.target)}`}>{f.target}</Link>
                      <FollowButton kind="market" target={f.target} state="on" trialHref={trial} label="Follow market" />
                    </li>
                  ))}
                </ul>
              ) : <p className="note">No markets yet. Open a market and tap Follow market.</p>}
            </section>
          </>
        )}
      </main>
    </>
  );
}
