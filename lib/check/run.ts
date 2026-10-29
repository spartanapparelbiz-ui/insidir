/* Checking a bet against our data (lib/check), the database and venue side. Each leg is matched to the same market on
 * Polymarket or Kalshi (markets with big money we track, then Polymarket's own search), and gets: the big money on
 * each side, proven traders' side (lib/smart), the crowd's chance now against the chance the slip's price stands
 * for, and one verdict. A stock gets insiders buying or selling in the last 90 days and funds adding or cutting.
 * Every check is kept for the member's history and settled from the venue's result. Server only. */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { betChecks } from "@/lib/db/schema";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { marketSmart, bigMoney } from "@/lib/smart/store";
import type { VMarket } from "@/lib/types";
import { bestMatch, sideOf, words, type Candidate, type Leg } from "./match";
import { chanceFrom } from "./odds";
import { legVerdict, parlaySummary, stockVerdict, type Verdict } from "./verdict";

const DAY = 86_400_000;
/** A venue that doesn't answer in this long is left out for this check (the leg is matched from what we hold). */
export const VENUE_MS = 4_000;
function within<T>(p: Promise<T>, fallback: T, ms = VENUE_MS): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>(ok => setTimeout(() => ok(fallback), ms))]);
}

export interface LegResult {
  leg: Leg;
  market: { source: "polymarket" | "kalshi"; marketId: string; title: string; eventTitle: string | null; yesLabel: string; noLabel: string } | null;
  side: "yes" | "no" | null;
  /** What the slip is on, in the market's words ("Brewers", "Over", "Yes"). */
  sideLabel: string | null;
  /** 0..1 for the slip's side: the market's price now, and the chance the slip's price stands for. */
  crowd: number | null;
  slip: number | null;
  /** All big money we track on each side, dollars. */
  big: { yes: number; no: number } | null;
  /** Proven traders (lib/smart): their money's share on the slip's side, how many, how much. */
  proven: { share: number | null; wallets: number; money: number } | null;
  verdict: Verdict;
  basis: "proven" | "big" | null;
  stock?: { ticker: string; insiderBuys: number; insiderBuyValue: number; insiderSells: number; insiderSellValue: number; fundsAdding: number; fundsCutting: number };
}

export interface CheckResult { id: string; input: "slip" | "link" | "ticker"; book: string | null; legs: LegResult[]; summary: string; createdAt: number; results: string[] | null }

const fromVMarket = (m: VMarket): Candidate => ({ source: m.venue === "kalshi" ? "kalshi" : "polymarket", marketId: m.id, title: m.title, eventTitle: m.eventTitle, yesLabel: m.yesLabel, noLabel: m.noLabel, closeTime: m.closeTime, yesPrice: m.yesPrice ?? null });

/** Markets with big money in the last 30 days whose titles share a word with the leg. */
async function trackedCandidates(db: Db, leg: Leg, now: number): Promise<Candidate[]> {
  const w = [...words(`${leg.event} ${leg.selection}`)].filter(x => x.length >= 4).sort((a, b) => b.length - a.length).slice(0, 4);
  if (!w.length) return [];
  const like = sql.join(w.map(x => sql`(event_title ilike ${`%${x}%`} or market_title ilike ${`%${x}%`})`), sql` or `);
  const r = await db.execute(sql`select source, market_id, max(event_title) as event, max(market_title) as title,
      max(case when outcome_side = 'yes' then outcome end) as yes_label, max(case when outcome_side = 'no' then outcome end) as no_label
    from terminal.moves where source in ('polymarket', 'kalshi') and hidden_at is null and result is null and at > ${new Date(now - 30 * DAY)} and (${like})
    group by source, market_id limit 200`);
  return (r.rows as Array<{ source: "polymarket" | "kalshi"; market_id: string; event: string; title: string; yes_label: string | null; no_label: string | null }>)
    .map(x => ({ source: x.source, marketId: x.market_id, title: x.title, eventTitle: x.event, yesLabel: x.yes_label ?? "Yes", noLabel: x.no_label ?? "No", closeTime: null, yesPrice: null }));
}

export interface Clients { polymarket: PolymarketClient; kalshi: KalshiClient }

/** Everything we know about one market for one side: price, big money, proven traders, verdict. */
async function legFor(db: Db, clients: Clients, leg: Leg, c: Candidate, side: "yes" | "no" | null, now: number): Promise<LegResult> {
  const fresh = (await within(clients[c.source].getMarketsById([c.marketId]), new Map<string, VMarket>())).get(c.marketId);
  const m = fresh ? fromVMarket(fresh) : c;
  const [big, smart] = await Promise.all([bigMoney(db, [c.marketId]).then(x => x.get(c.marketId) ?? null), c.source === "polymarket" ? marketSmart(db, c.marketId, now) : Promise.resolve(null)]);
  const yes = m.yesPrice;
  const crowd = yes === null || side === null ? null : side === "yes" ? yes : 1 - yes;
  const share = smart?.smart.share ?? null;
  const v = legVerdict(side, share, big);
  return {
    leg, market: { source: m.source, marketId: m.marketId, title: m.title, eventTitle: m.eventTitle, yesLabel: m.yesLabel, noLabel: m.noLabel },
    side, sideLabel: side === "yes" ? m.yesLabel : side === "no" ? m.noLabel : null, crowd, slip: chanceFrom(leg.odds), big,
    proven: smart ? { share: share === null || side === null ? share : side === "yes" ? share : 1 - share, wallets: smart.smart.wallets, money: Math.round(smart.smart.yes + smart.smart.no) } : null,
    verdict: v.verdict, basis: v.basis,
  };
}

const noMatch = (leg: Leg): LegResult => ({ leg, market: null, side: null, sideLabel: null, crowd: null, slip: chanceFrom(leg.odds), big: null, proven: null, verdict: "none", basis: null });

/** One slip leg: the best market, then its numbers. Unmatched legs say "No big money yet". */
export async function checkLeg(db: Db, clients: Clients, leg: Leg, now: number): Promise<LegResult> {
  if (leg.marketType === "stock") {
    const t = /\b([A-Z]{1,5})\b/.exec(`${leg.selection} ${leg.event}`)?.[1];
    return t ? checkTicker(db, t, now, leg) : noMatch(leg);
  }
  const fromSearch = await within(clients.polymarket.searchEvents(`${leg.event}`.slice(0, 120)), []);
  const list = [...await trackedCandidates(db, leg, now), ...fromSearch.flatMap(e => e.markets.filter(m => m.active && !m.result).map(fromVMarket))];
  const best = bestMatch(leg, list, now);
  if (!best) return noMatch(leg);
  return legFor(db, clients, leg, best.c, sideOf(leg, best.c), now);
}

/** A stock: insiders buying and selling it in the last 90 days, and funds adding or cutting it in their latest 13F. */
export async function checkTicker(db: Db, ticker: string, now: number, leg?: Leg): Promise<LegResult> {
  const t = ticker.toUpperCase();
  const since = new Date(now - 90 * DAY);
  const [ins, buysFeed, funds] = await Promise.all([
    db.execute(sql`select code, count(distinct owner_cik)::int as n, sum(value)::float as v from terminal.insider_trades where upper(ticker) = ${t} and filed_at > ${since} group by code`),
    db.execute(sql`select count(distinct detail->>'ownerName')::int as n, sum(amount)::float as v from terminal.moves where source = 'sec' and detail->>'kind' = 'insider' and upper(detail->>'ticker') = ${t} and at > ${since} and hidden_at is null`),
    db.execute(sql`with c as (select cusip from terminal.cusip_tickers where ticker = ${t}),
      f as (select h.fund_cik, ff.filed_on, sum(h.shares) as shares, row_number() over (partition by h.fund_cik order by ff.filed_on desc) as k
        from terminal.fund_holdings h join terminal.fund_filings ff on ff.fund_cik = h.fund_cik and ff.accession = h.accession and ff.complete
        where h.cusip in (select cusip from c) group by h.fund_cik, ff.filed_on)
      select count(*) filter (where cur.shares > coalesce(prev.shares, 0))::int as adding, count(*) filter (where cur.shares < prev.shares)::int as cutting
      from f cur left join f prev on prev.fund_cik = cur.fund_cik and prev.k = 2 where cur.k = 1 and cur.filed_on > ${new Date(now - 200 * DAY).toISOString().slice(0, 10)}`),
  ]);
  const by = new Map((ins.rows as Array<{ code: string; n: number; v: number }>).map(r => [r.code, r]));
  const feed = (buysFeed.rows as Array<{ n: number; v: number | null }>)[0];
  const f = (funds.rows as Array<{ adding: number; cutting: number }>)[0] ?? { adding: 0, cutting: 0 };
  const s = {
    ticker: t, insiderBuys: Math.max(by.get("P")?.n ?? 0, feed?.n ?? 0), insiderBuyValue: Math.max(Number(by.get("P")?.v ?? 0), Number(feed?.v ?? 0)),
    insiderSells: by.get("S")?.n ?? 0, insiderSellValue: Number(by.get("S")?.v ?? 0), fundsAdding: f.adding, fundsCutting: f.cutting,
  };
  return { ...noMatch(leg ?? { sport: null, event: t, selection: t, marketType: "stock", line: null, overUnder: null, odds: null, stake: null, date: null }), sideLabel: t, verdict: stockVerdict(s), stock: s };
}

/** A Polymarket or Kalshi link: the market itself, both sides (no slip side, so the verdict says where smart money is). */
export async function checkLink(db: Db, clients: Clients, p: { kind: "polymarket"; slug: string; market: string | null } | { kind: "kalshi"; ticker: string }, now: number): Promise<LegResult | null> {
  let m: VMarket | undefined;
  if (p.kind === "polymarket") {
    const ev = await within(clients.polymarket.getEventBySlug(p.slug), null) ?? await within(clients.polymarket.getEventBySlug(p.market ?? p.slug), null);
    const open = ev?.markets.filter(x => !x.result) ?? [];
    m = (p.market ? open.find(x => x.url.toLowerCase().endsWith(`/${p.market}`)) : undefined) ?? (open.length === 1 ? open[0] : open.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))[0]);
  } else {
    m = (await within(clients.kalshi.getMarketsById([p.ticker]), new Map<string, VMarket>())).get(p.ticker);
  }
  if (!m) return null;
  const leg: Leg = { sport: null, event: m.eventTitle ?? m.title, selection: m.yesLabel, marketType: "yes_no", line: null, overUnder: null, odds: null, stake: null, date: null };
  return legFor(db, clients, leg, fromVMarket(m), null, now);
}

const ALPHA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCheckId(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, x => ALPHA[x % ALPHA.length]).join("");
}

export async function saveCheck(db: Db, c: { input: CheckResult["input"]; book: string | null; legs: LegResult[]; userId: string | null; visitorId: string | null }, now: number): Promise<CheckResult> {
  const id = newCheckId();
  const summary = parlaySummary(c.legs.map(l => l.verdict));
  await db.insert(betChecks).values({ id, userId: c.userId, visitorId: c.visitorId, input: c.input, book: c.book, legs: c.legs, summary, createdAt: new Date(now) });
  return { id, input: c.input, book: c.book, legs: c.legs, summary, createdAt: now, results: null };
}

const rowOf = (r: typeof betChecks.$inferSelect): CheckResult => ({ id: r.id, input: r.input, book: r.book, legs: r.legs as LegResult[], summary: r.summary, createdAt: r.createdAt.getTime(), results: r.results ?? null });

export async function getCheck(db: Db, id: string): Promise<(CheckResult & { userId: string | null }) | null> {
  const r = (await db.select().from(betChecks).where(eq(betChecks.id, id)).limit(1))[0];
  return r ? { ...rowOf(r), userId: r.userId } : null;
}

export async function checksFor(db: Db, userId: string, limit = 50): Promise<CheckResult[]> {
  return (await db.select().from(betChecks).where(eq(betChecks.userId, userId)).orderBy(desc(betChecks.createdAt)).limit(limit)).map(rowOf);
}

/** How many checks this visitor (or signed-in free account) has used: free viewers get FREE_CHECKS. */
export const FREE_CHECKS = 1;
export async function checksUsed(db: Db, who: { userId: string | null; visitorId: string | null }): Promise<number> {
  const conds = [who.userId ? eq(betChecks.userId, who.userId) : undefined, who.visitorId ? eq(betChecks.visitorId, who.visitorId) : undefined].filter(Boolean);
  if (!conds.length) return 0;
  const r = await db.execute(sql`select count(*)::int as n from terminal.bet_checks where ${sql.join(conds.map(c => sql`(${c})`), sql` or `)}`);
  return Number((r.rows as Array<{ n: number }>)[0]?.n ?? 0);
}

/** Each matched leg's result from its venue ("won" / "lost" / "void" / "open"; unmatched legs "open" until never). */
export async function settleCheck(db: Db, clients: Clients, c: CheckResult, now: number): Promise<string[]> {
  const out = await Promise.all(c.legs.map(async l => {
    if (!l.market || !l.side) return l.market ? "open" : "unmatched";
    const m = (await within(clients[l.market.source].getMarketsById([l.market.marketId]), new Map<string, VMarket>())).get(l.market.marketId);
    return !m?.result ? "open" : m.result === "void" ? "void" : m.result === l.side ? "won" : "lost";
  }));
  const done = out.every(r => r !== "open");
  await db.update(betChecks).set({ results: out, ...(done ? { settledAt: new Date(now) } : {}) }).where(and(eq(betChecks.id, c.id)));
  return out;
}
