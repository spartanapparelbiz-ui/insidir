/* SEC EDGAR access for the Stocks tab, ported from the stock engine (src/sec.mjs on codex/social-stock-funnel).
 * Every request:
 *   - carries the User-Agent in SEC_USER_AGENT, which must name the operator and a monitored email (SEC fair access)
 *   - goes only to the EDGAR paths this feature reads (allowedSecUrl)
 *   - waits its turn in one shared throttle: one request every 125 ms, so never more than 8 a second (the SEC's
 *     limit is 10), with Retry-After honoured on 429 and 5xx
 * Server/worker only. */

export const SEC_MIN_GAP_MS = 125;

/** A usable SEC_USER_AGENT: some name and an email address. */
export function secUserAgent(env: Record<string, string | undefined> = process.env): string | null {
  const ua = (env.SEC_USER_AGENT ?? "").trim();
  return ua.length >= 8 && /[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(ua) ? ua : null;
}

export function allowedSecUrl(input: string): boolean {
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return false;
    if (u.hostname === "data.sec.gov") return !u.search && /^\/submissions\/CIK\d{10}\.json$/.test(u.pathname);
    if (u.hostname !== "www.sec.gov") return false;
    if (/^\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9_.-]+$/.test(u.pathname)) return !u.search;
    // The current-filings Atom feed for Form 4, paged.
    if (u.pathname === "/cgi-bin/browse-edgar") {
      const keys = [...u.searchParams.keys()].sort().join(",");
      return u.searchParams.get("action") === "getcurrent" && u.searchParams.get("type") === "4" && u.searchParams.get("output") === "atom" &&
        (keys === "action,count,output,type" || keys === "action,count,output,start,type");
    }
    return false;
  } catch { return false; }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SecStats { requests: number; ok: number; errors: number; throttled: number; lastError: string | null }

export class SecClient {
  readonly stats: SecStats = { requests: 0, ok: 0, errors: 0, throttled: 0, lastError: null };
  private next = 0;
  constructor(private readonly userAgent: string, private readonly fetcher: FetchLike = fetch, private readonly gapMs = SEC_MIN_GAP_MS, private readonly timeoutMs = 20_000) {}

  static fromEnv(env: Record<string, string | undefined> = process.env): SecClient | null {
    const ua = secUserAgent(env);
    return ua ? new SecClient(ua) : null;
  }

  private async turn(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.next - now);
    this.next = Math.max(this.next, now) + this.gapMs;
    if (wait) await new Promise(r => setTimeout(r, wait));
  }

  async text(url: string): Promise<string> { return this.get(url, false) as Promise<string>; }
  async json<T = unknown>(url: string): Promise<T> { return this.get(url, true) as Promise<T>; }

  private async get(url: string, json: boolean): Promise<unknown> {
    if (!allowedSecUrl(url)) throw new Error(`Disallowed SEC URL: ${url}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.turn();
      this.stats.requests++;
      let res: Response;
      try {
        res = await this.fetcher(url, {
          headers: { "User-Agent": this.userAgent, Accept: json ? "application/json" : "application/xml,application/atom+xml,text/xml,*/*;q=0.8" },
          redirect: "error", signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        this.stats.errors++; this.stats.lastError = e instanceof Error ? e.message : String(e);
        if (attempt < 2) continue;
        throw e;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        if (res.status === 429) this.stats.throttled++;
        const retry = Number(res.headers.get("retry-after"));
        await new Promise(r => setTimeout(r, Number.isFinite(retry) && retry > 0 ? Math.min(30_000, retry * 1000) : (attempt + 1) * 1500));
        continue;
      }
      if (!res.ok) { this.stats.errors++; this.stats.lastError = `SEC responded ${res.status}`; throw new Error(`SEC responded ${res.status}`); }
      this.stats.ok++;
      const body = await res.text();
      if (body.length > 12_000_000) throw new Error("SEC response too large");
      return json ? JSON.parse(body) : body;
    }
    throw new Error("SEC request attempts exhausted");
  }
}
