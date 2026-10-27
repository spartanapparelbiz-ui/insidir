/* /api/health's report: every exchange's last scan, paused venues, the worker's other jobs. SYNTHETIC heartbeats. */
import { describe, expect, it } from "vitest";
import { healthFrom, STALE_MS } from "@/lib/status";

const NOW = 1_800_000_000_000;

describe("health report", () => {
  it("a worker that never wrote to this database: every exchange null, not live", () => {
    const h = healthFrom([], NOW);
    expect(h.live).toBe(false);
    expect(h.venues.kalshi).toEqual({ lastScanAt: null, ageSeconds: null, ok: null, error: null, paused: false });
    expect(h.jobs).toEqual({});
  });

  it("reports each exchange's last scan, age and failure, and the other jobs", () => {
    const h = healthFrom([
      { job: "scan:kalshi", lastRunAt: NOW - 5_000, ok: true, error: null },
      { job: "scan:polymarket", lastRunAt: NOW - 1_000, ok: false, error: "sweep: fetch failed" },
      { job: "scan:polymarket_us", lastRunAt: NOW - STALE_MS - 1, ok: true, error: null },
      { job: "sweep", lastRunAt: NOW - 60_000, ok: false, error: "x".repeat(500) },
      { job: "e2e:pause", lastRunAt: NOW, ok: true, error: null },
    ], NOW);
    expect(h.live).toBe(true);
    expect(h.venues.kalshi).toMatchObject({ ageSeconds: 5, ok: true, paused: false, lastScanAt: new Date(NOW - 5_000).toISOString() });
    expect(h.venues.polymarket).toMatchObject({ ok: false, error: "sweep: fetch failed", paused: true });
    expect(h.venues.polymarket_us.paused).toBe(true);
    expect(Object.keys(h.jobs)).toEqual(["sweep"]);
    expect(h.jobs.sweep!.error).toHaveLength(200);
  });
});
