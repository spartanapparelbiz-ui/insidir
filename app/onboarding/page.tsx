/* Onboarding (/onboarding): straight after the first payment, one screen: pick trackers to follow, ranked by
 * followable ROI (those with 30+ settled positions first), the top three already ticked. Follow (or Skip) lands on
 * Following (app/onboarding/pick). Works without JavaScript. Members only; someone already onboarded goes home. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { TrackerCover, coverStats } from "@/components/trackers/TrackerCover";
import { requireMember } from "@/lib/auth/viewer";
import { PAST } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { hundredLine, roiText } from "@/lib/follow/math";
import { rankForOnboarding } from "@/lib/onboarding";
import { visibleTrackers, type TrackerSlug } from "@/lib/trackers";
import { trackerStats, type TrackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pick your trackers", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const viewer = await requireMember("/onboarding");
  if (viewer.user?.onboarded && !(await searchParams).again) redirect("/");
  const stats = hasDatabase() ? await trackerStats(getDb(), Date.now()).catch(() => new Map<TrackerSlug, TrackerStats>()) : new Map<TrackerSlug, TrackerStats>();
  const ranked = rankForOnboarding(visibleTrackers(isReady), stats);
  return (
    <>
      <SiteHeader signedIn plan={viewer.plan} offer={false} tone="light" />
      <main className="wrap onb">
        <h1 className="onb__h">Pick 3 trackers to follow.</h1>
        <p className="onb__sub">Ranked by followable ROI: what $100 on every position would have made at the price Insidir showed it, plus one point. Their new positions show up in Following.</p>
        <form method="post" action="/onboarding/pick" className="onb__form" data-testid="onboarding">
          <ul className="onb__list">
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
            <button type="submit" className="btn btn--primary">Follow and continue</button>
            <button type="submit" name="skip" value="1" className="onb__skip">Skip</button>
          </div>
        </form>
        <p className="onb__fine"><Link href="/trackers">See every tracker</Link></p>
      </main>
    </>
  );
}
