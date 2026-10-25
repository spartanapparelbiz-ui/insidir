/* JSON over HTTPS for the venues' public APIs.
 *
 * - A User-Agent and a timeout on every request.
 * - Bounded retries on 429 / 5xx / network errors: a 429 waits the server's Retry-After (capped) or, without one,
 *   a deterministic exponential backoff (BACKOFF_BASE_MS · 2^attempt, no jitter, capped). A 429 also pauses the
 *   whole venue's bucket for that delay, so the other queued requests back off too.
 * - One token-bucket rate limiter per venue API with two PRIORITY lanes: "hot" (markets with live opportunities)
 *   is always served before "normal" (the background sweep), so a hot refresh jumps the queue.
 * - Counters (requests, 429s, retries, tokens, configured and published limits) for the worker's headroom report.
 *
 * Base URLs come from env with the defaults below. The clock and fetch are injectable for tests. */

/* ---------- Base URLs (env, with defaults) ---------- */

/** Kalshi Trade API v2. api.elections.kalshi.com serves ALL Kalshi markets (not just elections) and is the host in
 *  Kalshi's public docs as of this writing. The spec mentions https://external-api.kalshi.com/trade-api/v2 ("verify
 *  live"); set KALSHI_API_URL to that if it turns out to be current. */
export const DEFAULT_KALSHI_API_URL = "https://api.elections.kalshi.com/trade-api/v2";
/** Polymarket Gamma (markets / events metadata). */
export const DEFAULT_POLYMARKET_GAMMA_URL = "https://gamma-api.polymarket.com";
/** Polymarket CLOB (order books, prices). */
export const DEFAULT_POLYMARKET_CLOB_URL = "https://clob.polymarket.com";
/** Polymarket Data API (trades, positions, activity). */
export const DEFAULT_POLYMARKET_DATA_URL = "https://data-api.polymarket.com";
/** Polymarket US (the CFTC-regulated exchange at polymarket.us). UNVERIFIED host; see polymarket-us.ts. */
export const DEFAULT_POLYMARKET_US_API_URL = "https://api.polymarket.us";
/** Polymarket CLOB market websocket. */
export const DEFAULT_POLYMARKET_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

const env = (k: string): string | undefined => {
  const v = typeof process !== "undefined" ? process.env[k] : undefined;
  return v && v.trim() !== "" ? v.trim().replace(/\/+$/, "") : undefined;
};

export const baseUrls = () => ({
  kalshi: env("KALSHI_API_URL") ?? DEFAULT_KALSHI_API_URL,
  gamma: env("POLYMARKET_GAMMA_URL") ?? DEFAULT_POLYMARKET_GAMMA_URL,
  clob: env("POLYMARKET_CLOB_URL") ?? DEFAULT_POLYMARKET_CLOB_URL,
  data: env("POLYMARKET_DATA_URL") ?? DEFAULT_POLYMARKET_DATA_URL,
  polymarketUs: env("POLYMARKET_US_API_URL") ?? DEFAULT_POLYMARKET_US_API_URL,
  polymarketWs: env("POLYMARKET_WS_URL") ?? DEFAULT_POLYMARKET_WS_URL,
});

/* ---------- Request policy ---------- */

export const USER_AGENT = "InsidirTerminal/0.1 (+https://insidir.com)";
/** Per-attempt timeout. */
export const TIMEOUT_MS = 10_000;
/** Retries after the first attempt (so at most MAX_RETRIES + 1 requests per call). */
export const MAX_RETRIES = 4;
/** Backoff without a Retry-After: 500ms, 1s, 2s, 4s ... deterministic (no jitter). */
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 15_000;
/** A Retry-After longer than this is clamped (a misbehaving header should not stall a sweep for minutes). */
export const RETRY_AFTER_CAP_MS = 30_000;
/** Without a Retry-After on a 429 we wait at least this long. */
export const RETRY_AFTER_DEFAULT_MS = 1_000;

/* ---------- Published rate limits (documentation, for the headroom report) ---------- */

/** Kalshi, Basic tier (no account / default): 20 reads per second, 10 writes per second. Advanced 30/30, Premier
 *  100/100, Prime 400/400. Only reads matter here (public market data, no auth). */
export const KALSHI_BASIC_READS_PER_SEC = 20;
export const KALSHI_BASIC_WRITES_PER_SEC = 10;

/** Polymarket's published Cloudflare throttles, requests per 10 seconds (requests over the limit are delayed /
 *  queued by Cloudflare rather than always rejected, but 429s do happen). */
export const POLYMARKET_LIMITS_PER_10S = {
  gamma: { general: 4000, events: 500, markets: 300, search: 350 },
  clob: { general: 9000, book: 1500, books: 500, price: 1500, prices: 500, midpoint: 1500, midpoints: 500 },
  data: { general: 1000, trades: 200, positions: 150, closedPositions: 150 },
} as const;

/* ---------- Configured buckets (what we actually allow ourselves) ---------- */

export type BucketName = "kalshi" | "polymarket_gamma" | "polymarket_clob" | "polymarket_data" | "polymarket_us";
export const BUCKETS: readonly BucketName[] = ["kalshi", "polymarket_gamma", "polymarket_clob", "polymarket_data", "polymarket_us"];

export interface BucketConfig {
  /** Sustained tokens per second. */
  ratePerSec: number;
  /** Bucket capacity (max burst). */
  burst: number;
  /** Human-readable published limit, for the worker's report. */
  published: string;
}

/** Defaults sit at ~80% of the tightest published limit of the endpoints each client uses. Override per bucket with
 *  <NAME>_RATE_PER_SEC (e.g. KALSHI_RATE_PER_SEC=80 on a Premier account). */
export const DEFAULT_BUCKETS: Record<BucketName, BucketConfig> = {
  // 80% of 20 reads/s.
  kalshi: { ratePerSec: 16, burst: 16, published: "20 reads/s (Basic tier)" },
  // /events 500 per 10s = 50/s, /markets 300 per 10s = 30/s → 80% of 30/s.
  polymarket_gamma: { ratePerSec: 24, burst: 24, published: "/events 500/10s, /markets 300/10s, general 4000/10s" },
  // POST /books 500 per 10s = 50/s (the tightest endpoint we use in bulk) → 80%.
  polymarket_clob: { ratePerSec: 40, burst: 40, published: "/books 500/10s, /book 1500/10s, general 9000/10s" },
  // /positions 150 per 10s = 15/s, /trades 200 per 10s = 20/s → 80% of 15/s.
  polymarket_data: { ratePerSec: 12, burst: 12, published: "/trades 200/10s, /positions 150/10s, general 1000/10s" },
  // Unknown (unverified API): conservative.
  polymarket_us: { ratePerSec: 5, burst: 5, published: "unknown (unverified)" },
};

export function bucketConfig(name: BucketName): BucketConfig {
  const base = DEFAULT_BUCKETS[name];
  const override = Number(env(`${name.toUpperCase()}_RATE_PER_SEC`));
  if (Number.isFinite(override) && override > 0) return { ...base, ratePerSec: override, burst: Math.max(1, Math.round(override)) };
  return base;
}

/* ---------- Clock ---------- */

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: ms => new Promise<void>(ok => setTimeout(ok, ms)),
};

/* ---------- Token bucket with priority lanes ---------- */

export type Priority = "hot" | "normal";

export interface BucketStats {
  name: string;
  ratePerSec: number;
  burst: number;
  published: string;
  tokens: number;
  queuedHot: number;
  queuedNormal: number;
  granted: number;
  /** Epoch ms until which the bucket is paused after a 429, else null. */
  pausedUntil: number | null;
}

export class TokenBucket {
  private tokens: number;
  private last: number;
  private blockedUntil = 0;
  private readonly hot: Array<() => void> = [];
  private readonly normal: Array<() => void> = [];
  private pumping = false;
  private granted = 0;

  constructor(
    readonly name: string,
    readonly config: BucketConfig,
    private readonly clock: Clock = realClock,
  ) {
    this.tokens = config.burst;
    this.last = clock.now();
  }

  /** Resolves when a request may be sent. Hot waiters are always served before normal ones. */
  acquire(priority: Priority = "normal"): Promise<void> {
    return new Promise<void>(resolve => {
      (priority === "hot" ? this.hot : this.normal).push(resolve);
      void this.pump();
    });
  }

  /** Stop granting tokens for `ms` (after a 429) and empty the bucket. */
  penalize(ms: number): void {
    this.refill();
    const until = this.clock.now() + Math.max(0, ms);
    if (until > this.blockedUntil) this.blockedUntil = until;
    this.tokens = 0;
  }

  private refill(): void {
    const now = this.clock.now();
    // No tokens accrue while paused after a 429.
    const from = Math.max(this.last, Math.min(now, this.blockedUntil));
    const elapsed = Math.max(0, now - from);
    this.last = now;
    this.tokens = Math.min(this.config.burst, this.tokens + (elapsed * this.config.ratePerSec) / 1000);
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.hot.length > 0 || this.normal.length > 0) {
        this.refill();
        const now = this.clock.now();
        if (now < this.blockedUntil) {
          await this.clock.sleep(this.blockedUntil - now);
          continue;
        }
        if (this.tokens >= 1) {
          this.tokens -= 1;
          this.granted++;
          const next = this.hot.shift() ?? this.normal.shift();
          next?.();
          continue;
        }
        const waitMs = Math.max(1, Math.ceil(((1 - this.tokens) * 1000) / this.config.ratePerSec));
        await this.clock.sleep(waitMs);
      }
    } finally {
      this.pumping = false;
    }
  }

  stats(): BucketStats {
    this.refill();
    const now = this.clock.now();
    return {
      name: this.name,
      ratePerSec: this.config.ratePerSec,
      burst: this.config.burst,
      published: this.config.published,
      tokens: Math.floor(this.tokens * 100) / 100,
      queuedHot: this.hot.length,
      queuedNormal: this.normal.length,
      granted: this.granted,
      pausedUntil: this.blockedUntil > now ? this.blockedUntil : null,
    };
  }
}

/* ---------- HTTP client ---------- */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string | null = null,
  ) {
    super(`HTTP ${status} from ${url}`);
    this.name = "HttpError";
  }
}

/** Retry-After as milliseconds: delta-seconds or an HTTP date; capped; RETRY_AFTER_DEFAULT_MS when unreadable. */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const secs = Number(header);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return RETRY_AFTER_DEFAULT_MS;
  return Math.min(Math.ceil(ms), RETRY_AFTER_CAP_MS);
}

/** Deterministic exponential backoff for retry number `attempt` (0-based). */
export const backoffMs = (attempt: number): number => Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);

export interface RequestOptions {
  priority?: Priority;
  method?: "GET" | "POST";
  /** JSON body for POST. */
  body?: unknown;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface HttpStats extends BucketStats {
  requests: number;
  ok: number;
  rateLimited: number;
  retries: number;
  failures: number;
  lastStatus: number | null;
  lastError: string | null;
  lastRateLimitedAt: number | null;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  bucket: TokenBucket;
  clock?: Clock;
  fetchImpl?: FetchLike;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class HttpClient {
  readonly bucket: TokenBucket;
  private readonly clock: Clock;
  private readonly fetchImpl: FetchLike;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private counters = { requests: 0, ok: 0, rateLimited: 0, retries: 0, failures: 0 };
  private lastStatus: number | null = null;
  private lastError: string | null = null;
  private lastRateLimitedAt: number | null = null;

  constructor(o: HttpClientOptions) {
    this.bucket = o.bucket;
    this.clock = o.clock ?? realClock;
    this.fetchImpl = o.fetchImpl ?? ((url, init) => fetch(url, init));
    this.userAgent = o.userAgent ?? USER_AGENT;
    this.timeoutMs = o.timeoutMs ?? TIMEOUT_MS;
    this.maxRetries = o.maxRetries ?? MAX_RETRIES;
  }

  /** Fetch and parse JSON. A 404 resolves to null; other non-2xx statuses throw HttpError after retries. */
  async json(url: string, opts: RequestOptions = {}): Promise<unknown> {
    const maxRetries = opts.maxRetries ?? this.maxRetries;
    const method = opts.method ?? "GET";
    for (let attempt = 0; ; attempt++) {
      await this.bucket.acquire(opts.priority ?? "normal");
      this.counters.requests++;
      let res: Response;
      try {
        const headers: Record<string, string> = { "User-Agent": this.userAgent, Accept: "application/json" };
        const init: RequestInit = { method, headers, signal: AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs), cache: "no-store" };
        if (opts.body !== undefined) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(opts.body);
        }
        res = await this.fetchImpl(url, init);
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.lastStatus = null;
        if (attempt < maxRetries) {
          this.counters.retries++;
          await this.clock.sleep(backoffMs(attempt));
          continue;
        }
        this.counters.failures++;
        throw err;
      }
      this.lastStatus = res.status;
      if (res.status === 429) {
        this.counters.rateLimited++;
        this.lastRateLimitedAt = this.clock.now();
      }
      if (RETRYABLE.has(res.status) && attempt < maxRetries) {
        const wait = res.status === 429 ? (retryAfterMs(res.headers.get("retry-after"), this.clock.now()) ?? backoffMs(attempt)) : backoffMs(attempt);
        if (res.status === 429) this.bucket.penalize(wait);
        this.counters.retries++;
        await res.body?.cancel().catch(() => undefined);
        await this.clock.sleep(wait);
        continue;
      }
      if (res.status === 404) {
        this.counters.ok++;
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!res.ok) {
        this.counters.failures++;
        const body = await res.text().catch(() => null);
        this.lastError = `HTTP ${res.status}`;
        throw new HttpError(res.status, url, body ? body.slice(0, 500) : null);
      }
      this.counters.ok++;
      const text = await res.text();
      if (text.trim() === "") return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        this.counters.failures++;
        this.lastError = "invalid JSON";
        throw new HttpError(res.status, url, text.slice(0, 500));
      }
    }
  }

  stats(): HttpStats {
    return {
      ...this.bucket.stats(),
      ...this.counters,
      lastStatus: this.lastStatus,
      lastError: this.lastError,
      lastRateLimitedAt: this.lastRateLimitedAt,
    };
  }
}

/* ---------- Process-wide registry (one client per venue API) ---------- */

const registry = new Map<BucketName, HttpClient>();

/** The shared client for a venue API. */
export function venueHttp(name: BucketName): HttpClient {
  let c = registry.get(name);
  if (!c) {
    c = new HttpClient({ bucket: new TokenBucket(name, bucketConfig(name)) });
    registry.set(name, c);
  }
  return c;
}

/** Rate-limit headroom and counters for every venue API that has been used, for the worker's status report. */
export function rateLimitStats(): Partial<Record<BucketName, HttpStats>> {
  const out: Partial<Record<BucketName, HttpStats>> = {};
  for (const [name, c] of registry) out[name] = c.stats();
  return out;
}

/** Query string from a record, skipping undefined values. */
export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
