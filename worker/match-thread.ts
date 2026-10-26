/* The matcher, in its own thread (worker/match-client.ts starts it) so a sweep's matching never blocks the scan loop
 * and its heartbeats. It keeps its own copy of every venue's markets, updated from the changes the main thread sends
 * (new or changed markets, and removed ids), and an IncrementalCandidates per venue pair, so each sweep re-profiles
 * and re-scores only what changed. Decisions are cached in memory in front of the database cache. */
import { parentPort } from "node:worker_threads";
import { appUrl } from "@/lib/auth/whop";
import { getDb } from "@/lib/db";
import {
  createLayeredCache, createOpenRouterConfirm, DEFAULT_MATCH_CONFIG, IncrementalCandidates, llmEnv, matchConfigFromEnv, matchMarkets,
} from "@/lib/matching";
import type { MarketPair, VMarket, Venue } from "@/lib/types";
import { dbMatchCache, dbUsageStore, loadOverrides } from "@/lib/worker/store";
import type { FromThread, ToThread } from "./match-protocol";

const port = parentPort;
if (!port) throw new Error("match-thread must run in a worker thread");

const store = new Map<Venue, Map<string, VMarket>>();
const incremental = { polymarket: new IncrementalCandidates(), polymarket_us: new IncrementalCandidates() };
const cache = createLayeredCache(dbMatchCache(getDb()));
const send = (m: FromThread) => port.postMessage(m);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function run(): Promise<{ pairs: MarketPair[]; log: string[] }> {
  const db = getDb();
  const env = llmEnv(process.env);
  const config = matchConfigFromEnv(process.env);
  const cfg = { ...DEFAULT_MATCH_CONFIG, ...config };
  const deps = {
    cache, overrides: await loadOverrides(db), now: Date.now(), config,
    llm: env.apiKey ? createOpenRouterConfirm({ apiKey: env.apiKey, model: env.model, monthlyCapUsd: env.monthlyCapUsd, usage: dbUsageStore(db), now: () => Date.now(), appUrl: appUrl() }) : undefined,
  };
  const kalshi = [...(store.get("kalshi")?.values() ?? [])];
  const pairs: MarketPair[] = [], log: string[] = [];
  for (const other of ["polymarket", "polymarket_us"] as const) {
    const list = [...(store.get(other)?.values() ?? [])];
    if (!kalshi.length || !list.length) continue;
    const t = Date.now();
    const { candidates, stats: inc } = incremental[other].run(kalshi, list, cfg);
    const { pairs: p, stats } = await matchMarkets(kalshi, list, deps, candidates);
    for (const x of p) pairs.push(x);
    log.push(`match kalshi↔${other}: ${p.length} pairs (green ${stats.green}, yellow ${stats.yellow}, red ${stats.red}), candidates ${stats.candidates}, `
      + `re-scored ${inc.rescored} of ${inc.a} (changed ${inc.changedA}+${inc.changedB}, gone ${inc.removedA}+${inc.removedB}), llm asked ${stats.llmAsked}, rejected ${stats.rejected}, ${((Date.now() - t) / 1000).toFixed(1)}s`);
  }
  return { pairs, log };
}

port.on("message", (m: ToThread) => {
  if (m.type === "changes") {
    let s = store.get(m.venue);
    if (!s) store.set(m.venue, (s = new Map()));
    for (const id of m.removed) s.delete(id);
    for (const x of m.upserts) s.set(x.id, x);
    return;
  }
  run().then(r => send({ type: "result", id: m.id, ok: true, ...r }), e => send({ type: "result", id: m.id, ok: false, error: errMsg(e), pairs: [], log: [] }));
});
