/* Onboarding (/onboarding): straight after the first payment, one screen: "You're in." and the top 6 trackers by
 * followable ROI (those with 30+ settled positions first), the best three already ticked. Start (or Skip) lands on
 * Open now, or the page they came from (app/onboarding/pick). Works without JavaScript. Members only; someone already onboarded goes home. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { TrackerCover, coverStats } from "@/components/trackers/TrackerCover";
import { requireMember } from "@/lib/auth/viewer";
import { safeNext } from "@/lib/auth/next";
import { PAST } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { hundredLine, roiText } from "@/lib/follow/math";
import { rankForOnboarding } from "@/lib/onboarding";
import { visibleTrackers, type TrackerSlug } from "@/lib/trackers";
import { trackerStats, type TrackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pick your trackers", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ again?: string; next?: string }> }) {
  const viewer = await requireMember("/onboarding");
  const sp = await searchParams;
  if (viewer.user?.onboarded && !sp.again) redirect("/");
  const next = safeNext(sp.next ?? "/open");
  const stats = hasDatabase() ? await trackerStats(getDb(), Date.now()).catch(() => new Map<TrackerSlug, TrackerStats>()) : new Map<TrackerSlug, TrackerStats>();
  const ranked = rankForOnboarding(visibleTrackers(isReady), stats).slice(0, 6);
  return (
    <>
      <SiteHeader signedIn plan={viewer.plan} offer={false} tone="light" />
      <main className="wrap onb">
        <h1 className="onb__h">You&apos;re in.</h1>
        <p className="onb__sub">The top trackers by followable ROI: what $100 on every position would have made at the price Insidir showed it, plus one point. The best three are picked; their new positions show up in Following.</p>
        <form method="post" action="/onboarding/pick" className="onb__form" data-testid="onboarding">
          <input type="hidden" name="next" value={next} />
          <ul className="onb__list onb__tiles">
            {ranked.map(({ t, roi, s }, i) => {
              const r = s?.records.all;
              return (
                <li key={t.slug}>
                  <label className="onb__row">
                    <input type="checkbox" name="t" value={t.slug} defaultChecked={i < 3 && roi !== null} />
                    <TrackerCover t={t} s={coverStats(s)} small figure={false} className="onb__art" />
                    <span className="onb__main"><span className="onb__name">{t.name}</span><span className="onb__line">{t.line}</span></span>
                    <span className="onb__fig">
                      {roi !== null && r ? <><b className={roi >= 0 ? "pos" : "neg"}>{roiText(r.net, r.staked!)}</b><span>{hundredLine({ net: r.net, staked: r.staked! })}</span></>
                        : <span>{t.kind === "filings" ? "Filings" : "Building a record"}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="onb__fine">{PAST}</p>
          <div className="onb__ctas">
            <button type="submit" className="btn btn--primary btn--big acta">Start</button>
            <button type="submit" name="skip" value="1" className="onb__skip">Skip</button>
          </div>
        </form>
        <p className="onb__fine"><Link href="/trackers">See every tracker</Link></p>
      </main>
    </>
  );
}
