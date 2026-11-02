/* The /go funnel's data in a throwaway Postgres next to E2E_DATABASE_URL: the hook is an hour late and carries no
 * address, the aha's locked cards never carry their side, the building lines count real rows, and /admin/go counts
 * each step's visitors per UTM source. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ahaData, buildLine, hookData } from "@/lib/go/data";
import { goFunnel } from "@/lib/go/funnel";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_go_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const MIN = 60_000, NOW = Date.now();
const RICH = "0x" + "a".repeat(40), RICH2 = "0x" + "b".repeat(40);
const A = { topics: ["nfl" as const], venue: "kalshi" as const, stake: "25-100" as const, at: NOW };

async function bet(id: string, market: string, title: string, side: "yes" | "no", outcome: string, amount: number, wallet: string, ago: number, league = "NFL") {
  await pool.query(`insert into terminal.millionaire_bets (id, wallet, market_id, event_title, market_title, outcome, outcome_side, amount, price, pnl, tab, league, category, at)
    values ($1, $2, $3, $4, $4, $5, $6, $7, 0.6, 2000000, 'sports', $8, 'sports', $9)`, [id, wallet, market, title, outcome, side, amount, league, new Date(NOW - ago)]);
}

describe.skipIf(!URL0)("the /go funnel's data, in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    await pool.query(`insert into terminal.millionaire_wallets (wallet, pnl, source, read_at) values ($1, 3100000, 'leaderboard', now()), ($2, 1200000, 'leaderboard', now())`, [RICH, RICH2]);
    await bet("b1", "0xrams", "Rams vs. 49ers", "yes", "Rams", 120_000, RICH, 90 * MIN);
    await bet("b2", "0xrams", "Rams vs. 49ers", "yes", "Rams", 40_000, RICH2, 80 * MIN);
    await bet("b3", "0xkc", "Chiefs vs. Bills", "no", "Bills", 70_000, RICH, 30 * MIN);
    await bet("b4", "0xdal", "Cowboys vs. Eagles", "yes", "Cowboys", 20_000, RICH2, 20 * MIN);
    await bet("b5", "0xbos", "Celtics vs. Magic", "yes", "Celtics", 500_000, RICH, 10 * MIN, "NBA");
    for (const [vid, steps, src] of [["v1", ["hook", "topics", "venue", "stake", "building", "aha", "paywall"], "tiktok"], ["v2", ["hook", "topics"], "tiktok"], ["v3", ["hook"], "ig"]] as const) {
      for (const [i, s] of steps.entries()) {
        await pool.query(`insert into terminal.events (name, visitor_id, props, at) values ('go_step', $1, $2, now())`, [vid, JSON.stringify({ step: s, source: src })]);
        if (i < steps.length - 1) await pool.query(`insert into terminal.events (name, visitor_id, props, at) values ('go_time', $1, $2, now())`, [vid, JSON.stringify({ step: s, ms: 1000 * (i + 1), source: src })]);
      }
    }
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("the hook is the newest $1M+ bet at least an hour old, with no address; the count is the last hour's, live", async () => {
    const h = await hookData(db, NOW);
    expect(h.bet?.id).toBe("b2");
    expect(h.hour).toBe(3);
  });

  it("the aha ranks their categories' markets by $1M+ money today; only unlocked cards carry the side", async () => {
    const a = await ahaData(db, NOW, A, 1);
    expect(a.cards.map(c => c.market)).toEqual(["0xrams", "0xkc", "0xdal"]);
    expect(a.cards[0]).toMatchObject({ dollars: 160_000, side: { label: "Rams", dollars: 160_000, wallets: 2 } });
    expect(a.cards[1]!.side).toBeUndefined();
    // Nothing in a locked card points at its side: the logos stay in the market's order.
    expect(a.cards[1]!.art).toMatchObject({ kind: "teams", teams: [{ name: "Chiefs" }, { name: "Bills" }] });
    expect(a.more).toBe(0);
    expect((await ahaData(db, NOW, A, 3)).cards.every(c => c.side)).toBe(true);
    expect((await ahaData(db, NOW, { ...A, topics: [] })).more).toBe(1);
  });

  it("the building lines count real rows", async () => {
    expect(await buildLine(db, NOW, "wallets", A)).toBe(2);
    expect(await buildLine(db, NOW, "bets", A)).toBe(4);
  });

  it("/admin/go counts each step's visitors per source, biggest source first", async () => {
    const f = await goFunnel(db, new Date(NOW - 86_400_000), NOW);
    expect(f.map(r => r.source)).toEqual(["tiktok", "ig"]);
    expect(f[0]!.steps.hook!.visitors).toBe(2);
    expect(f[0]!.steps.topics!.visitors).toBe(2);
    expect(f[0]!.steps.paywall!.visitors).toBe(1);
    expect(f[0]!.steps.topics!.medianMs).toBe(2000);
    expect(f[1]!.steps.hook!.visitors).toBe(1);
  });
});
