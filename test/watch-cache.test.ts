/* The poller's watchlist copy: re-read every 5 minutes, and at once after the daily refresh, so a wallet the screen
 * moves down to Pro stops pinging as a millionaire within minutes (it used to stay frozen for a day). */
import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { WatchCache } from "@/lib/millionaires/watchlist";

function fakeDb(rows: { current: Array<{ wallet: string; tier: string }> }): Db {
  return { select: () => ({ from: async () => rows.current }) } as unknown as Db;
}

describe("WatchCache", () => {
  it("keeps its copy for 5 minutes, re-reads after, and at once when invalidated", async () => {
    const rows = { current: [{ wallet: "0xaaa", tier: "millionaire" }] };
    const db = fakeDb(rows), cache = new WatchCache(), t0 = 1_000_000;
    await cache.load(db, t0);
    expect(cache.tier("0xAAA")).toBe("millionaire");
    rows.current = [{ wallet: "0xaaa", tier: "pro" }];
    await cache.load(db, t0 + 60_000);
    expect(cache.tier("0xaaa")).toBe("millionaire");
    await cache.load(db, t0 + 5 * 60_000);
    expect(cache.tier("0xaaa")).toBe("pro");
    rows.current = [{ wallet: "0xaaa", tier: "millionaire" }];
    cache.invalidate();
    await cache.load(db, t0 + 5 * 60_000 + 1);
    expect(cache.tier("0xaaa")).toBe("millionaire");
  });
});
