/* The Millionaires' board, pings and their receipts in a throwaway Postgres next to E2E_DATABASE_URL: only $1M+ wallets'
 * $10K+ bets, the visitors' 60-minute delay, the price now by side, one ping per member and bet, the daily cap, the
 * member's categories, and the receipts counting each pinged bet once. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { boardRows, boardStats, VISITOR_DELAY_MS } from "@/lib/millionaire/board";
import { pingReceipts, pingsOnce } from "@/lib/millionaire/pings";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_mil_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const MIN = 60_000, NOW = Date.now();
const RICH = "0x" + "1".repeat(40), PRO = "0x" + "2".repeat(40), POOR = "0x" + "3".repeat(40);

async function move(id: string, o: { market: string; title: string; side: "yes" | "no"; outcome: string; amount: number; wallet: string; ago: number; price?: number; tab?: string; league?: string | null; category?: string; result?: "won" | "lost" | null }) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, league, category, result, settled_at)
    values ($1, 'polymarket', $2, $3, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, $13, $14)`,
    [id, o.market, o.title, o.outcome, o.side, o.amount, o.price ?? 0.69, o.wallet, new Date(NOW - o.ago), o.tab ?? "sports", o.league ?? "NFL", o.category ?? "sports", o.result ?? null, o.result ? new Date(NOW) : null]);
}

describe.skipIf(!URL0)("the Millionaires' board and pings, in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    for (const [w, pnl] of [[RICH, 2_400_000], [PRO, 400_000], [POOR, 20_000]] as const) {
      await pool.query(`insert into terminal.wallet_pnl (wallet, closed, closed_at_least, pnl, read_at) values ($1, 500, false, $2, now())`, [w, pnl]);
    }
    await move("rams", { market: "0xrams", title: "Chargers vs. Rams", side: "no", outcome: "Rams", amount: 139_771, wallet: RICH, ago: 4 * MIN });
    await move("chiefs", { market: "0xkc", title: "Chiefs vs. Broncos", side: "yes", outcome: "Chiefs", amount: 61_500, wallet: RICH, ago: 2 * 60 * MIN });
    await move("senate", { market: "0xsen", title: "Senate control", side: "yes", outcome: "Democrats", amount: 30_000, wallet: RICH, ago: 6 * MIN, tab: "markets", league: null, category: "politics" });
    await move("small", { market: "0xsm", title: "Titans vs. Bengals", side: "yes", outcome: "Titans", amount: 9_000, wallet: RICH, ago: 3 * MIN });
    await move("pro", { market: "0xpro", title: "Celtics vs. Magic", side: "yes", outcome: "Celtics", amount: 90_000, wallet: PRO, ago: 2 * MIN, league: "NBA" });
    await move("poor", { market: "0xpoor", title: "Celtics vs. Magic", side: "yes", outcome: "Celtics", amount: 90_000, wallet: POOR, ago: 2 * MIN, league: "NBA" });
    await move("settled-w", { market: "0xs1", title: "Old game one", side: "yes", outcome: "A", amount: 40_000, wallet: RICH, ago: 3 * 24 * 60 * MIN, result: "won" });
    await move("settled-l", { market: "0xs2", title: "Old game two", side: "yes", outcome: "B", amount: 40_000, wallet: RICH, ago: 3 * 24 * 60 * MIN, result: "lost" });
    await pool.query(`insert into terminal.market_info (source, market_id, yes_price) values ('polymarket', '0xrams', 0.3)`);
    // Two paid members with push on and a device: one follows sports only, the other elections only.
    for (const [id, cats] of [["u_sports", ["sports"]], ["u_elect", ["elections"]]] as const) {
      await pool.query(`insert into terminal.users (id, email, plan, settings) values ($1, $2, 'insidir', $3)`, [id, `${id}@example.test`, JSON.stringify({ ...schema.DEFAULT_SETTINGS, alertPush: true, pingCats: cats })]);
      await pool.query(`insert into terminal.push_subscriptions (endpoint, user_id, p256dh, auth) values ($1, $2, 'k', 'a')`, [`https://push.test/${id}`, id]);
    }
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("lists only $1M+ wallets' $10K+ bets, newest first, with the price now for their side; visitors see it an hour late", async () => {
    const live = await boardRows(db, NOW);
    expect(live.map(r => r.id).slice(0, 3)).toEqual(["rams", "senate", "chiefs"]);
    expect(new Set(live.map(r => r.id).slice(3))).toEqual(new Set(["settled-w", "settled-l"]));
    expect(live.find(r => r.id === "small")).toBeUndefined();
    expect(live.find(r => r.id === "pro")).toBeUndefined();
    const rams = live.find(r => r.id === "rams")!;
    expect(rams).toMatchObject({ side: "Rams", amount: 139_771, priceThen: 0.69, tier: "millionaire" });
    expect(rams.priceNow).toBeCloseTo(0.7, 5);
    const late = await boardRows(db, NOW, { delayMs: VISITOR_DELAY_MS });
    expect(late.map(r => r.id)).not.toContain("rams");
    expect(late.map(r => r.id)).toContain("chiefs");
    expect(await boardRows(db, NOW, { cats: ["elections"] })).toHaveLength(1);
  });

  it("counts big bets, $1M+ wallets and their money today", async () => {
    const s = await boardStats(db, NOW);
    expect(s.millionaires).toBe(1);
    expect(s.bigBets).toBe(8);
    expect(s.movedToday).toBe(139_771 + 61_500 + 30_000 + 9_000);
  });

  it("pings each member once per bet, in their categories only, and stores each one", async () => {
    process.env.FEATURE_ALERTS_PUSH = "on";
    const sent: Array<{ endpoint: string; body: string }> = [];
    const send = async (t: { endpoint: string }, m: { body: string }) => { sent.push({ endpoint: t.endpoint, body: m.body }); return "sent" as const; };
    expect(await pingsOnce(db, NOW, send)).toBe(2);
    expect(new Set(sent.map(x => `${x.endpoint} ${x.body}`))).toEqual(new Set([
      "https://push.test/u_sports A $1M+ wallet just put $140K on Rams at 69¢ (now 70¢)",
      "https://push.test/u_elect A $1M+ wallet just put $30K on Democrats at 69¢",
    ]));
    // Again: nothing new to send.
    expect(await pingsOnce(db, NOW + MIN, send)).toBe(0);
    const rows = (await pool.query("select user_id, move_id from terminal.millionaire_pings order by user_id")).rows;
    expect(rows).toEqual([{ user_id: "u_elect", move_id: "senate" }, { user_id: "u_sports", move_id: "rams" }]);
  });

  it("stops at five a day", async () => {
    await pool.query("delete from terminal.millionaire_pings");
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(NOW));
    for (let i = 0; i < 5; i++) await pool.query("insert into terminal.millionaire_pings (user_id, move_id, day, sent_at) values ('u_sports', $1, $2, now())", [`earlier-${i}`, day]);
    const sent: string[] = [];
    await pingsOnce(db, NOW, async t => { sent.push(t.endpoint); return "sent"; });
    expect(sent).toEqual(["https://push.test/u_elect"]);
  });

  it("receipts count each pinged bet once, losses included", async () => {
    await pool.query("insert into terminal.millionaire_pings (user_id, move_id, day, sent_at) values ('u_sports', 'settled-w', '2026-10-30', now()), ('u_elect', 'settled-w', '2026-10-30', now()), ('u_sports', 'settled-l', '2026-10-30', now())");
    const r = await pingReceipts(db);
    expect(r.won).toBe(1);
    expect(r.lost).toBe(1);
    expect(r.open).toBeGreaterThan(0);
  });
});
