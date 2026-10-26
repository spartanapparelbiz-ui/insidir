/* Test harness for the venue clients: a virtual clock (sleep advances time instantly) and a fake fetch that serves
 * canned JSON by URL and records every request. */
import { HttpClient, TokenBucket, type BucketConfig, type Clock } from "@/lib/exchanges/http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8")) as unknown;
}

export function fixtureText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

export class VirtualClock implements Clock {
  t = 1_700_000_000_000;
  readonly sleeps: number[] = [];
  now = (): number => this.t;
  sleep = (ms: number): Promise<void> => {
    this.sleeps.push(ms);
    this.t += ms;
    return Promise.resolve();
  };
}

export interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface Call {
  url: string;
  method: string;
  body: unknown;
  at: number;
}

/** routes: (url, method, body) → Reply (or a list of replies served in order for that matcher). */
export type Route = (url: string, method: string, body: unknown) => Reply | undefined;

export function fakeFetch(route: Route, clock: VirtualClock) {
  const calls: Call[] = [];
  const impl = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? "GET";
    const body: unknown = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body, at: clock.now() });
    const r = route(url, method, body) ?? { status: 404, body: { error: "not found" } };
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers });
  };
  return { impl, calls };
}

export const FAST: BucketConfig = { ratePerSec: 1000, burst: 1000, published: "test" };

export function testHttp(route: Route, config: BucketConfig = FAST) {
  const clock = new VirtualClock();
  const { impl, calls } = fakeFetch(route, clock);
  const http = new HttpClient({ bucket: new TokenBucket("test", config, clock), clock, fetchImpl: impl });
  return { http, clock, calls };
}
