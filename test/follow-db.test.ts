/* Followable records in Postgres (lib/follow/records.ts), against a throwaway database next to E2E_DATABASE_URL:
 * $100 on each position at the price Insidir showed it plus a point, only when shown before it settled; a tracker's
 * record per window and all time, a trader's, and who counts as a winner (30+ settled, net positive). */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_follow_${process.pid}`;
const NOW = Date.UTC(2026, 9, 29, 15), DAY = 86_400_000;
const W = "0x" + "d".repeat(40);

describe.skipIf(!URL0)("followable records in Postgres", () => {
  let admin: pg.Client, pool: pg.Pool, db: Db;
  const prev = process.env.FEATURES_READY;

  beforeAll(async () => {
    process.env.FEATURES_READY = "feed,records,follows,stocks";
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => { process.env.FEATURES_READY = prev; await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("a tracker and a trader: $100 at the seen price plus a point, shown before settling, 30+ settled to be a winner", async () => {
    const { trackerFollow, traderFollowAll, isWinner } = await import("@/lib/follow/records");
    const { TRACKERS, TRACKER_RULES_V } = await import("@/lib/trackers");
    const row = (i: number, o: Partial<typeof schema.moves.$inferInsert>): typeof schema.moves.$inferInsert => ({
      id: `f${i}`, at: new Date(NOW - (40 - i) * DAY), lastAt: new Date(NOW - (40 - i) * DAY), source: "polymarket", marketId: `0xf${i}`, eventTitle: `Match ${i}`,
      marketTitle: `Match ${i}`, outcome: "Player", outcomeSide: "yes", amount: 30_000, avgPrice: 0.43, wallet: W, walletName: "Follow", fills: 1, tab: "sports",
      league: "tennis", category: "sports", trackers: ["tennis"], trackersV: TRACKER_RULES_V, seenAt: new Date(NOW - (40 - i) * DAY), seenPrice: 0.45, seenSrc: "history", ...o,
    } as typeof schema.moves.$inferInsert);
    await db.insert(schema.moves).values([
      // 32 settled, shown at 45%: 20 won (each 100 / 0.46 − 100), 12 lost.
      ...Array.from({ length: 32 }, (_, i) => row(i, { result: i < 20 ? "won" : "lost", settledAt: new Date(NOW - (39 - i) * DAY) })),
      // Shown after it settled, and never shown: neither counts.
      row(40, { result: "won", settledAt: new Date(NOW - 5 * DAY), seenAt: new Date(NOW - 4 * DAY) }),
      row(41, { result: "won", settledAt: new Date(NOW - 5 * DAY), seenPrice: null }),
      // Open: not settled.
      row(42, { at: new Date(NOW - DAY), lastAt: new Date(NOW - DAY), seenAt: new Date(NOW - DAY) }),
    ]);
    const net = 20 * (100 / 0.46 - 100) - 12 * 100;
    const t = await trackerFollow(db, TRACKERS.find(x => x.slug === "tennis")!, NOW);
    expect(t.all).toMatchObject({ n: 32, won: 20, lost: 12, staked: 3200 });
    expect(t.all.net).toBeCloseTo(net, 6);
    expect(isWinner(t.all)).toBe(true);
    const tr = (await traderFollowAll(db, NOW)).get(W)!;
    expect(tr.all.n).toBe(32);
    expect(tr.all.net).toBeCloseTo(net, 6);
    expect(tr.open).toBe(1);
    expect(isWinner({ ...t.all, n: 29 })).toBe(false);
  });
});
