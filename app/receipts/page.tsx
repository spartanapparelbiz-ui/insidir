/* Receipts: an audited ledger of every deal we've flagged, as it looked when found and how it settled. Wins and
 * misses carry the same weight. Up top: the summary for the chosen period (7 days / 30 days / all time), the
 * cumulative "$500 per green deal" line, how long deals last and when they show up (charts hide with under 7 days of
 * data). Then the ledger with filters (result, category, dates) and Export CSV, both from the same rows under the same
 * paywall (lib/ledger.ts loadLedger): visitors and free members see the public 7 days on their delayed clock; Pro sees
 * everything. Filters are plain links and a GET form, so they work without JS. */
import { redirect } from "next/navigation";
import { isReady } from "@/lib/features";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { LedgerTable, type LedgerItem } from "@/components/receipts/LedgerTable";
import { LifeHistogram } from "@/components/receipts/LifeHistogram";
import { ProfitChart, type ChartPoint } from "@/components/receipts/ProfitChart";
import { WhenHeatmap } from "@/components/receipts/WhenHeatmap";
import { requireMember } from "@/lib/auth/viewer";
import { unlockHref } from "@/components/app/links";
import { UNLOCK } from "@/lib/copy";
import {
  CHART_MIN_DAYS, cents1, cumulative, DAY_MS, dataSince, hiddenFor, lifeHistogram, loadLedger, outcomeOf, outcomeText, outlayOf, PAGE_ROWS, PERIODS, pct2,
  pricesText, receiptId, rulesCheckText, summary, usd2, utcStamp, whenGrid, type LedgerRow,
} from "@/lib/ledger";
import { entitlements } from "@/lib/plans";
import { VENUE_NAME } from "@/lib/types";
import "@/components/app/terminal.css";
import "./receipts.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receipts", description: "Every deal Insidir has flagged, as it looked when found, and how it settled. Wins and misses, with the same weight." };

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function item(r: LedgerRow, sizesHidden: boolean): LedgerItem {
  const o = r.snapshot;
  const hide = hiddenFor(r, sizesHidden);
  const res = (venue: string, id: string) => {
    const v = r.results?.[`${venue}:${id}`];
    return v === "yes" ? "YES won" : v === "no" ? "NO won" : v === "void" ? "Voided (refunded)" : "Not settled yet";
  };
  return {
    id: r.id, rid: receiptId(r.id), foundAt: utcStamp(r.detectedAt), title: o.title, safety: o.safety, prices: pricesText(o, VENUE_NAME),
    size: hide ? null : usd2(outlayOf(o)), profit: hide ? null : usd2(o.profit), outcome: outcomeText(r), outcomeKind: outcomeOf(r), check: rulesCheckText(r),
    legs: o.legs.map(l => ({
      venue: l.venue, venueName: VENUE_NAME[l.venue], side: l.side, label: l.label, contracts: hide ? null : Math.floor(l.contracts).toLocaleString("en-US"),
      avg: cents1(l.avgPrice), worst: hide ? null : cents1(l.worstPrice), cost: hide ? null : usd2(l.cost), fee: hide ? null : usd2(l.fee), result: res(l.venue, l.marketId), url: l.url,
    })),
  };
}

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const params = await searchParams;
  // Receipts were the price-gap log; V2's proof page is Results. Price gaps (Pro) bring their log back when ready.
  if (!isReady("price_gaps")) redirect("/results");
  const viewer = await requireMember("/receipts");
  const [ledger, since] = await Promise.all([loadLedger(viewer.plan, viewer.region, params, now), dataSince()]);
  const s = summary(ledger.periodRows);
  const sizesHidden = entitlements(viewer.plan).sizesHidden;
  const enough = since !== null && now - since >= CHART_MIN_DAYS * DAY_MS;
  const curve = cumulative(ledger.periodRows);
  const points: ChartPoint[] = curve.map(p => ({ at: p.at, value: p.value, label: p.title, valueText: usd2(p.value), dateText: DAY.format(new Date(p.at)) }));
  const life = lifeHistogram(ledger.periodRows);
  const when = whenGrid(ledger.periodRows);
  const f = ledger.filters;
  const q = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ period: ledger.period, ...(f.result !== "all" ? { result: f.result } : {}), ...(f.category ? { category: f.category } : {}),
      ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...extra });
    return u.toString();
  };
  const filtered = f.result !== "all" || f.category || f.from || f.to;
  const shown = ledger.rows.slice(0, PAGE_ROWS);
  const pro = ledger.access.periods.includes("all");
  const last = points[points.length - 1];

  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} current="/receipts" />
      <main className="wrap rx">
        <header className="rx-head">
          <h1 className="rx-h">Receipts: every deal we&apos;ve ever flagged.</h1>
          <p className="rx-sub">Each deal as it looked when we found it, and how it settled on both apps. Wins and misses, side by side.{pro ? "" : " You see the last 7 days, 30 minutes late."}</p>
        </header>

        <nav className="rx-tabs" aria-label="Period">
          {PERIODS.map(p => {
            const can = ledger.access.periods.includes(p.key);
            return can
              ? <Link key={p.key} href={`/receipts?${q({ period: p.key })}`} className="rx-tab" aria-current={ledger.period === p.key ? "page" : undefined} scroll={false}>{p.label}</Link>
              : <a key={p.key} href={unlockHref()} className="rx-tab rx-tab--locked" data-unlock={`receipts-${p.key}`} title="Members see the full history">{p.label} <span className="sr-only">(members)</span><span aria-hidden="true" className="rx-tab__pro">Members</span></a>;
          })}
        </nav>

        <dl className="rx-sum" aria-label={`Summary, ${PERIODS.find(p => p.key === ledger.period)?.label.toLowerCase()}`}>
          <div><dt>Deals flagged</dt><dd>{s.flagged.toLocaleString("en-US")}</dd></div>
          <div><dt>Settled</dt><dd>{s.settled.toLocaleString("en-US")}</dd></div>
          {s.follow ? <div><dt>$500 per green deal, after fees</dt><dd className={s.follow.realizedProfit >= 0 ? "rx-sum__main" : ""}>{(s.follow.realizedProfit >= 0 ? "+" : "") + usd2(s.follow.realizedProfit)}</dd></div> : null}
          {s.winRate !== null ? <div><dt>Settled the same way</dt><dd>{pct2(s.winRate)}</dd></div> : null}
          {s.medianLifeMin !== null ? <div><dt>Median deal life</dt><dd>{s.medianLifeMin < 10 ? s.medianLifeMin.toFixed(1) : Math.round(s.medianLifeMin)} min</dd></div> : null}
        </dl>
        {s.follow ? <p className="rx-note">The $500 line: every green deal in this period taken at $500 (or less, if that&apos;s all the books could fill when we found it), after fees, at its real result. {s.follow.pending ? `${s.follow.pending} still open, not counted.` : ""}</p> : null}

        {enough && (points.length >= 2 || life.n || when.n) ? (
          <section className="rx-charts" aria-label="Charts">
            {points.length >= 2 ? <ProfitChart points={points} summary={`Cumulative profit following every green deal with $500, after fees: ${points.length} settled deals from ${points[0]!.dateText} to ${last!.dateText}, ending at ${last!.valueText}.`} /> : null}
            <div className="rx-charts__two">
              {life.n ? <LifeHistogram counts={life.counts} medianMin={life.medianMin} n={life.n} /> : null}
              {when.n ? <WhenHeatmap grid={when.grid} max={when.max} n={when.n} /> : null}
            </div>
          </section>
        ) : null}

        <section className="rx-ledger" aria-labelledby="ledger-h">
          <div className="rx-ledger__top">
            <h2 id="ledger-h" className="rx-h2">Ledger</h2>
            <a className="btn btn--secondary rx-csv" href={`/api/receipts/csv?${q({})}`} download="receipts.csv" data-testid="export-csv">Export CSV</a>
          </div>
          <form className="rx-filters" method="get" action="/receipts">
            <input type="hidden" name="period" value={ledger.period} />
            <label className="tbar__field">Result
              <select name="result" className={`input${f.result !== "all" ? " input--on" : ""}`} defaultValue={f.result}>
                <option value="all">All</option><option value="won">Settled the same way</option><option value="differently">Settled differently</option><option value="open">Open</option>
              </select>
            </label>
            <label className="tbar__field">Category
              <select name="category" className={`input${f.category ? " input--on" : ""}`} defaultValue={f.category}>
                <option value="">All</option>
                {ledger.categories.map(c => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
              </select>
            </label>
            <label className="tbar__field">From<input type="date" name="from" className={`input${f.from ? " input--on" : ""}`} defaultValue={f.from} /></label>
            <label className="tbar__field">To<input type="date" name="to" className={`input${f.to ? " input--on" : ""}`} defaultValue={f.to} /></label>
            <button type="submit" className="btn btn--primary rx-apply">Show receipts</button>
            {filtered ? <Link className="btn btn--ghost rx-apply" href={`/receipts?period=${ledger.period}`}>Clear filters</Link> : null}
          </form>
          {shown.length ? (
            <>
              <LedgerTable items={shown.map(r => item(r, sizesHidden))} />
              <p className="rx-note">{ledger.rows.length > shown.length ? `Showing the newest ${shown.length} of ${ledger.rows.length.toLocaleString("en-US")}. Export CSV for all of them.` : `${ledger.rows.length.toLocaleString("en-US")} ${ledger.rows.length === 1 ? "receipt" : "receipts"}.`} Times are UTC.</p>
            </>
          ) : (
            <div className="dt-empty">
              <p className="dt-empty__h">{filtered ? "No receipts match these filters" : "No receipts in this period yet"}</p>
              <p className="muted small">{filtered ? "Try a wider date range or another result." : "Every deal the scanner flags is logged here as it's found."}</p>
              {filtered ? <Link className="btn btn--secondary" href={`/receipts?period=${ledger.period}`}>Clear filters</Link> : <Link className="btn btn--secondary" href="/terminal">Open the Terminal</Link>}
            </div>
          )}
          {!pro ? <p className="rx-note">Members see every receipt since launch. <a href={unlockHref()} data-unlock="receipts-footer">{UNLOCK}</a></p> : null}
        </section>
      </main>
    </>
  );
}
