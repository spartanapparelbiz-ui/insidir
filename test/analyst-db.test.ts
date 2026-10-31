/* Analyst notes in Postgres (lib/analyst/facts.ts factsFor, lib/analyst/store.ts notesOnce), against a throwaway
 * database next to E2E_DATABASE_URL: the facts come from SQL over the account's positions, its record, the market and
 * other proven accounts; every new position gets a note that passes the validator; notesFor reads them back. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_analyst_${process.pid}`;
const NOW = Date.UTC(2026, 9, 31, 1), DAY = 86_400_000, MIN = 60_000;
const W = "0x" + "c".repeat(40), P1 = "0x" + "d".repeat(40), P2 = "0x" + "e".repeat(40);

describe.skipIf(!URL0)("analyst notes in Postgres", () => {
  let admin: pg.Client, pool: pg.Pool, db: Db;
  const prevKey = process.env.OPENROUTER_API_KEY;
  beforeAll(async () => {
    delete process.env.OPENROUTER_API_KEY;
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => { process.env.OPENROUTER_API_KEY = prevKey; await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  const mv = (id: string, o: Partial<typeof schema.moves.$inferInsert>): typeof schema.moves.$inferInsert => ({
    id, source: "polymarket", marketId: "0xmk", eventTitle: "Knicks vs. Celtics", marketTitle: "Knicks vs. Celtics", outcome: "Knicks", outcomeSide: "yes", amount: 20_000, avgPrice: 0.5,
    wallet: W, walletName: "googleplay", at: new Date(NOW - 5 * DAY), lastAt: new Date(NOW - 5 * DAY), fills: 1, tab: "sports", league: "NBA", category: "sports", ...o,
  } as typeof schema.moves.$inferInsert);

  it("facts from SQL, a note for each new position, read back", async () => {
    // Their history: 20 settled NBA positions (14 won), seen at 0.5 before settling; sizes around $20K.
    const hist = Array.from({ length: 20 }, (_, i) => mv(`h${i}`, { marketId: `0xh${i}`, amount: 15_000 + i * 500, at: new Date(NOW - (25 - i) * DAY), lastAt: new Date(NOW - (25 - i) * DAY),
      result: i < 14 ? "won" : "lost", settledAt: new Date(NOW - (24 - i) * DAY), seenAt: new Date(NOW - (25 - i) * DAY), seenPrice: 0.5 }));
    await db.insert(schema.moves).values([...hist,
      mv("now", { amount: 62_000, avgPrice: 0.48, at: new Date(NOW - 40 * MIN), lastAt: new Date(NOW - 40 * MIN) }),
      mv("before", { amount: 9_000, at: new Date(NOW - 3 * DAY), lastAt: new Date(NOW - 3 * DAY) }),
      mv("p1", { wallet: P1, walletName: "proA", amount: 50_000, at: new Date(NOW - 2 * 60 * MIN), lastAt: new Date(NOW - 2 * 60 * MIN) }),
      mv("p2", { wallet: P2, walletName: "proB", amount: 35_000, at: new Date(NOW - 3 * 60 * MIN), lastAt: new Date(NOW - 3 * 60 * MIN) }),
    ]);
    const rec = (wallet: string, resolved: number, won: number, profit: number) => ({ wallet, name: null, resolved, won, lost: resolved - won, profit, biggestWin: 1, updatedAt: new Date(NOW) });
    await db.insert(schema.traderRecords).values([rec(W, 63, 41, 120_000), rec(P1, 40, 26, 50_000), rec(P2, 30, 18, 9_000)]);
    await db.insert(schema.marketInfo).values({ source: "polymarket", marketId: "0xmk", yesPrice: 0.54, startAt: new Date(NOW + 95 * MIN), closed: false, updatedAt: new Date(NOW) } as typeof schema.marketInfo.$inferInsert);

    const { factsFor } = await import("@/lib/analyst/facts");
    const { fromRow } = await import("@/lib/moves/store");
    const row = (await db.select().from(schema.moves)).find(r => r.id === "now")!;
    const t = Object.fromEntries((await factsFor(db, fromRow(row), NOW)).facts.map(f => [f.key, f.text]));
    expect(t).toMatchObject({
      account: "googleplay", rank: "largest position this month", record: "41–22", scope_record: "NBA record: 14–6",
      proven: "2 proven accounts with $85K", price_move: "6 points their way", since: "40 minutes since", to_start: "95 minutes before the start", prior: "1 earlier position in this market",
    });
    expect(t.vs_median).toMatch(/^3\.\d× their median$/);
    expect(t.scope_roi).toMatch(/^followable ROI [+−]\d+\.\d%$/);

    const { notesOnce, notesFor } = await import("@/lib/analyst/store");
    const { validateNote } = await import("@/lib/analyst/validate");
    const r = await notesOnce(db, NOW, { limit: 50 });
    // The last 2 days only: "before" (3 days old) gets none.
    expect(r.written).toBe(3);
    expect(r.template).toBe(3);
    const notes = await notesFor(db, ["now", "p1", "p2", "before"]);
    expect([...notes.keys()].sort()).toEqual(["now", "p1", "p2"]);
    for (const n of notes.values()) expect(validateNote(n.text, n.facts), n.text).toMatchObject({ ok: true });
    expect(notes.get("now")!.text).toMatch(/^googleplay's largest position this month, 3\.\d× their median\. Their NBA record: 14–6, followable ROI/);
    // Nothing new: nothing written.
    expect((await notesOnce(db, NOW)).written).toBe(0);
  });
});
