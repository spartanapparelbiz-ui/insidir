/* Deleting an account in Postgres (lib/account/delete.ts), against a throwaway database next to E2E_DATABASE_URL:
 * the user and everything tied to them goes; usage events stay without the user id; nobody else is touched. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { deleteAccount } from "@/lib/account/delete";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_delete_${process.pid}`;

describe.skipIf(!URL0)("deleting an account in Postgres", () => {
  let admin: pg.Client, pool: pg.Pool, db: Db;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("removes the user and everything tied to them (copies, Autopilot, Research and Reads included); keeps events without the user id", async () => {
    for (const id of ["usr_gone", "usr_kept"]) {
      await db.insert(schema.users).values({ id, email: `${id}@example.com` });
      await db.insert(schema.sessions).values({ tokenHash: `h_${id}`, userId: id, expiresAt: new Date(Date.now() + 86_400_000) });
      await db.insert(schema.pushSubscriptions).values({ endpoint: `https://push/${id}`, userId: id, p256dh: "k", auth: "a" });
      await db.insert(schema.follows).values({ userId: id, kind: "tracker", target: "whales" } as typeof schema.follows.$inferInsert);
      await db.insert(schema.alertsSent).values({ userId: id, oppId: "o1", channel: "push" });
      await db.insert(schema.lifecycleEmails).values({ userId: id, kind: "welcome", period: "once" });
      await db.insert(schema.betChecks).values({ id: `bc_${id}`, userId: id, input: "link", legs: [], summary: "1 leg" });
      await db.insert(schema.events).values({ visitorId: `v_${id}`, userId: id, name: "page_view" });
      await pool.query(`insert into terminal.bet_copies (user_id, bet_id, market_id, title, outcome, outcome_side, tier, their_price, price, amount, venue) values ($1, 'b1', 'm1', 'T', 'Yes', 'yes', 'millionaire', 0.5, 0.5, 100, 'kalshi')`, [id]);
      const rule = (await pool.query(`insert into terminal.autopilot_rules (user_id, name, spec) values ($1, 'r', '{}'::jsonb) returning id`, [id])).rows[0].id;
      await pool.query(`insert into terminal.autopilot_matches (rule_id, user_id, event_id, status, wallet, market_id, kalshi_id, kalshi_url, side, outcome, title, category, amount, their_price, trade_at, matched_at, latency_ms)
        values ($1, $2, 'e1', 'sent', '0xw', 'm1', 'K1', 'https://kalshi.com', 'yes', 'Yes', 'T', 'football', 100, 0.5, now(), now(), 10)`, [rule, id]);
      await pool.query(`insert into terminal.research_queries (user_id, question, key) values ($1, 'q', 'k')`, [id]);
      await pool.query(`insert into terminal.reads (id, user_id, input, market_key, data) values ($1, $2, 'link', 'mk', '{}'::jsonb)`, [`rd_${id}`, id]);
      await pool.query(`insert into terminal.read_seen (user_id, market_key) values ($1, 'mk')`, [id]);
      await pool.query(`insert into terminal.cancel_reasons (user_id, membership_id, reason, detail) values ($1, 'mem_x', 'price', 'my name is …')`, [id]);
    }
    expect(await deleteAccount(db, "usr_gone")).toBe(true);

    const count = async (table: string, id: string) => Number((await pool.query(`select count(*) n from terminal.${table} where user_id = $1`, [id])).rows[0].n);
    for (const t of ["sessions", "push_subscriptions", "follows", "alerts_sent", "lifecycle_emails", "bet_checks", "events", "bet_copies", "autopilot_rules", "autopilot_matches", "research_queries", "reads", "read_seen", "cancel_reasons"]) {
      expect(await count(t, "usr_gone"), t).toBe(0);
      expect(await count(t, "usr_kept"), t).toBe(1);
    }
    expect((await pool.query("select id from terminal.users order by id")).rows).toEqual([{ id: "usr_kept" }]);
    expect((await pool.query("select user_id from terminal.events where visitor_id = 'v_usr_gone'")).rows).toEqual([{ user_id: null }]);
    // The cancel reason stays as a count only: no account, no membership, nothing they typed.
    expect((await pool.query("select membership_id, reason, detail from terminal.cancel_reasons where user_id = 'deleted'")).rows).toEqual([{ membership_id: null, reason: "price", detail: null }]);
    expect(await deleteAccount(db, "usr_gone")).toBe(false);
  });
});
