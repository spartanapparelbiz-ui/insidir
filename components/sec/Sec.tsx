/* The SEC research pages' pieces (/filings, /insiders; docs/INSIDIR-V3.md §3): the header, the filter form (a plain GET
 * form, so every view is a link), the two tables, paging, the coverage line, and the Coming soon state. Server
 * components. Every row links to its filing on sec.gov. Facts as filed only: no signals, no price targets, no prices
 * from anywhere but the filing. */
import Link from "next/link";
import type { ReactNode } from "react";
import { SoonForm } from "@/components/app/ComingSoon";
import { CODE_NAMES, TABS, type FilingView, type Query, type TabKey, type TradeView } from "@/lib/stocks/filings";
import { personName } from "@/lib/profiles/name";
import "./sec.css";

export const PAGE_SIZE = 100;

const usd = (v: number | null) => (v === null ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const usd0 = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const price = (v: number | null) => (v === null ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
const count = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const etDate = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(d);
const etTime = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d);
const day = (s: string | null) => (s ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${s}T12:00:00Z`)) : "—");
const short = (acc: string) => `${acc.slice(0, 10)}-${acc.slice(10, 12)}-${acc.slice(12)}`;

/** The relationship as filed: "CEO · Director", "10% owner". */
export function relationship(t: Pick<TradeView, "isDirector" | "isOfficer" | "isTenPercent" | "officerTitle" | "role">): string {
  const parts = [t.isOfficer ? (t.officerTitle?.trim() || "Officer") : null, t.isDirector ? "Director" : null, t.isTenPercent ? "10% owner" : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : t.role.replace(/^(The|An|A) /, "").replace(/^./, c => c.toUpperCase());
}

export function SecHead({ title, sub, current }: { title: string; sub: string; current: "filings" | "insiders" }) {
  return (
    <header className="sec-head">
      <nav className="sec-tabs" aria-label="SEC research">
        <Link href="/filings" aria-current={current === "filings" ? "page" : undefined}>SEC filings</Link>
        <Link href="/insiders" aria-current={current === "insiders" ? "page" : undefined}>Insider activity</Link>
      </nav>
      <h1 className="sec-h1">{title}</h1>
      <p className="sec-sub">{sub}</p>
    </header>
  );
}

/** "Every Form 4 filed from Nov 7, 2025 on, read from SEC EDGAR. New filings within minutes of reaching EDGAR." */
export function Coverage({ since }: { since: string | null }) {
  return (
    <p className="sec-cov" data-testid="sec-coverage">
      {since ? <>Every Form 4 filed from {day(since)} on, read from SEC EDGAR.</> : <>Still reading EDGAR&apos;s daily indexes: these are the Form 4s read so far.</>}{" "}
      New filings appear within minutes of reaching EDGAR. Information, not advice.
    </p>
  );
}

export function Filters({ action, q, tab, codes }: { action: string; q: Query; tab?: TabKey; codes: boolean }) {
  return (
    <form className="sec-filters" method="get" action={action} role="search" data-testid="sec-filters">
      {tab ? <input type="hidden" name="tab" value={tab} /> : null}
      <label><span>Company, ticker or person</span><input name="q" defaultValue={q.q ?? ""} placeholder="Nvidia, NVDA, Huang" maxLength={80} /></label>
      <label><span>Ticker</span><input name="ticker" defaultValue={q.ticker ?? ""} placeholder="NVDA" maxLength={10} autoCapitalize="characters" /></label>
      <label><span>Role</span>
        <select name="role" defaultValue={q.role ?? ""}><option value="">Anyone</option><option value="officer">Officers</option><option value="director">Directors</option><option value="ten">10% owners</option></select>
      </label>
      {codes ? (
        <label><span>Transaction code</span>
          <select name="code" defaultValue={q.code ?? ""}><option value="">Any</option>{Object.entries(CODE_NAMES).map(([c, n]) => <option key={c} value={c}>{c}: {n}</option>)}</select>
        </label>
      ) : null}
      <label><span>From</span><input type="date" name="from" defaultValue={q.from ?? ""} /></label>
      <label><span>To</span><input type="date" name="to" defaultValue={q.to ?? ""} /></label>
      <label><span>Value at least ($)</span><input type="number" name="min" min={0} step={1000} defaultValue={q.min ?? ""} inputMode="numeric" /></label>
      <button type="submit" className="sec-btn">Search</button>
      <Link href={action + (tab && tab !== "open" ? `?tab=${tab}` : "")} className="sec-clear">Clear</Link>
    </form>
  );
}

/** The insider page's tabs, each a link keeping the filters. */
export function Tabs({ tab, href }: { tab: TabKey; href: (t: TabKey) => string }) {
  return (
    <nav className="sec-ttabs" aria-label="Kind of transaction" data-testid="insider-tabs">
      {TABS.map(t => <Link key={t.key} href={href(t.key)} aria-current={t.key === tab ? "page" : undefined} data-tab={t.key}>{t.label}{t.codes.length ? <span> {t.codes.join(" ")}</span> : null}</Link>)}
    </nav>
  );
}

function FilingLink({ url, form, accession }: { url: string; form: string; accession: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" className="sec-link" title={`Accession ${short(accession)} on sec.gov`}>Form {form}<span className="sr-only"> {short(accession)} on sec.gov</span> ↗</a>;
}

const tickerLink = (ticker: string | null) => (ticker ? <Link href={`/insiders?ticker=${encodeURIComponent(ticker)}`} className="sec-tick">{ticker}</Link> : null);

export function TradesTable({ rows, open }: { rows: readonly TradeView[]; open: boolean }) {
  if (!rows.length) return <p className="sec-empty" data-testid="sec-empty">No transactions match.</p>;
  return (
    <div className="sec-wrap">
      <table className="sec-table" data-testid="trades-table">
        <thead><tr>
          <th scope="col">Filed (ET)</th><th scope="col">Traded</th><th scope="col">Company</th><th scope="col">Person</th><th scope="col">Transaction</th>
          {open ? null : <th scope="col">Security</th>}
          <th scope="col" className="r">Shares</th><th scope="col" className="r">Price</th><th scope="col" className="r">Value</th><th scope="col" className="r">Owned after</th>
          <th scope="col">Plan</th><th scope="col">Source</th>
        </tr></thead>
        <tbody>{rows.map(t => (
          <tr key={`${t.accession}:${t.ownerCik}:${t.line}`} data-code={t.code}>
            <td data-label="Filed">{etDate(t.filedAt)}<span className="sec-dim"> {etTime(t.filedAt)}</span></td>
            <td data-label="Traded">{day(t.tradeDate)}</td>
            <td data-label="Company">{t.company} {tickerLink(t.ticker)}</td>
            <td data-label="Person">{personName(t.ownerName)}<span className="sec-dim"> {relationship(t)}</span></td>
            <td data-label="Transaction"><abbr title={CODE_NAMES[t.code] ?? "Code as filed"} className="sec-code">{t.code}</abbr> {open ? (t.code === "P" ? "Purchase" : "Sale") : (CODE_NAMES[t.code] ?? "As filed")}
              {t.acquiredDisposed ? <span className="sec-dim"> ({t.acquiredDisposed === "A" ? "acquired" : "disposed"})</span> : null}</td>
            {open ? null : <td data-label="Security">{t.security ?? "—"}{t.derivative ? <span className="sec-dim"> derivative</span> : null}</td>}
            <td data-label="Shares" className="r">{count(t.shares)}</td>
            <td data-label="Price" className="r">{price(t.price)}</td>
            <td data-label="Value" className="r">{usd(t.value)}</td>
            <td data-label="Owned after" className="r">{count(t.ownedAfter)}{t.direct === false ? <span className="sec-dim"> indirect</span> : null}</td>
            <td data-label="Plan">{t.plan10b5_1 === true ? "10b5-1" : t.plan10b5_1 === false ? "No" : "—"}</td>
            <td data-label="Source"><FilingLink url={t.url} form={t.form} accession={t.accession} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function FilingsTable({ rows }: { rows: readonly FilingView[] }) {
  if (!rows.length) return <p className="sec-empty" data-testid="sec-empty">No filings match.</p>;
  return (
    <div className="sec-wrap">
      <table className="sec-table" data-testid="filings-table">
        <thead><tr>
          <th scope="col">Filed (ET)</th><th scope="col">Form</th><th scope="col">Company</th><th scope="col">Reporting owners</th><th scope="col">Period</th>
          <th scope="col">Codes</th><th scope="col" className="r">Open-market purchases</th><th scope="col" className="r">Open-market sales</th><th scope="col">Source</th>
        </tr></thead>
        <tbody>{rows.map(f => (
          <tr key={f.accession} data-form={f.form}>
            <td data-label="Filed">{etDate(f.filedAt)}<span className="sec-dim"> {etTime(f.filedAt)}</span></td>
            <td data-label="Form">{f.form}
              {f.supersededBy ? <span className="sec-flag" title={`Restated by ${short(f.supersededBy)}`}>Amended</span> : null}
              {f.amends ? <span className="sec-flag sec-flag--dim" title={`Amends ${short(f.amends)}`}>Amendment</span> : null}</td>
            <td data-label="Company">{f.company} {tickerLink(f.ticker)}</td>
            <td data-label="Owners">{f.owners.slice(0, 3).map((o, i) => <span key={i} className="sec-owner">{personName(o.name)}<span className="sec-dim"> {o.role.replace(/^(The|An|A) /, "")}</span></span>)}{f.owners.length > 3 ? <span className="sec-dim"> +{f.owners.length - 3} more</span> : null}</td>
            <td data-label="Period">{day(f.period)}</td>
            <td data-label="Codes">{f.codes.length ? f.codes.map(c => <abbr key={c} title={CODE_NAMES[c] ?? "Code as filed"} className="sec-code">{c}</abbr>) : <span className="sec-dim">Holdings only</span>}</td>
            <td data-label="Purchases" className="r">{f.bought ? usd0(f.bought) : "—"}</td>
            <td data-label="Sales" className="r">{f.sold ? usd0(f.sold) : "—"}</td>
            <td data-label="Source"><FilingLink url={f.url} form={f.form} accession={f.accession} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function Pager({ page, more, href }: { page: number; more: boolean; href: (p: number) => string }) {
  if (page === 1 && !more) return null;
  return (
    <nav className="sec-pager" aria-label="Pages">
      {page > 1 ? <Link href={href(page - 1)} rel="prev">← Newer</Link> : <span />}
      <span className="sec-dim">Page {page}</span>
      {more ? <Link href={href(page + 1)} rel="next">Older →</Link> : <span />}
    </nav>
  );
}

export function Totals({ t }: { t: { bought: number; sold: number; buyers: number; sellers: number; from: string; to: string } }) {
  return (
    <dl className="sec-totals" data-testid="sec-totals">
      <div><dt>Open-market purchases</dt><dd>{usd0(t.bought)}</dd><span className="sec-dim">{t.buyers} {t.buyers === 1 ? "person" : "people"}</span></div>
      <div><dt>Open-market sales</dt><dd>{usd0(t.sold)}</dd><span className="sec-dim">{t.sellers} {t.sellers === 1 ? "person" : "people"}</span></div>
      <div><dt>Traded between</dt><dd className="sec-dd-s">{day(t.from)} and {day(t.to)}</dd><span className="sec-dim">Amended filings counted as restated</span></div>
    </dl>
  );
}

/** Not live yet (docs/INSIDIR-V2.md §2): what it will be, and the waitlist. Nothing from the database is shown. */
export function SecSoon({ title, line }: { title: string; line: string }) {
  return (
    <section className="sec-soon" data-testid="sec-soon">
      <span className="soon">Coming soon</span>
      <h1 className="sec-h1">{title}</h1>
      <p className="sec-sub">{line}</p>
      <div className="sec-soon__form"><SoonForm feature="filings" /></div>
    </section>
  );
}

export function SecPage({ children, testid }: { children: ReactNode; testid: string }) {
  return <div className="sec" data-testid={testid}>{children}</div>;
}
