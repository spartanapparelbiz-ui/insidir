/* Company report (/company/<TICKER>, or /company/cik-<CIK> for a registrant without one; docs/INSIDIR-V3.md §3): the
 * registrant as EDGAR describes it, its financials (trailing twelve months where the filings support it), its filings,
 * its insiders' open-market trades, and the member's own journal entry and watchlists. Everything from SEC filings; the
 * price chart is Coming soon until a price vendor is licensed. A visit asks the worker to read the company if its data
 * is more than a day old. Members only, and Coming soon until the financials accuracy check passes
 * (lib/accuracy/companies.ts, FEATURES_READY `companies`). */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { JournalPanel, WatchButton } from "@/components/sec/Actions";
import { fmt, PAGE_SIZE, personLink, SecHead, SecPage, SecSoon, SoonLine, TradesTable } from "@/components/sec/Sec";
import { secViewer } from "@/components/sec/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { entryFor } from "@/lib/journal";
import { companyByCik, companyByTicker, EIGHT_K_ITEMS, factSource, factsFor, filingsFor, FILING_GROUPS, financials, fiscalYearEnd, wantCompanies, type CompanyRow, type Figure } from "@/lib/stocks/company";
import { searchTrades } from "@/lib/stocks/filings";
import { listsFor } from "@/lib/stocks/watchlists";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Company report", robots: { index: false } };

type Params = Record<string, string | string[] | undefined>;
const DAY = 86_400_000;

/** "$87,922M" for big dollar figures (the exact value in the title), "$6.62" per share, shares in full. */
function shown(f: Figure): { text: string; exact: string } {
  const exact = f.unit === "shares" ? Math.round(f.value).toLocaleString("en-US") : `$${f.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (f.unit === "USD/shares") return { text: `$${f.value.toFixed(2)}`, exact };
  if (f.unit === "USD" && Math.abs(f.value) >= 1e6) return { text: `${f.value < 0 ? "−" : ""}$${Math.round(Math.abs(f.value) / 1e6).toLocaleString("en-US")}M`, exact };
  return { text: f.unit === "shares" ? exact : exact.replace(/^\$-/, "−$"), exact };
}
/** "Sep 2026": which period a source filing covers, so two 10-Qs a year apart read differently. */
const periodTag = (end: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", year: "numeric" }).format(new Date(`${end}T12:00:00Z`));
const basis = (f: Figure) => (f.basis === "ttm" ? `12 months to ${fmt.day(f.periodEnd)}` : f.basis === "fy" ? `Fiscal year to ${fmt.day(f.periodEnd)}` : `As of ${fmt.day(f.periodEnd)}`);

async function load(raw: string): Promise<CompanyRow | null | "redirect"> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const m = /^cik-(\d{1,10})$/i.exec(raw);
  if (m) return companyByCik(db, m[1]!);
  const t = decodeURIComponent(raw).toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(t)) return null;
  if (t !== decodeURIComponent(raw)) return "redirect";
  return companyByTicker(db, t);
}

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<Params> }) {
  const { paid, unread, userId } = await secViewer();
  if (!isReady("companies")) {
    return (
      <Frame member={paid} current="board" testid="company-page">
        <SecSoon title="Company reports" line="A company's trailing-twelve-month financials, every filing and its insiders' trades on one page, straight from SEC EDGAR." />
      </Frame>
    );
  }
  if (!paid) redirect("/go");
  const { ticker: raw } = await params;
  const co = await load(raw);
  if (co === "redirect") permanentRedirect(`/company/${encodeURIComponent(decodeURIComponent(raw).toUpperCase())}`);
  if (!co) notFound();
  const db = getDb(), now = Date.now();
  if (!co.refreshedAt || co.refreshedAt.getTime() < now - DAY) await wantCompanies(db, [co.cik], now).catch(() => undefined);
  const sp = await searchParams;
  const group = FILING_GROUPS.find(g => g.key === sp.filings) ?? FILING_GROUPS[0]!;
  const ticker = co.tickers[0] ?? null;
  const [facts, filings, trades, insiders, lists, entry] = await Promise.all([
    factsFor(db, co.cik).catch(() => []),
    filingsFor(db, co.cik, group.forms, 100).catch(() => []),
    searchTrades(db, "open", { issuer: co.cik }, { limit: 15 }).catch(() => []),
    db.execute(sql`select distinct on (o.value->>'cik') o.value->>'cik' as cik, o.value->>'name' as name, o.value->>'role' as role, f.filed_at
      from terminal.filings f, jsonb_array_elements(f.owners) o where f.issuer_cik = ${co.cik} and f.filed_at > ${new Date(now - 730 * DAY)} and o.value->>'cik' is not null
      order by o.value->>'cik', f.filed_at desc`).then(r => (r.rows as Array<{ cik: string; name: string; role: string; filed_at: string }>).sort((a, b) => b.filed_at.localeCompare(a.filed_at)).slice(0, 30)).catch(() => []),
    userId && isReady("watchlists") ? listsFor(db, userId).catch(() => []) : Promise.resolve([]),
    userId && isReady("journal") ? entryFor(db, userId, co.cik).catch(() => null) : Promise.resolve(null),
  ]);
  const figures = financials(facts);
  const reading = !co.refreshedAt;
  return (
    <Frame member current="board" testid="company-page">
      <SecPage testid="company">
        <SecHead current="company" unread={unread} title={`${co.name}${ticker ? ` · ${ticker}` : ""}`}
          sub={co.sicDescription ? `${co.sicDescription}. From the company's own SEC filings.` : "From the company's own SEC filings."}>
          <dl className="sec-meta" data-testid="company-meta">
            {co.tickers.length ? <div><dt>Tickers</dt><dd>{co.tickers.join(", ")}</dd></div> : null}
            {co.exchanges.length ? <div><dt>Exchange</dt><dd>{co.exchanges.join(", ")}</dd></div> : null}
            <div><dt>CIK</dt><dd>{co.cik}</dd></div>
            {fiscalYearEnd(co.fiscalYearEnd) ? <div><dt>Fiscal year ends</dt><dd>{fiscalYearEnd(co.fiscalYearEnd)}</dd></div> : null}
            {co.stateOfIncorporation ? <div><dt>Incorporated</dt><dd>{co.stateOfIncorporation}</dd></div> : null}
            {co.category ? <div><dt>Filer</dt><dd>{co.category}</dd></div> : null}
          </dl>
          <div className="sec-actions">
            <a className="sec-link" href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${co.cik}&owner=include&count=40`} target="_blank" rel="noopener noreferrer">Every filing on EDGAR ↗</a>
            {isReady("watchlists") ? <WatchButton kind="company" cik={co.cik} label={`${co.name}${ticker ? ` (${ticker})` : ""}`} lists={lists.map(l => ({ id: l.id, name: l.name }))} /> : <SoonLine what="Watchlists and alerts" />}
          </div>
        </SecHead>

        {reading ? <p className="sec-cov" data-testid="company-reading">Reading this company from SEC EDGAR now. Its financials and filings appear within a few minutes.</p> : null}

        <section className="sec-section" aria-labelledby="chart-h">
          <h2 id="chart-h" className="sec-h2">Price</h2>
          <SoonLine what="A delayed price chart, once its prices come from a licensed source." />
        </section>

        <section className="sec-section" aria-labelledby="fin-h">
          <h2 id="fin-h" className="sec-h2">Financials</h2>
          {figures.length ? (
            <div className="sec-wrap">
              <table className="sec-table sec-fin" data-testid="financials">
                <thead><tr><th scope="col">Line</th><th scope="col" className="r">Value</th><th scope="col">Period</th><th scope="col">Reported as</th><th scope="col">Source</th></tr></thead>
                <tbody>{figures.map(f => { const v = shown(f); return (
                  <tr key={f.metric} data-metric={f.metric} data-basis={f.basis}>
                    <th scope="row" data-label="Line">{f.label}</th>
                    <td data-label="Value" className="r" title={v.exact}>{v.text}</td>
                    <td data-label="Period">{basis(f)}</td>
                    <td data-label="Reported as" className="sec-dim">{f.concept}</td>
                    <td data-label="Source">{f.sources.map((s, i) => <a key={i} className="sec-link" href={factSource(co.cik, s)} target="_blank" rel="noopener noreferrer" title={`${s.form} filed ${s.filed}: ${s.start ? `${s.start} to ` : ""}${s.end}`}>{s.form} {periodTag(s.end)} ↗ </a>)}</td>
                  </tr>); })}</tbody>
              </table>
            </div>
          ) : <p className="sec-empty">{reading ? "Not read yet." : co.factsAt ? "No US GAAP figures in this company's 10-K and 10-Q filings for the last few years." : "This company files no XBRL financial data with the SEC (often a foreign private issuer or a fund)."}</p>}
          <p className="sec-msg">Twelve-month figures are the latest annual report plus this fiscal year to date, less the same months a year earlier, each as most recently filed. Where a filing for one of those is missing, the latest fiscal year is shown instead. Per-share figures are the fiscal year as filed.</p>
        </section>

        <section className="sec-section" aria-labelledby="filings-h">
          <h2 id="filings-h" className="sec-h2">Filings</h2>
          <nav className="sec-chips" aria-label="Filing type">{FILING_GROUPS.map(g => <Link key={g.key} href={`?filings=${g.key}`} aria-current={g.key === group.key ? "page" : undefined}>{g.label}</Link>)}</nav>
          {filings.length ? (
            <div className="sec-wrap">
              <table className="sec-table" data-testid="company-filings">
                <thead><tr><th scope="col">Filed</th><th scope="col">Form</th><th scope="col">What</th><th scope="col">Period</th><th scope="col">Source</th></tr></thead>
                <tbody>{filings.map(f => (
                  <tr key={f.accession} data-form={f.form}>
                    <td data-label="Filed">{fmt.day(f.filedOn)}</td>
                    <td data-label="Form">{f.form}</td>
                    <td data-label="What">{f.items ? f.items.split(",").map(i => i.trim()).filter(Boolean).map(i => `${i} ${EIGHT_K_ITEMS[i] ?? ""}`.trim()).join(" · ") : (f.description ?? "—")}</td>
                    <td data-label="Period">{fmt.day(f.reportDate)}</td>
                    <td data-label="Source"><a className="sec-link" href={f.url} target="_blank" rel="noopener noreferrer">{f.form} ↗</a></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="sec-empty">{reading ? "Not read yet." : "No filings of this type in the last two years."}</p>}
        </section>

        <section className="sec-section" aria-labelledby="ins-h">
          <h2 id="ins-h" className="sec-h2">Insiders' open-market trades</h2>
          <TradesTable rows={trades.slice(0, PAGE_SIZE)} open />
          {ticker ? <p className="sec-msg"><Link className="sec-link" href={`/insiders?ticker=${encodeURIComponent(ticker)}`}>All insider activity at {co.name}, with exercises, grants and the rest</Link></p> : null}
          {insiders.length ? (
            <ul className="sec-meta" aria-label="People who filed for this company in the last two years" data-testid="company-insiders">
              {insiders.map(p => <li key={p.cik}>{personLink(p.cik, p.name)} <span className="sec-dim">{p.role.replace(/^(The|An|A) /, "")}</span></li>)}
            </ul>
          ) : null}
        </section>

        <section className="sec-section" aria-labelledby="journal-h">
          <h2 id="journal-h" className="sec-h2">Your journal</h2>
          {isReady("journal") ? <JournalPanel cik={co.cik} status={entry?.status ?? null} note={entry?.note ?? ""} updated={entry ? fmt.etDate(entry.updatedAt) : null} /> : <SoonLine what="Your private notes and status on this company." />}
        </section>
        <p className="sec-cov">Information, not advice. Insidir is not a broker or investment adviser.</p>
      </SecPage>
    </Frame>
  );
}
