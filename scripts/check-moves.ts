/* The 20-move accuracy check (docs/INSIDIR-V2.md §3, §12): picks 20 random stored moves and checks each against the source
 * API: amount, side, outcome, wallet and time. Prints a table and exits 1 on any mismatch.
 *   DATABASE_URL=... npx tsx scripts/check-moves.ts [--n 20]
 * Stocks: n more moves from SEC filings: a Form 4 is re-read from EDGAR and its open-market buys summed again; a 13F
 * add is recomputed from both filings' information tables (needs SEC_USER_AGENT).
 * Polymarket: re-reads the wallet's trades in that market (Data API /trades?user=&market=) and re-merges the fills
 * that make up the move. Kalshi: re-reads the trade (GET /markets/trades?ticker=&min_ts=&max_ts=) by trade id.
 * Profiles (docs/INSIDIR-V2.md §6): --profiles n (default 20) random stored profile facts, each re-read from its
 * source: a trader's resolved position (Data API /closed-positions?user=&market=), an insider's trade line (the Form 4
 * re-read from EDGAR), a fund's holding (the 13F information table re-read), and each sampled trader's record checked
 * against the positions it was built from. */
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { fromRow } from "@/lib/moves/store";
import { fundAdds, thirteenFFilings } from "@/lib/stocks/form13f";
import { readForm4, thirteenFPositions } from "@/lib/stocks/jobs";
import { readOwnership, tradeRows } from "@/lib/stocks/history";
import { cik10 } from "@/lib/stocks/form13f";
import { marketsFor } from "@/lib/profiles/store";
import { readClosedRows, traderStats } from "@/lib/profiles/trader";
import { SecClient } from "@/lib/stocks/sec";
import { readKalshiFills, readPolymarketFills } from "@/lib/moves/sources";
import { MERGE_WINDOW_MS } from "@/lib/moves/detect";
import type { Move } from "@/lib/moves/types";
import type { VMarket } from "@/lib/types";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) || d : d; };
const n = arg("--n", 20);
const nProfiles = arg("--profiles", 20);
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

async function checkPoly(poly: PolymarketClient, m: Move): Promise<string[]> {
  const raw = await poly.getWalletMarketTrades(m.wallet!, m.marketId);
  const fills = readPolymarketFills(raw).filter(f => f.side === "BUY" && f.outcomeSide === m.outcomeSide && f.at >= m.at && f.at <= m.lastAt)
    .sort((a, b) => a.at - b.at);
  const errs: string[] = [];
  if (!fills.length) return ["no matching fills at the source"];
  const amount = fills.reduce((s, f) => s + f.contracts * f.price, 0);
  if (!near(amount, m.amount, Math.max(1, m.amount * 0.005))) errs.push(`amount ${m.amount} vs source ${amount.toFixed(2)}`);
  if (fills[0]!.at !== m.at) errs.push(`time ${new Date(m.at).toISOString()} vs ${new Date(fills[0]!.at).toISOString()}`);
  if (fills.some(f => f.wallet !== m.wallet)) errs.push("wallet differs");
  if (fills[0]!.outcome !== m.outcome) errs.push(`outcome ${m.outcome} vs ${fills[0]!.outcome}`);
  for (let i = 1; i < fills.length; i++) if (fills[i]!.at - fills[i - 1]!.at > MERGE_WINDOW_MS) errs.push("fills further apart than the merge window");
  return errs;
}

async function checkKalshi(kalshi: KalshiClient, m: Move, market: VMarket | null): Promise<string[]> {
  if (!market) return ["market not in terminal.markets"];
  const tradeId = m.id.slice(3);
  const raw = await kalshi.getTradesPage({ minTsSec: Math.floor(m.at / 1000) - 1, limit: 1000 });
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
async function checkSec(sec: SecClient, m: Move): Promise<string[]> {
  const d = m.detail;
  if (!d) return ["no filing detail"];
  const errs: string[] = [];
  if (!m.url || !m.url.includes(d.accession)) errs.push("link is not this filing");
  if (d.kind === "insider") {
    const again = await readForm4(sec, { accession: d.accession, filerCik: String(Number(d.issuerCik)), formType: "4", publishedAt: null,
      indexBase: `https://www.sec.gov/Archives/edgar/data/${Number(d.issuerCik)}/${d.accession}/`, sourceUrl: m.url ?? "" });
    if (!again || again.detail?.kind !== "insider") return [...errs, "no open-market buy of $100k+ in the filing"];
    if (!near(again.amount, m.amount, 0.01)) errs.push(`amount ${m.amount} vs filing ${again.amount}`);
    if (again.detail.shares !== d.shares) errs.push(`shares ${d.shares} vs filing ${again.detail.shares}`);
    if (again.detail.role !== d.role) errs.push(`role ${d.role} vs filing ${again.detail.role}`);
    if (again.detail.ticker !== d.ticker) errs.push(`ticker ${d.ticker} vs filing ${again.detail.ticker}`);
    return errs;
  }
  const filings = thirteenFFilings(await sec.json(`https://data.sec.gov/submissions/CIK${d.fundCik}.json`), 60);
  const cur = filings.find(f => f.accession === d.accession), prev = filings.find(f => f.accession === d.prevAccession);
  if (!cur || !prev) return [...errs, "filing not in the fund's EDGAR list"];
  const [a, b] = [await thirteenFPositions(sec, d.fundCik, cur), await thirteenFPositions(sec, d.fundCik, prev)];
  if (!a || !b) return [...errs, "information table missing or incomplete"];
  const add = fundAdds(b, a, 0).find(x => x.cusip === d.cusip);
  if (!add) return [...errs, "no add for this company in the filing"];
  if (!near(add.added, m.amount, 1)) errs.push(`added ${m.amount} vs filing ${add.added}`);
  if (add.addedShares !== d.addedShares) errs.push(`shares added ${d.addedShares} vs filing ${add.addedShares}`);
  if (add.newPosition !== d.newPosition) errs.push("new position flag differs");
  return errs;
}

/** A stored resolved position against Polymarket's own row for that wallet and market. */
async function checkPosition(poly: PolymarketClient, p: Record<string, unknown>): Promise<string[]> {
  const got = readClosedRows(await poly.getClosedPositionsPage(String(p.wallet), { market: String(p.market_id), limit: 50 }))
    .find(x => x.marketId === p.market_id && x.outcomeIndex === Number(p.outcome_index));
  if (!got) return ["position not found at the source"];
  const errs: string[] = [];
  if (!near(got.pnl, Number(p.pnl), 0.01)) errs.push(`profit ${p.pnl} vs source ${got.pnl}`);
  if (!near(got.moneyIn, Number(p.money_in), 0.01)) errs.push(`money in ${p.money_in} vs source ${got.moneyIn}`);
  return errs;
}

/** A trader's record against the positions stored with it (one result per market). */
async function checkRecord(db: ReturnType<typeof getDb>, wallet: string): Promise<string[]> {
  const rec = (await db.execute(sql`select resolved, won, profit from terminal.trader_records where wallet = ${wallet}`)).rows[0] as { resolved: number; won: number; profit: number } | undefined;
  if (!rec) return ["no record"];
  const s = traderStats(await marketsFor(db, wallet), Date.now());
  const errs: string[] = [];
  if (s.resolved !== rec.resolved) errs.push(`resolved ${rec.resolved} vs positions ${s.resolved}`);
  if (s.won !== rec.won) errs.push(`won ${rec.won} vs positions ${s.won}`);
  if (!near(s.profit, rec.profit, 0.05)) errs.push(`profit ${rec.profit} vs positions ${s.profit}`);
  return errs;
}

/** A stored insider trade line against the Form 4 re-read from EDGAR. */
async function checkTrade(sec: SecClient, t: Record<string, unknown>): Promise<string[]> {
  const acc = String(t.accession);
  const m = /\/data\/(\d+)\//.exec(String(t.url));
  if (!m || !String(t.url).includes(acc)) return ["link is not this filing"];
  const got = await readOwnership(sec, `https://www.sec.gov/Archives/edgar/data/${m[1]}/${acc}/`);
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
async function checkHolding(sec: SecClient, h: Record<string, unknown>): Promise<string[]> {
  const cik = cik10(String(h.fund_cik))!;
  const f = thirteenFFilings(await sec.json(`https://data.sec.gov/submissions/CIK${cik}.json`), 4000).find(x => x.accession === h.accession);
  if (!f) return ["filing not in the fund's EDGAR list"];
  const pos = await thirteenFPositions(sec, cik, f);
  const p = pos?.get(String(h.cusip));
  if (!p) return ["holding not in the information table"];
  const errs: string[] = [];
  if (p.shares !== Number(h.shares)) errs.push(`shares ${h.shares} vs filing ${p.shares}`);
  if (!near(p.value, Number(h.value), 1)) errs.push(`value ${h.value} vs filing ${p.value}`);
  return errs;
}

async function checkProfiles(db: ReturnType<typeof getDb>, poly: PolymarketClient, sec: SecClient | null): Promise<{ checked: number; bad: number }> {
  const k = Math.max(1, Math.round(nProfiles / 3));
  const positionsRows = (await db.execute(sql`select * from terminal.trader_positions order by random() limit ${k}`)).rows as Array<Record<string, unknown>>;
  const tradesRows = (await db.execute(sql`select * from terminal.insider_trades order by random() limit ${k}`)).rows as Array<Record<string, unknown>>;
  const holdingRows = (await db.execute(sql`select * from terminal.fund_holdings order by random() limit ${Math.max(1, nProfiles - 2 * k)}`)).rows as Array<Record<string, unknown>>;
  let checked = 0, bad = 0;
  const report = (kind: string, label: string, errs: string[]) => {
    checked++; if (errs.length) bad++;
    console.log(`${errs.length ? "MISMATCH" : "ok      "}  ${kind.padEnd(10)} ${label.slice(0, 60).padEnd(60)}  ${errs.join("; ")}`);
  };
  for (const p of positionsRows) report("position", `${p.wallet} ${p.market_id}`, await checkPosition(poly, p));
  for (const w of new Set(positionsRows.map(p => String(p.wallet)))) report("record", w, await checkRecord(db, w));
  for (const t of tradesRows) report("insider", `${t.owner_name} ${t.code} ${t.accession}:${t.line}`, sec ? await checkTrade(sec, t) : ["SEC_USER_AGENT is not set"]);
  for (const h of holdingRows) report("fund", `${h.fund_cik} ${h.company} ${h.accession}`, sec ? await checkHolding(sec, h) : ["SEC_USER_AGENT is not set"]);
  return { checked, bad };
}

async function main() {
  const db = getDb();
  // n prediction-market moves and n Stocks moves (SEC filings), each sampled at random.
  const rs = { rows: [
    ...(await db.execute(sql`select * from terminal.moves where source <> 'sec' order by random() limit ${n}`)).rows,
    ...(await db.execute(sql`select * from terminal.moves where source = 'sec' order by random() limit ${n}`)).rows,
  ] };
  const poly = new PolymarketClient(), kalshi = new KalshiClient();
  const sec = SecClient.fromEnv();
  let bad = 0;
  for (const r of rs.rows as Array<Record<string, unknown>>) {
    const m = fromRow({
      id: r.id, source: r.source, marketId: r.market_id, eventTitle: r.event_title, marketTitle: r.market_title, outcome: r.outcome,
      outcomeSide: r.outcome_side, amount: r.amount, avgPrice: r.avg_price, wallet: r.wallet, walletName: r.wallet_name, at: new Date(r.at as string),
      lastAt: new Date(r.last_at as string), fills: r.fills, tab: r.tab, league: r.league, category: r.category, url: r.url, result: r.result,
      settledAt: r.settled_at ? new Date(r.settled_at as string) : null, detail: r.detail ?? null, createdAt: new Date(r.created_at as string),
    } as never);
    const mk = m.source === "kalshi" ? (await db.execute(sql`select data from terminal.markets where venue = 'kalshi' and id = ${m.marketId}`)).rows[0] as { data: VMarket } | undefined : undefined;
    const errs = m.source === "sec" ? (sec ? await checkSec(sec, m) : ["SEC_USER_AGENT is not set"])
      : m.source === "polymarket" ? await checkPoly(poly, m) : await checkKalshi(kalshi, m, mk?.data ?? null);
    if (errs.length) bad++;
    console.log(`${errs.length ? "MISMATCH" : "ok      "}  ${m.source.padEnd(10)} $${m.amount.toFixed(0).padStart(9)}  ${m.outcome.slice(0, 18).padEnd(18)}  ${m.id.slice(0, 40)}  ${errs.join("; ")}`);
  }
  console.log(`\n${rs.rows.length - bad} of ${rs.rows.length} moves match the source.\n`);
  const prof = nProfiles > 0 ? await checkProfiles(db, poly, sec) : { checked: 0, bad: 0 };
  if (nProfiles > 0) console.log(`\n${prof.checked - prof.bad} of ${prof.checked} profile facts match the source.`);
  await closeDb();
  process.exit(bad || prof.bad ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
