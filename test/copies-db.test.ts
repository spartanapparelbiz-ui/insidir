/* Copy the winners against a throwaway Postgres next to E2E_DATABASE_URL: a wallet with 30+ settled positions is
 * copyable; a member copies it; only moves shown after the copy began count; a US member's new move on a Polymarket
 * market opens the matched Kalshi market at Kalshi's price (inverted pair: the other side), an unmatched one is view
 * only, and nobody in the US ever gets a polymarket.com link; outside the US it opens on Polymarket; P&L at the
 * member's size. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copiesOf, copyable, copyMoves, copyPnl } from "@/lib/copies/store";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_copies_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const H = 3_600_000, NOW = Date.UTC(2026, 9, 30, 18), START = NOW - 48 * H;
const W = "0x4f" + "a".repeat(36) + "c2";

async function move(id: string, o: { market: string; side?: "yes" | "no"; at: number; seen: number | null; result?: "won" | "lost" | null; settled?: number | null; url?: string }) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, category, url, result, settled_at, seen_at, seen_price)
    values ($1, 'polymarket', $2, 'Lakers vs. Celtics', 'Lakers vs. Celtics', 'Lakers', $3, 25000, 0.48, $4, $5, $5, 'sports', 'sports', $6, $7, $8, $5, $9)`,
    [id, o.market, o.side ?? "yes", W, new Date(o.at), o.url ?? `https://polymarket.com/event/${o.market}`, o.result ?? null, o.settled ? new Date(o.settled) : null, o.seen]);
}

describe.skipIf(!URL0)("copy the winners, in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    // 32 settled before the copy: 20 won, 12 lost, each shown at 49¢ (followed at 50¢).
    for (let i = 0; i < 32; i++) await move(`old_${i}`, { market: `0xold${i}`, at: START - (100 - i) * H, seen: 0.49, result: i < 20 ? "won" : "lost", settled: START - (90 - i) * H });
    await pool.query(`insert into terminal.users (id, email, plan, region) values ('usr_us', 'us@example.test', 'insidir', 'us')`);
    await pool.query(`insert into terminal.follows (user_id, kind, target, created_at) values ('usr_us', 'trader', $1, $2)`, [W, new Date(START)]);
    // After the copy began: one matched to Kalshi (inverted), one with no match, one settled (won at 39¢ → 40¢).
    await move("m_matched", { market: "0xp1", at: NOW - 2 * H, seen: 0.5 });
    await move("m_unmatched", { market: "0xp2", at: NOW - H, seen: 0.6 });
    await move("m_settled", { market: "0xp3", at: START + H, seen: 0.39, result: "won", settled: START + 5 * H });
    await pool.query(`insert into terminal.markets (venue, id, data) values ('kalshi', 'KXNBA-LAL', $1)`, [JSON.stringify({ venue: "kalshi", id: "KXNBA-LAL", url: "https://kalshi.com/markets/kxnbagame/lal", yesPrice: 0.3, active: true })]);
    await pool.query(`insert into terminal.pairs (id, data, safety) values ('p1', $1, 'green')`, [JSON.stringify({ id: "p1", a: { venue: "polymarket", id: "0xp1" }, b: { venue: "kalshi", id: "KXNBA-LAL" }, inverted: true, method: "llm", confidence: 0.9, safety: "green", safetyNotes: [], blocked: false })]);
    await pool.query(`insert into terminal.market_info (source, market_id, yes_price) values ('polymarket', '0xp1', 0.55), ('polymarket', '0xp2', 0.62)`);
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("the wallet is copyable, shown by its short address only", async () => {
    const list = await copyable(db, NOW);
    const w = list.find(x => x.kind === "trader" && x.target === W)!;
    expect(w).toBeTruthy();
    expect(w.label).toBe("0x4f…c2");
    expect(w.record).toMatchObject({ n: 33, won: 21, lost: 12 });
  });

  it("a US member copying a Polymarket wallet: the matched Kalshi market at Kalshi's price; no match is view only", async () => {
    const copies = await copiesOf(db, "usr_us");
    expect(copies).toEqual([{ kind: "trader", target: W, label: "0x4f…c2", since: START }]);
    const moves = await copyMoves(db, copies, "us", NOW);
    expect(moves.map(m => m.id)).toEqual(["m_unmatched", "m_matched", "m_settled"]);
    const matched = moves.find(m => m.id === "m_matched")!;
    expect(matched.open).toEqual({ venue: "kalshi", href: "https://kalshi.com/markets/kxnbagame/lal" });
    expect(matched.yourPrice).toBeCloseTo(0.7, 6); // YES on Polymarket = NO on Kalshi: 1 − 0.30
    expect(matched.theirPrice).toBe(0.48);
    expect(moves.find(m => m.id === "m_unmatched")).toMatchObject({ open: null, yourPrice: null });
    for (const m of moves) expect(m.open?.href ?? "").not.toMatch(/polymarket\.com/);
  });

  it("outside the US: Polymarket at Polymarket's price", async () => {
    const moves = await copyMoves(db, await copiesOf(db, "usr_us"), "non_us", NOW);
    expect(moves.find(m => m.id === "m_matched")).toMatchObject({ open: { venue: "polymarket", href: "https://polymarket.com/event/0xp1" }, yourPrice: 0.55 });
  });

  it("P&L at your size counts only moves after the copy began", async () => {
    const [p] = await copyPnl(db, await copiesOf(db, "usr_us"), 10, NOW);
    // One settled since the copy: $10 at 40¢ → $25 back, +$15. The 32 before it don't count. Two still open.
    expect(p!.total).toMatchObject({ n: 1, won: 1, lost: 0, staked: 10 });
    expect(p!.total.net).toBeCloseTo(15, 6);
    expect(p!.week.net).toBeCloseTo(15, 6);
    expect(p!.open).toBe(2);
  });
});
