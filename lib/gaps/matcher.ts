/* The Price gaps matcher, run as a Railway cron job every 6 hours (`npm run match`, scripts/match.ts), then exits.
 *
 *   1. Streams each venue's open markets page by page (Kalshi cursor, Polymarket events keyset), keeps the ones that
 *      trade (the activity floor), and stores them in terminal.markets. A page is dropped before the next is read:
 *      the full universe is never in memory.
 *   2. Keeps the candidate index in Postgres (terminal.match_keys: each market's blocking keys and close day). Only
 *      markets that are new or whose matching fields changed (matchFingerprint) get new keys.
 *   3. Re-scores only the Kalshi markets that can be affected: new or changed ones, and those sharing a key with a
 *      Polymarket market that appeared, changed or closed. Their candidates come from SQL; decisions (deterministic,
 *      or the LLM within MATCH_LLM_MONTHLY_USD) are cached in terminal.match_decisions as before.
 *   4. Assigns pairs one-to-one from every cached accepted decision whose two markets are still open and unchanged,
 *      gives each a safety light (with the tie, date, threshold and source checks), applies admin overrides, and
 *      writes terminal.pairs and terminal.gap_targets (pairs plus multi-outcome sets) in one transaction.
 * Peak memory is one page of markets plus one scoring batch and a bounded profile cache. */
import { and, eq, inArray, lt, or, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { gapTargets, markets, matchCandidates, matchKeys, matchRuns, pairs as pairsTable } from "@/lib/db/schema";
import type { KalshiClient, VenueClient } from "@/lib/exchanges";
import type { PolymarketClient } from "@/lib/exchanges";
import type { KalshiEventInfo } from "@/lib/exchanges/kalshi";
import { isActiveEnough, type ActivityFloor } from "@/lib/exchanges/venue";
import { matchMarkets, matchFingerprint, pairKey, pairFingerprint, type LlmConfirm, type MatchCache, type MatchConfig, type Override } from "@/lib/matching";
import {
  buildCandidateIndex, buildProfile, candidatesFor, DAY_MS, MAX_POSTING, RARE_TOKEN_MAX_DF, RARE_TOKEN_MIN_LEN, RARE_TOKENS_PER_MARKET,
  type Candidate, type MarketProfile,
} from "@/lib/matching/candidates";
import { assessSafety } from "@/lib/matching/safety";
import { extractEntities } from "@/lib/matching/entities";
import { MULTI_MAX_OUTCOMES } from "@/lib/scanner";
import type { MarketPair, VEvent, VMarket } from "@/lib/types";

export const SCORE_BATCH = 300;
export const PROFILE_CACHE = 4000;
/** A key on more markets than this (on the other venue, all days) is not used to look up candidates. */
export const KEY_MAX_TOTAL = 30 * MAX_POSTING;
const INSERT_CHUNK = 500;

export interface MatcherClients {
  kalshi: Pick<KalshiClient, "listOpenEventInfos" | "marketPages">;
  polymarket: Pick<PolymarketClient, "eventPages">;
  /** Polymarket US (small: listed in one call); omitted or disabled when POLYMARKET_US_ENABLED=0. */
  polymarketUs?: Pick<VenueClient, "listMarkets" | "listEvents"> | null;
}

type BVenue = "polymarket" | "polymarket_us";

export interface MatcherDeps {
  db: Db;
  clients: MatcherClients;
  floor: ActivityFloor;
  config: MatchConfig;
  cache: MatchCache;
  overrides: Map<string, Override>;
  llm?: LlmConfirm;
  now: number;
  log?: (msg: string) => void;
}

export interface MatcherStats {
  runId: number;
  ms: number;
  peakRssMb: number;
  seen: Record<"kalshi" | BVenue, number>;
  listed: Record<"kalshi" | BVenue, number>;
  changed: Record<"kalshi" | BVenue, number>;
  closed: Record<"kalshi" | BVenue, number>;
  rescored: number;
  candidates: number;
  llmAsked: number;
  llmCostUsd: number;
  pairs: number;
  multi: number;
  targets: number;
}

/** A market's keys for the index: its blocking keys plus every title word that could be a rare-token key. */
export function indexKeys(p: MarketProfile): string[] {
  const toks = [...new Set(p.e.tokens)].filter(t => t.length >= RARE_TOKEN_MIN_LEN && !/^\d/.test(t)).map(t => `tok:${t}`);
  return [...new Set([...p.blockKeys, ...toks])];
}
const dayOf = (m: VMarket): number | null => (m.closeTime === null ? null : Math.floor(m.closeTime / DAY_MS));
const isTok = (k: string) => k.startsWith("tok:");

/** Peak resident memory of this process so far, MB. */
export const peakRssMb = (): number => Math.round(process.resourceUsage().maxRSS / 1024);

class ProfileCache {
  private map = new Map<string, MarketProfile>();
  constructor(private readonly max: number) {}
  get(m: VMarket): MarketProfile {
    const k = `${m.venue}:${m.id}:${matchFingerprint(m)}`;
    let p = this.map.get(k);
    if (p) { this.map.delete(k); this.map.set(k, p); return p; }
    p = buildProfile(m);
    this.map.set(k, p);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
    return p;
  }
}

export async function runMatcher(d: MatcherDeps): Promise<MatcherStats> {
  const { db } = d;
  const log = d.log ?? (() => undefined);
  const t0 = Date.now();
  const run = (await db.insert(matchRuns).values({}).returning({ id: matchRuns.id }))[0]!.id;
  const stats: MatcherStats = {
    runId: run, ms: 0, peakRssMb: 0, seen: { kalshi: 0, polymarket: 0, polymarket_us: 0 }, listed: { kalshi: 0, polymarket: 0, polymarket_us: 0 },
    changed: { kalshi: 0, polymarket: 0, polymarket_us: 0 }, closed: { kalshi: 0, polymarket: 0, polymarket_us: 0 }, rescored: 0, candidates: 0, llmAsked: 0, llmCostUsd: 0, pairs: 0, multi: 0, targets: 0,
  };
  try {
    const dirtyA = new Set<string>();
    const touched = new Set<string>();
    const multi: VEvent[] = [];

    /* ---------- 1–2. stream, store, index ---------- */
    const ingest = async (venue: "kalshi" | BVenue, list: VMarket[]) => {
      for (let i = 0; i < list.length; i += INSERT_CHUNK) {
        const chunk = list.slice(i, i + INSERT_CHUNK);
        const ids = chunk.map(m => m.id);
        const prev = new Map((await db.select({ id: markets.id, fp: markets.fp }).from(markets).where(and(eq(markets.venue, venue), inArray(markets.id, ids)))).map(r => [r.id, r.fp]));
        const changed: VMarket[] = [], same: string[] = [];
        const fps = new Map<string, string>();
        for (const m of chunk) {
          const fp = matchFingerprint(m);
          fps.set(m.id, fp);
          if (prev.get(m.id) === fp) same.push(m.id); else changed.push(m);
        }
        if (same.length) await db.update(markets).set({ seenRun: run }).where(and(eq(markets.venue, venue), inArray(markets.id, same)));
        if (!changed.length) continue;
        stats.changed[venue] += changed.length;
        await db.insert(markets).values(changed.map(m => ({ venue, id: m.id, data: m, fp: fps.get(m.id)!, seenRun: run, updatedAt: new Date(d.now) })))
          .onConflictDoUpdate({ target: [markets.venue, markets.id], set: { data: sql`excluded.data`, fp: sql`excluded.fp`, seenRun: sql`excluded.seen_run`, updatedAt: sql`excluded.updated_at` } });
        const changedIds = changed.map(m => m.id);
        if (venue !== "kalshi") {
          for (const r of await db.select({ key: matchKeys.key }).from(matchKeys).where(and(eq(matchKeys.venue, venue), inArray(matchKeys.marketId, changedIds)))) touched.add(r.key);
        } else for (const id of changedIds) dirtyA.add(id);
        await db.delete(matchKeys).where(and(eq(matchKeys.venue, venue), inArray(matchKeys.marketId, changedIds)));
        const rows: Array<typeof matchKeys.$inferInsert> = [];
        for (const m of changed) {
          const keys = indexKeys(buildProfile(m));
          if (venue !== "kalshi") for (const k of keys) touched.add(k);
          for (const key of keys) rows.push({ venue, marketId: m.id, key, day: dayOf(m) });
        }
        for (let j = 0; j < rows.length; j += 2000) await db.insert(matchKeys).values(rows.slice(j, j + 2000)).onConflictDoNothing();
      }
    };

    // Kalshi: event infos first (small), then market pages.
    const events = await d.clients.kalshi.listOpenEventInfos();
    const kalshiMulti = new Map<string, { info: KalshiEventInfo; total: number; kept: string[]; close: number | null; category: string }>();
    for (const [t, info] of events) if (info.mutuallyExclusive) kalshiMulti.set(t, { info, total: 0, kept: [], close: null, category: "other" });
    for await (const page of d.clients.kalshi.marketPages(events)) {
      stats.listed.kalshi += page.raw;
      for (const t of page.eventTickers) { const e = kalshiMulti.get(t); if (e) e.total++; }
      const kept = page.markets.filter(m => isActiveEnough(m, d.floor));
      stats.seen.kalshi += kept.length;
      for (const m of kept) {
        const e = kalshiMulti.get(m.eventId);
        if (e) { e.kept.push(m.id); e.close = Math.max(e.close ?? 0, m.closeTime ?? 0) || e.close; e.category = m.category; }
      }
      await ingest("kalshi", kept);
    }
    for (const e of kalshiMulti.values()) {
      if (e.kept.length >= 2 && e.kept.length === e.total && e.kept.length <= MULTI_MAX_OUTCOMES) {
        multi.push({ venue: "kalshi", id: e.info.ticker, title: e.info.title ?? e.info.ticker, category: e.category, marketIds: e.kept, mutuallyExclusive: true, exhaustive: false, closeTime: e.close ?? e.info.strikeDate });
      }
    }
    kalshiMulti.clear();
    log(`kalshi: ${stats.seen.kalshi} of ${stats.listed.kalshi} markets trade enough; ${stats.changed.kalshi} new or changed`);

    // Polymarket: events keyset pages (events carry their markets).
    for await (const page of d.clients.polymarket.eventPages()) {
      const kept: VMarket[] = [];
      for (const { event, markets: ms } of page) {
        const open = ms.filter(m => m.active);
        stats.listed.polymarket += open.length;
        const k = open.filter(m => isActiveEnough(m, d.floor));
        kept.push(...k);
        if (event.mutuallyExclusive && k.length >= 2 && k.length === open.length && k.length <= MULTI_MAX_OUTCOMES) multi.push({ ...event, marketIds: k.map(m => m.id) });
      }
      stats.seen.polymarket += kept.length;
      await ingest("polymarket", kept);
    }
    log(`polymarket: ${stats.seen.polymarket} of ${stats.listed.polymarket} markets trade enough; ${stats.changed.polymarket} new or changed`);

    // Polymarket US: small, not filtered (the US venue a US member can actually use).
    const bVenues: BVenue[] = ["polymarket"];
    if (d.clients.polymarketUs) {
      const [ms, evs] = await Promise.all([d.clients.polymarketUs.listMarkets({ refresh: true }), d.clients.polymarketUs.listEvents()]);
      if (ms.length) {
        bVenues.push("polymarket_us");
        stats.listed.polymarket_us = stats.seen.polymarket_us = ms.length;
        await ingest("polymarket_us", ms.filter(m => m.active));
        const ids = new Set(ms.map(m => m.id));
        for (const e of evs) if (e.mutuallyExclusive && e.marketIds.length >= 2 && e.marketIds.length <= MULTI_MAX_OUTCOMES && e.marketIds.every(id => ids.has(id))) multi.push(e);
      }
    }

    // Markets not seen this run have closed or stopped trading: out of the index.
    for (const venue of ["kalshi", ...bVenues] as const) {
      const gone = (await db.select({ id: markets.id }).from(markets).where(and(eq(markets.venue, venue), or(lt(markets.seenRun, run), isNull(markets.seenRun))))).map(r => r.id);
      for (let i = 0; i < gone.length; i += 2000) {
        const ids = gone.slice(i, i + 2000);
        if (venue !== "kalshi") for (const r of await db.select({ key: matchKeys.key }).from(matchKeys).where(and(eq(matchKeys.venue, venue), inArray(matchKeys.marketId, ids)))) touched.add(r.key);
        else await db.delete(matchCandidates).where(inArray(matchCandidates.aId, ids));
        const n = (await db.delete(matchKeys).where(and(eq(matchKeys.venue, venue), inArray(matchKeys.marketId, ids))).returning({ id: matchKeys.marketId })).length;
        if (n) stats.closed[venue] += new Set(ids).size;
      }
    }

    /* ---------- 3. re-score what can have changed ---------- */
    const touchedList = [...touched];
    touched.clear();
    for (let i = 0; i < touchedList.length; i += 5000) {
      const keys = touchedList.slice(i, i + 5000);
      for (const r of await db.selectDistinct({ id: matchKeys.marketId }).from(matchKeys).where(and(eq(matchKeys.venue, "kalshi"), inArray(matchKeys.key, keys)))) dirtyA.add(r.id);
    }
    // Scored in close-time order, so each batch spans a few days and pulls few candidates from the other venue.
    const dirtyIds = [...dirtyA];
    dirtyA.clear();
    const dirty: string[] = [];
    for (let i = 0; i < dirtyIds.length; i += 5000) {
      const rows = await db.select({ id: markets.id, close: sql<number | null>`(${markets.data}->>'closeTime')::bigint` }).from(markets)
        .where(and(eq(markets.venue, "kalshi"), inArray(markets.id, dirtyIds.slice(i, i + 5000)), eq(markets.seenRun, run)));
      for (const r of rows) dirty.push(`${r.close ?? 9e15}\u0001${r.id}`);
    }
    dirty.sort((x, y) => Number(x.split("\u0001")[0]) - Number(y.split("\u0001")[0]) || (x < y ? -1 : 1));
    for (let i = 0; i < dirty.length; i++) dirty[i] = dirty[i]!.split("\u0001")[1]!;
    stats.rescored = dirty.length;
    log(`re-scoring ${dirty.length} Kalshi markets`);

    const profiles = new ProfileCache(PROFILE_CACHE);
    let llmLeft = d.config.maxLlmPerRun;
    for (let i = 0; i < dirty.length; i += SCORE_BATCH) {
      const ids = dirty.slice(i, i + SCORE_BATCH);
      const as = (await db.select({ data: markets.data }).from(markets).where(and(eq(markets.venue, "kalshi"), inArray(markets.id, ids), eq(markets.seenRun, run)))).map(r => r.data);
      if (!as.length) continue;
      const aKeys = await keysOf(db, "kalshi", as.map(m => m.id));
      const df = await docFreq(db, [...new Set([...aKeys.values()].flat().filter(isTok))]);
      const effective = new Map(as.map(m => [m.id, effectiveKeys(aKeys.get(m.id) ?? [], df)]));
      for (const bv of bVenues) {
      // Every market on the other venue sharing a usable key, within the close-time window of the batch.
      const window = Math.ceil(d.config.maxCloseGapHours / 24);
      const allKeys = [...new Set([...effective.values()].flat())];
      const posting = await postingSizes(db, bv, allKeys);
      // The per-day posting limit (MAX_POSTING) is applied by candidatesFor on the fetched markets, bucket by bucket, as
      // in the in-memory matcher; here only keys that are everywhere (no use for blocking) are skipped.
      const usable = allKeys.filter(k => (posting.get(k) ?? 0) > 0 && (posting.get(k) ?? 0) <= KEY_MAX_TOTAL);
      const days = as.map(dayOf).filter((x): x is number => x !== null);
      const lo = days.length ? Math.min(...days) - window : null, hi = days.length ? Math.max(...days) + window : null;
      const bIds = new Set<string>();
      for (let j = 0; j < usable.length; j += 5000) {
        const ks = usable.slice(j, j + 5000);
        const rows = await db.selectDistinct({ id: matchKeys.marketId }).from(matchKeys).where(and(eq(matchKeys.venue, bv), inArray(matchKeys.key, ks),
          lo === null ? undefined : or(isNull(matchKeys.day), sql`${matchKeys.day} between ${lo} and ${hi}`)));
        for (const r of rows) bIds.add(r.id);
      }
      const bList = [...bIds];
      const bs: VMarket[] = [];
      for (let j = 0; j < bList.length; j += 2000) {
        for (const r of await db.select({ data: markets.data }).from(markets).where(and(eq(markets.venue, bv), inArray(markets.id, bList.slice(j, j + 2000)), eq(markets.seenRun, run)))) bs.push(r.data);
      }
      // Same tie order every run: by id.
      bs.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      const bKeys = await keysOf(db, bv, bs.map(m => m.id));
      const dfB = await docFreq(db, [...new Set([...bKeys.values()].flat().filter(k => isTok(k) && !df.has(k)))]);
      for (const [k, v] of dfB) df.set(k, v);
      const pbs = bs.map(m => profiles.get(m));
      const idx = buildCandidateIndex(pbs, pbs.map(p => effectiveKeys(bKeys.get(p.m.id) ?? [], df)));
      const cands: Candidate[] = [];
      for (const a of as) for (const c of candidatesFor(profiles.get(a), effective.get(a.id) ?? [], idx, d.config)) cands.push(c);
      stats.candidates += cands.length;
      await db.delete(matchCandidates).where(and(inArray(matchCandidates.aId, as.map(m => m.id)), eq(matchCandidates.bVenue, bv)));
      for (let j = 0; j < cands.length; j += 2000) {
        await db.insert(matchCandidates).values(cands.slice(j, j + 2000).map(c => ({ key: c.key, aId: c.a.id, bVenue: bv }))).onConflictDoNothing();
      }
      if (!cands.length) continue;
      const res = await matchMarkets(as, bs, { cache: d.cache, llm: llmLeft > 0 ? d.llm : undefined, overrides: d.overrides, now: d.now, config: { ...d.config, maxLlmPerRun: Math.max(0, llmLeft) } }, cands);
      llmLeft -= res.stats.llmAsked;
      stats.llmAsked += res.stats.llmAsked;
      stats.llmCostUsd += res.stats.llmCostUsd;
      }
    }

    /* ---------- 4. assign, check, write ---------- */
    const pairs = await assignPairs(db, run, d);
    stats.pairs = pairs.filter(p => !p.blocked).length;
    stats.multi = multi.length;
    await db.transaction(async tx => {
      await tx.delete(pairsTable);
      for (let i = 0; i < pairs.length; i += 500) {
        await tx.insert(pairsTable).values(pairs.slice(i, i + 500).map(p => ({ id: p.id, data: p, safety: p.safety, blocked: p.blocked, updatedAt: new Date(d.now) })));
      }
      await tx.delete(gapTargets);
      const targets = [
        ...pairs.filter(p => !p.blocked).map(p => ({ id: p.id, kind: "pair" as const, marketKeys: [`${p.a.venue}:${p.a.id}`, `${p.b.venue}:${p.b.id}`], data: p as unknown as Record<string, unknown> })),
        ...multi.map(e => ({ id: `multi:${e.venue}:${e.id}`, kind: "multi" as const, marketKeys: e.marketIds.map(id => `${e.venue}:${id}`), data: e as unknown as Record<string, unknown> })),
      ];
      for (let i = 0; i < targets.length; i += 500) await tx.insert(gapTargets).values(targets.slice(i, i + 500).map(t => ({ ...t, updatedAt: new Date(d.now) })));
      stats.targets = targets.length;
    });
    stats.ms = Date.now() - t0;
    stats.peakRssMb = peakRssMb();
    stats.llmCostUsd = Math.round(stats.llmCostUsd * 1e6) / 1e6;
    await db.update(matchRuns).set({ finishedAt: new Date(), stats: stats as unknown as Record<string, unknown> }).where(eq(matchRuns.id, run));
    return stats;
  } catch (e) {
    await db.update(matchRuns).set({ finishedAt: new Date(), error: e instanceof Error ? e.message : String(e) }).where(eq(matchRuns.id, run)).catch(() => undefined);
    throw e;
  }
}

async function keysOf(db: Db, venue: "kalshi" | BVenue, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 2000) {
    for (const r of await db.select({ id: matchKeys.marketId, key: matchKeys.key }).from(matchKeys).where(and(eq(matchKeys.venue, venue), inArray(matchKeys.marketId, ids.slice(i, i + 2000))))) {
      const l = out.get(r.id);
      if (l) l.push(r.key); else out.set(r.id, [r.key]);
    }
  }
  return out;
}

/** How many markets (both venues) carry each key. */
async function docFreq(db: Db, keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 5000) {
    const rows = await db.select({ key: matchKeys.key, n: sql<number>`count(*)::int` }).from(matchKeys).where(inArray(matchKeys.key, keys.slice(i, i + 5000))).groupBy(matchKeys.key);
    for (const r of rows) out.set(r.key, r.n);
  }
  return out;
}

async function postingSizes(db: Db, venue: "kalshi" | BVenue, keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 5000) {
    const rows = await db.select({ key: matchKeys.key, n: sql<number>`count(*)::int` }).from(matchKeys).where(and(eq(matchKeys.venue, venue), inArray(matchKeys.key, keys.slice(i, i + 5000)))).groupBy(matchKeys.key);
    for (const r of rows) out.set(r.key, r.n);
  }
  return out;
}

/** Blocking keys, plus the market's rarest title words (seen on 2..RARE_TOKEN_MAX_DF markets) as in findCandidates. */
export function effectiveKeys(keys: readonly string[], df: ReadonlyMap<string, number>): string[] {
  const block = keys.filter(k => !isTok(k));
  const rare = keys.filter(isTok).filter(k => { const n = df.get(k) ?? 0; return n >= 2 && n <= RARE_TOKEN_MAX_DF; })
    .sort((x, y) => (df.get(x) ?? 0) - (df.get(y) ?? 0) || (x < y ? -1 : 1)).slice(0, RARE_TOKENS_PER_MARKET);
  return [...block, ...rare];
}

/** Every cached accepted decision whose markets are both open this run and unchanged since it was decided, assigned
 *  one-to-one (best first), with admin overrides, safety lights and rules mismatches. */
async function assignPairs(db: Db, run: number, d: MatcherDeps): Promise<MarketPair[]> {
  const rows = (await db.execute(sql`select d.key, d.decision from terminal.match_decisions d join terminal.match_candidates c on c.key = d.key where d.decision->>'status' = 'accepted'`)).rows as Array<{ key: string; decision: { inverted: boolean; confidence: number; fingerprint: string; method: string; llmDifferences?: string[] } }>;
  const forced = [...d.overrides].filter(([, o]) => o.action === "force_match").map(([k]) => k);
  const want = new Map<string, Set<string>>([["kalshi", new Set()], ["polymarket", new Set()], ["polymarket_us", new Set()]]);
  const split = (key: string) => { const [a, b] = key.split("|"); const [va, ...ia] = (a ?? "").split(":"); const [vb, ...ib] = (b ?? "").split(":"); return { va: va!, ia: ia.join(":"), vb: vb!, ib: ib.join(":") }; };
  for (const k of [...rows.map(r => r.key), ...forced, ...[...d.overrides].filter(([, o]) => o.action === "block").map(([k]) => k)]) {
    const s = split(k);
    want.get(s.va)?.add(s.ia); want.get(s.vb)?.add(s.ib);
  }
  const open = new Map<string, VMarket>();
  for (const [venue, set] of want) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i += 2000) {
      for (const r of await db.select({ data: markets.data }).from(markets).where(and(eq(markets.venue, venue as "kalshi"), inArray(markets.id, ids.slice(i, i + 2000)), eq(markets.seenRun, run)))) open.set(`${venue}:${r.data.id}`, r.data);
    }
  }
  const out: MarketPair[] = [];
  const used = new Set<string>();
  const slotA = (a: VMarket, b: VMarket) => `${a.venue}:${a.id}>${b.venue}`;
  const slotB = (a: VMarket, b: VMarket, inv: boolean) => `${b.venue}:${b.id}<${a.venue}:${inv ? "inv" : "same"}`;
  const pair = (a: VMarket, b: VMarket, inverted: boolean, method: MarketPair["method"], confidence: number, llmDifferences: string[] = [], blocked = false): MarketPair => {
    const ov = d.overrides.get(pairKey(a, b));
    const s = assessSafety(a, b, { inverted, llmDifferences, ea: extractEntities(a), eb: extractEntities(b) });
    return { id: pairKey(a, b), a: { venue: a.venue, id: a.id }, b: { venue: b.venue, id: b.id }, inverted, method, confidence: Math.round(confidence * 1000) / 1000,
      safety: blocked ? "red" : ov?.safety ?? s.safety, safetyNotes: blocked ? ["Blocked by an admin"] : ov?.safety ? ov.notes ?? s.notes : s.notes,
      ...(method === "admin" ? {} : { ruleMismatch: s.mismatch }), blocked };
  };
  for (const k of forced) {
    const s = split(k), a = open.get(`${s.va}:${s.ia}`), b = open.get(`${s.vb}:${s.ib}`);
    if (!a || !b) continue;
    const inv = d.overrides.get(k)?.inverted ?? false;
    used.add(slotA(a, b)); used.add(slotB(a, b, inv));
    out.push(pair(a, b, inv, "admin", 1));
  }
  const accepted = rows.filter(r => d.overrides.get(r.key)?.action !== "block").sort((x, y) => y.decision.confidence - x.decision.confidence || (x.key < y.key ? -1 : 1));
  for (const r of accepted) {
    const s = split(r.key), a = open.get(`${s.va}:${s.ia}`), b = open.get(`${s.vb}:${s.ib}`);
    if (!a || !b || pairFingerprint(a, b) !== r.decision.fingerprint) continue;
    const inv = r.decision.inverted;
    if (used.has(slotA(a, b)) || used.has(slotB(a, b, inv))) continue;
    used.add(slotA(a, b)); used.add(slotB(a, b, inv));
    out.push(pair(a, b, inv, r.decision.method === "llm" ? "llm" : "deterministic", r.decision.confidence, r.decision.llmDifferences ?? []));
  }
  for (const [k, o] of d.overrides) {
    if (o.action !== "block") continue;
    const s = split(k), a = open.get(`${s.va}:${s.ia}`), b = open.get(`${s.vb}:${s.ib}`);
    if (a && b) out.push(pair(a, b, false, "admin", 0, [], true));
  }
  return out;
}
