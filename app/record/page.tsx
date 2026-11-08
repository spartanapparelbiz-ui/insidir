/* /record: the public record. Every position that ever hit the board or was flagged (millionaire, pro, unusual bet,
 * disagreement), losses included, never filtered out or deleted (terminal.record_log, lib/record). The summary is
 * computed from every row in the filter; the default view is the last 30 days. Open positions' sides (and the prices,
 * move and on-chain links that would give them away) are for members; settled positions are public. Members can
 * download the filter as CSV (/record/csv). */
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Frame } from "@/components/brand/app/Frame";
import { TierBadge } from "@/components/brand/Bits";
import { Verify } from "@/components/brand/Verify";
import { Lines, Stage } from "@/components/system";
import { getViewer } from "@/lib/auth/viewer";
import { PAST } from "@/lib/brand/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { marketPath } from "@/lib/entities/slug";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";
import { CATEGORY_OPTIONS, etStamp, FLAG_NAME, FLAGS, filterQuery, PAGE_SIZE, readFilter, recordRows, recordSummary, recordView, RESULTS, type RecordSummary, type RecordView } from "@/lib/record/query";

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
    <div className="b-stats b-stats--4" data-testid="record-summary">
      <div className="b-stat"><span className="b-stat__n b-num" data-testid="record-logged">{s.logged.toLocaleString("en-US")}</span><span className="b-small">positions logged</span></div>
      <div className="b-stat"><span className="b-stat__n b-num" data-testid="record-won-share">{s.wonShare === null ? "—" : `${Math.round(s.wonShare * 100)}%`}</span><span className="b-small">of {s.settled.toLocaleString("en-US")} settled won ({s.won} won, {s.lost} lost)</span></div>
      <div className="b-stat"><span className="b-stat__n b-num" data-testid="record-median">{s.medianMove === null ? "—" : `${s.medianMove > 0 ? "+" : s.medianMove < 0 ? "−" : "±"}${Math.abs(s.medianMove)}¢`}</span><span className="b-small">median move since flagged</span></div>
      <div className="b-stat"><span className="b-stat__n b-num">{s.open.toLocaleString("en-US")}</span><span className="b-small">open · {s.sold} sold · {s.void} void</span></div>
    </div>
  );
}

function Row({ r, member, polymarket }: { r: RecordView; member: boolean; polymarket: boolean }) {
  const move = r.moveCents;
  return (
    <li className="b-rec__row" data-testid="record-row" data-result={r.result}>
      <span className="b-rec__c b-rec__when" data-label="Flagged">{etStamp(r.flaggedAt)}</span>
      <span className="b-rec__c b-rec__mkt" data-label="Market">
        <a href={marketPath(r.marketId, r.market)}>{r.market}</a>
        <span className="b-rec__flags">{r.flags.map(f => <span key={f} className="b-rec__flag">{FLAG_NAME[f as keyof typeof FLAG_NAME] ?? f}</span>)}</span>
      </span>
      <span className="b-rec__c" data-label="Category">{r.categoryName}</span>
      <span className="b-rec__c b-rec__who" data-label="Wallet">{r.tier === "new" ? <span className="b-rec__flag">New wallet</span> : <TierBadge tier={r.tier as "millionaire" | "pro"} />}<span className="b-num">{r.short}</span></span>
      <span className="b-rec__c" data-label="Side">{r.outcome ?? <span className="b-small" data-locked="side">{member ? "" : "Members"}</span>}</span>
      <span className="b-rec__c b-num" data-label="Entry">{cents(r.entryPrice)}</span>
      <span className="b-rec__c b-num" data-label="Size">{dollars(r.size)}</span>
      <span className="b-rec__c b-num" data-label={r.result === "sold" ? "Exit" : r.result === "open" ? "Now" : "Settle"}>{cents(r.result === "sold" ? r.exitPrice : r.priceNow)}</span>
      <span className={`b-rec__c b-num${move ? (move > 0 ? " b-up" : " b-down") : ""}`} data-label="Move">{move === null ? "—" : `${move > 0 ? "+" : move < 0 ? "−" : "±"}${Math.abs(move)}¢`}</span>
      <span className="b-rec__c" data-label="Result"><span className={`b-rec__res b-rec__res--${r.result}`}>{RESULT_NAME[r.result]}</span></span>
      <span className="b-rec__c b-rec__verify"><Verify v={r.verify} marketId={r.marketId} polymarket={polymarket} compact /></span>
    </li>
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
    <label className="b-rec__field"><span className="b-small">{all}</span>
      <select name={name} defaultValue={value ?? ""} className="s-input"><option value="">All</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  );
  return (
    <Frame member={member} current="board" testid="record-page">
      <Stage first testid="record-hero" labelledBy="record-h">
        <div className="b-head">
          <Lines as="h1" id="record-h" lines={["The record."]} size={56} />
          <p className="b-sub" data-testid="record-disclaimer">Every position we&apos;ve flagged, losses included. Past results don&apos;t predict future ones. Information, not advice.</p>
        </div>
        {summary ? <Summary s={summary} /> : null}
        <p className="b-small" style={{ marginTop: 12 }}>From every position in this filter ({f.from} to {f.to}, ET){f.wallet ? `, wallet ${f.wallet.slice(0, 6)}…${f.wallet.slice(-4)}` : ""}. &ldquo;Won&rdquo; counts markets that settled; sold positions closed at the wallet&apos;s exit price. {PAST}</p>
      </Stage>
      <Stage testid="record-table" labelledBy="rt-h">
        <div className="b-head"><h2 id="rt-h" className="b-h2" style={{ "--hs": 40 } as CSSProperties}>Every position.</h2>
          <p className="b-sub">Open positions show their side to members; settled ones are public. Verify opens the trade on Polygonscan and the market on its exchange.</p></div>
        <form className="b-rec__filters" method="get" action="/record" data-testid="record-filters">
          {sel("category", f.category, CATEGORY_OPTIONS, "Category")}
          {sel("tier", f.tier, [{ value: "millionaire", label: "Millionaire" }, { value: "pro", label: "Pro" }, { value: "new", label: "New wallet" }], "Tier")}
          {sel("flag", f.flag, FLAGS.map(x => ({ value: x, label: FLAG_NAME[x] })), "Flag")}
          {sel("result", f.result, RESULTS.map(x => ({ value: x, label: RESULT_NAME[x]! })), "Result")}
          <label className="b-rec__field"><span className="b-small">From</span><input type="date" name="from" defaultValue={f.from} className="s-input" /></label>
          <label className="b-rec__field"><span className="b-small">To</span><input type="date" name="to" defaultValue={f.to} className="s-input" /></label>
          {f.wallet ? <input type="hidden" name="wallet" value={f.wallet} /> : null}
          <div className="b-rec__go"><button type="submit" className="b-btn b-panel-pill">Apply</button><a className="b-small" href="/record">Reset</a>
            {member ? <a className="b-btn b-panel-pill" href={`/record/csv?${filterQuery(f)}`} data-testid="record-csv">Download CSV</a> : null}</div>
        </form>
        {shown.length ? (
          <>
            <div className="b-rec__head" aria-hidden="true"><span>Flagged (ET)</span><span>Market</span><span>Category</span><span>Wallet</span><span>Side</span><span>Entry</span><span>Size</span><span>Now / settle</span><span>Move</span><span>Result</span></div>
            <ol className="b-rec__rows" data-testid="record-rows">{shown.map(r => <Row key={r.id} r={r} member={member} polymarket={polymarket} />)}</ol>
          </>
        ) : <p className="b-empty">No position in this filter.</p>}
        <div className="b-rec__pager">
          {page > 1 ? <a className="b-btn b-panel-pill" href={`/record?${filterQuery(f, { page: String(page - 1) })}`}>Newer</a> : null}
          {more ? <a className="b-btn b-panel-pill" href={`/record?${filterQuery(f, { page: String(page + 1) })}`} data-testid="record-older">Older</a> : null}
        </div>
        <p className="b-small" style={{ marginTop: 16 }}>A wallet is only ever its tier and short address. Prices are Polymarket&apos;s for the side taken, fetched at the time shown. Information, not advice.</p>
      </Stage>
    </Frame>
  );
}
