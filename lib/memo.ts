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
