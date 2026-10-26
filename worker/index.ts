/* Insidir Terminal worker (Railway service "worker": `npm run worker`).
 *
 *   sweep     every SWEEP_MS:  list markets and events on every venue, match Kalshi ↔ Polymarket (and ↔ Polymarket US),
 *                              store markets and pairs
 *   scan      every SCAN_MS:   fetch the books the engines need ("hot" priority for markets with live deals, the rest
 *                              on the full-scan cadence), run every engine, store deals and their receipts, write a
 *                              heartbeat per venue (the site shows "Live data paused, retrying" when they go quiet)
 *   alerts    every ALERT_MS:  Price gaps alerts for Pro (only while price_gaps is ready)
 *   moves:alerts every ALERT_MS: push and email for new moves by followed traders, $50k+ in followed markets, Pro rules
 *   moves:daily  every 10 min:  the 8am ET daily email (yesterday's top 5 moves and how top-trader moves settled)
 *   whales    every WHALE_MS:  Polymarket trades over $10K
 *   moves     every MOVES_MS (15s): big money moves from Polymarket and Kalshi; settle every 10 min; trader records
 *             every 5 min (lib/moves/jobs.ts)
 *   settle    every SETTLE_MS: record how each logged deal resolved
 *
 * Every job catches its own errors: a venue being down pauses that venue, never the worker. 429s are logged. */
import { createVenueClients, KalshiClient, PolymarketClient, rateLimitStats, type VenueClient } from "@/lib/exchanges";
import { MOVES_MS, movesOnce, movesPoller, recordsOnce, settleMovesOnce } from "@/lib/moves/jobs";
import { marketKey } from "@/lib/engines/common";
import { settle } from "@/lib/engines/receipts";
import { bigTrades } from "@/lib/engines/whales";
import { alertText, dueAlerts } from "@/lib/alerts/fanout";
import { ALERT_MAX_AGE_MS, alertJobs, alertMessage, dailyDue, dailyEmail } from "@/lib/moves/alerts";
import { dailyLists, moveAlertUsers, recentMoves } from "@/lib/moves/alert-store";
import { recordsFor } from "@/lib/moves/store";
import { isReady } from "@/lib/features";
import { renderEmail, sendEmail, sendPush, unsubscribeUrl } from "@/lib/alerts/send";
import { appUrl } from "@/lib/auth/whop";
import { closeDb, getDb } from "@/lib/db";
import { createOpenRouterConfirm, llmEnv, matchConfigFromEnv, matchMarkets } from "@/lib/matching";
import { marketsToBook, scan, type Universe } from "@/lib/scanner";
import { pruneLive } from "@/lib/live/publish";
import type { Book, MarketPair, VEvent, VMarket, Venue } from "@/lib/types";
import {
  alertableDeals, alertUsers, claimAlert, dbMatchCache, dbUsageStore, deactivateStale, dropPush, heartbeat, loadOverrides, markDigestSent,
  pushTargets, saveMarkets, saveNearMisses, saveOpportunities, savePairs, saveWhales, settleReceipt, unsettledReceipts,
} from "@/lib/worker/store";

const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
export const SWEEP_MS = n("SWEEP_MS", 5 * 60_000);
export const SCAN_MS = n("SCAN_MS", 5_000);
export const FULL_SCAN_MS = n("FULL_SCAN_MS", 60_000);
export const ALERT_MS = n("ALERT_MS", 5_000);
export const WHALE_MS = n("WHALE_MS", 15_000);
export const SETTLE_MS = n("SETTLE_MS", 15 * 60_000);
export const DIGEST_CHECK_MS = 10 * 60_000;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** push(...xs) overflows the stack past ~100K items (Kalshi lists 130K+ markets), so append in a loop. */
const append = <T>(to: T[], xs: readonly T[]) => { for (const x of xs) to.push(x); };

interface State { universe: Universe; lastFull: number; hot: Set<string>; lastTickAt: Map<string, number> }

async function sweep(clients: Record<Venue, VenueClient>, state: State): Promise<void> {
  const db = getDb();
  const markets: VMarket[] = [], events: VEvent[] = [];
  const byVenue = new Map<Venue, VMarket[]>();
  for (const [venue, client] of Object.entries(clients) as Array<[Venue, VenueClient]>) {
    try {
      const [m, e] = await Promise.all([client.listMarkets({ refresh: true }), client.listEvents()]);
      append(markets, m); append(events, e); byVenue.set(venue, m);
      await saveMarkets(db, m);
      log(`sweep ${venue}: ${m.length} markets, ${e.length} events`);
    } catch (e) {
      log(`sweep ${venue} failed: ${errMsg(e)}`);
      await heartbeat(db, "scan:" + venue, false, "sweep: " + errMsg(e)).catch(() => undefined);
      // Keep the venue's last known markets so a blip doesn't drop its deals.
      const prev = state.universe.markets.filter(x => x.venue === venue);
      append(markets, prev); byVenue.set(venue, prev);
      append(events, state.universe.events.filter(x => x.venue === venue));
    }
  }
  const kalshi = byVenue.get("kalshi") ?? [];
  const env = llmEnv(process.env);
  const deps = {
    cache: dbMatchCache(db), overrides: await loadOverrides(db), now: Date.now(), config: matchConfigFromEnv(process.env),
    llm: env.apiKey ? createOpenRouterConfirm({ apiKey: env.apiKey, model: env.model, monthlyCapUsd: env.monthlyCapUsd, usage: dbUsageStore(db), now: () => Date.now(), appUrl: appUrl() }) : undefined,
  };
  const pairs: MarketPair[] = [];
  for (const other of ["polymarket", "polymarket_us"] as const) {
    const list = byVenue.get(other) ?? [];
    if (!kalshi.length || !list.length) continue;
    const { pairs: p, stats } = await matchMarkets(kalshi, list, deps);
    append(pairs, p);
    log(`match kalshi↔${other}: ${p.length} pairs (green ${stats.green}, yellow ${stats.yellow}, red ${stats.red}), candidates ${stats.candidates}, llm asked ${stats.llmAsked}, rejected ${stats.rejected}`);
  }
  await savePairs(db, pairs);
  state.universe = { markets, events, pairs };
}

async function scanOnce(clients: Record<Venue, VenueClient>, state: State): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const full = now - state.lastFull >= FULL_SCAN_MS;
  const need = marketsToBook(state.universe);
  const books = new Map<string, Book>();
  for (const [venue, list] of need) {
    const targets = full ? list : list.filter(m => state.hot.has(marketKey(m.venue, m.id)));
    if (!targets.length) continue;
    try {
      const got = await clients[venue].getBooks(targets, { priority: full ? "normal" : "hot" });
      for (const [id, b] of got) books.set(marketKey(venue, id), b);
      await heartbeat(db, "scan:" + venue, true, null, { markets: targets.length, books: got.size });
    } catch (e) {
      log(`books ${venue} failed: ${errMsg(e)}`);
      await heartbeat(db, "scan:" + venue, false, errMsg(e)).catch(() => undefined);
    }
  }
  if (full) state.lastFull = now;
  if (!books.size) return;
  const { opps, counts, nearMisses } = scan(state.universe, books, now);
  const fresh = await saveOpportunities(db, opps, new Date(now), state.lastTickAt);
  await saveNearMisses(db, nearMisses);
  const dropped = full ? await deactivateStale(db, new Date(now)) : 0;
  state.hot = new Set(opps.flatMap(o => o.legs.map(l => marketKey(l.venue, l.marketId))));
  if (full || fresh.length) log(`scan${full ? " (full)" : ""}: ${books.size} books, ${opps.length} deals (${JSON.stringify(counts)}), ${fresh.length} new, ${dropped} gone`);
}

async function alertsOnce(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const deals = await alertableDeals(db, new Date(now - 15 * 60_000));
  if (!deals.length) return;
  // Price gaps are a Pro extra in V2.
  const users = (await alertUsers(db, new Date(now))).filter(u => u.plan === "pro");
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
    } else if (user.email) {
      const unsub = unsubscribeUrl(appUrl(), user.id);
      const body = renderEmail({ heading: msg.title, lines: [{ text: msg.body }], cta: { label: "Open the deal", url: msg.url }, unsubscribe: unsub });
      await sendEmail({ to: user.email, subject: msg.title, ...body, unsubscribe: unsub });
    }
  }
}

/** Push and email for new moves (docs/V2.md §7). Each user, move and channel goes out once (alerts_sent, "move:<id>"). */
async function moveAlertsOnce(): Promise<void> {
  const push = isReady("alerts_push"), email = isReady("alerts_email");
  if (!push && !email) return;
  const db = getDb();
  const now = Date.now();
  const fresh = await recentMoves(db, new Date(now - ALERT_MAX_AGE_MS));
  if (!fresh.length) return;
  const users = (await moveAlertUsers(db)).map(u => ({ ...u, push: u.push && push, emailOn: u.emailOn && email }));
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
    } else if (user.email) {
      const unsub = unsubscribeUrl(appUrl(), user.id);
      await sendEmail({ to: user.email, subject: msg.title, ...renderEmail({ heading: msg.title, lines: [{ text: msg.body }], cta: { label: "See the market", url: msg.url }, unsubscribe: unsub }), unsubscribe: unsub });
    }
  }
}

/** The 8am ET daily email for members who keep it on. */
async function dailyOnce(): Promise<void> {
  if (!isReady("daily_email")) return;
  const db = getDb();
  const now = Date.now();
  const due = (await moveAlertUsers(db)).filter(u => dailyDue(u, now));
  if (!due.length) return;
  const { top, settled, records } = await dailyLists(db, now);
  const e = dailyEmail(top, settled, records, appUrl());
  for (const u of due) {
    const unsub = unsubscribeUrl(appUrl(), u.id);
    const body = renderEmail({ heading: e.heading, lines: e.lines, cta: { label: "See the live feed", url: `${appUrl()}/feed?from=daily` }, unsubscribe: unsub });
    if (u.email && (await sendEmail({ to: u.email, subject: e.subject, ...body, unsubscribe: unsub })) === "sent") await markDigestSent(db, u.id, new Date(now));
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
  const state: State = { universe: { markets: [], events: [], pairs: [] }, lastFull: 0, hot: new Set(), lastTickAt: new Map() };
  log("worker starting");
  // Big money moves (docs/V2.md): only with both public clients in place.
  const poller = clients.polymarket instanceof PolymarketClient && clients.kalshi instanceof KalshiClient ? movesPoller(clients.polymarket, clients.kalshi) : null;
  await sweep(clients, state).catch(e => log("first sweep failed:", errMsg(e)));
  const stops = [
    every("sweep", SWEEP_MS, () => sweep(clients, state)),
    every("scan", SCAN_MS, () => scanOnce(clients, state)),
    every("alerts", ALERT_MS, async () => { if (isReady("price_gaps")) await alertsOnce(); }),
    every("moves:alerts", ALERT_MS, moveAlertsOnce),
    every("moves:daily", DIGEST_CHECK_MS, dailyOnce),
    every("whales", WHALE_MS, () => whalesOnce(clients)),
    every("settle", SETTLE_MS, () => settleOnce(clients)),
    ...(poller ? [
      every("moves", MOVES_MS, async () => {
        const fresh = await movesOnce(getDb(), poller, state.universe.markets, Date.now(), (job, ok, err) => heartbeat(getDb(), job, ok, err ?? null));
        if (fresh.length) log(`moves: ${fresh.length} new`);
      }),
      every("moves:settle", 10 * 60_000, async () => {
        const n = await settleMovesOnce(getDb(), { polymarket: clients.polymarket as PolymarketClient, kalshi: clients.kalshi as KalshiClient }, Date.now());
        if (n) log(`moves: ${n} markets settled`);
      }),
      every("moves:records", 5 * 60_000, async () => {
        const n = await recordsOnce(getDb(), clients.polymarket as PolymarketClient, Date.now());
        if (n) log(`moves: ${n} trader records refreshed`);
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
  main({ runForMs: runFor }).catch(e => { console.error(e); process.exit(1); });
}
