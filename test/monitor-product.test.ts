/* The product checks (lib/monitor/product.ts) against a throwaway Postgres and a stand-in site, with the real Autopilot
 * engine running between polls as the worker would: every step passes, the fixture match has the right Kalshi market,
 * side, limit and contracts, the exit ping fires, and every fixture row is gone afterwards; stale data fails
 * freshness; an engine that never runs fails the 10-second match. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { runAutopilot } from "@/lib/autopilot/engine";
import { MONITOR_USER, MONITOR_WALLET, runProduct } from "@/lib/monitor/product";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_monprod_${process.pid}`;
const B = "https://insidir.test", M = "0x" + "c".repeat(64), K = "KXNBAGAME-26NOV04MIALAL-MIA", KURL = "https://kalshi.com/markets/kxnbagame/x";
let admin: pg.Client, pool: pg.Pool, db: Db;

const site = (() => {
  const f = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input)), cookie = String((init?.headers as Record<string, string> | undefined)?.cookie ?? "");
    const member = cookie.includes("insidir_session=");
    if (u.pathname === "/") return new Response(member ? '<main data-testid="member-home"></main>' : "<main></main>", { status: 200 });
    if (u.pathname === "/autopilot" || u.pathname === "/book") return new Response("", { status: member ? 200 : 307 });
    if (u.pathname === "/api/search") {
      const q = u.searchParams.get("q") ?? "";
      return Response.json(q === KURL ? { go: "/market/x", hits: [] } : q === "Heat" ? { go: null, hits: [{ kind: "market" }] } : { go: null, hits: [] });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return f;
})();

const engine = () => runAutopilot(db, Date.now(), { appUrl: B, quote: async () => ({ yesAsk: 0.62, noAsk: 0.4, yesBid: 0.6, noBid: 0.37 }), push: async () => {},
  claim: async (u, k) => (await db.insert(schema.alertsSent).values({ userId: u, oppId: k, channel: "push" }).onConflictDoNothing().returning()).length > 0 });

async function beats(ageMs: number) {
  for (const job of ["moves", "twins:bets", "markets:info"]) await pool.query(`insert into terminal.worker_heartbeats (job, last_run_at, last_ok_at, ok) values ($1, now(), now() - $2 * interval '1 millisecond', true)
    on conflict (job) do update set last_ok_at = excluded.last_ok_at`, [job, ageMs]);
}

describe.skipIf(!URL0)("the product checks", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    await pool.query(`insert into terminal.millionaire_bets (id, wallet, tier, source, market_id, event_title, market_title, outcome, outcome_side, amount, price, category, at, last_at)
      values ('b1', '0xw', 'millionaire', 'polymarket', $1, 'Heat vs. Lakers', 'Heat vs. Lakers', 'Heat', 'yes', 50000, 0.6, 'basketball', now(), now())`, [M]);
    await db.insert(schema.marketTwins).values({ polymarketId: M, kalshiId: K, kalshiUrl: KURL, polymarketTitle: "Heat vs. Lakers", kalshiTitle: "Miami wins", kind: "winner", verdict: "candidate",
      status: "approved", confidence: 0.99, checks: { event: true, outcome: true, line: true, rules: true, close: true } });
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("every step passes; the fixture match is right and leaves nothing behind", async () => {
    await beats(30_000);
    const steps = await runProduct(db, { base: B, f: site, yesAsk: async () => 0.62, sleep: async () => { await engine(); } });
    expect(steps.map(s => [s.step, s.ok, s.detail ?? null])).toEqual([["today", true, null], ["search", true, null], ["fresh-bets", true, null], ["autopilot", true, null], ["exit-ping", true, null], ["freshness", true, null]]);
    // Nothing of the fixture is left; the monitor's account and rule stay, with no devices.
    expect((await pool.query("select count(*)::int n from terminal.position_events where wallet = $1", [MONITOR_WALLET])).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int n from terminal.autopilot_matches where user_id = $1", [MONITOR_USER])).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int n from terminal.push_subscriptions where user_id = $1", [MONITOR_USER])).rows[0].n).toBe(0);
  }, 60_000);

  it("stale data fails freshness and the bet poller", async () => {
    await beats(6 * 60_000);
    const steps = await runProduct(db, { base: B, f: site, yesAsk: async () => 0.62, sleep: async () => { await engine(); } });
    expect(steps.find(s => s.step === "fresh-bets")).toMatchObject({ ok: false, detail: expect.stringMatching(/last read Polymarket 3\d\ds ago/) });
    expect(steps.find(s => s.step === "freshness")).toMatchObject({ ok: false, detail: expect.stringContaining("Trades (Polymarket bets) (6 min)") });
  }, 60_000);

  it("no engine: no match within 10 seconds", async () => {
    await beats(0);
    const steps = await runProduct(db, { base: B, f: site, yesAsk: async () => 0.62, sleep: ms => new Promise(r => setTimeout(r, ms)) });
    expect(steps.find(s => s.step === "autopilot")).toMatchObject({ ok: false, detail: "no Autopilot match within 10 seconds of the trade" });
    expect(steps.find(s => s.step === "exit-ping")).toBeUndefined();
    expect((await pool.query("select count(*)::int n from terminal.position_events where wallet = $1", [MONITOR_WALLET])).rows[0].n).toBe(0);
  }, 60_000);
});
