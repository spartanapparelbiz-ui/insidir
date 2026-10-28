/* The accuracy check (docs/INSIDIR-V2.md §3, §12): every hour the worker re-reads stored moves and profile facts from
 * their sources and compares (worker/index.ts "accuracy"; `npm run check:moves` runs the same check by hand).
 *   Moves: n random moves (all sources) plus every move currently hidden.
 *     Polymarket: the wallet's trades in that market (Data API /trades?user=&market=), re-merged.
 *     Kalshi: the trade by id (GET /markets/trades?ticker=&min_ts=&max_ts=).
 *     SEC: a Form 4 re-read from EDGAR and its buys summed again; a 13F add recomputed from both filings.
 *   Profiles: n random profile facts: a trader's resolved position (Data API /closed-positions), each sampled
 *     trader's record against its positions, an insider's trade line (Form 4 re-read), a fund's holding (13F re-read).
 * What happens with the result:
 *   - every line is stored in terminal.accuracy_checks (shown on /admin);
 *   - a move that doesn't match is hidden everywhere (moves.hidden_at) until a later check passes, then shown again;
 *   - a trader record or position that doesn't match is marked stale, so the records job rebuilds it from source;
 *   - a source that can't be reached is "skipped", never a mismatch: nothing is hidden on a network error. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accuracyChecks } from "@/lib/db/schema";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { readKalshiFills, readPolymarketFills } from "@/lib/moves/sources";
import { fromRow } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { marketsFor } from "@/lib/profiles/store";
import { readClosedRows, traderStats } from "@/lib/profiles/trader";
import { cik10, fundAdds, thirteenFFilings } from "@/lib/stocks/form13f";
import { readOwnership, tradeRows } from "@/lib/stocks/history";
import { readForm4, thirteenFPositions } from "@/lib/stocks/jobs";
import type { SecClient } from "@/lib/stocks/sec";
import type { VMarket } from "@/lib/types";

export interface Sources { poly: PolymarketClient; kalshi: KalshiClient; sec: SecClient | null }
export type Status = "ok" | "mismatch" | "skipped";
export interface CheckLine { kind: "move" | "profile"; what: string; target: string; label: string; status: Status; problems: string[] }
export interface CheckRun { runAt: number; lines: CheckLine[]; hidden: string[]; restored: string[] }

export const ACCURACY_MS = 3_600_000;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
/** A check that can't reach its source says so; it is never counted as a mismatch. */
class Unavailable extends Error {}
const SKIP_NO_SEC = "SEC_USER_AGENT is not set";

async function source<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); } catch (e) { throw new Unavailable(`source unavailable: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`); }
}

export async function checkPoly(poly: PolymarketClient, m: Move): Promise<string[]> {
  // Every fill of the wallet in that market, maker and taker: a move is a whole position (lib/moves/store.ts).
  const raw = await source(() => poly.getWalletMarketTradesAll(m.wallet!, m.marketId));
  const fills = readPolymarketFills(raw).filter(f => f.side === "BUY" && f.outcomeSide === m.outcomeSide && f.at >= m.at && f.at <= m.lastAt)
    .sort((a, b) => a.at - b.at);
  if (!fills.length) return ["no matching fills at the source"];
  const errs: string[] = [];
  const amount = fills.reduce((s, f) => s + f.contracts * f.price, 0);
  if (!near(amount, m.amount, Math.max(1, m.amount * 0.005))) errs.push(`amount ${m.amount} vs source ${amount.toFixed(2)}`);
  if (fills[0]!.at !== m.at) errs.push(`time ${new Date(m.at).toISOString()} vs ${new Date(fills[0]!.at).toISOString()}`);
  if (fills.some(f => f.wallet !== m.wallet)) errs.push("wallet differs");
  if (fills[0]!.outcome !== m.outcome) errs.push(`outcome ${m.outcome} vs ${fills[0]!.outcome}`);
  return errs;
}

/** The parser wants the market only for its wording; the check compares the trade itself (amount, side, time), so a
 *  stand-in built from the stored move is enough (Kalshi markets aren't necessarily kept in terminal.markets). */
const kalshiStandIn = (m: Move): VMarket => ({ id: m.marketId, venue: "kalshi", title: m.marketTitle, eventTitle: m.eventTitle,
  yesLabel: m.outcomeSide === "yes" ? m.outcome : "Yes", noLabel: m.outcomeSide === "no" ? m.outcome : "No", url: m.url } as unknown as VMarket);

export async function checkKalshi(kalshi: KalshiClient, m: Move, market: VMarket | null = null): Promise<string[]> {
  market ??= kalshiStandIn(m);
  const tradeId = m.id.slice(3);
  const s = Math.floor(m.at / 1000);
  const raw = await source(() => kalshi.getTradesPage({ ticker: m.marketId, minTsSec: s - 1, maxTsSec: s + 1, limit: 1000, priority: "normal" }));
  const f = readKalshiFills(raw, new Map([[market.id, market]])).find(x => x.id === tradeId);
  if (!f) return ["trade not found at the source"];
  const errs: string[] = [];
  const amount = f.contracts * f.price;
  if (!near(amount, m.amount, 0.01)) errs.push(`amount ${m.amount} vs source ${amount.toFixed(2)}`);
  if (f.outcomeSide !== m.outcomeSide) errs.push(`side ${m.outcomeSide} vs ${f.outcomeSide}`);
  if (f.at !== m.at) errs.push("time differs");
  return errs;
}

/** Form 4: re-read the filing from EDGAR and rebuild the move; 13F: re-read both filings and recompute the add. */
export async function checkSec(sec: SecClient, m: Move): Promise<string[]> {
  const d = m.detail;
  if (!d) return ["no filing detail"];
  const errs: string[] = [];
  if (!m.url || !m.url.includes(d.accession)) errs.push("link is not this filing");
  if (d.kind === "insider") {
    const again = await source(() => readForm4(sec, { accession: d.accession, filerCik: String(Number(d.issuerCik)), formType: "4", publishedAt: null,
      indexBase: `https://www.sec.gov/Archives/edgar/data/${Number(d.issuerCik)}/${d.accession}/`, sourceUrl: m.url ?? "" }));
    if (!again || again.detail?.kind !== "insider") return [...errs, "no open-market buy of $100k+ in the filing"];
    if (!near(again.amount, m.amount, 0.01)) errs.push(`amount ${m.amount} vs filing ${again.amount}`);
    if (again.detail.shares !== d.shares) errs.push(`shares ${d.shares} vs filing ${again.detail.shares}`);
    if (again.detail.role !== d.role) errs.push(`role ${d.role} vs filing ${again.detail.role}`);
    if (again.detail.ticker !== d.ticker) errs.push(`ticker ${d.ticker} vs filing ${again.detail.ticker}`);
    return errs;
  }
  const filings = thirteenFFilings(await source(() => sec.json(`https://data.sec.gov/submissions/CIK${d.fundCik}.json`)), 60);
  const cur = filings.find(f => f.accession === d.accession), prev = filings.find(f => f.accession === d.prevAccession);
  if (!cur || !prev) return [...errs, "filing not in the fund's EDGAR list"];
  const [a, b] = [await source(() => thirteenFPositions(sec, d.fundCik, cur)), await source(() => thirteenFPositions(sec, d.fundCik, prev))];
  if (!a || !b) return [...errs, "information table missing or incomplete"];
  const add = fundAdds(b, a, 0).find(x => x.cusip === d.cusip);
  if (!add) return [...errs, "no add for this company in the filing"];
  if (!near(add.added, m.amount, 1)) errs.push(`added ${m.amount} vs filing ${add.added}`);
  if (add.addedShares !== d.addedShares) errs.push(`shares added ${d.addedShares} vs filing ${add.addedShares}`);
  if (add.newPosition !== d.newPosition) errs.push("new position flag differs");
  return errs;
}

/** A stored resolved position against Polymarket's own row for that wallet and market. */
export async function checkPosition(poly: PolymarketClient, p: Record<string, unknown>): Promise<string[]> {
  const got = readClosedRows(await source(() => poly.getClosedPositionsPage(String(p.wallet), { market: String(p.market_id), limit: 50 })))
    .find(x => x.marketId === p.market_id && x.outcomeIndex === Number(p.outcome_index));
  if (!got) return ["position not found at the source"];
  const errs: string[] = [];
  if (!near(got.pnl, Number(p.pnl), 0.01)) errs.push(`profit ${p.pnl} vs source ${got.pnl}`);
  if (!near(got.moneyIn, Number(p.money_in), 0.01)) errs.push(`money in ${p.money_in} vs source ${got.moneyIn}`);
  return errs;
}

/** A trader's record (what the profile and cards show) against the positions it was built from. */
export async function checkRecord(db: Db, wallet: string, now: number): Promise<string[]> {
  const rec = (await db.execute(sql`select resolved, won, profit from terminal.trader_records where wallet = ${wallet}`)).rows[0] as { resolved: number; won: number; profit: number } | undefined;
  if (!rec) return ["no record"];
  const s = traderStats(await marketsFor(db, wallet), now);
  const errs: string[] = [];
  if (s.resolved !== rec.resolved) errs.push(`resolved ${rec.resolved} vs positions ${s.resolved}`);
  if (s.won !== rec.won) errs.push(`won ${rec.won} vs positions ${s.won}`);
  if (!near(s.profit, rec.profit, 0.05)) errs.push(`profit ${rec.profit} vs positions ${s.profit}`);
  return errs;
}

/** A stored insider trade line against the Form 4 re-read from EDGAR. */
export async function checkTrade(sec: SecClient, t: Record<string, unknown>): Promise<string[]> {
  const acc = String(t.accession);
  const m = /\/data\/(\d+)\//.exec(String(t.url));
  if (!m || !String(t.url).includes(acc)) return ["link is not this filing"];
  const got = await source(() => readOwnership(sec, `https://www.sec.gov/Archives/edgar/data/${m[1]}/${acc}/`));
  if (!got) return ["no ownership XML in the filing"];
  const line = tradeRows(got.ownership, acc, 0, String(t.url)).find(r => r.line === Number(t.line) && r.ownerCik === t.owner_cik);
  if (!line) return ["line not in the filing"];
  const errs: string[] = [];
  if (line.code !== t.code) errs.push(`code ${t.code} vs filing ${line.code}`);
  if (line.shares !== Number(t.shares)) errs.push(`shares ${t.shares} vs filing ${line.shares}`);
  if (!near(line.value, Number(t.value), 0.01)) errs.push(`value ${t.value} vs filing ${line.value}`);
  if (line.tradeDate !== (t.trade_date ?? null)) errs.push(`date ${t.trade_date} vs filing ${line.tradeDate}`);
  return errs;
}

/** A stored 13F holding against the fund's information table re-read. */
export async function checkHolding(sec: SecClient, h: Record<string, unknown>): Promise<string[]> {
  const cik = cik10(String(h.fund_cik))!;
  const f = thirteenFFilings(await source(() => sec.json(`https://data.sec.gov/submissions/CIK${cik}.json`)), 4000).find(x => x.accession === h.accession);
  if (!f) return ["filing not in the fund's EDGAR list"];
  const pos = await source(() => thirteenFPositions(sec, cik, f));
  const p = pos?.get(String(h.cusip));
  if (!p) return ["holding not in the information table"];
  const errs: string[] = [];
  if (p.shares !== Number(h.shares)) errs.push(`shares ${h.shares} vs filing ${p.shares}`);
  if (!near(p.value, Number(h.value), 1)) errs.push(`value ${h.value} vs filing ${p.value}`);
  return errs;
}

/** Runs one check, turning "can't reach the source" into a skipped line. */
async function line(base: Omit<CheckLine, "status" | "problems">, run: () => Promise<string[] | null>): Promise<CheckLine> {
  try {
    const errs = await run();
    if (errs === null) return { ...base, status: "skipped", problems: [SKIP_NO_SEC] };
    return { ...base, status: errs.length ? "mismatch" : "ok", problems: errs };
  } catch (e) {
    if (e instanceof Unavailable) return { ...base, status: "skipped", problems: [e.message] };
    return { ...base, status: "skipped", problems: [`check failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`] };
  }
}

const moveRow = (r: Record<string, unknown>): Move => fromRow({
  id: r.id, source: r.source, marketId: r.market_id, eventTitle: r.event_title, marketTitle: r.market_title, outcome: r.outcome,
  outcomeSide: r.outcome_side, amount: r.amount, avgPrice: r.avg_price, wallet: r.wallet, walletName: r.wallet_name, at: new Date(r.at as string),
  lastAt: new Date(r.last_at as string), fills: r.fills, tab: r.tab, league: r.league, category: r.category, url: r.url, result: r.result,
  settledAt: r.settled_at ? new Date(r.settled_at as string) : null, detail: r.detail ?? null, newWallet: r.new_wallet ?? null,
  sourceRefs: r.source_refs ?? null, createdAt: new Date(r.created_at as string),
} as never);

export async function checkMoves(db: Db, src: Sources, n: number): Promise<Array<CheckLine & { wasHidden: boolean }>> {
  const rows = [
    ...(await db.execute(sql`select *, false as was_hidden from terminal.moves where hidden_at is null order by random() limit ${n}`)).rows,
    // Every hidden move again: shown once its source agrees.
    ...(await db.execute(sql`select *, true as was_hidden from terminal.moves where hidden_at is not null limit 200`)).rows,
  ] as Array<Record<string, unknown>>;
  const out: Array<CheckLine & { wasHidden: boolean }> = [];
  for (const r of rows) {
    const m = moveRow(r);
    const base = { kind: "move" as const, what: m.source, target: m.id, label: `${m.source === "sec" ? m.eventTitle : m.marketTitle} · $${Math.round(m.amount).toLocaleString("en-US")} on ${m.outcome}`.slice(0, 160) };
    const res = await line(base, async () => {
      if (m.source === "sec") return src.sec ? checkSec(src.sec, m) : null;
      if (m.source === "polymarket") return checkPoly(src.poly, m);
      return checkKalshi(src.kalshi, m);
    });
    out.push({ ...res, wasHidden: Boolean(r.was_hidden) });
  }
  return out;
}

export async function checkProfiles(db: Db, src: Sources, n: number, now: number): Promise<CheckLine[]> {
  const k = Math.max(1, Math.round(n / 3));
  const positions = (await db.execute(sql`select * from terminal.trader_positions order by random() limit ${k}`)).rows as Array<Record<string, unknown>>;
  const trades = (await db.execute(sql`select * from terminal.insider_trades order by random() limit ${k}`)).rows as Array<Record<string, unknown>>;
  const holdings = (await db.execute(sql`select * from terminal.fund_holdings order by random() limit ${Math.max(1, n - 2 * k)}`)).rows as Array<Record<string, unknown>>;
  const out: CheckLine[] = [];
  for (const p of positions) out.push(await line({ kind: "profile", what: "position", target: String(p.wallet), label: `${p.wallet} · ${String(p.title ?? p.market_id).slice(0, 80)}` }, () => checkPosition(src.poly, p)));
  for (const w of new Set(positions.map(p => String(p.wallet)))) out.push(await line({ kind: "profile", what: "record", target: w, label: `${w} · record` }, () => checkRecord(db, w, now)));
  for (const t of trades) out.push(await line({ kind: "profile", what: "insider", target: `${t.accession}:${t.line}`, label: `${t.owner_name} · ${t.code} · ${t.company}` }, async () => (src.sec ? checkTrade(src.sec, t) : null)));
  for (const h of holdings) out.push(await line({ kind: "profile", what: "fund", target: `${h.accession}:${h.cusip}`, label: `${h.fund_cik} · ${h.company}` }, async () => (src.sec ? checkHolding(src.sec, h) : null)));
  return out;
}

/** One full run: check, store every line, hide moves that don't match, show again those that now do, and mark
 *  mismatched trader records stale so the records job rebuilds them from the source. */
export async function runAccuracyCheck(db: Db, src: Sources, opts: { moves?: number; profiles?: number; now?: number } = {}): Promise<CheckRun> {
  const runAt = opts.now ?? Date.now();
  const moveLines = await checkMoves(db, src, opts.moves ?? 20);
  const profileLines = await checkProfiles(db, src, opts.profiles ?? 20, runAt);
  const hidden: string[] = [], restored: string[] = [];
  for (const l of moveLines) {
    if (l.status === "mismatch") {
      await db.execute(sql`update terminal.moves set hidden_at = coalesce(hidden_at, ${new Date(runAt)}), hidden_reason = ${l.problems.join("; ").slice(0, 500)} where id = ${l.target}`);
      if (!l.wasHidden) hidden.push(l.target);
    } else if (l.status === "ok" && l.wasHidden) {
      await db.execute(sql`update terminal.moves set hidden_at = null, hidden_reason = null where id = ${l.target}`);
      restored.push(l.target);
    }
  }
  for (const l of profileLines) {
    if (l.status === "mismatch" && (l.what === "record" || l.what === "position")) {
      await db.execute(sql`update terminal.trader_records set updated_at = to_timestamp(0) where wallet = ${l.target}`);
    }
  }
  const lines: CheckLine[] = [...moveLines.map(({ wasHidden: _w, ...l }) => l), ...profileLines];
  if (lines.length) {
    await db.insert(accuracyChecks).values(lines.map(l => ({ runAt: new Date(runAt), kind: l.kind, what: l.what, target: l.target, label: l.label, status: l.status, problems: l.problems })));
  }
  return { runAt, lines, hidden, restored };
}

/** The email to the owner when a run finds anything off: what, and what was done about it. */
export function accuracyEmail(run: CheckRun, appUrl: string): { subject: string; heading: string; lines: Array<{ text: string; url?: string }> } | null {
  const bad = run.lines.filter(l => l.status === "mismatch");
  if (!bad.length) return null;
  const moves = bad.filter(l => l.kind === "move").length, profiles = bad.length - moves;
  return {
    subject: `Insidir accuracy check: ${bad.length} ${bad.length === 1 ? "thing doesn't" : "things don't"} match the source`,
    heading: `${bad.length} of ${run.lines.length} checks didn't match the source.`,
    lines: [
      { text: `${moves} ${moves === 1 ? "move" : "moves"} and ${profiles} profile ${profiles === 1 ? "fact" : "facts"}. Moves that don't match are hidden until a later check passes; mismatched trader records are being rebuilt from the source.` },
      ...bad.slice(0, 15).map(l => ({ text: `${l.what} · ${l.label}: ${l.problems.join("; ")}` })),
      ...(bad.length > 15 ? [{ text: `…and ${bad.length - 15} more on /admin.` }] : []),
      { text: "See every check on /admin", url: `${appUrl}/admin#accuracy` },
    ],
  };
}
