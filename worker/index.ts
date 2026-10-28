/* Insidir Terminal worker (Railway service "worker": `npm run worker`).
 *
 *   gaps      every BOOKS_MS (10s), only with GAPS_ENABLED=1: books for the Price gaps targets the cron matcher
 *                              (`npm run match`, every 6 h) chose, every engine, quarantine, store deals and receipts,
 *                              a heartbeat per venue. Matching itself never runs in the worker.
 *   alerts    every ALERT_MS:  Price gaps alerts for Pro (only while price_gaps is ready)
 *   moves:alerts every ALERT_MS: push and email for new moves by followed traders, $50k+ in followed markets, Pro rules
 *   moves:daily  every 10 min:  the 8am ET daily email (yesterday's top 5 moves and how top-trader moves settled)
 *   emails:lifecycle every 10 min: day 0 welcome, day 2 "your trial ends tomorrow", Monday results (lib/emails/lifecycle.ts)
 *   whales    every WHALE_MS:  Polymarket trades over $10K
 *   moves     every MOVES_MS (15s): big money moves from Polymarket and Kalshi; settle every 10 min; trader records
 *             and resolved positions every 5 min, the public leaderboard's wallets every 6 h (lib/moves/jobs.ts)
 *   stocks    with SEC_USER_AGENT: Form 4 insider buys every 2 min, 13F fund adds every 6 h (lib/stocks/jobs.ts);
 *             for profiles, buyers' and companies' Form 4 histories every 5 min and funds' quarters every 30 min
 *   settle    every SETTLE_MS: record how each logged deal resolved
 *   accuracy  every hour: 20 random moves and 20 profile facts re-read from their sources (lib/accuracy/check.ts);
 *             moves that don't match are hidden until they do; OWNER_EMAIL gets an email when anything is off
 *
 * Every job catches its own errors: a venue being down pauses that venue, never the worker. 429s are logged. */
import { createVenueClients, KalshiClient, PolymarketClient, rateLimitStats, type VenueClient } from "@/lib/exchanges";
import { gapsEnabled } from "@/lib/flags";
import { BOOKS_MS, LiveGaps } from "@/lib/gaps/live";
import { MarketDirectory } from "@/lib/moves/directory";
import { dedupeOnce, leagueBackfillOnce, leaderboardOnce, reclassifyOnce, MOVES_MS, movesOnce, movesPoller, realizeOnce, recordsOnce, settleMovesOnce } from "@/lib/moves/jobs";
import { form13fOnce, form4Once, fundHistoriesOnce, STOCKS_13F_MS, STOCKS_FORM4_MS, stocksIngestOn } from "@/lib/stocks/jobs";
import { historyOnce } from "@/lib/stocks/history";
import { SecClient } from "@/lib/stocks/sec";
import { marketKey } from "@/lib/engines/common";
import { settle } from "@/lib/engines/receipts";
import { bigTrades } from "@/lib/engines/whales";
import { alertText, dueAlerts } from "@/lib/alerts/fanout";
import { ALERT_MAX_AGE_MS, alertJobs, alertMessage } from "@/lib/moves/alerts";
import { moveAlertUsers, recentMoves } from "@/lib/moves/alert-store";
import { recordsFor } from "@/lib/moves/store";
import { isReady } from "@/lib/features";
import { sendPush } from "@/lib/alerts/send";
import { appUrl } from "@/lib/app-url";
import { closeDb, getDb } from "@/lib/db";
import { ACCURACY_MS, runAccuracyCheck } from "@/lib/accuracy/check";
import { scanOptionsFromEnv } from "@/lib/scanner";
import { pruneLive } from "@/lib/live/publish";
import type { VMarket, Venue } from "@/lib/types";
import {
  alertableDeals, alertUsers, claimAlert, deactivateStale, dropPush, heartbeat,
  pushTargets, saveOpportunities, saveQuarantined, saveWhales, settleReceipt, unsettledReceipts,
} from "@/lib/worker/store";

const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
export const ALERT_MS = n("ALERT_MS", 5_000);
export const WHALE_MS = n("WHALE_MS", 15_000);
export const SETTLE_MS = n("SETTLE_MS", 15 * 60_000);

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
/** Capped: a failed bulk insert puts its whole SQL statement (thousands of placeholders) in the message. */
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
/** Price gaps, live (lib/gaps/live.ts): the targets the cron matcher chose (re-read every 10 min), their books every
 *  BOOKS_MS, every engine, quarantine, then store. One heartbeat per venue ("scan:<venue>") for the Price gaps
 *  status line. Off unless GAPS_ENABLED=1. */
async function gapsOnce(live: LiveGaps, lastTickAt: Map<string, number>): Promise<void> {
  const db = getDb();
  const now = Date.now();
  if (await live.refresh(now)) log(`gaps: ${live.size.targets} targets, ${live.size.markets} markets, ${live.size.books} books per round`);
  if (!live.size.books) return;
  const r = await live.round(now);
  for (const venue of ["kalshi", "polymarket", "polymarket_us"] as const) {
    const err = r.errors.find(e => e.startsWith(venue + ":"));
    await heartbeat(db, "scan:" + venue, !err, err ?? null, { books: r.books, requests: r.requests });
  }
  const fresh = await saveOpportunities(db, r.opps, new Date(now), lastTickAt);
  const held = new Set(await saveQuarantined(db, r.held, new Date(now)));
  for (const q of r.held) if (held.has(q.opp.id)) log(`quarantined ${q.opp.kind} "${q.opp.title}" (${q.opp.id}): ${q.reasons.join("; ")}`);
  const dropped = await deactivateStale(db, new Date(now));
  if (fresh.length || dropped) log(`gaps: ${r.books} books, ${r.opps.length} deals, ${fresh.length} new, ${r.held.length} held, ${dropped} gone`);
}

async function alertsOnce(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const deals = await alertableDeals(db, new Date(now - 15 * 60_000));
  if (!deals.length) return;
  // Price gaps are for members.
  const users = (await alertUsers(db, new Date(now))).filter(u => u.plan === "insidir");
  const byId = new Map(deals.map(d => [d.opp.id, d.opp]));
  const userById = new Map(users.map(u => [u.id, u]));
  for (const job of dueAlerts(users, deals, now)) {
    const opp = byId.get(job.oppId), user = userById.get(job.userId);
    if (!opp || !user || !(await claimAlert(db, job.userId, job.oppId, job.channel))) continue;
    const msg = alertText(opp, appUrl(), job.channel);
    if (job.channel === "push") {
      for (const t of await pushTargets(db, user.id)) {
        const r = await sendPush(t, msg);
        if (r === "gone") await dropPush(db, t.endpoint);
      }
    }
  }
}

/** Push alerts for new moves (docs/INSIDIR-V2.md §7). Insidir sends no email. Each user and move goes out once
 *  (alerts_sent, "move:<id>"). */
async function moveAlertsOnce(): Promise<void> {
  if (!isReady("alerts_push")) return;
  const db = getDb();
  const now = Date.now();
  const fresh = await recentMoves(db, new Date(now - ALERT_MAX_AGE_MS));
  if (!fresh.length) return;
  const users = (await moveAlertUsers(db)).map(u => ({ ...u, emailOn: false }));
  const jobs = alertJobs(users, fresh, now);
  if (!jobs.length) return;
  const byId = new Map(fresh.map(m => [m.id, m])), userById = new Map(users.map(u => [u.id, u]));
  const records = await recordsFor(db, fresh.map(m => m.wallet ?? ""));
  for (const job of jobs) {
    const m = byId.get(job.moveId), user = userById.get(job.userId);
    if (!m || !user || !(await claimAlert(db, job.userId, `move:${m.id}`, job.channel))) continue;
    const msg = alertMessage(m, m.wallet ? records.get(m.wallet) ?? null : null, job.reason, appUrl(), now);
    if (job.channel === "push") {
      for (const t of await pushTargets(db, user.id)) if ((await sendPush(t, msg)) === "gone") await dropPush(db, t.endpoint);
    }
  }
}

async function whalesOnce(clients: Record<Venue, VenueClient>): Promise<void> {
  const poly = clients.polymarket;
  if (!(poly instanceof PolymarketClient)) return;
  await saveWhales(getDb(), bigTrades(await poly.getWhaleTrades({ minCash: 10_000, limit: 200 })));
}

async function settleOnce(clients: Record<Venue, VenueClient>): Promise<void> {
  const db = getDb();
  const now = new Date();
  await pruneLive(db, now);
  const due = await unsettledReceipts(db, now);
  if (!due.length) return;
  const ids = new Map<Venue, Set<string>>();
  for (const r of due) for (const l of r.snapshot.legs) ids.set(l.venue, (ids.get(l.venue) ?? new Set()).add(l.marketId));
  const results = new Map<string, "yes" | "no" | "void">();
  for (const [venue, set] of ids) {
    const client = clients[venue] as VenueClient & { getMarketsById?: (ids: readonly string[]) => Promise<Map<string, VMarket>> };
    if (!client.getMarketsById) continue;
    try {
      for (const [id, m] of await client.getMarketsById([...set])) if (m.result) results.set(marketKey(venue, id), m.result);
    } catch (e) { log(`settle ${venue} failed: ${errMsg(e)}`); }
  }
  let settled = 0;
  for (const r of due) {
    const s = settle(r.snapshot, results);
    if (!s.settled) continue;
    const legResults: Record<string, "yes" | "no" | "void"> = {};
    for (const l of r.snapshot.legs) { const v = results.get(marketKey(l.venue, l.marketId)); if (v) legResults[`${l.venue}:${l.marketId}`] = v; }
    await settleReceipt(db, r.id, legResults, s.sameWay, s.realizedProfit, now);
    settled++;
  }
  if (settled) log(`settled ${settled} receipts`);
}

/** The hourly accuracy check and its heartbeat (read on /admin). */
async function accuracyOnce(poly: PolymarketClient, kalshi: KalshiClient, sec: SecClient | null): Promise<void> {
  const db = getDb();
  const run = await runAccuracyCheck(db, { poly, kalshi, sec });
  const count = (s: string) => run.lines.filter(l => l.status === s).length;
  const stats = { ok: count("ok"), mismatch: count("mismatch"), skipped: count("skipped"), hidden: run.hidden.length, restored: run.restored.length };
  await heartbeat(db, "accuracy", stats.mismatch === 0, stats.mismatch ? `${stats.mismatch} mismatches` : null, stats);
  log(`accuracy: ${stats.ok} ok, ${stats.mismatch} mismatched, ${stats.skipped} skipped; ${stats.hidden} moves hidden, ${stats.restored} restored`);
  // Each mismatch on its own line (public data only: what was checked and how it differs), so it can be read from the logs.
  for (const l of run.lines.filter(x => x.status === "mismatch")) log(`accuracy mismatch: ${l.kind}/${l.what} ${l.target} | ${l.label} | ${l.problems.join("; ")}`);
}

/** Runs `fn` every `ms`, never overlapping itself, logging failures. */
function every(name: string, ms: number, fn: () => Promise<void>): () => void {
  let running = false, stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await fn(); } catch (e) { log(`${name} failed: ${errMsg(e)}`); await heartbeat(getDb(), name, false, errMsg(e)).catch(() => undefined); }
    finally { running = false; }
  };
  void tick();
  const t = setInterval(() => void tick(), ms);
  return () => { stopped = true; clearInterval(t); };
}

export async function main(opts: { runForMs?: number } = {}): Promise<void> {
  const clients = createVenueClients();
  const gaps = gapsEnabled() ? new LiveGaps(getDb(), clients, scanOptionsFromEnv()) : null;
  const lastTickAt = new Map<string, number>();
  log(`worker starting (Price gaps ${gaps ? "on" : "off: GAPS_ENABLED is not 1"})`);
  // Big money moves (docs/INSIDIR-V2.md): only with both public clients in place.
  const poller = clients.polymarket instanceof PolymarketClient && clients.kalshi instanceof KalshiClient ? movesPoller(clients.polymarket, clients.kalshi) : null;
  const directory = new MarketDirectory(getDb(), { polymarket: clients.polymarket, kalshi: clients.kalshi });
  const sec = SecClient.fromEnv();
  if (!sec) log("stocks: SEC_USER_AGENT not set (name and email), Stocks ingest is off");
  const stops = [
    ...(gaps ? [every("gaps", BOOKS_MS, () => gapsOnce(gaps, lastTickAt))] : []),
    every("alerts", ALERT_MS, async () => { if (gaps && isReady("price_gaps")) await alertsOnce(); }),
    every("moves:alerts", ALERT_MS, moveAlertsOnce),
    every("whales", WHALE_MS, () => whalesOnce(clients)),
    every("settle", SETTLE_MS, () => settleOnce(clients)),
    ...(poller ? [
      every("moves", MOVES_MS, async () => {
        const fresh = await movesOnce(getDb(), poller, directory, Date.now(), (job, ok, err) => heartbeat(getDb(), job, ok, err ?? null));
        if (fresh.length) log(`moves: ${fresh.length} new`);
      }),
      every("moves:settle", 10 * 60_000, async () => {
        const n = await settleMovesOnce(getDb(), { polymarket: clients.polymarket as PolymarketClient, kalshi: clients.kalshi as KalshiClient }, Date.now());
        if (n) log(`moves: ${n} markets settled`);
      }),
      every("moves:reclassify", 60 * 60_000, async () => {
        const n = await reclassifyOnce(getDb(), clients.polymarket as PolymarketClient);
        if (n) log(`moves: ${n} Polymarket markets moved to Sports`);
      }),
      every("moves:leagues", 10 * 60_000, async () => {
        const n = await leagueBackfillOnce(getDb());
        if (n) log(`moves: ${n} sports moves got their league`);
      }),
      every("moves:dedupe", 10 * 60_000, async () => {
        const n = await dedupeOnce(getDb(), clients.polymarket as PolymarketClient);
        if (n) log(`moves: ${n} duplicate positions merged`);
      }),
      every("moves:realize", 5 * 60_000, async () => {
        const n = await realizeOnce(getDb(), clients.polymarket as PolymarketClient, Date.now());
        if (n) log(`moves: ${n} settled bets checked against the wallet's trades`);
      }),
      every("moves:records", 5 * 60_000, async () => {
        const n = await recordsOnce(getDb(), clients.polymarket as PolymarketClient, Date.now());
        if (n) log(`moves: ${n} trader records refreshed`);
      }),
      every("accuracy", ACCURACY_MS, () => accuracyOnce(clients.polymarket as PolymarketClient, clients.kalshi as KalshiClient, sec)),
      every("moves:leaderboard", 6 * 3_600_000, async () => {
        const n = await leaderboardOnce(getDb(), clients.polymarket as PolymarketClient);
        log(`moves: ${n} leaderboard wallets tracked`);
      }),
    ] : []),
    // Stocks (docs/INSIDIR-V2.md): SEC Form 4 insider buys and 13F fund adds, only with SEC_USER_AGENT set.
    ...(sec && stocksIngestOn() ? [
      every("stocks:form4", STOCKS_FORM4_MS, async () => {
        try {
          const r = await form4Once(getDb(), sec);
          await heartbeat(getDb(), "stocks:form4", r.errors === 0 || r.read > 0, r.errors ? `${r.errors} filings failed` : null, r);
          if (r.moves) log(`stocks: ${r.moves} insider buys from ${r.read} Form 4 filings`);
        } catch (e) { await heartbeat(getDb(), "stocks:form4", false, errMsg(e)).catch(() => undefined); throw e; }
      }),
      every("stocks:13f", STOCKS_13F_MS, async () => {
        try {
          const r = await form13fOnce(getDb(), sec);
          await heartbeat(getDb(), "stocks:13f", r.errors < r.funds, r.errors ? `${r.errors} funds failed` : null, r);
          if (r.moves) log(`stocks: ${r.moves} fund adds from 13F filings`);
        } catch (e) { await heartbeat(getDb(), "stocks:13f", false, errMsg(e)).catch(() => undefined); throw e; }
      }),
      // Profiles: each $100k+ buyer's and company's Form 4 history, and each fund's last 8 quarters (lib/stocks/history.ts).
      every("stocks:history", 5 * 60_000, async () => {
        const r = await historyOnce(getDb(), sec, Date.now());
        if (r.read || r.errors) log(`stocks: ${r.read} history filings read, ${r.done} histories complete, ${r.errors} errors`);
      }),
      every("stocks:funds", 30 * 60_000, async () => {
        const r = await fundHistoriesOnce(getDb(), sec, Date.now());
        if (r.read || r.errors) log(`stocks: ${r.read} fund quarters read, ${r.errors} errors`);
      }),
    ] : []),
    every("ratelimits", 60_000, async () => {
      const s = rateLimitStats();
      log("rate limits:", Object.entries(s).map(([k, v]) => `${k} ${v.requests} req, ${v.rateLimited} 429s, ${v.retries} retries`).join(" | "));
      await heartbeat(getDb(), "ratelimits", true, null, Object.fromEntries(Object.entries(s).flatMap(([k, v]) => [[k + ":requests", v.requests], [k + ":429", v.rateLimited]])));
    }),
  ];
  const stop = async () => { stops.forEach(s => s()); await closeDb(); log("worker stopped"); };
  process.on("SIGTERM", () => void stop().then(() => process.exit(0)));
  process.on("SIGINT", () => void stop().then(() => process.exit(0)));
  if (opts.runForMs) { await new Promise(r => setTimeout(r, opts.runForMs)); await stop(); }
}

if (process.argv[1]?.endsWith("worker/index.ts")) {
  const runFor = Number(process.env.WORKER_RUN_FOR_MS) || undefined;
  // A timed run (WORKER_RUN_FOR_MS) ends when its time is up, even with source requests still retrying.
  main({ runForMs: runFor }).then(() => { if (runFor) process.exit(0); }, e => { console.error(e); process.exit(1); });
}
