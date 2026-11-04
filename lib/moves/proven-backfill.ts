/* The proven-wallet backfill (worker job moves:proven-backfill, and inline from a Read): each Polymarket wallet's public
 * record in terminal.wallet_pnl, re-read once it is PROVEN_RECORD_TTL_MS old.
 *   Record   closed markets: distinct markets on Data API /closed-positions, paged up to RECORD_MAX_PAGES (a wallet
 *            with more is kept as "at least"); all-time profit: pnl from its own /v1/leaderboard row (pnl only).
 *   Order    1. wallets a Read needed (terminal.wallet_pnl_queue), oldest first;
 *            2. wallets with open positions in markets that start or close in the next 72 hours (tonight's games,
 *               Tuesday's elections), most open dollars there first;
 *            3. every other wallet with a large position in the last 90 days, newest first.
 *   Speed    each run spends a request budget: the Data API bucket's rate (lib/exchanges/http.ts) × a share × the run's
 *            length. The share grows after a run without a 429 and halves after one, so the backfill settles at what
 *            the limiter allows without errors. Wallets are read concurrently so the bucket, not latency, sets the pace.
 * Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { walletPnlQueue } from "@/lib/db/schema";
import { rows } from "@/lib/exchanges/parse";
import { bucketConfig, venueHttp, type Priority } from "@/lib/exchanges/http";
import type { PolymarketClient } from "@/lib/exchanges";
import { tradesCursor } from "@/lib/exchanges/polymarket";
import { readClosedRows } from "@/lib/profiles/trader";
import { RECORD_MAX_PAGES } from "./jobs";
import { readUserPnl } from "./sources";
import { saveWalletPnl, type WalletPnl } from "./store";

export const PROVEN_RECORD_TTL_MS = 24 * 3_600_000;
export const BACKFILL_DAYS = 90;
/** Markets starting or closing within this window go first. */
export const SOON_MS = 72 * 3_600_000;
const DAY = 86_400_000;

type Poly = Pick<PolymarketClient, "getClosedPositionsPage" | "getLeaderboardUser">;

/* ---------- reading one wallet ---------- */

/** The backfill pages at most this far: 500 settled markets is far past the 30 a proven wallet needs, and a wallet
 *  with more is stored as "at least". A full read of the most active wallets (up to 101 requests) outlasted a run, was
 *  thrown away, and kept the head of the queue: every run read nothing. */
export const BACKFILL_MAX_PAGES = 10;
/** A read cut off by its deadline is still stored when it already shows this many settled markets (as "at least"). */
export const PARTIAL_MIN = 30;

/** One wallet's record, and how many requests it took. Throws when Polymarket can't be read (the wallet stays due).
 *  With a deadline, stops starting new pages after it and returns null (nothing saved), or with `partial` the markets
 *  read so far as "at least" (no profit read). `onRequest` hears every request, kept or not. */
export async function readWalletPnl(poly: Poly, wallet: string, o: { priority?: Priority; deadline?: number; maxPages?: number; partial?: boolean; onRequest?: () => void } = {}): Promise<{ v: WalletPnl; requests: number } | null> {
  const markets = new Set<string>();
  let complete = false, requests = 0;
  let cursor: string | null = null;
  const late = () => o.deadline !== undefined && Date.now() > o.deadline;
  const cut = () => (o.partial && markets.size >= PARTIAL_MIN ? { v: { closed: markets.size, closedAtLeast: true, pnl: null }, requests } : null);
  for (let page = 0; page < (o.maxPages ?? RECORD_MAX_PAGES); page++) {
    if (late()) return cut();
    const raw: unknown = await poly.getClosedPositionsPage(wallet, { limit: 50, cursor, priority: o.priority });
    requests++; o.onRequest?.();
    for (const p of readClosedRows(raw)) markets.add(p.marketId);
    cursor = tradesCursor(raw);
    if (!cursor) { complete = true; break; }
  }
  if (late()) return cut();
  const pnl = readUserPnl(await poly.getLeaderboardUser(wallet, o.priority), wallet);
  requests++; o.onRequest?.();
  return { v: { closed: markets.size, closedAtLeast: !complete, pnl }, requests };
}

async function store(db: Db, wallet: string, v: WalletPnl, now: number): Promise<void> {
  await saveWalletPnl(db, wallet, v, now);
  await db.execute(sql`delete from terminal.wallet_pnl_queue where wallet = ${wallet}`);
}

/* ---------- order ---------- */

/** Due wallets (no record, or one older than staleMs), in backfill order (see the header). */
export async function walletsToBackfill(db: Db, now: number, staleMs: number, limit: number): Promise<string[]> {
  const stale = new Date(now - staleMs), soonFrom = new Date(now - 6 * 3_600_000), soonTo = new Date(now + SOON_MS);
  const r = await db.execute(sql`with cand as (
      select m.wallet, max(m.at) as last_at,
        coalesce(sum(m.amount) filter (where m.result is null and m.hidden_at is null and (
          (i.start_at >= ${soonFrom} and i.start_at < ${soonTo}) or (i.end_at >= ${new Date(now)} and i.end_at < ${soonTo}))), 0)::float as soon
      from terminal.moves m left join terminal.market_info i on i.source = m.source and i.market_id = m.market_id
      where m.source = 'polymarket' and m.wallet is not null and m.at > ${new Date(now - BACKFILL_DAYS * DAY)}
      group by m.wallet
      union all
      select q.wallet, null::timestamptz, 0::float from terminal.wallet_pnl_queue q
    ), w as (select wallet, max(last_at) as last_at, max(soon) as soon from cand group by wallet)
    select w.wallet from w
      left join terminal.wallet_pnl p on p.wallet = w.wallet
      left join terminal.wallet_pnl_queue q on q.wallet = w.wallet
    where p.wallet is null or p.read_at < ${stale}
    order by (q.wallet is not null) desc, q.queued_at asc nulls last, (w.soon > 0) desc, w.soon desc, w.last_at desc nulls last, w.wallet
    limit ${limit}`);
  return (r.rows as Array<{ wallet: string }>).map(x => x.wallet);
}

/** Puts wallets at the front of the backfill (a Read needed them). Already queued ones keep their place. */
export async function enqueueWallets(db: Db, wallets: readonly string[], now: number): Promise<void> {
  const ws = [...new Set(wallets)].filter(Boolean);
  if (ws.length) await db.insert(walletPnlQueue).values(ws.map(wallet => ({ wallet, queuedAt: new Date(now) }))).onConflictDoNothing();
}

/* ---------- on demand, from a Read ---------- */

/** The most wallets a Read reads inline. */
export const INLINE_MAX = 5;

/** A Read's wallets with no record: all of them queued; up to INLINE_MAX read now (hot lane) if they finish within
 *  `ms`. Returns the wallets whose record was stored in time. Reads still running at the deadline are abandoned (the
 *  wallet stays queued for the worker). */
export async function onDemand(db: Db, poly: Poly, missing: readonly string[], ms: number, now: number): Promise<string[]> {
  if (!missing.length) return [];
  await enqueueWallets(db, missing, now);
  if (ms < 200) return [];
  const deadline = Date.now() + ms, done: string[] = [];
  const work = missing.slice(0, INLINE_MAX).map(async w => {
    const r = await readWalletPnl(poly, w, { priority: "hot", deadline }).catch(() => null);
    if (r && Date.now() <= deadline) { await store(db, w, r.v, now); done.push(w); }
  });
  await Promise.race([Promise.all(work), new Promise(ok => setTimeout(ok, ms))]);
  return [...done];
}

/* ---------- speed ---------- */

/** Share of the Data API bucket the backfill may spend: starts at half, +0.1 after a clean run (up to 0.8; the rest
 *  stays for the moves poller and positions), halved after a run that saw a 429 (down to 0.1). */
export const SHARE_START = 0.5, SHARE_MIN = 0.1, SHARE_MAX = 0.8;
export const nextShare = (share: number, rateLimited: number): number =>
  rateLimited > 0 ? Math.max(SHARE_MIN, share / 2) : Math.min(SHARE_MAX, Math.round((share + 0.1) * 10) / 10);
/** Requests one run may spend: bucket rate × share × run length. */
export const budgetFor = (ratePerSec: number, share: number, runMs: number): number => Math.max(1, Math.floor(ratePerSec * share * runMs / 1000));

let share = SHARE_START;
export interface BackfillRun { wallets: number; requests: number; reqPerSec: number; budget: number; share: number; limitPerSec: number; rateLimited: number; failed: number; queued: number; due: number }

/** One run: spends up to its request budget within runMs, reading wallets concurrently in backfill order. */
export async function provenBackfillOnce(db: Db, poly: Poly, now: number, runMs = 50_000): Promise<BackfillRun> {
  const http = venueHttp("polymarket_data"), limit = bucketConfig("polymarket_data").ratePerSec;
  const before = http.stats().rateLimited;
  const budget = budgetFor(limit, share, runMs);
  // Every wallet costs at least 2 requests; take enough to fill the budget. The queue (wallets a Read or the watchlist
  // needs) first, from a cheap query; the full ordering only when it is empty: on a large moves table that query alone
  // can outlast a run, which left the backfill reading nothing.
  const want = Math.ceil(budget / 2);
  const queued = ((await db.execute(sql`select q.wallet from terminal.wallet_pnl_queue q left join terminal.wallet_pnl p on p.wallet = q.wallet
      where p.wallet is null or p.read_at < ${new Date(now - PROVEN_RECORD_TTL_MS)} order by q.queued_at limit ${want}`)).rows as Array<{ wallet: string }>).map(x => x.wallet);
  // Wallets already read in the last day leave the queue.
  await db.execute(sql`delete from terminal.wallet_pnl_queue q using terminal.wallet_pnl p where p.wallet = q.wallet and p.read_at >= ${new Date(now - PROVEN_RECORD_TTL_MS)}`);
  const list = queued.length >= want ? queued : [...queued, ...(await walletsToBackfill(db, now, PROVEN_RECORD_TTL_MS, want)).filter(w => !queued.includes(w))].slice(0, want);
  // The run's clock starts once the list is in hand.
  const t0 = Date.now();
  let spent = 0, wallets = 0, failed = 0, next = 0;
  const lanes = Math.max(1, Math.min(16, Math.ceil(limit * share)));
  await Promise.all(Array.from({ length: lanes }, async () => {
    while (next < list.length && spent < budget && Date.now() - t0 < runMs) {
      const w = list[next++]!;
      try {
        const r = await readWalletPnl(poly, w, { priority: "normal", deadline: t0 + runMs, maxPages: BACKFILL_MAX_PAGES, partial: true, onRequest: () => { spent++; } });
        if (!r) {
          // Cut off with too little read: to the back of the queue, so the next run starts on other wallets.
          await db.execute(sql`update terminal.wallet_pnl_queue set queued_at = ${new Date(Date.now())} where wallet = ${w}`);
          continue;
        }
        if (r.v.pnl === null) {
          // A partial read keeps the profit the wallet already has on record.
          const had = ((await db.execute(sql`select pnl from terminal.wallet_pnl where wallet = ${w}`)).rows[0] as { pnl: number | null } | undefined)?.pnl ?? null;
          r.v.pnl = had;
        }
        await store(db, w, r.v, now);
        wallets++;
      } catch { failed++; spent += 1; }
    }
  }));
  const rateLimited = http.stats().rateLimited - before, secs = Math.max(0.001, (Date.now() - t0) / 1000);
  const run: BackfillRun = { wallets, requests: spent, reqPerSec: Math.round((spent / secs) * 10) / 10, budget, share, limitPerSec: limit, rateLimited, failed,
    queued: await countOf(db, sql`select count(*)::int as n from terminal.wallet_pnl_queue`),
    due: await countOf(db, sql`select count(distinct m.wallet)::int as n from terminal.moves m left join terminal.wallet_pnl p on p.wallet = m.wallet
      where m.source = 'polymarket' and m.wallet is not null and m.at > ${new Date(now - BACKFILL_DAYS * DAY)} and (p.wallet is null or p.read_at < ${new Date(now - PROVEN_RECORD_TTL_MS)})`) };
  share = nextShare(share, rateLimited);
  return run;
}

async function countOf(db: Db, q: ReturnType<typeof sql>): Promise<number> {
  return Number(((await db.execute(q)).rows[0] as { n: number } | undefined)?.n ?? 0);
}

/** For tests: the share back to its start. */
export const resetShare = () => { share = SHARE_START; };
