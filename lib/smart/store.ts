/* Smart money vs. the crowd, the database side (lib/smart/splits.ts has the rules). Proven traders' open positions are
 * read from Polymarket's public Data API (terminal.trader_open); each open market they hold is compared with its
 * price now; games also with all the big money we track; stocks with insider buys and fund adds against daily
 * closes. Every split is kept in terminal.splits, live while it lasts, and scored when it ends. Server only. */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { splits, traderOpen, traderOpenRead, traderRecords, type SplitKind } from "@/lib/db/schema";
import type { PolymarketClient, PolymarketPosition } from "@/lib/exchanges/polymarket";
import { classify } from "@/lib/moves/classify";
import { liveTabs } from "@/lib/features";
import { closesFor } from "@/lib/stocks/prices";
import {
  bigMoneySplit, crowdSplit, fundAddsInFall, insiderDips, marketVerdict, smartOf, SPLIT_ALERT_GAP, SPLIT_MIN, stockVerdict,
  type FundAdd, type InsiderBuy, type Smart, type SmartPosition,
} from "./splits";

const MIN = 60_000, DAY = 86_400_000;
/** Proven wallets' open positions are read again after this long. */
export const OPEN_STALE_MS = 30 * MIN;
/** Open markets checked per splits run, by proven money. */
export const MARKETS_PER_RUN = 300;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Replaces a wallet's stored open positions (Data API /positions). Resolved ones (redeemable, or priced 0 or 1) are
 *  left out: they're no longer a view on an open market. */
export async function saveOpen(db: Db, wallet: string, list: readonly PolymarketPosition[], now: number): Promise<void> {
  const seen = new Set<string>();
  const values = list.flatMap(p => {
    const k = `${p.conditionId}:${p.outcomeIndex ?? -1}`;
    if (seen.has(k) || p.outcomeIndex === null || p.redeemable || !(p.size > 0)) return [];
    if (p.curPrice !== null && (p.curPrice <= 0 || p.curPrice >= 1)) return [];
    const moneyIn = p.initialValue ?? (p.avgPrice !== null ? p.size * p.avgPrice : 0);
    if (!(moneyIn > 0)) return [];
    seen.add(k);
    return [{ wallet, marketId: p.conditionId, outcomeIndex: p.outcomeIndex, outcome: p.outcome, title: p.title.slice(0, 300), size: p.size,
      avgPrice: p.avgPrice, moneyIn: Math.round(moneyIn * 100) / 100, curPrice: p.curPrice, endDate: p.endDate ? new Date(p.endDate) : null, readAt: new Date(now) }];
  });
  await db.transaction(async tx => {
    await tx.delete(traderOpen).where(eq(traderOpen.wallet, wallet));
    for (let i = 0; i < values.length; i += 500) await tx.insert(traderOpen).values(values.slice(i, i + 500));
    await tx.insert(traderOpenRead).values({ wallet, readAt: new Date(now) }).onConflictDoUpdate({ target: traderOpenRead.wallet, set: { readAt: new Date(now) } });
  });
}

/** Reads proven wallets' open positions, stalest first, so smart money is never more than about half an hour old. */
export async function provenOpenOnce(db: Db, poly: PolymarketClient, now: number, perRun = 25): Promise<number> {
  const r = await db.execute(sql`select t.wallet from terminal.trader_records t left join terminal.trader_open_read o on o.wallet = t.wallet
    where t.proven and (o.read_at is null or o.read_at < ${new Date(now - OPEN_STALE_MS)}) order by o.read_at asc nulls first limit ${perRun}`);
  let n = 0;
  for (const { wallet } of r.rows as Array<{ wallet: string }>) {
    try { await saveOpen(db, wallet, await poly.getPositions(wallet, { sizeThreshold: 0 }), now); n++; } catch { /* next run */ }
  }
  return n;
}

/** Proven traders' open money per market (positions read in the last 3 hours). */
export async function provenOpen(db: Db, now: number, marketIds?: readonly string[]): Promise<Map<string, { positions: SmartPosition[]; title: string; outcomes: [string | null, string | null]; cur: number | null }>> {
  const rows = await db.select({ wallet: traderOpen.wallet, marketId: traderOpen.marketId, outcomeIndex: traderOpen.outcomeIndex, outcome: traderOpen.outcome,
    title: traderOpen.title, moneyIn: traderOpen.moneyIn, curPrice: traderOpen.curPrice })
    .from(traderOpen).innerJoin(traderRecords, eq(traderRecords.wallet, traderOpen.wallet))
    .where(and(eq(traderRecords.proven, true), gte(traderOpen.readAt, new Date(now - 3 * 3_600_000)), marketIds ? inArray(traderOpen.marketId, [...marketIds]) : undefined));
  const out = new Map<string, { positions: SmartPosition[]; title: string; outcomes: [string | null, string | null]; cur: number | null }>();
  for (const r of rows) {
    const m = out.get(r.marketId) ?? { positions: [], title: r.title, outcomes: [null, null] as [string | null, string | null], cur: null };
    m.positions.push({ wallet: r.wallet, outcomeIndex: r.outcomeIndex, moneyIn: r.moneyIn });
    if (r.outcomeIndex === 0 || r.outcomeIndex === 1) m.outcomes[r.outcomeIndex] ??= r.outcome;
    if (r.curPrice !== null && m.cur === null) m.cur = r.outcomeIndex === 0 ? r.curPrice : r.outcomeIndex === 1 ? 1 - r.curPrice : null;
    out.set(r.marketId, m);
  }
  return out;
}

/** All the big money we track on each side of these markets (every wallet, Polymarket ids). */
export async function bigMoney(db: Db, marketIds: readonly string[]): Promise<Map<string, { yes: number; no: number }>> {
  if (!marketIds.length) return new Map();
  const r = await db.execute(sql`select market_id, sum(case when outcome_side = 'yes' then amount else 0 end)::float as yes,
      sum(case when outcome_side = 'no' then amount else 0 end)::float as no
    from terminal.moves where source = 'polymarket' and hidden_at is null and market_id in (${sql.join(marketIds.map(id => sql`${id}`), sql`, `)}) group by market_id`);
  return new Map((r.rows as Array<{ market_id: string; yes: number; no: number }>).map(x => [x.market_id, { yes: Number(x.yes), no: Number(x.no) }]));
}

interface SplitRow {
  kind: SplitKind; source: string; subject: string; title: string; subtitle: string | null; tab: string; league: string | null;
  crowd: number | null; smart: number | null; gap: number; smartSide: string; detail: Record<string, unknown>;
}

/** Saves what this run saw. A split first crossing SPLIT_ALERT_GAP is flagged (once; the values are kept for the
 *  scorecard). Returns the ids flagged now. */
async function saveSplits(db: Db, list: readonly SplitRow[], now: number): Promise<string[]> {
  const flagged: string[] = [];
  for (const s of list) {
    const id = `${s.kind}:${s.subject}`;
    const cur = (await db.select({ flaggedAt: splits.flaggedAt, resolvedAt: splits.resolvedAt }).from(splits).where(eq(splits.id, id)))[0];
    if (cur?.resolvedAt) continue;
    const flagNow = !cur?.flaggedAt && s.gap >= SPLIT_ALERT_GAP;
    const v = { title: s.title, subtitle: s.subtitle, tab: s.tab, league: s.league, crowd: s.crowd, smart: s.smart, gap: s.gap, smartSide: s.smartSide,
      detail: s.detail, live: true, lastSeenAt: new Date(now),
      ...(flagNow ? { flaggedAt: new Date(now), flaggedCrowd: s.crowd, flaggedSmart: s.smart, flaggedGap: s.gap } : {}) };
    await db.insert(splits).values({ id, kind: s.kind, source: s.source, subject: s.subject, firstSeenAt: new Date(now), ...v })
      .onConflictDoUpdate({ target: splits.id, set: v });
    if (flagNow) flagged.push(id);
  }
  return flagged;
}

/** Splits of `kinds` not seen this run stop being live (they stay on the scorecard if flagged). */
async function endUnseen(db: Db, kinds: readonly SplitKind[], seen: ReadonlySet<string>): Promise<void> {
  const live = await db.select({ id: splits.id }).from(splits).where(and(eq(splits.live, true), inArray(splits.kind, [...kinds])));
  const gone = live.map(r => r.id).filter(id => !seen.has(id));
  for (let i = 0; i < gone.length; i += 500) await db.update(splits).set({ live: false }).where(inArray(splits.id, gone.slice(i, i + 500)));
}

/** Markets and games: crowd vs. smart money on every open market proven traders hold, and all big money vs. proven
 *  traders on games. Returns the ids flagged this run. */
export async function marketSplitsOnce(db: Db, poly: PolymarketClient, now: number): Promise<{ markets: number; live: number; flagged: string[] }> {
  const open = await provenOpen(db, now);
  // The MARKETS_PER_RUN markets with the most proven money: the venue is asked about each one every run.
  const held = [...open].map(([id, o]) => ({ id, o, smart: smartOf(o.positions) })).filter(x => x.smart.share !== null)
    .sort((a, b) => b.smart.yes + b.smart.no - (a.smart.yes + a.smart.no)).slice(0, MARKETS_PER_RUN);
  const venue = held.length ? await poly.getMarketsById(held.map(x => x.id)).catch(() => new Map()) : new Map();
  const big = await bigMoney(db, held.map(x => x.id));
  const tabs = new Set<string>(liveTabs());
  const rows: SplitRow[] = [];
  for (const { id, o, smart } of held) {
    const m = venue.get(id);
    if (m && (m.result !== null || m.active === false)) continue;
    const c = classify(m?.category ?? "other", [m?.eventTitle, m?.title ?? o.title, m?.seriesId]);
    if (!tabs.has(c.tab)) continue;
    const labels = [m?.yesLabel ?? o.outcomes[0] ?? "Yes", m?.noLabel ?? o.outcomes[1] ?? "No"];
    const base = { source: "polymarket", subject: id, title: m?.title ?? o.title, subtitle: m?.eventTitle && m.eventTitle !== m.title ? m.eventTitle : null, tab: c.tab, league: c.league };
    const facts = { yesLabel: labels[0], noLabel: labels[1], wallets: smart.wallets, smartYes: Math.round(smart.yes), smartNo: Math.round(smart.no), url: m?.url ?? null };
    const cs = crowdSplit(m?.yesPrice ?? o.cur, smart);
    if (cs && cs.gap >= SPLIT_MIN) rows.push({ ...base, kind: "crowd", ...cs, detail: facts });
    const all = big.get(id);
    if (c.tab === "sports" && all) {
      const bs = bigMoneySplit(all, smart);
      if (bs && bs.gap >= SPLIT_MIN) rows.push({ ...base, kind: "bigmoney", ...bs, detail: { ...facts, bigYes: Math.round(all.yes), bigNo: Math.round(all.no) } });
    }
  }
  const flagged = await saveSplits(db, rows, now);
  await endUnseen(db, ["crowd", "bigmoney"], new Set(rows.map(r => `${r.kind}:${r.subject}`)));
  return { markets: held.length, live: rows.length, flagged };
}

/** Stocks: insiders buying the dip (Form 4 buys in the last 30 days) and funds adding in a falling quarter (13F adds
 *  filed in the last 120 days), from daily closes. Returns the ids flagged this run. */
export async function stockSplitsOnce(db: Db, now: number): Promise<{ live: number; flagged: string[] }> {
  const r = await db.execute(sql`select detail, amount, at from terminal.moves where source = 'sec' and hidden_at is null
    and ((detail->>'kind' = 'insider' and at > ${new Date(now - 30 * DAY)}) or (detail->>'kind' = 'fund' and at > ${new Date(now - 120 * DAY)}))`);
  const ins: InsiderBuy[] = [], adds: FundAdd[] = [];
  const cusips = new Set<string>();
  for (const x of r.rows as Array<{ detail: Record<string, unknown>; amount: number; at: string }>) {
    const d = x.detail;
    if (d.kind === "insider" && typeof d.ticker === "string" && d.ticker) {
      ins.push({ ticker: d.ticker.toUpperCase(), company: String(d.company ?? d.ticker), owner: String(d.ownerName ?? ""), value: Number(x.amount), tradeDate: String(d.tradeDate ?? iso(new Date(x.at).getTime())) });
    } else if (d.kind === "fund" && typeof d.cusip === "string" && d.period) cusips.add(d.cusip);
  }
  const tickers = await tickersFor(db, [...cusips]);
  for (const x of r.rows as Array<{ detail: Record<string, unknown>; amount: number }>) {
    const d = x.detail;
    const t = d.kind === "fund" ? tickers.get(String(d.cusip)) : null;
    if (t) adds.push({ ticker: t, company: String(d.company ?? t), fund: String(d.fund ?? ""), addedValue: Number(x.amount), period: String(d.period) });
  }
  const closes = await closesFor(db, [...ins.map(b => b.ticker), ...adds.map(a => a.ticker)], iso(now - 400 * DAY));
  const open = await db.select({ subject: splits.subject, kind: splits.kind }).from(splits).where(and(inArray(splits.kind, ["insider_dip", "fund_add"]), isNull(splits.resolvedAt)));
  // One open split per ticker and kind: a later wave of buys updates it; after it's scored a new one starts.
  const subjectFor = (kind: SplitKind, ticker: string, from: string) => open.find(o => o.kind === kind && o.subject.startsWith(`${ticker}:`))?.subject ?? `${ticker}:${from}`;
  const rows: SplitRow[] = [];
  for (const d of insiderDips(ins, closes)) {
    rows.push({ kind: "insider_dip", source: "sec", subject: subjectFor("insider_dip", d.ticker, d.from), title: `Insiders buying the dip: ${d.company}`, subtitle: d.ticker, tab: "stocks", league: null,
      crowd: null, smart: null, gap: d.fall, smartSide: "up", detail: { ticker: d.ticker, company: d.company, owners: d.owners, value: Math.round(d.value), from: d.from, to: d.to } });
  }
  for (const f of fundAddsInFall(adds, closes)) {
    rows.push({ kind: "fund_add", source: "sec", subject: subjectFor("fund_add", f.ticker, f.period), title: `Big funds adding while it falls: ${f.company}`, subtitle: f.ticker, tab: "stocks", league: null,
      crowd: null, smart: null, gap: f.fall, smartSide: "up", detail: { ticker: f.ticker, company: f.company, funds: f.funds, value: Math.round(f.value), period: f.period } });
  }
  const flagged = await saveSplits(db, rows.filter(x => x.gap >= SPLIT_MIN), now);
  await endUnseen(db, ["insider_dip", "fund_add"], new Set(rows.map(x => `${x.kind}:${x.subject}`)));
  return { live: rows.length, flagged };
}

async function tickersFor(db: Db, cusips: readonly string[]): Promise<Map<string, string>> {
  if (!cusips.length) return new Map();
  const r = await db.execute(sql`select cusip, ticker from terminal.cusip_tickers where ticker is not null and cusip in (${sql.join(cusips.map(c => sql`${c}`), sql`, `)})`);
  return new Map((r.rows as Array<{ cusip: string; ticker: string }>).map(x => [x.cusip, x.ticker]));
}

/** Scores flagged splits that ended: markets once settled (from the venue), stocks STOCK_WINDOW_DAYS after the flag. */
export async function resolveSplitsOnce(db: Db, poly: PolymarketClient, now: number): Promise<number> {
  const due = await db.select().from(splits).where(and(isNotNull(splits.flaggedAt), isNull(splits.resolvedAt))).limit(500);
  let n = 0;
  const markets = due.filter(s => s.source === "polymarket");
  const got = markets.length ? await poly.getMarketsById([...new Set(markets.map(s => s.subject))]).catch(() => new Map()) : new Map();
  for (const s of markets) {
    const m = got.get(s.subject);
    if (!m?.result) continue;
    await db.update(splits).set({ live: false, outcome: m.result, smartRight: marketVerdict(s.smartSide as "yes" | "no", m.result), resolvedAt: new Date(now) }).where(eq(splits.id, s.id));
    n++;
  }
  const stocks = due.filter(s => s.source === "sec");
  const closes = await closesFor(db, stocks.map(s => String(s.detail.ticker ?? "")), iso(now - 400 * DAY));
  for (const s of stocks) {
    const v = stockVerdict(closes.get(String(s.detail.ticker ?? "").toUpperCase()) ?? [], iso(s.flaggedAt!.getTime()), iso(now));
    if (!v) continue;
    await db.update(splits).set({ live: false, outcome: v.outcome, smartRight: v.right, resolvedAt: new Date(now), detail: { ...s.detail, change: v.change } }).where(eq(splits.id, s.id));
    n++;
  }
  return n;
}

export type SplitRec = typeof splits.$inferSelect;

/** Live splits, biggest gap first. `until` hides those first seen after it (free viewers see them 30 minutes late). */
export async function liveSplits(db: Db, opts: { kinds?: readonly SplitKind[]; until: number; limit?: number }): Promise<SplitRec[]> {
  return db.select().from(splits).where(and(eq(splits.live, true), isNull(splits.resolvedAt), lte(splits.firstSeenAt, new Date(opts.until)),
    opts.kinds ? inArray(splits.kind, [...opts.kinds]) : undefined)).orderBy(desc(splits.gap)).limit(opts.limit ?? 100);
}

/** Every flagged split, newest first: the public scorecard. */
export async function flaggedSplits(db: Db, limit = 500): Promise<SplitRec[]> {
  return db.select().from(splits).where(isNotNull(splits.flaggedAt)).orderBy(desc(splits.flaggedAt)).limit(limit);
}

/** The live crowd split (and game split) on these markets, for cards and market pages. */
export async function splitsFor(db: Db, marketIds: readonly string[]): Promise<Map<string, { crowd?: SplitRec; bigmoney?: SplitRec }>> {
  const ids = [...new Set(marketIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const rows = await db.select().from(splits).where(and(eq(splits.live, true), inArray(splits.subject, ids), inArray(splits.kind, ["crowd", "bigmoney"])));
  const out = new Map<string, { crowd?: SplitRec; bigmoney?: SplitRec }>();
  for (const r of rows) out.set(r.subject, { ...out.get(r.subject), [r.kind]: r });
  return out;
}

/** Smart money on one market for its page, read live (also under the listing line): proven money each side, all big
 *  money each side. Null when no proven trader holds it. */
export async function marketSmart(db: Db, marketId: string, now: number): Promise<{ smart: Smart; big: { yes: number; no: number } | null; outcomes: [string | null, string | null]; cur: number | null } | null> {
  const o = (await provenOpen(db, now, [marketId])).get(marketId);
  if (!o) return null;
  return { smart: smartOf(o.positions), big: (await bigMoney(db, [marketId])).get(marketId) ?? null, outcomes: o.outcomes, cur: o.cur };
}

/** Splits flagged in the last `ms` (alerts). */
export async function newlyFlagged(db: Db, since: number): Promise<SplitRec[]> {
  return db.select().from(splits).where(and(gte(splits.flaggedAt, new Date(since)), eq(splits.live, true))).orderBy(desc(splits.gap));
}
