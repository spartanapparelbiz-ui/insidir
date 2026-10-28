/* Following (docs/INSIDIR-V2.md §6): the member's Following feed (lib/following-feed.ts: big moves by the traders and
 * markets they follow, and every new filing by the insiders, companies and funds they follow), then everything they
 * follow, and the alert switches. Alert switches show Coming soon until alerts are live on production. Free viewers
 * see what following does and Get Insidir. */
import { GET_CTA } from "@/lib/copy";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { ComingSoon } from "@/components/v2/ComingSoon";
import { FollowButton } from "@/components/v2/FollowButton";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { signedShort } from "@/lib/moves/copy";
import { movePlan } from "@/lib/moves/gate";
import { hasRecord, walletLabel } from "@/lib/moves/records";
import { followList, recordsFor } from "@/lib/moves/store";
import { followingFeed, FOLLOWING_DAYS, type FollowingEntry } from "@/lib/following-feed";
import type { FilingItem } from "@/lib/follows";
import { companyHref, fundHref, insiderHref, personName, roleOf } from "@/lib/profiles/name";
import { fundOf, issuersByCik, ownersByCik } from "@/lib/profiles/store";
import { MoveCard } from "@/components/v2/MoveCard";
import { TimeAgo } from "@/components/TimeAgo";
import { agoText } from "@/lib/moves/copy";
import { isPaid } from "@/lib/plans";
import { PageBand } from "@/components/PageBand";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Following" };

/** A filing by someone the member follows: who filed what, why it's here, and links to the page and the filing. */
function FilingCard({ f, now }: { f: FilingItem; now: number }) {
  return (
    <article className="move" data-filing={f.key}>
      <div className="move__top">
        <span className="tag tag--blue"><span className="tag__dot" aria-hidden="true" />Stocks · {f.kind === "fund" ? "13F" : "Form 4"}</span>
        <TimeAgo className="move__time" at={f.at} initial={agoText(f.at, now)} />
      </div>
      <p className="move__sentence">{f.sentence}</p>
      <p className="filing__because">{f.because}</p>
      <div className="move__foot">
        <Link className="btn btn--secondary" href={f.href}>{f.kind === "fund" ? "See the fund" : "See the insider"}</Link>
        {f.companyHref ? <Link className="btn btn--secondary" href={f.companyHref}>Company insiders</Link> : null}
        <a className="source move__src" href={f.url} target="_blank" rel="noopener noreferrer">SEC filing<span aria-hidden="true">{"\u00a0↗"}</span><span className="sr-only"> (opens in a new tab)</span></a>
      </div>
    </article>
  );
}

export default async function FollowingPage() {
  const viewer = await requireMember("/following");
  const paid = isPaid(viewer.plan);
  const trial = unlockHref();
  const now = Date.now();
  const db = hasDatabase() ? getDb() : null;
  const list = viewer.user && db ? await followList(db, viewer.user.id).catch(() => []) : [];
  const targets = (k: string) => list.filter(f => f.kind === k).map(f => f.target);
  const [recs, owners, issuers, funds, feed] = db && paid ? await Promise.all([
    recordsFor(db, targets("trader")).catch(() => new Map()),
    ownersByCik(db, targets("insider")).catch(() => new Map()),
    issuersByCik(db, targets("company")).catch(() => new Map()),
    Promise.all(targets("fund").map(c => fundOf(db, c).catch(() => null))),
    followingFeed(db, list, viewer.plan, viewer.region, now).catch((): FollowingEntry[] => []),
  ]) : [new Map(), new Map(), new Map(), [], [] as FollowingEntry[]];
  const max = movePlan(viewer.plan).maxFollows;
  const alertsReady = isReady("alerts_push") || isReady("alerts_email");
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/following" trialHref={trial} />
      <main className="wrap app2 following dark">
        <PageBand n={BAND.following} title="Following" />
        {!paid ? (
          <section className="upsell upsell--big">
            <p className="upsell__text">Follow top traders, markets, insiders, companies and funds, and see their moves and filings in one feed. Following is for members.</p>
            <a className="btn btn--primary" href={trial} data-unlock="following">{GET_CTA}</a>
          </section>
        ) : (
          <>
            <p className="note">{max === null ? `You follow ${list.length}.` : `You follow ${list.length} of ${max}.`}</p>
            <section className="block" aria-labelledby="feed-h">
              <h2 id="feed-h" className="block__h">Latest from who you follow</h2>
              {feed.length ? (
                <ol className="feedlist" data-testid="following-feed">
                  {feed.map(e => <li key={e.type === "move" ? e.item.id : e.item.key}>
                    {e.type === "move" ? <MoveCard m={e.item} follow="on" trialHref={trial} /> : <FilingCard f={e.item} now={now} />}
                  </li>)}
                </ol>
              ) : <p className="note">{list.length ? `Nothing from who you follow in the last ${FOLLOWING_DAYS} days yet. Their next move or filing shows up here.` : "Follow a trader, insider, company or fund and their moves and filings show up here."}</p>}
            </section>
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
                        <span><Link className="flist__name" href={`/p/${f.target}`}>{walletLabel(f.target, r?.name ?? null)}</Link>
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
            <section className="block" aria-labelledby="in-h">
              <h2 id="in-h" className="block__h">Insiders</h2>
              {targets("insider").length ? (
                <ul className="flist">
                  {targets("insider").map(cik => {
                    const o = owners.get(cik);
                    return (
                      <li key={cik} className="flist__row">
                        <span><Link className="flist__name" href={insiderHref(cik, o?.name)}>{o ? personName(o.name) : `SEC filer ${cik}`}</Link>
                          <span className="flist__rec">{o?.role ? `${roleOf(o.role)} of ${o.company}` : "Reading their SEC filings"}</span></span>
                        <FollowButton kind="insider" target={cik} state="on" trialHref={trial} label="Follow insider" />
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="note">No insiders yet. Tap Follow insider on a Stocks card, or on an insider&apos;s page.</p>}
            </section>
            <section className="block" aria-labelledby="co-h">
              <h2 id="co-h" className="block__h">Companies</h2>
              {targets("company").length ? (
                <ul className="flist">
                  {targets("company").map(cik => {
                    const c = issuers.get(cik);
                    return (
                      <li key={cik} className="flist__row">
                        <span>{c?.ticker ? <Link className="flist__name" href={companyHref(c.ticker)}>{c.company}</Link> : <span className="flist__name">{c?.company ?? `SEC filer ${cik}`}</span>}
                          <span className="flist__rec">{c?.ticker ? `${c.ticker} · every insider trade` : "Every insider trade"}</span></span>
                        <FollowButton kind="company" target={cik} state="on" trialHref={trial} label="Follow company" />
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="note">No companies yet. Tap Follow company on a Stocks card, or on a company&apos;s insider trading page.</p>}
            </section>
            <section className="block" aria-labelledby="fu-h">
              <h2 id="fu-h" className="block__h">Funds</h2>
              {targets("fund").length ? (
                <ul className="flist">
                  {targets("fund").map((cik, i) => {
                    const fund = funds[i];
                    return (
                      <li key={cik} className="flist__row">
                        <span><Link className="flist__name" href={fundHref(cik, fund?.name)}>{fund?.name ?? `SEC filer ${cik}`}</Link>
                          <span className="flist__rec">Every new 13F</span></span>
                        <FollowButton kind="fund" target={cik} state="on" trialHref={trial} label="Follow fund" />
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="note">No funds yet. Tap Follow fund on a fund&apos;s Stocks card or its page.</p>}
            </section>
          </>
        )}
      </main>
    </>
  );
}
