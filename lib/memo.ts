/* A tiny in-process cache for expensive reads that every visitor shares (the home page's moves, Top traders, the
 * trust numbers). Each key is computed at most once per `ttl`; callers arriving while it runs share the same promise.
 * A failed computation is not kept. Per server instance, in memory; fine for data that is a few seconds old anyway. */
const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  store.set(key, { at: now, value });
  value.catch(() => { if (store.get(key)?.value === value) store.delete(key); });
  if (store.size > 500) for (const [k, v] of store) if (now - v.at > ttlMs) store.delete(k);
  return value;
}

/** Like memo, but once a value exists it is returned at once even when stale, and refreshed in the background (a
 *  page never waits on a slow outside API twice). The very first call waits; a failed refresh keeps the old value. */
const swrStore = new Map<string, { at: number; value: unknown; running: Promise<unknown> | null }>();
export function memoStale<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now(), hit = swrStore.get(key);
  const refresh = () => {
    const e = swrStore.get(key);
    if (e?.running) return e.running as Promise<T>;
    const p = fn().then(v => { swrStore.set(key, { at: Date.now(), value: v, running: null }); return v; },
      err => { const old = swrStore.get(key); if (old) old.running = null; throw err; });
    if (e) e.running = p; else swrStore.set(key, { at: 0, value: undefined, running: p });
    return p;
  };
  if (!hit || hit.at === 0) return hit?.running ? (hit.running as Promise<T>) : refresh();
  if (now - hit.at >= ttlMs) void refresh().catch(() => undefined);
  return Promise.resolve(hit.value as T);
}

/** Forgets everything (tests). */
export function clearMemo(): void { store.clear(); swrStore.clear(); }
