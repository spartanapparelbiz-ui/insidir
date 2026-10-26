/* The main thread's side of the match thread (worker/match-thread.ts). Each sweep it fingerprints every venue's
 * markets, sends only the new or changed ones (and removed ids) in chunks, yielding between them so the scan loop
 * keeps running, then asks for a match. If the thread dies (out of memory, a crash) the next sweep starts a fresh
 * one and sends everything again. */
import path from "node:path";
import { Worker } from "node:worker_threads";
import { matchFingerprint } from "@/lib/matching";
import type { MarketPair, VMarket, Venue } from "@/lib/types";
import type { FromThread, ToThread } from "./match-protocol";

/** Markets per message: keeps each structured clone (and the main thread's pause for it) short. */
const CHUNK = 5_000;
/** The thread's own heap, MB. */
const THREAD_HEAP_MB = Number(process.env.MATCH_THREAD_HEAP_MB) > 0 ? Number(process.env.MATCH_THREAD_HEAP_MB) : 3072;

const yieldNow = () => new Promise<void>(ok => setImmediate(ok));

export class MatchThread {
  private worker: Worker | null = null;
  private sent = new Map<Venue, Map<string, string>>();
  private pending = new Map<number, (r: FromThread) => void>();
  private nextId = 1;

  constructor(private readonly log: (...a: unknown[]) => void) {}

  private start(): Worker {
    const w = new Worker(path.join(__dirname, "match-boot.cjs"), { workerData: { entry: path.join(__dirname, "match-thread.ts") }, resourceLimits: { maxOldGenerationSizeMb: THREAD_HEAP_MB } });
    w.on("message", (m: FromThread) => { this.pending.get(m.id)?.(m); this.pending.delete(m.id); });
    const down = (why: string) => {
      if (this.worker !== w) return;
      this.log(`match thread stopped: ${why}; the next sweep starts a new one`);
      this.worker = null;
      this.sent.clear();
      for (const [id, done] of this.pending) done({ type: "result", id, ok: false, error: why, pairs: [], log: [] });
      this.pending.clear();
    };
    w.on("error", e => down(e.message));
    w.on("exit", code => down(`exit ${code}`));
    return w;
  }

  /** Matches the venues' current markets; resolves with the pairs (or rejects when the thread failed). `fps` holds
   *  each market's matchFingerprint by venue and id (the sweep computes them once). */
  async match(byVenue: ReadonlyMap<Venue, readonly VMarket[]>, fps: ReadonlyMap<Venue, ReadonlyMap<string, string>>): Promise<{ pairs: MarketPair[]; log: string[]; sent: number }> {
    const w = this.worker ?? (this.worker = this.start());
    let sent = 0;
    for (const [venue, list] of byVenue) {
      const prev = this.sent.get(venue) ?? new Map<string, string>();
      const next = new Map<string, string>();
      const known = fps.get(venue);
      let upserts: VMarket[] = [];
      for (let i = 0; i < list.length; i++) {
        const m = list[i]!;
        const fp = known?.get(m.id) ?? matchFingerprint(m);
        next.set(m.id, fp);
        if (prev.get(m.id) !== fp) upserts.push(m);
        if (upserts.length >= CHUNK) { this.post(w, { type: "changes", venue, upserts, removed: [] }); sent += upserts.length; upserts = []; await yieldNow(); }
        else if (i % CHUNK === CHUNK - 1) await yieldNow();
      }
      const removed = [...prev.keys()].filter(id => !next.has(id));
      this.post(w, { type: "changes", venue, upserts, removed });
      sent += upserts.length;
      this.sent.set(venue, next);
      await yieldNow();
    }
    if (this.worker !== w) { this.sent.clear(); throw new Error("match thread stopped while receiving markets"); }
    const id = this.nextId++;
    const r = await new Promise<FromThread>(ok => { this.pending.set(id, ok); this.post(w, { type: "run", id }); });
    if (!r.ok) { this.sent.clear(); throw new Error(`match thread: ${r.error ?? "failed"}`); }
    return { pairs: r.pairs, log: r.log, sent };
  }

  private post(w: Worker, m: ToThread): void { w.postMessage(m); }

  async stop(): Promise<void> {
    const w = this.worker;
    this.worker = null;
    if (w) await w.terminate();
  }
}
