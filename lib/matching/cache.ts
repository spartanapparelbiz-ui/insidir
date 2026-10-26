/* The match-decision cache and the LLM usage store: interfaces plus in-memory implementations (for tests and
 * one-off scripts; the worker's Postgres implementations live with the DB code). Every decision is cached,
 * accepted and rejected alike, so the LLM is never asked twice about the same pair while neither market's text
 * has changed. */
import type { LlmUsageStore } from "./llm";

export interface MatchDecision {
  status: "accepted" | "rejected" | "unsure";
  method: "deterministic" | "llm";
  /** YES on a is NO on b. */
  inverted: boolean;
  /** 0..1: the deterministic score, or the LLM's confidence. */
  confidence: number;
  reasons: string[];
  /** The LLM's plain-English rule differences, merged into the safety notes. */
  llmDifferences: string[];
  /** Hash of both markets' title, labels and rules: a changed market is decided again. */
  fingerprint: string;
  /** Matcher version for deterministic decisions (bumping it re-decides them; LLM answers are kept). */
  version: number;
  decidedAt: number;
  /** For "unsure" after an LLM failure: when it may be asked again. */
  retryAt: number | null;
}

export interface MatchCache {
  get(key: string): Promise<MatchDecision | null>;
  /** Optional batch read (a DB does this in one query). */
  getMany?(keys: readonly string[]): Promise<Map<string, MatchDecision>>;
  set(key: string, decision: MatchDecision): Promise<void>;
}

export interface MemoryMatchCache extends MatchCache {
  readonly map: Map<string, MatchDecision>;
  writes: number;
}

export function createMemoryCache(initial?: Iterable<[string, MatchDecision]>): MemoryMatchCache {
  const map = new Map<string, MatchDecision>(initial);
  const cache: MemoryMatchCache = {
    map,
    writes: 0,
    async get(key) {
      return map.get(key) ?? null;
    },
    async getMany(keys) {
      const out = new Map<string, MatchDecision>();
      for (const k of keys) {
        const d = map.get(k);
        if (d) out.set(k, d);
      }
      return out;
    },
    async set(key, decision) {
      cache.writes++;
      map.set(key, decision);
    },
  };
  return cache;
}

export interface MemoryUsageStore extends LlmUsageStore {
  readonly spend: Map<string, number>;
}

export function createMemoryUsageStore(initial?: Record<string, number>): MemoryUsageStore {
  const spend = new Map<string, number>(Object.entries(initial ?? {}));
  return {
    spend,
    async getMonthSpendUsd(month) {
      return spend.get(month) ?? 0;
    },
    async addSpendUsd(month, usd) {
      spend.set(month, (spend.get(month) ?? 0) + usd);
    },
  };
}

/** Keeps every decision read or written in memory in front of `inner` (a database), so repeated runs over the same
 *  candidates read the database only for keys they have not seen. */
export function createLayeredCache(inner: MatchCache): MatchCache {
  const mem = new Map<string, MatchDecision>();
  return {
    async get(key) {
      const hit = mem.get(key);
      if (hit) return hit;
      const d = await inner.get(key);
      if (d) mem.set(key, d);
      return d;
    },
    async getMany(keys) {
      const out = new Map<string, MatchDecision>();
      const missing: string[] = [];
      for (const k of keys) { const d = mem.get(k); if (d) out.set(k, d); else missing.push(k); }
      if (missing.length) {
        const got = inner.getMany ? await inner.getMany(missing) : new Map((await Promise.all(missing.map(async k => [k, await inner.get(k)] as const))).filter((x): x is readonly [string, MatchDecision] => x[1] !== null));
        for (const [k, d] of got) { mem.set(k, d); out.set(k, d); }
      }
      return out;
    },
    async set(key, decision) {
      mem.set(key, decision);
      await inner.set(key, decision);
    },
  };
}
