/* People (/people/<CIK>; docs/INSIDIR-V3.md §3): an officer, director or 10% owner by their SEC reporting-owner CIK,
 * every company they file Forms 3, 4 and 5 for, their relationship there as last filed, and their open-market trades.
 * Only what the filings say. Members only, and Coming soon until `people` is in FEATURES_READY (it is built from the
 * Form 3/4/5 database, so it goes live with or after `filings`). */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { WatchButton } from "@/components/sec/Actions";
import { fmt, relationship, SecHead, SecPage, SecSoon, SoonLine, TradesTable } from "@/components/sec/Sec";
import { secViewer } from "@/components/sec/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { personName } from "@/lib/profiles/name";
import { openMarketTotals, searchTrades } from "@/lib/stocks/filings";
import { personByCik } from "@/lib/stocks/people";
import { listsFor } from "@/lib/stocks/watchlists";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "People", robots: { index: false } };

export default async function PersonPage({ params }: { params: Promise<{ cik: string }> }) {
  const { paid, unread, userId } = await secViewer();
  if (!isReady("people")) {
    return (
      <Frame member={paid} current="board" testid="person-page">
        <SecSoon title="People" line="Officers, directors and 10% owners across every board they sit on, from their own Forms 3, 4 and 5." />
      </Frame>
    );
  }
  if (!paid) redirect("/go");
  const { cik: raw } = await params;
  if (!/^\d{1,10}$/.test(raw) || !hasDatabase()) notFound();
  const db = getDb(), now = Date.now();
  const person = await personByCik(db, raw).catch(() => null);
  if (!person) notFound();
  const [trades, totals, lists] = await Promise.all([
    searchTrades(db, "open", { owner: person.cik }, { limit: 50 }).catch(() => []),
    openMarketTotals(db, { owner: person.cik, from: new Date(now - 365 * 86_400_000).toISOString().slice(0, 10) }, now).catch(() => null),
    userId && isReady("watchlists") ? listsFor(db, userId).catch(() => []) : Promise.resolve([]),
  ]);
  const name = personName(person.name);
  return (
    <Frame member current="board" testid="person-page">
      <SecPage testid="person">
        <SecHead current="people" unread={unread} title={name} sub={`Reporting owner CIK ${person.cik}. ${person.seats.length} ${person.seats.length === 1 ? "company" : "companies"} on their Forms 3, 4 and 5.`}>
          <div className="sec-actions">
            <a className="sec-link" href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${person.cik}&type=4&owner=include&count=40`} target="_blank" rel="noopener noreferrer">Their filings on EDGAR ↗</a>
            {isReady("watchlists") ? <WatchButton kind="person" cik={person.cik} label={name} lists={lists.map(l => ({ id: l.id, name: l.name }))} /> : <SoonLine what="Watchlists and signals" />}
          </div>
        </SecHead>

        <section className="sec-section" aria-labelledby="seats-h">
          <h2 id="seats-h" className="sec-h2">Companies</h2>
          <div className="sec-wrap">
            <table className="sec-table" data-testid="person-seats">
              <thead><tr><th scope="col">Company</th><th scope="col">Relationship, as last filed</th><th scope="col">First filing</th><th scope="col">Latest filing</th><th scope="col" className="r">Filings</th><th scope="col">Source</th></tr></thead>
              <tbody>{person.seats.map(s => (
                <tr key={s.issuerCik}>
                  <td data-label="Company">{s.ticker ? <Link href={`/company/${encodeURIComponent(s.ticker)}`}>{s.company} <span className="sec-tick">{s.ticker}</span></Link> : <Link href={`/company/cik-${s.issuerCik}`}>{s.company}</Link>}</td>
                  <td data-label="Relationship">{relationship({ ...s, isTenPercent: s.isTenPercent })}</td>
                  <td data-label="First filing">{fmt.etDate(s.firstFiled)}</td>
                  <td data-label="Latest filing">{fmt.etDate(s.lastFiled)}</td>
                  <td data-label="Filings" className="r">{s.filings}</td>
                  <td data-label="Source"><a className="sec-link" href={s.lastUrl} target="_blank" rel="noopener noreferrer">Form {s.lastForm} ↗</a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="sec-msg">From the Forms 3, 4 and 5 Insidir has read. A board seat with no such filing in that time doesn&apos;t show.</p>
        </section>

        <section className="sec-section" aria-labelledby="trades-h">
          <h2 id="trades-h" className="sec-h2">Open-market trades</h2>
          {totals ? <p className="sec-cov">Last 12 months: {fmt.usd0(totals.bought)} of open-market purchases, {fmt.usd0(totals.sold)} of sales, as filed.</p> : null}
          <TradesTable rows={trades} open />
          <p className="sec-msg"><Link className="sec-link" href={`/insiders?owner=${person.cik}&tab=exercises`}>Their option exercises, grants and other transactions</Link></p>
        </section>
        <p className="sec-cov">Only what their SEC filings say. Information, not advice.</p>
      </SecPage>
    </Frame>
  );
}
