/* Insidir Terminal worker (Railway service "worker": `npm run worker`).
 *
 *   sweep     every SWEEP_MS:  list markets and events on every venue, match Kalshi ↔ Polymarket (and ↔ Polymarket US)
 *                              in the match thread (worker/match-thread.ts: only new or changed markets are re-matched),
 *                              store changed markets and the pairs
 *   scan      every SCAN_MS:   fetch the books the engines need (matched pairs, plus traded markets closing within
 *                              BOOK_MAX_DAYS: lib/scanner.ts) ("hot" priority for markets with live deals, the rest
 *                              on the full-scan cadence), run every engine, store deals and their receipts, write a
 *                              heartbeat per venue (the site shows "Live data paused, retrying" when they go quiet)
 *   alerts    every ALERT_MS:  web push (Pro instant, Insidir within 60s), email backup, daily summaries
 *   whales    every WHALE_MS:  Polymarket trades over $10K
 *   settle    every SETTLE_MS: record how each logged deal resolved
 *
 * Every job catches its own errors: a venue being down pauses that venue, never the worker. 429s are logged. */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { createVenueClients, PolymarketClient, rateLimitStats, type VenueClient } from "@/lib/exchanges";
import { marketKey } from "@/lib/engines/common";
import { settle } from "@/lib/engines/receipts";
import { bigTrades } from "@/lib/engines/whales";
import { alertText, digestDue, digestRows, dueAlerts } from "@/lib/alerts/fanout";
import { renderEmail, sendEmail, sendPush, unsubscribeUrl } from "@/lib/alerts/send";
import { appUrl } from "@/lib/auth/whop";
import { closeDb, getDb } from "@/lib/db";
import { hiddenKinds } from "@/lib/flags";
import { MatchThread } from "./match-client";
import { quarantineReasons } from "@/lib/quarantine";
import { matchFingerprint } from "@/lib/matching";
import { storedOpps } from "@/lib/queries";
import { marketsToBook, scan, scanOptionsFromEnv, type Universe } from "@/lib/scanner";
import { pct, usd } from "@/lib/format";
import type { Book, Opportunity, VEvent, VMarket, Venue } from "@/lib/types";
import {
  alertableDeals, alertUsers, claimAlert, deactivateKinds, saveQuarantined, deactivateStale, dropPush, heartbeat, markDigestSent,
  pushTargets, saveMarkets, saveOpportunities, savePairs, saveWhales, settleReceipt, unsettledReceipts,
} from "@/lib/worker/store";

const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
export const SWEEP_MS = n("SWEEP_MS", 5 * 60_000);
export const SCAN_MS = n("SCAN_MS", 5_000);
export const FULL_SCAN_MS = n("FULL_SCAN_MS", 60_000);
export const ALERT_MS = n("ALERT_MS", 5_000);
export const WHALE_MS = n("WHALE_MS", 15_000);
export const SETTLE_MS = n("SETTLE_MS", 15 * 60_000);
export const DIGEST_CHECK_MS = 10 * 60_000;
const SCAN_OPTIONS = scanOptionsFromEnv();

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** push(...xs) overflows the stack past ~100K items (Kalshi lists 130K+ markets), so append in a loop. */
const append = <T>(to: T[], xs: readonly T[]) => { for (const x of xs) to.push(x); };

/** `need`: the markets whose books a scan fetches, recomputed with each sweep. */
/** `savedFp`: match fingerprints of the markets last stored, by venue and id. */
interface State { universe: Universe; byKey: Map<string, VMarket>; need: Map<Venue, VMarket[]>; savedFp: Map<Venue, Map<string, string>>; lastFull: number; hot: Set<string> }

/** Each market's matchFingerprint by venue and id, computed in slices so the scan loop keeps running. */
async function fingerprints(byVenue: ReadonlyMap<Venue, readonly VMarket[]>): Promise<Map<Venue, Map<string, string>>> {
  const out = new Map<Venue, Map<string, string>>();
  for (const [venue, list] of byVenue) {
    const fps = new Map<string, string>();
    for (let i = 0; i < list.length; i++) {
      fps.set(list[i]!.id, matchFingerprint(list[i]!));
      if (i % 5_000 === 4_999) await new Promise<void>(ok => setImmediate(ok));
    }
    out.set(venue, fps);
  }
  return out;
}

async function sweep(clients: Record<Venue, VenueClient>, state: State, matcher: MatchThread): Promise<void> {
  const db = getDb();
  const markets: VMarket[] = [], events: VEvent[] = [];
  const byVenue = new Map<Venue, VMarket[]>();
  const fresh = new Set<Venue>();
  for (const [venue, client] of Object.entries(clients) as Array<[Venue, VenueClient]>) {
    try {
      const [m, e] = await Promise.all([client.listMarkets({ refresh: true }), client.listEvents()]);
      append(markets, m); append(events, e); byVenue.set(venue, m); fresh.add(venue);
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
  const fps = await fingerprints(byVenue);
  // Store only markets whose matching fields changed (titles, rules, close): ~370K rows every sweep was most of
  // the database's write load.
  let saved = 0;
  for (const venue of fresh) {
    const prev = state.savedFp.get(venue) ?? new Map<string, string>();
    const next = fps.get(venue) ?? new Map<string, string>();
    const changed = (byVenue.get(venue) ?? []).filter(m => prev.get(m.id) !== next.get(m.id));
    await saveMarkets(db, changed);
    state.savedFp.set(venue, next);
    saved += changed.length;
  }
  const t = Date.now();
  let pairs = state.universe.pairs;
  try {
    const r = await matcher.match(byVenue, fps);
    pairs = r.pairs;
    for (const line of r.log) log(line);
    await savePairs(db, pairs);
  } catch (e) {
    log(`match failed (keeping ${pairs.length} pairs from the last sweep): ${errMsg(e)}`);
  }
  state.universe = { markets, events, pairs };
  state.byKey = new Map(markets.map(m => [marketKey(m.venue, m.id), m]));
  state.need = marketsToBook(state.universe, Date.now(), SCAN_OPTIONS);
  log(`sweep done: ${saved} markets stored, match ${((Date.now() - t) / 1000).toFixed(1)}s; books per scan: ${[...state.need].map(([v, l]) => `${v} ${l.length}`).join(", ") || "none"}`);
}

/** Deals that may be shown, and those held back (lib/quarantine.ts). */
function splitQuarantine(found: readonly Opportunity[], state: State): { shown: Opportunity[]; held: Array<{ opp: Opportunity; reasons: string[] }> } {
  const pairs = new Map(state.universe.pairs.map(p => [p.id, p]));
  const fee = (venue: Venue, id: string) => state.byKey.get(marketKey(venue, id))?.fee;
  const shown: Opportunity[] = [], held: Array<{ opp: Opportunity; reasons: string[] }> = [];
  for (const opp of found) {
    const reasons = quarantineReasons(opp, { pair: opp.pairId ? pairs.get(opp.pairId) : undefined, fee });
    if (reasons.length) held.push({ opp, reasons });
    else shown.push(opp);
  }
  return { shown, held };
}

async function scanOnce(clients: Record<Venue, VenueClient>, state: State): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const full = now - state.lastFull >= FULL_SCAN_MS;
  const need = state.need;
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
  const { opps: found, counts } = scan(state.universe, books, now, SCAN_OPTIONS);
  const { shown: opps, held } = splitQuarantine(found, state);
  const fresh = await saveOpportunities(db, opps, new Date(now));
  const newlyHeld = new Set(await saveQuarantined(db, held, new Date(now)));
  for (const q of held) if (newlyHeld.has(q.opp.id)) log(`quarantined ${q.opp.kind} "${q.opp.title}" (${q.opp.id}): ${q.reasons.join("; ")}`);
  const dropped = full ? await deactivateStale(db, new Date(now)) : 0;
  state.hot = new Set(opps.flatMap(o => o.legs.map(l => marketKey(l.venue, l.marketId))));
  if (full || fresh.length || newlyHeld.size) log(`scan${full ? " (full)" : ""}: ${books.size} books, ${opps.length} deals (${JSON.stringify(counts)}), ${fresh.length} new, ${held.length} quarantined (${newlyHeld.size} new), ${dropped} gone`);
}

async function alertsOnce(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const deals = await alertableDeals(db, new Date(now - 15 * 60_000));
  if (!deals.length) return;
  const users = await alertUsers(db, new Date(now));
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

async function digestsOnce(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const users = (await alertUsers(db, new Date(now))).filter(u => digestDue(u, now));
  if (!users.length) return;
  const opps = await storedOpps();
  for (const u of users) {
    const rows = digestRows(u, opps, now);
    const unsub = unsubscribeUrl(appUrl(), u.id);
    const lines = rows.length
      ? rows.map(r => ({ text: `${r.title}: ${r.play}. ${pct(r.roi)}${r.profit !== null ? `, ${usd(r.profit)} after fees` : ""}${r.locked ? " (30 min delay)" : ""}`, url: `${appUrl()}/deal/${encodeURIComponent(r.id)}` }))
      : [{ text: "No deals matched your settings in the last day." }];
    const heading = rows.length ? `Today on Insidir: ${rows.length} deal${rows.length === 1 ? "" : "s"}` : "Today on Insidir";
    const body = renderEmail({ heading, lines, cta: { label: "See today's live deals", url: `${appUrl()}/terminal` }, unsubscribe: unsub });
    if (u.email && (await sendEmail({ to: u.email, subject: heading, ...body, unsubscribe: unsub })) === "sent") await markDigestSent(db, u.id, new Date(now));
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
function every(name: string, ms: number, fn: () => Promise<void>, opts: { immediate?: boolean } = {}): () => void {
  let running = false, stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await fn(); } catch (e) { log(`${name} failed: ${errMsg(e)}`); await heartbeat(getDb(), name, false, errMsg(e)).catch(() => undefined); }
    finally { running = false; }
  };
  if (opts.immediate !== false) void tick();
  const t = setInterval(() => void tick(), ms);
  return () => { stopped = true; clearInterval(t); };
}

export async function main(opts: { runForMs?: number } = {}): Promise<void> {
  const clients = createVenueClients();
  const state: State = { universe: { markets: [], events: [], pairs: [] }, byKey: new Map(), need: new Map(), savedFp: new Map(), lastFull: 0, hot: new Set() };
  log(`worker starting (ladders ${SCAN_OPTIONS.ladders ? "on" : "off"}, books: 24h volume ≥ ${SCAN_OPTIONS.minVolume24h}, closing within ${SCAN_OPTIONS.maxDays} days, plus matched pairs)`);
  const off = await deactivateKinds(getDb(), hiddenKinds()).catch(e => { log("deactivating hidden kinds failed:", errMsg(e)); return 0; });
  if (off) log(`switched off ${off} live deals of hidden kinds (${hiddenKinds().join(", ")})`);
  const matcher = new MatchThread(log);
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();
  await sweep(clients, state, matcher).catch(e => log("first sweep failed:", errMsg(e)));
  const stops = [
    // The first sweep just ran: the next is due one interval from now, not immediately.
    every("sweep", SWEEP_MS, () => sweep(clients, state, matcher), { immediate: false }),
    every("scan", SCAN_MS, () => scanOnce(clients, state)),
    every("alerts", ALERT_MS, alertsOnce),
    every("digests", DIGEST_CHECK_MS, digestsOnce),
    every("whales", WHALE_MS, () => whalesOnce(clients)),
    every("settle", SETTLE_MS, () => settleOnce(clients)),
    every("ratelimits", 60_000, async () => {
      const s = rateLimitStats();
      // The longest the event loop was blocked this minute: matching runs in its own thread, so this stays small.
      log(`event loop: max ${Math.round(loopDelay.max / 1e6)}ms, p99 ${Math.round(loopDelay.percentile(99) / 1e6)}ms`);
      loopDelay.reset();
      log("rate limits:", Object.entries(s).map(([k, v]) => `${k} ${v.requests} req, ${v.rateLimited} 429s, ${v.retries} retries`).join(" | "));
      await heartbeat(getDb(), "ratelimits", true, null, Object.fromEntries(Object.entries(s).flatMap(([k, v]) => [[k + ":requests", v.requests], [k + ":429", v.rateLimited]])));
    }),
  ];
  const stop = async () => { stops.forEach(s => s()); await matcher.stop(); await closeDb(); log("worker stopped"); };
  process.on("SIGTERM", () => void stop().then(() => process.exit(0)));
  process.on("SIGINT", () => void stop().then(() => process.exit(0)));
  if (opts.runForMs) { await new Promise(r => setTimeout(r, opts.runForMs)); await stop(); }
}

if (process.argv[1]?.endsWith("worker/index.ts")) {
  const runFor = Number(process.env.WORKER_RUN_FOR_MS) || undefined;
  main({ runForMs: runFor }).catch(e => { console.error(e); process.exit(1); });
}
