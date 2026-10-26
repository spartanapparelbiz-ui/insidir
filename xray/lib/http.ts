/* JSON over HTTPS for Polymarket's public APIs: a User-Agent on every request, an 8 second timeout, and one
 * retry on 429 after the server's Retry-After (capped at 3 seconds). */

export const USER_AGENT = "InsidirXray/0.1 (+https://insidir.com)";
export const TIMEOUT_MS = 8_000;
export const RETRY_AFTER_CAP_MS = 3_000;

export class HttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`HTTP ${status} from ${url}`);
    this.name = "HttpError";
  }
}

/** Retry-After as milliseconds: delta-seconds or an HTTP date; capped; 1s when absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 1_000;
  const secs = Number(header);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - now;
  if (!Number.isFinite(ms) || ms < 0) return 1_000;
  return Math.min(ms, RETRY_AFTER_CAP_MS);
}

const sleep = (ms: number) => new Promise<void>(ok => setTimeout(ok, ms));

/** GET a URL and parse JSON. 404 resolves to null; other failures throw. */
export async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 429 && attempt === 0) {
      await sleep(retryAfterMs(res.headers.get("retry-after")));
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new HttpError(res.status, url);
    return (await res.json()) as unknown;
  }
}
