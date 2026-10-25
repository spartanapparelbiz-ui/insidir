import { describe, expect, it } from "vitest";
import { backoffMs, HttpError, qs, retryAfterMs, TokenBucket, BACKOFF_BASE_MS, MAX_RETRIES, RETRY_AFTER_CAP_MS } from "@/lib/exchanges/http";
import { testHttp, VirtualClock } from "./fixtures/exchanges/harness";

describe("TokenBucket", () => {
  it("serves hot waiters before normal ones once the bucket is empty", async () => {
    const clock = new VirtualClock();
    const bucket = new TokenBucket("t", { ratePerSec: 1, burst: 1, published: "" }, clock);
    const order: string[] = [];
    const track = (label: string, p: Promise<void>) => p.then(() => order.push(label));
    // The first normal takes the only token; the rest queue. A hot request arriving later still goes first.
    const all = [
      track("n1", bucket.acquire("normal")),
      track("n2", bucket.acquire("normal")),
      track("n3", bucket.acquire("normal")),
      track("h1", bucket.acquire("hot")),
      track("h2", bucket.acquire("hot")),
    ];
    await Promise.all(all);
    expect(order).toEqual(["n1", "h1", "h2", "n2", "n3"]);
  });

  it("grants at the configured rate", async () => {
    const clock = new VirtualClock();
    const start = clock.t;
    const bucket = new TokenBucket("t", { ratePerSec: 10, burst: 2, published: "" }, clock);
    await Promise.all(Array.from({ length: 12 }, () => bucket.acquire()));
    // 2 from the burst, then 10 more at 10/s = 1 second.
    expect(clock.t - start).toBe(1000);
    expect(bucket.stats().granted).toBe(12);
  });

  it("penalize pauses the bucket and accrues no tokens while paused", async () => {
    const clock = new VirtualClock();
    const start = clock.t;
    const bucket = new TokenBucket("t", { ratePerSec: 100, burst: 5, published: "" }, clock);
    bucket.penalize(2000);
    expect(bucket.stats().pausedUntil).toBe(start + 2000);
    await bucket.acquire();
    // Waited out the pause, then 10ms for one token at 100/s.
    expect(clock.t - start).toBe(2010);
  });
});

describe("retry policy", () => {
  it("reads Retry-After as seconds or an HTTP date and caps it", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(retryAfterMs("2", now)).toBe(2000);
    expect(retryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5000);
    expect(retryAfterMs("9999", now)).toBe(RETRY_AFTER_CAP_MS);
    expect(retryAfterMs(null, now)).toBeNull();
    expect(retryAfterMs("garbage", now)).toBeNull();
  });

  it("backs off deterministically: 500, 1000, 2000, 4000", () => {
    expect([0, 1, 2, 3].map(backoffMs)).toEqual([BACKOFF_BASE_MS, 1000, 2000, 4000]);
  });

  it("waits Retry-After on 429, then succeeds, and pauses the venue bucket", async () => {
    let n = 0;
    const { http, clock, calls } = testHttp(() => (n++ === 0 ? { status: 429, headers: { "retry-after": "3" } } : { body: { ok: 1 } }));
    const res = await http.json("https://x.test/a");
    expect(res).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(3000);
    expect(clock.sleeps).toContain(3000);
    const s = http.stats();
    expect(s.rateLimited).toBe(1);
    expect(s.retries).toBe(1);
    expect(s.requests).toBe(2);
  });

  it("uses exponential backoff on 429 without Retry-After and gives up after MAX_RETRIES", async () => {
    const { http, calls } = testHttp(() => ({ status: 429 }));
    await expect(http.json("https://x.test/a")).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(MAX_RETRIES + 1);
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i]!.at);
    // Each gap is the backoff plus at most one token interval (the 429 also empties the venue's bucket).
    [500, 1000, 2000, 4000].forEach((want, i) => {
      expect(gaps[i]).toBeGreaterThanOrEqual(want);
      expect(gaps[i]).toBeLessThanOrEqual(want + 2);
    });
    expect(http.stats().rateLimited).toBe(MAX_RETRIES + 1);
  });

  it("retries 5xx, resolves 404 to null, throws on other 4xx without retrying", async () => {
    let n = 0;
    const a = testHttp(() => (n++ < 2 ? { status: 503 } : { body: [1] }));
    expect(await a.http.json("https://x.test/a")).toEqual([1]);
    expect(a.calls).toHaveLength(3);

    const b = testHttp(() => ({ status: 404 }));
    expect(await b.http.json("https://x.test/missing")).toBeNull();

    const c = testHttp(() => ({ status: 400, body: { error: "bad" } }));
    await expect(c.http.json("https://x.test/bad")).rejects.toMatchObject({ status: 400 });
    expect(c.calls).toHaveLength(1);
  });

  it("sends POST bodies as JSON", async () => {
    const { http, calls } = testHttp(() => ({ body: [] }));
    await http.json("https://x.test/books", { method: "POST", body: [{ token_id: "1" }] });
    expect(calls[0]).toMatchObject({ method: "POST", body: [{ token_id: "1" }] });
  });
});

describe("qs", () => {
  it("skips undefined and encodes values", () => {
    expect(qs({ a: 1, b: undefined, c: "x y", d: true })).toBe("?a=1&c=x%20y&d=true");
    expect(qs({})).toBe("");
  });
});
