/* Incremental candidates for repeated sweeps. Building a market's profile (normalising its title and rules, pulling
 * out entities) is ~95% of matching's cost, and almost nothing changes between two sweeps five minutes apart. This
 * keeps every market's profile and every A market's candidate row, keyed by a fingerprint of the fields matching
 * reads (prices and volume are not among them). Each run it rebuilds profiles only for new or changed markets and
 * re-scores only the A rows those changes can reach: an A market that changed, or that shares a blocking key (old or
 * new) with a B market that appeared, changed or went away. The result equals findCandidates over the same lists
 * (test/matching-incremental.test.ts). Not thread-safe; one instance per venue pair. */
import { createHash } from "node:crypto";
import type { VMarket } from "@/lib/types";
import { buildCandidateIndex, buildProfile, candidatesFor, rareTokenKeys, type Candidate, type MarketProfile, type MatchConfig } from "./candidates";

/** The fields candidates and decisions read. A change in any of them re-matches the market. */
export function matchFingerprint(m: VMarket): string {
  const f = [m.venue, m.id, m.title, m.eventTitle, m.eventId, m.yesLabel, m.noLabel, m.category, m.seriesId, m.closeTime, m.strike, m.rules, m.resolutionSource, m.active];
  return createHash("sha1").update(JSON.stringify(f)).digest("base64");
}

interface Entry { fp: string; p: MarketProfile; keys: string[] }

export interface IncrementalStats { a: number; b: number; changedA: number; changedB: number; removedA: number; removedB: number; rescored: number }

const keyOf = (m: Pick<VMarket, "venue" | "id">) => `${m.venue}:${m.id}`;

export class IncrementalCandidates {
  private a = new Map<string, Entry>();
  private b = new Map<string, Entry>();
  private rows = new Map<string, Candidate[]>();

  run(as: readonly VMarket[], bs: readonly VMarket[], cfg: MatchConfig): { candidates: Candidate[]; stats: IncrementalStats } {
    const a = this.refresh(this.a, as), b = this.refresh(this.b, bs);
    this.a = a.next;
    this.b = b.next;

    // Rare-token keys depend on the whole corpus, so recompute them for everyone; a market whose keys moved counts
    // as changed for the index.
    const entriesA = [...this.a.values()], entriesB = [...this.b.values()];
    const rare = rareTokenKeys([...entriesA.map(e => e.p), ...entriesB.map(e => e.p)]);
    const oldKeysB = new Map<string, string[]>();
    const setKeys = (e: Entry, extra: string[] | undefined, changed: Set<string>, k: string, old?: Map<string, string[]>) => {
      const keys = [...e.p.blockKeys, ...(extra ?? [])];
      if (keys.join("\u0001") !== e.keys.join("\u0001")) { old?.set(k, e.keys); e.keys = keys; changed.add(k); }
    };
    entriesA.forEach((e, i) => setKeys(e, rare[i], a.changed, keyOf(e.p.m)));
    entriesB.forEach((e, i) => setKeys(e, rare[entriesA.length + i], b.changed, keyOf(e.p.m), oldKeysB));

    // A rows to re-score: changed A, and every A sharing a key (old or new) with a B that appeared, changed or left.
    const dirty = new Set<string>([...a.changed].filter(k => this.a.has(k)));
    const touched = new Set<string>();
    for (const k of b.changed) {
      for (const key of this.b.get(k)?.keys ?? []) touched.add(key);
      for (const key of oldKeysB.get(k) ?? b.oldKeys.get(k) ?? []) touched.add(key);
    }
    for (const keys of b.removedKeys) for (const key of keys) touched.add(key);
    if (touched.size) for (const [k, e] of this.a) if (e.keys.some(key => touched.has(key))) dirty.add(k);
    for (const k of a.removed) this.rows.delete(k);

    if (dirty.size) {
      const idx = buildCandidateIndex(entriesB.map(e => e.p), entriesB.map(e => e.keys));
      for (const k of dirty) {
        const e = this.a.get(k);
        if (e) this.rows.set(k, candidatesFor(e.p, e.keys, idx, cfg));
      }
    }

    // Emit in A order, pointing at the current market objects (prices may have moved; matching fields have not).
    const candidates: Candidate[] = [];
    for (const e of entriesA) {
      for (const c of this.rows.get(keyOf(e.p.m)) ?? []) {
        const pb = this.b.get(keyOf(c.b))?.p;
        if (pb) candidates.push({ ...c, a: e.p.m, b: pb.m, pa: e.p, pb });
      }
    }
    return {
      candidates,
      stats: { a: this.a.size, b: this.b.size, changedA: a.changed.size, changedB: b.changed.size, removedA: a.removed.length, removedB: b.removedKeys.length, rescored: dirty.size },
    };
  }

  /** The next map for one side: unchanged entries kept (with the new market object), changed ones re-profiled. */
  private refresh(prev: Map<string, Entry>, list: readonly VMarket[]) {
    const next = new Map<string, Entry>();
    const changed = new Set<string>();
    const oldKeys = new Map<string, string[]>();
    for (const m of list) {
      const k = keyOf(m);
      if (next.has(k)) continue;
      const fp = matchFingerprint(m);
      const old = prev.get(k);
      if (old && old.fp === fp) {
        old.p.m = m;
        next.set(k, old);
      } else {
        if (old) oldKeys.set(k, old.keys);
        next.set(k, { fp, p: buildProfile(m), keys: [] });
        changed.add(k);
      }
    }
    const removed: string[] = [], removedKeys: string[][] = [];
    for (const [k, e] of prev) if (!next.has(k)) { removed.push(k); removedKeys.push(e.keys); }
    return { next, changed, oldKeys, removed, removedKeys };
  }
}
