/* A small TTL cache with in-flight de-duplication: two requests for the same key while it is loading share one
 * promise. The store lives on globalThis so it survives Next's module reloads in dev and is shared by every
 * route in one server process.
 *
 * The seam: everything goes through `cached()` and the `CacheStore` interface. To move the cache to Supabase
 * (or Redis), implement CacheStore with async get/set against a table keyed by `key` with an `expires_at`
 * column, and pass it to `setCacheStore()` at start-up. In-flight de-duplication stays in memory either way. */

export interface CacheStore {
  get(key: string): Promise<unknown | undefined> | unknown | undefined;
  set(key: string, value: unknown, ttlMs: number): Promise<void> | void;
}

interface Entry { value: unknown; expires: number }

export class MemoryStore implements CacheStore {
  private map = new Map<string, Entry>();
  constructor(private maxEntries = 20_000) {}
  get(key: string): unknown | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires <= Date.now()) { this.map.delete(key); return undefined; }
    return e.value;
  }
  set(key: string, value: unknown, ttlMs: number): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, { value, expires: Date.now() + ttlMs });
  }
  clear(): void { this.map.clear(); }
}

interface CacheGlobals { store: CacheStore; inflight: Map<string, Promise<unknown>> }
const G = globalThis as typeof globalThis & { __insidirXrayCache?: CacheGlobals };
const state = (): CacheGlobals => (G.__insidirXrayCache ??= { store: new MemoryStore(), inflight: new Map() });

export function setCacheStore(store: CacheStore): void { state().store = store; }

/** Clears the memory store and anything in flight (tests). */
export function resetCache(): void {
  const s = state();
  if (s.store instanceof MemoryStore) s.store.clear(); else s.store = new MemoryStore();
  s.inflight.clear();
}

export const TTL = {
  walletRecord: 6 * 60 * 60_000,
  walletAge: 6 * 60 * 60_000,
  xray: 60_000,
  gamma: 60_000,
} as const;

/** The cached value for `key`, or the result of `load()` stored for `ttlMs`. Failures are not cached. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const s = state();
  const hit = await s.store.get(key);
  if (hit !== undefined) return hit as T;
  const running = s.inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load().then(
    async value => { await s.store.set(key, value, ttlMs); s.inflight.delete(key); return value; },
    (e: unknown) => { s.inflight.delete(key); throw e; },
  );
  s.inflight.set(key, p);
  return p;
}
