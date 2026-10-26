/* Cross-venue market matching: Kalshi ↔ Polymarket (or Polymarket US). Candidates come from candidates.ts;
 * high scores with nothing uncertain are accepted deterministically, the uncertain middle band goes to the LLM
 * (llm.ts) at most once per pair (every decision is cached), everything else is rejected. Accepted pairs are
 * assigned one-to-one (each A market pairs with at most one market per other venue; each B market with at most
 * one A market per orientation, so Kalshi's two per-team game markets can both pair with Polymarket's one), then
 * given a safety light (safety.ts). Admin overrides force a match, block one, or force the light. */
import type { MarketPair, Safety, VMarket } from "@/lib/types";
import { createMemoryCache, createMemoryUsageStore, type MatchCache, type MatchDecision } from "./cache";
import { DEFAULT_MATCH_CONFIG, findCandidates, pairKey, type Candidate, type MatchConfig } from "./candidates";
import type { LlmConfirm, LlmVerdict } from "./llm";
import { assessSafety } from "./safety";

export type { MatchCache, MatchDecision } from "./cache";
export { createMemoryCache, createMemoryUsageStore };
export type { LlmConfirm, LlmUsageStore, LlmVerdict } from "./llm";
export { createOpenRouterConfirm, llmEnv, DEFAULT_MODEL } from "./llm";
export { DEFAULT_MATCH_CONFIG, matchConfigFromEnv, findCandidates, pairKey, type MatchConfig, type Candidate } from "./candidates";
export { assessSafety, extractRuleFacts } from "./safety";
export { extractEntities } from "./entities";

/** Bump when deterministic matching changes in a way that should re-decide cached deterministic decisions. */
export const MATCHER_VERSION = 1;
/** The LLM must be at least this confident that the contracts pay on the same outcome. */
export const LLM_ACCEPT_MIN_CONFIDENCE = 0.8;
/** After an LLM failure (timeout, HTTP error, malformed answer), ask again no sooner than this. */
export const LLM_RETRY_HOURS = 24;
const HOUR_MS = 3_600_000;

/** Admin override for one pair id (`kalshi:X|polymarket:Y`). */
export interface Override {
  action?: "force_match" | "block";
  /** For force_match: YES on a is NO on b. */
  inverted?: boolean;
  /** Forces the safety light (with optional notes replacing the computed ones). */
  safety?: Safety;
  notes?: string[];
}

export interface MatchDeps {
  cache: MatchCache;
  llm?: LlmConfirm;
  overrides: Map<string, Override>;
  now: number;
  config?: Partial<MatchConfig>;
}

export interface MatchStats {
  candidates: number;
  /** Candidates accepted without asking the LLM this run (fresh or cached). */
  deterministic: number;
  llmAsked: number;
  llmAccepted: number;
  /** Candidates rejected (fresh or cached). */
  rejected: number;
  green: number;
  yellow: number;
  red: number;
  cacheHits: number;
  /** In the LLM band but not decided: no LLM configured, budget reached, per-run cap, or an LLM failure. */
  unsure: number;
  /** In the LLM band but skipped because a better pair already took the slot. */
  skipped: number;
  blocked: number;
  admin: number;
  llmCostUsd: number;
}

/** FNV-1a 32-bit, hex. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
function marketText(m: VMarket): string {
  return [m.venue, m.id, m.title, m.eventTitle ?? "", m.yesLabel, m.noLabel, m.rules, m.resolutionSource ?? ""]
    .map(x => x.replace(/\s+/g, " ").trim())
    .join("\u0001");
}
export function pairFingerprint(a: VMarket, b: VMarket): string {
  const ta = marketText(a);
  const tb = marketText(b);
  return `${fnv1a(ta)}${fnv1a(tb)}${fnv1a(ta + "\u0002" + tb)}`;
}

function cacheValid(d: MatchDecision | undefined, fp: string, now: number): d is MatchDecision {
  if (!d || d.fingerprint !== fp) return false;
  if (d.method === "deterministic" && d.version !== MATCHER_VERSION) return false;
  if (d.status === "unsure" && (d.retryAt === null || d.retryAt <= now)) return false;
  return true;
}

async function readCache(cache: MatchCache, keys: string[]): Promise<Map<string, MatchDecision>> {
  if (cache.getMany) return cache.getMany(keys);
  const out = new Map<string, MatchDecision>();
  const vals = await Promise.all(keys.map(k => cache.get(k)));
  keys.forEach((k, i) => {
    const v = vals[i];
    if (v) out.set(k, v);
  });
  return out;
}

async function pool<T, R>(items: readonly T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const item = items[i] as T;
      out[i] = await f(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

interface Accepted {
  c: Candidate;
  d: MatchDecision;
}

/** Matches two venues' markets. `kalshi` is side A of every pair, `poly` side B. */
export async function matchMarkets(
  kalshi: readonly VMarket[],
  poly: readonly VMarket[],
  deps: MatchDeps,
): Promise<{ pairs: MarketPair[]; stats: MatchStats }> {
  const cfg: MatchConfig = { ...DEFAULT_MATCH_CONFIG, ...deps.config };
  const { now } = deps;
  const stats: MatchStats = {
    candidates: 0, deterministic: 0, llmAsked: 0, llmAccepted: 0, rejected: 0, green: 0, yellow: 0, red: 0,
    cacheHits: 0, unsure: 0, skipped: 0, blocked: 0, admin: 0, llmCostUsd: 0,
  };
  const candidates = findCandidates(kalshi, poly, cfg).sort((x, y) => y.score - x.score || (x.key < y.key ? -1 : 1));
  stats.candidates = candidates.length;
  const cached = await readCache(deps.cache, candidates.map(c => c.key));
  const writes: Array<[string, MatchDecision]> = [];
  const accepted: Accepted[] = [];
  const blockedPairs: Candidate[] = [];
  const llmBand: Array<{ c: Candidate; fp: string }> = [];

  const decision = (c: Candidate, fp: string, p: Partial<MatchDecision> & Pick<MatchDecision, "status" | "method">): MatchDecision => ({
    inverted: c.orientation === "inverted",
    confidence: c.score,
    reasons: [...c.reasons, ...c.conflicts.map(x => `conflict: ${x}`), ...c.caps.map(x => `uncertain: ${x}`)],
    llmDifferences: [],
    fingerprint: fp,
    version: MATCHER_VERSION,
    decidedAt: now,
    retryAt: null,
    ...p,
  });

  for (const c of candidates) {
    const ov = deps.overrides.get(c.key);
    if (ov?.action === "block") {
      blockedPairs.push(c);
      continue;
    }
    if (ov?.action === "force_match") continue;
    const fp = pairFingerprint(c.a, c.b);
    const hit = cached.get(c.key);
    if (cacheValid(hit, fp, now)) {
      stats.cacheHits++;
      if (hit.status === "accepted") {
        accepted.push({ c, d: hit });
        if (hit.method === "deterministic") stats.deterministic++;
      } else if (hit.status === "rejected") stats.rejected++;
      else stats.unsure++;
      continue;
    }
    if (c.decision === "accept") {
      const d = decision(c, fp, { status: "accepted", method: "deterministic" });
      writes.push([c.key, d]);
      accepted.push({ c, d });
      stats.deterministic++;
    } else if (c.decision === "reject") {
      writes.push([c.key, decision(c, fp, { status: "rejected", method: "deterministic" })]);
      stats.rejected++;
    } else llmBand.push({ c, fp });
  }

  // Slots taken by accepted pairs (best first), so the LLM is not asked about pairs that cannot win.
  const aSlot = (c: Candidate) => `${c.a.venue}:${c.a.id}>${c.b.venue}`;
  const bSlot = (c: Candidate, inverted: boolean) => `${c.b.venue}:${c.b.id}<${c.a.venue}:${inverted ? "inv" : "same"}`;
  const taken = new Set<string>();
  for (const { c, d } of [...accepted].sort((x, y) => y.d.confidence - x.d.confidence)) {
    if (taken.has(aSlot(c)) || taken.has(bSlot(c, d.inverted))) continue;
    taken.add(aSlot(c));
    taken.add(bSlot(c, d.inverted));
  }
  const queue: Array<{ c: Candidate; fp: string }> = [];
  const perA = new Map<string, number>();
  for (const item of llmBand) {
    const { c } = item;
    const known = c.orientation !== "unknown";
    if (taken.has(aSlot(c)) || (known && taken.has(bSlot(c, c.orientation === "inverted"))) || (!known && taken.has(bSlot(c, false)) && taken.has(bSlot(c, true)))) {
      stats.skipped++;
      continue;
    }
    const n = perA.get(aSlot(c)) ?? 0;
    if (!deps.llm || n >= cfg.maxLlmPerMarket || queue.length >= cfg.maxLlmPerRun) {
      stats.unsure++;
      continue;
    }
    perA.set(aSlot(c), n + 1);
    queue.push(item);
  }

  const verdicts: LlmVerdict[] = deps.llm ? await pool(queue, cfg.llmConcurrency, ({ c }) => deps.llm!(c.a, c.b)) : [];
  queue.forEach(({ c, fp }, i) => {
    const v = verdicts[i];
    if (!v) return;
    stats.llmCostUsd += v.costUsd;
    if (v.status === "unsure") {
      stats.unsure++;
      if (v.reason === "budget" || v.reason === "no_key") return; // nothing was asked: ask on a later run
      stats.llmAsked++;
      writes.push([c.key, decision(c, fp, { status: "unsure", method: "llm", retryAt: now + LLM_RETRY_HOURS * HOUR_MS, reasons: [`LLM ${v.reason}: ${v.detail}`] })]);
      return;
    }
    stats.llmAsked++;
    const llmReasons = [`LLM (${v.model}): same_event=${v.sameEvent}, inverted=${v.inverted}, confidence=${v.confidence}`];
    const disagrees = c.orientation !== "unknown" && (c.orientation === "inverted") !== v.inverted;
    if (v.sameEvent && v.confidence >= LLM_ACCEPT_MIN_CONFIDENCE && !disagrees) {
      const d = decision(c, fp, { status: "accepted", method: "llm", inverted: v.inverted, confidence: v.confidence, llmDifferences: v.differences, reasons: [...llmReasons, ...c.reasons] });
      writes.push([c.key, d]);
      accepted.push({ c, d });
      stats.llmAccepted++;
    } else {
      const why = disagrees ? "LLM orientation disagrees with the deterministic orientation" : v.sameEvent ? "LLM confidence too low" : "LLM: not the same outcome";
      writes.push([c.key, decision(c, fp, { status: "rejected", method: "llm", inverted: v.inverted, confidence: v.confidence, llmDifferences: v.differences, reasons: [why, ...llmReasons] })]);
      stats.rejected++;
    }
  });
  await Promise.all(writes.map(([k, d]) => deps.cache.set(k, d)));

  // One-to-one assignment, best first.
  const pairs: MarketPair[] = [];
  const used = new Set<string>();
  const forced = forcedPairs(kalshi, poly, deps.overrides);
  for (const f of forced) {
    used.add(`${f.a.venue}:${f.a.id}>${f.b.venue}`);
    used.add(`${f.b.venue}:${f.b.id}<${f.a.venue}:${f.inverted ? "inv" : "same"}`);
  }
  for (const { c, d } of accepted.sort((x, y) => y.d.confidence - x.d.confidence || (x.c.key < y.c.key ? -1 : 1))) {
    const sa = aSlot(c);
    const sb = bSlot(c, d.inverted);
    if (used.has(sa) || used.has(sb)) continue;
    used.add(sa);
    used.add(sb);
    const s = assessSafety(c.a, c.b, { inverted: d.inverted, llmDifferences: d.llmDifferences, ea: c.pa.e, eb: c.pb.e });
    const ov = deps.overrides.get(c.key);
    pairs.push({
      id: c.key,
      a: { venue: c.a.venue, id: c.a.id },
      b: { venue: c.b.venue, id: c.b.id },
      inverted: d.inverted,
      method: d.method,
      confidence: Math.round(d.confidence * 1000) / 1000,
      safety: ov?.safety ?? s.safety,
      safetyNotes: ov?.safety ? ov.notes ?? s.notes : s.notes,
      blocked: false,
    });
  }
  for (const f of forced) {
    const ov = deps.overrides.get(pairKey(f.a, f.b));
    const s = assessSafety(f.a, f.b, { inverted: f.inverted });
    pairs.push({
      id: pairKey(f.a, f.b),
      a: { venue: f.a.venue, id: f.a.id },
      b: { venue: f.b.venue, id: f.b.id },
      inverted: f.inverted,
      method: "admin",
      confidence: 1,
      safety: ov?.safety ?? s.safety,
      safetyNotes: ov?.safety ? ov.notes ?? s.notes : s.notes,
      blocked: false,
    });
    stats.admin++;
  }
  for (const c of blockedPairs) {
    pairs.push({
      id: c.key,
      a: { venue: c.a.venue, id: c.a.id },
      b: { venue: c.b.venue, id: c.b.id },
      inverted: c.orientation === "inverted",
      method: "admin",
      confidence: 0,
      safety: "red",
      safetyNotes: ["Blocked by an admin"],
      blocked: true,
    });
    stats.blocked++;
  }
  for (const p of pairs) if (!p.blocked) stats[p.safety]++;
  stats.llmCostUsd = Math.round(stats.llmCostUsd * 1e6) / 1e6;
  return { pairs, stats };
}

/** force_match overrides whose two markets are both in this run. */
function forcedPairs(as: readonly VMarket[], bs: readonly VMarket[], overrides: Map<string, Override>): Array<{ a: VMarket; b: VMarket; inverted: boolean }> {
  const out: Array<{ a: VMarket; b: VMarket; inverted: boolean }> = [];
  if (!overrides.size) return out;
  const byA = new Map(as.map(m => [`${m.venue}:${m.id}`, m]));
  const byB = new Map(bs.map(m => [`${m.venue}:${m.id}`, m]));
  for (const [key, ov] of overrides) {
    if (ov.action !== "force_match") continue;
    const [ka, kb] = key.split("|");
    const a = ka ? byA.get(ka) : undefined;
    const b = kb ? byB.get(kb) : undefined;
    if (a && b) out.push({ a, b, inverted: ov.inverted ?? false });
  }
  return out;
}
