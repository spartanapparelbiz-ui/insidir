/* /record: the public record, on the terminal. Every position that ever hit the board or was flagged (millionaire, pro,
 * unusual bet, disagreement), losses included, never filtered out or deleted (terminal.record_log, lib/record). The
 * summary is computed from every row in the filter; the default view is the last 30 days. Open positions' sides (and the
 * prices, move and on-chain links that would give them away) are for members; settled positions are public. Members can
 * download the filter as CSV (/record/csv). */
import type { Metadata } from "next";
import { Frame } from "@/components/brand/app/Frame";
import { TierBadge } from "@/components/brand/Bits";
import { Verify } from "@/components/brand/Verify";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { PAST } from "@/lib/brand/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";
import { CATEGORY_OPTIONS, etStamp, FLAG_NAME, FLAGS, filterQuery, PAGE_SIZE, readFilter, recordRows, recordSummary, recordView, RESULTS, type RecordSummary, type RecordView } from "@/lib/record/query";
import "../flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "The record: every position we've flagged",
  description: "Every position Insidir has flagged, losses included, with links to the on-chain trade. Past results don't predict future ones.",
  alternates: { canonical: "/record" },
};

const cents = (p: number | null) => (p === null ? "—" : `${Math.round(p * 100)}¢`);
const RESULT_NAME: Record<string, string> = { won: "Won", lost: "Lost", sold: "Sold", void: "Void", open: "Open" };

function Summary({ s }: { s: RecordSummary }) {
  return (
    <dl className="tg-kpis" data-testid="record-summary">
      <div className="tg-kpi"><dt className="t-label">Positions logged</dt><dd className="tg-kpi__n" data-testid="record-logged">{s.logged.toLocaleString("en-US")}</dd></div>
      <div className="tg-kpi"><dt className="t-label">Settled that won</dt><dd className="tg-kpi__n" data-testid="record-won-share">{s.wonShare === null ? "—" : `${Math.round(s.wonShare * 100)}%`}</dd><dd className="tg-kpi__s">of {s.settled.toLocaleString("en-US")} settled ({s.won} won, {s.lost} lost)</dd></div>
      <div className="tg-kpi"><dt className="t-label">Median move since flagged</dt><dd className={`tg-kpi__n ${s.medianMove ? (s.medianMove > 0 ? "t-up" : "t-down") : ""}`} data-testid="record-median">{s.medianMove === null ? "—" : `${s.medianMove > 0 ? "+" : s.medianMove < 0 ? "−" : "±"}${Math.abs(s.medianMove)}¢`}</dd></div>
      <div className="tg-kpi"><dt className="t-label">Open</dt><dd className="tg-kpi__n">{s.open.toLocaleString("en-US")}</dd><dd className="tg-kpi__s">{s.sold} sold · {s.void} void</dd></div>
    </dl>
  );
}

function Row({ r, member, polymarket }: { r: RecordView; member: boolean; polymarket: boolean }) {
  const move = r.moveCents;
  return (
    <tr data-testid="record-row" data-result={r.result}>
      <td className="t-muted">{etStamp(r.flaggedAt)}</td>
      <td className="tg-mkt">
        <a href={marketPath(r.marketId, r.market)}>{r.market}</a>
        <span className="tg-flags">{r.flags.map(f => <span key={f} className="tg-tag">{FLAG_NAME[f as keyof typeof FLAG_NAME] ?? f}</span>)}</span>
      </td>
      <td>{r.categoryName}</td>
      <td><span className="tg-who">{r.tier === "new" ? <span className="tg-tag">New wallet</span> : <TierBadge tier={r.tier as "millionaire" | "pro"} />}<span>{r.short}</span></span></td>
      <td>{r.outcome ?? <span className="tg-side-members" data-locked="side">{member ? "" : "MEMBERS"}</span>}</td>
      <td className="r">{cents(r.entryPrice)}</td>
      <td className="r t-strong">{dollars(r.size)}</td>
      <td className="r">{cents(r.result === "sold" ? r.exitPrice : r.priceNow)}</td>
      <td className={`r${move ? (move > 0 ? " t-up" : " t-down") : ""}`}>{move === null ? "—" : `${move > 0 ? "+" : move < 0 ? "−" : "±"}${Math.abs(move)}¢`}</td>
      <td><span className={`tg-res tg-res--${r.result}`}>{RESULT_NAME[r.result]}</span></td>
      <td className="tg-verify"><Verify v={r.verify} marketId={r.marketId} polymarket={polymarket} compact /></td>
    </tr>
  );
}

export default async function RecordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [q, viewer] = await Promise.all([searchParams, getViewer()]);
  const now = Date.now(), member = isPaid(viewer.plan) && Boolean(viewer.user), polymarket = viewer.region === "non_us";
  const f = readFilter(q, now), page = Math.max(1, Number(typeof q.page === "string" ? q.page : 1) || 1);
  const db = hasDatabase() ? getDb() : null;
  const [summary, rows] = db ? await Promise.all([recordSummary(db, f), recordRows(db, f, { page })]).catch(e => { console.error("record", e instanceof Error ? e.message : e); return [null, []] as const; }) : [null, []] as const;
  const shown = rows.slice(0, PAGE_SIZE).map(r => recordView(r, member));
  const more = rows.length > PAGE_SIZE;
  const sel = (name: string, value: string | null, options: Array<{ value: string; label: string }>, all: string) => (
    <label className="tg-field"><span>{all}</span>
      <select name={name} defaultValue={value ?? ""}><option value="">All</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  );
  const SRC = "Polymarket public data · Polygon chain · Kalshi";
  return (
    <Frame member={member} current="board" testid="record-page">
      <div className="t-wrap tg-page">
        <header className="tg-head" data-testid="record-hero">
          <h1 className="tg-h1" id="record-h">The record.</h1>
          <p className="tg-sub" data-testid="record-disclaimer">Every position we&apos;ve flagged, losses included. Past results don&apos;t predict future ones. Information, not advice.</p>
        </header>
        <PanelGrid>
          <Panel n={1} title="Summary · every position in this filter" meta={`${f.from} → ${f.to} ET`} span={3} testid="record-summary-panel" source={SRC} fetchedAt={now}
            empty={summary ? null : "No record to read right now."}>
            {summary ? <Summary s={summary} /> : null}
            <p className="tg-note">From every position in this filter ({f.from} to {f.to}, ET){f.wallet ? `, wallet ${f.wallet.slice(0, 6)}…${f.wallet.slice(-4)}` : ""}. &ldquo;Won&rdquo; counts markets that settled; sold positions closed at the wallet&apos;s exit price. {PAST}</p>
          </Panel>
          <Panel n={2} title="Every position" meta={`${shown.length}${more ? "+" : ""} rows · page ${page}`} span={3} testid="record-table" source={SRC} fetchedAt={now}>
            <p className="tg-note" style={{ marginTop: 0 }}>Open positions show their side to members; settled ones are public. Verify opens the trade on Polygonscan and the market on its exchange.</p>
            <form className="tg-form tg-filters" method="get" action="/record" data-testid="record-filters">
              <div className="tg-fields">
                {sel("category", f.category, CATEGORY_OPTIONS, "Category")}
                {sel("tier", f.tier, [{ value: "millionaire", label: "Millionaire" }, { value: "pro", label: "Pro" }, { value: "new", label: "New wallet" }], "Tier")}
                {sel("flag", f.flag, FLAGS.map(x => ({ value: x, label: FLAG_NAME[x] })), "Flag")}
                {sel("result", f.result, RESULTS.map(x => ({ value: x, label: RESULT_NAME[x]! })), "Result")}
                <label className="tg-field"><span>From</span><input type="date" name="from" defaultValue={f.from} /></label>
                <label className="tg-field"><span>To</span><input type="date" name="to" defaultValue={f.to} /></label>
              </div>
              {f.wallet ? <input type="hidden" name="wallet" value={f.wallet} /> : null}
              <div className="tg-row" style={{ marginTop: 0 }}>
                <button type="submit" className="tg-btn">Apply</button>
                <a className="t-btn2" href="/record">Reset</a>
                {member ? <a className="t-btn2" href={`/record/csv?${filterQuery(f)}`} data-testid="record-csv">Download CSV</a> : null}
              </div>
            </form>
            {shown.length ? (
              <div className="t-scroll tg-tablebox">
                <table className="t-table">
                  <thead><tr><th scope="col">Flagged (ET)</th><th scope="col">Market</th><th scope="col">Category</th><th scope="col">Wallet</th><th scope="col">Side</th>
                    <th scope="col" className="r">Entry</th><th scope="col" className="r">Size</th><th scope="col" className="r">Now / settle</th><th scope="col" className="r">Move</th><th scope="col">Result</th><th scope="col">Verify</th></tr></thead>
                  <tbody data-testid="record-rows">{shown.map(r => <Row key={r.id} r={r} member={member} polymarket={polymarket} />)}</tbody>
                </table>
              </div>
            ) : <p className="t-empty">No position in this filter.</p>}
            <div className="tg-row">
              {page > 1 ? <a className="t-btn2" href={`/record?${filterQuery(f, { page: String(page - 1) })}`}>Newer</a> : null}
              {more ? <a className="t-btn2" href={`/record?${filterQuery(f, { page: String(page + 1) })}`} data-testid="record-older">Older</a> : null}
            </div>
            <p className="tg-note">A wallet is only ever its tier and short address. Prices are Polymarket&apos;s for the side taken, fetched at the time shown. Information, not advice.</p>
          </Panel>
        </PanelGrid>
      </div>
    </Frame>
  );
}
