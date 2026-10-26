/* The web side of the live pipe. One poller per web process reads new rows from terminal.live_events (written by the
 * worker) into a short in-memory buffer; each open stream reads the buffer through its viewer's lens (lib/live/view.ts)
 * at its own pace, so a free viewer's 30-minute-delayed clock and a Pro viewer's real-time clock share one query.
 * The poller only runs while someone is connected. Server only. */
import { asc, desc, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { liveEvents } from "@/lib/db/schema";
import type { FeedViewer } from "@/lib/feed";
import { dataStatus } from "@/lib/status";
import type { LiveEvent, LiveEventType, LiveStatus, RawLiveEvent } from "./types";
import { delayFor, viewEvent } from "./view";

export const POLL_MS = 1_000;
export const STATUS_MS = 2_000;
/** Enough history for the free plan's 30-minute delay, plus the tape's backlog. */
export const BUFFER_MS = 3 * 3_600_000;
export const BUFFER_MAX = 20_000;
/** Most events one stream sends per poll: a human can't read more. */
export const MAX_PER_TICK = 12;

const TYPES: LiveEventType[] = ["deal_found", "deal_closed", "price_tick", "whale"];

type Listener = () => void;

class LiveHub {
  buffer: RawLiveEvent[] = [];
  lastId = 0;
  status: LiveStatus = { live: false, paused: [], lastScanAt: null, serverNow: Date.now() };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private loaded: Promise<void> | null = null;
  private lastStatusAt = 0;
  private busy = false;

  private toRaw(r: typeof liveEvents.$inferSelect): RawLiveEvent {
    return { id: r.id, type: r.type, oppId: r.oppId, venues: r.venues, data: r.data as unknown as RawLiveEvent["data"], at: r.at.getTime() };
  }

  /** First fill: the recent history (newest BUFFER_MAX rows within BUFFER_MS), oldest first. */
  ready(): Promise<void> {
    this.loaded ??= (async () => {
      const db = getDb();
      const rows = await db.select().from(liveEvents).orderBy(desc(liveEvents.id)).limit(BUFFER_MAX);
      const since = Date.now() - BUFFER_MS;
      this.buffer = rows.reverse().map(r => this.toRaw(r)).filter(e => e.at >= since);
      this.lastId = rows.length ? Math.max(...rows.map(r => r.id)) : 0;
      await this.refreshStatus();
    })();
    return this.loaded;
  }

  private async refreshStatus(): Promise<void> {
    const now = Date.now();
    const s = await dataStatus(now);
    this.status = { ...s, serverNow: now };
    this.lastStatusAt = now;
  }

  private async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.ready();
      const rows = await getDb().select().from(liveEvents).where(gt(liveEvents.id, this.lastId)).orderBy(asc(liveEvents.id)).limit(1_000);
      for (const r of rows) { this.buffer.push(this.toRaw(r)); this.lastId = Math.max(this.lastId, r.id); }
      const since = Date.now() - BUFFER_MS;
      let drop = 0;
      while (drop < this.buffer.length && (this.buffer[drop]!.at < since || this.buffer.length - drop > BUFFER_MAX)) drop++;
      if (drop) this.buffer.splice(0, drop);
      if (Date.now() - this.lastStatusAt >= STATUS_MS) await this.refreshStatus();
    } catch {
      // The database blipped: keep the buffer; streams report the scanner status they last had.
    } finally {
      this.busy = false;
    }
    for (const l of this.listeners) l();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    if (!this.timer) this.timer = setInterval(() => void this.poll(), POLL_MS);
    return () => {
      this.listeners.delete(l);
      if (!this.listeners.size && this.timer) { clearInterval(this.timer); this.timer = null; }
    };
  }
}

const G = globalThis as typeof globalThis & { __liveHub?: LiveHub };
export const hub = (): LiveHub => (G.__liveHub ??= new LiveHub());

/** One viewer's read position: a cursor per event type, since each type runs on its own delay. */
export class ViewerCursor {
  private cursor: Record<LiveEventType, number>;
  constructor(private viewer: FeedViewer) {
    this.cursor = { deal_found: 0, deal_closed: 0, price_tick: 0, whale: 0 };
  }

  /** The most recent events this viewer may already see, newest first, and moves the cursors past everything due. */
  backlog(buffer: readonly RawLiveEvent[], now: number, max = 15): LiveEvent[] {
    const out: LiveEvent[] = [];
    for (const t of TYPES) {
      for (const e of buffer) if (e.type === t && now >= e.at + delayFor(e, this.viewer)) this.cursor[t] = e.id;
    }
    for (let i = buffer.length - 1; i >= 0 && out.length < max; i--) {
      const e = buffer[i]!;
      if (e.type === "price_tick" || e.id > this.cursor[e.type]) continue;
      const v = viewEvent(e, this.viewer, now);
      if (v) out.push(v);
    }
    return out;
  }

  /** Everything newly due, oldest first; price ticks coalesced to the latest per deal; at most MAX_PER_TICK. */
  next(buffer: readonly RawLiveEvent[], now: number): LiveEvent[] {
    const out: LiveEvent[] = [];
    const ticks = new Map<string, LiveEvent>();
    for (const t of TYPES) {
      for (const e of buffer) {
        if (e.type !== t || e.id <= this.cursor[t]) continue;
        if (now < e.at + delayFor(e, this.viewer)) break; // later events of this type aren't due yet either
        this.cursor[t] = e.id;
        const v = viewEvent(e, this.viewer, now);
        if (!v) continue;
        if (v.type === "price_tick") ticks.set(v.oppId, v);
        else out.push(v);
      }
    }
    out.push(...ticks.values());
    out.sort((a, b) => a.id - b.id);
    // Too much at once: keep the newest (the stream is live; a backlog of stale events isn't).
    return out.length > MAX_PER_TICK ? out.slice(-MAX_PER_TICK) : out;
  }
}
