/* /status sources (lib/status-page.ts readStatus) against a throwaway Postgres: a venue is lit by its poller's own
 * last successful read, not by the newest stored bet. Nov 4: no large Polymarket bet for 22 minutes showed "Behind"
 * while the poller read every few seconds. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { readStatus } from "@/lib/status-page";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_status_${process.pid}`;
const MIN = 60_000, NOW = Date.now();
let admin: pg.Client, pool: pg.Pool, db: Db;

async function bet(source: "polymarket" | "kalshi", agoMs: number) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, category)
    values ($1, $2, 'm', 'E', 'M', 'Yes', 'yes', 50000, 0.5, '0xw', $3, $3, 'sports', 'sports')`, [`${source}-${agoMs}`, source, new Date(NOW - agoMs)]);
}
async function beat(job: string, agoMs: number | null) {
  await pool.query(`insert into terminal.worker_heartbeats (job, last_run_at, last_ok_at, ok) values ($1, now(), $2, true)`, [job, agoMs === null ? null : new Date(NOW - agoMs)]);
}

describe.skipIf(!URL0)("/status sources", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });
  beforeEach(async () => { await pool.query("truncate terminal.moves, terminal.worker_heartbeats"); });

  it("a quiet stretch with a fresh poller is green; the note gives both the read and the latest trade", async () => {
    await bet("polymarket", 22 * MIN);
    await beat("moves:polymarket", 15_000);
    const s = (await readStatus(db, NOW)).sources.find(x => x.key === "polymarket")!;
    expect(s.light).toBe("green");
    expect(s.note).toMatch(/^Read .* ago; latest trade 22 min ago$/);
  });

  it("a poller that stopped reading is not green, however recent the last trade", async () => {
    await bet("polymarket", MIN);
    await beat("moves:polymarket", 3 * 60 * MIN);
    expect((await readStatus(db, NOW)).sources.find(x => x.key === "polymarket")!.light).toBe("red");
  });

  it("no poller beat yet: falls back to the newest stored trade", async () => {
    await bet("kalshi", 5 * MIN);
    const s = (await readStatus(db, NOW)).sources.find(x => x.key === "kalshi")!;
    expect(s.light).toBe("green");
    expect(s.note).toBe("Latest seen 5 min ago");
  });
});
