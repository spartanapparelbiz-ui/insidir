/* Small bounded in-memory cache for read-only public data.
 * A pending promise is shared by concurrent callers; failures are evicted so the
 * next request retries instead of serving a cached error. */
export function createCache(max = 200) {
  const store = new Map();
  function remember(key, lifetime, work) {
    const existing = store.get(key);
    if (existing && Date.now() < existing.expiresAt) return existing.value;
    const promise = Promise.resolve().then(work);
    store.delete(key);
    store.set(key, { value: promise, expiresAt: Date.now() + lifetime });
    while (store.size > max) store.delete(store.keys().next().value);
    promise.catch(() => { if (store.get(key)?.value === promise) store.delete(key); });
    return promise;
  }
  remember.clear = () => store.clear();
  remember.size = () => store.size;
  return remember;
}

/* Market-wide answers every member shares (the import's status, the newest trades and filings, the reporting-owner
 * directory) are kept for seconds, so a burst of dashboards costs one query instead of one each. Each API server
 * registers its cache here; a finished SEC import clears them all, so new filings appear at once. */
const marketCaches = new Set();
export function createMarketCache(max = 300) {
  const cache = createCache(max);
  marketCaches.add(cache);
  return cache;
}
export function marketDataChanged() {
  for (const cache of marketCaches) cache.clear();
}
