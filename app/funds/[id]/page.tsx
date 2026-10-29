/* A fund (/funds/<cik>-<slug>): its latest 13F-HR (quarter, filing date, positions, reported value), the biggest adds
 * and new positions against the quarter before, and for members its top 10 holdings and every earlier quarter's adds
 * and cuts. Public: a 13F filed in the last 30 days is free; older ones and Follow are for members. A bare
 * /funds/<cik> or an old slug redirects to the canonical one. */
import { LineChart } from "@/components/charts/LineChart";
import { Section, Table } from "@/components/stats/Stats";
import { quarterSummary } from "@/lib/stocks/quarters";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Photo } from "@/components/Photo";
import { unlockHref } from "@/components/app/links";
import { SourceA } from "@/components/v2/MoveCard";
import { Avatar } from "@/components/v2/Avatar";
import { monogram } from "@/lib/moves/avatar";
import { FollowButton } from "@/components/v2/FollowButton";
import { calDate, exactDollars, followState, pct, signedPct } from "@/components/v2/profiles/shared";
import { OlderLocked, SecFrame, shareCount } from "@/components/v2/sec/shared";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { followList } from "@/lib/moves/store";
import { profileSource } from "@/lib/moves/source";
import { BAND } from "@/lib/photos";
import { isPaid } from "@/lib/plans";
import { fundHref, parseCikSlug } from "@/lib/profiles/name";
import { FREE_DAYS, quarterChanges, topHoldings, type Change } from "@/lib/profiles/sec";
import { fundOf, fundQuarters } from "@/lib/profiles/store";

export const dynamic = "force-dynamic";

const KIND: Record<Change["kind"], string> = { new: "New position", added: "Added", cut: "Cut", sold: "Sold all" };

function Changes({ title, list, empty }: { title: string; list: Change[]; empty?: string }) {
  if (!list.length) return empty ? <div><h3 className="pq__h">{title}</h3><p className="note">{empty}</p></div> : null;
  return (
    <div>
      <h3 className="pq__h">{title}</h3>
      <ul className="positions">{list.map(c => (
        <li key={c.cusip} className="positions__row"><span className="positions__title">{c.company}</span><span className="positions__out">{KIND[c.kind]} · {shareCount(c.shares)} shares</span><span className="positions__val">{exactDollars(c.value)}</span></li>
      ))}</ul>
    </div>
  );
}

async function load(id: string) {
  const ref = parseCikSlug(id);
  if (!ref || !hasDatabase()) return null;
  const fund = await fundOf(getDb(), ref.cik).catch(() => null);
  return fund ? { ref, fund, href: fundHref(ref.cik, fund.name) } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const x = await load((await params).id);
  if (!x) return { title: "Fund", robots: { index: false } };
  return {
    title: `${x.fund.name}: 13F holdings, biggest adds and new positions`,
    description: `${x.fund.name}'s latest 13F filed with the SEC: what it holds, its biggest adds and its new positions, each linked to the filing.`,
    alternates: { canonical: x.href },
  };
}

export default async function FundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const x = await load(id);
  if (!x) notFound();
  if (`/funds/${id}` !== x.href) permanentRedirect(x.href);
  const now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const db = getDb();
  const [quarters, following] = await Promise.all([
    fundQuarters(db, x.ref.cik).catch(() => []),
    paid && viewer.user ? followList(db, viewer.user.id).then(l => l.some(f => f.kind === "fund" && f.target === x.ref.cik)).catch(() => false) : Promise.resolve(false),
  ]);
  const latest = quarters[0];
  const freeLatest = latest ? Date.parse(`${latest.filedOn}T21:00:00Z`) >= now - FREE_DAYS * 86_400_000 : false;
  const open = paid || freeLatest;
  const changes = latest && quarters[1] ? quarterChanges(quarters[1].holdings, latest.holdings, 50) : null;
  const total = latest ? latest.holdings.reduce((s, h) => s + h.value, 0) : 0;
  return (
    <SecFrame viewer={viewer} current="/funds">
      <header className="trader__head">
        <Photo n={BAND.profile.stocks} className="trader__photo" band par eager />
        <div className="trader__id">
          <Avatar face={{ src: null, mono: monogram(x.fund.name) }} size="profile" />
          <div>
            <p className="trader__kicker">Fund · files 13F reports with the SEC</p>
            <h1 className="trader__name">{x.fund.name}</h1>
            <SourceA link={profileSource({ kind: "fund", cik: x.ref.cik })} className="source source--dark" />
          </div>
        </div>
        <div className="trader__acts">
          <FollowButton kind="fund" target={x.ref.cik} state={followState(viewer, following)} trialHref={unlockHref()} label="Follow fund" />
        </div>
      </header>
      <p className="note pnote">{x.fund.quartersOnFile} {x.fund.quartersOnFile === 1 ? "quarter" : "quarters"} on file with the SEC. A 13F lists long US positions at the quarter&apos;s end and is filed up to 45 days later. <Link href="/data">About our data</Link></p>
      {!latest ? <p className="note">Not enough history yet. We show holdings once we&apos;ve read one of their filings in full.</p> : !open ? (
        <>
          <p className="note">Latest 13F filed {calDate(latest.filedOn)}{latest.period ? `, for the quarter ending ${calDate(latest.period)}` : ""}.</p>
          <OlderLocked older={0} what="filings" />
        </>
      ) : (
        <>
          <section className="block" aria-labelledby="latest-h">
            <h2 id="latest-h" className="block__h">Latest 13F</h2>
            <dl className="record record--wide">
              <div><dt>Quarter ending</dt><dd>{latest.period ? calDate(latest.period) : "—"}</dd><span className="record__sub">Filed {calDate(latest.filedOn)}</span></div>
              <div><dt>Reported value</dt><dd>{exactDollars(total)}</dd><span className="record__sub">{latest.holdings.length.toLocaleString("en-US")} positions</span></div>
            </dl>
            <p className="note"><a href={latest.url} target="_blank" rel="noopener noreferrer">See the SEC filing</a></p>
            {changes ? (
              <div className="pq__grid">
                <Changes title="Largest additions" list={changes.adds.filter(c => c.kind === "added").slice(0, 10)} empty="No positions added to this quarter." />
                <Changes title="New positions" list={changes.adds.filter(c => c.kind === "new").slice(0, 10)} empty="No new positions this quarter." />
              </div>
            ) : <p className="note">We compare quarters once we hold two of their filings.</p>}
          </section>
          {paid ? (
            <>
              <section className="block" aria-labelledby="top-h">
                <h2 id="top-h" className="block__h">Top 10 holdings</h2>
                <ol className="positions">{topHoldings(latest.holdings).map(h => (
                  <li key={h.cusip} className="positions__row"><span className="positions__title">{h.company}</span><span className="positions__out">{pct(h.share)} of reported</span><span className="positions__val">{exactDollars(h.value)}</span></li>
                ))}</ol>
              </section>
              <Section id="qq-h" title="Quarter over quarter" note="Each 13F against the one before: the reported value and how many positions are new, added to, cut or sold out.">
                {quarters.length > 1 ? <div className="dsub" style={{ marginTop: 0, marginBottom: 32 }}>
                  <LineChart points={[...quarters].reverse().map(q => ({ t: Date.parse(`${q.period ?? q.filedOn}T12:00:00Z`), v: q.holdings.reduce((s, h) => s + h.value, 0) }))}
                    format="usd" baseline="first" label="Reported value by quarter" empty="We chart the value once we hold two of their filings." />
                </div> : null}
                <Table label="Quarter over quarter" head={["Quarter ending", "Reported value", "Change", "Positions", "New", "Added", "Cut", "Sold out"]} numeric={[1, 2, 3, 4, 5, 6, 7]}
                  rows={quarters.map((q, i) => {
                    const s = quarterSummary(q.holdings, quarters[i + 1]?.holdings ?? null);
                    return [q.period ? calDate(q.period) : `Filed ${calDate(q.filedOn)}`, exactDollars(s.value),
                      s.change === null ? "—" : <span key="c" className={s.change >= 0 ? "money" : "loss"}>{signedPct(s.change)}</span>,
                      s.positions.toLocaleString("en-US"), ...(s.prevValue === null ? ["—", "—", "—", "—"] : [s.new, s.added, s.cut, s.soldOut].map(x => x.toLocaleString("en-US")))];
                  })} />
              </Section>
              <section className="block" aria-labelledby="q-h">
                <h2 id="q-h" className="block__h">Largest additions and reductions, every quarter</h2>
                {quarters.slice(0, -1).map((q, i) => {
                  const { adds, cuts } = quarterChanges(quarters[i + 1]!.holdings, q.holdings);
                  return (
                    <article key={q.accession} className="pq">
                      <h3 className="pq__title">{q.period ? `Quarter ending ${calDate(q.period)}` : `Filed ${calDate(q.filedOn)}`}</h3>
                      <p className="note">Versus the quarter before. Filed {calDate(q.filedOn)}. <a href={q.url} target="_blank" rel="noopener noreferrer">See the SEC filing</a></p>
                      <div className="pq__grid"><Changes title="Largest additions" list={adds} /><Changes title="Largest reductions" list={cuts} /></div>
                    </article>
                  );
                })}
              </section>
            </>
          ) : <OlderLocked older={Math.max(0, quarters.length - 1)} what="filings" />}
        </>
      )}
    </SecFrame>
  );
}
