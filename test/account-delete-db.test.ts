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

  it("removes the user, sessions, push, follows, alerts, lifecycle emails and bet checks; keeps events without the user id", async () => {
    for (const id of ["usr_gone", "usr_kept"]) {
      await db.insert(schema.users).values({ id, email: `${id}@example.com` });
      await db.insert(schema.sessions).values({ tokenHash: `h_${id}`, userId: id, expiresAt: new Date(Date.now() + 86_400_000) });
      await db.insert(schema.pushSubscriptions).values({ endpoint: `https://push/${id}`, userId: id, p256dh: "k", auth: "a" });
      await db.insert(schema.follows).values({ userId: id, kind: "tracker", target: "whales" } as typeof schema.follows.$inferInsert);
      await db.insert(schema.alertsSent).values({ userId: id, oppId: "o1", channel: "push" });
      await db.insert(schema.lifecycleEmails).values({ userId: id, kind: "welcome", period: "once" });
      await db.insert(schema.betChecks).values({ id: `bc_${id}`, userId: id, input: "link", legs: [], summary: "1 leg" });
      await db.insert(schema.events).values({ visitorId: `v_${id}`, userId: id, name: "page_view" });
    }
    expect(await deleteAccount(db, "usr_gone")).toBe(true);

    const count = async (table: string, id: string) => Number((await pool.query(`select count(*) n from terminal.${table} where user_id = $1`, [id])).rows[0].n);
    for (const t of ["sessions", "push_subscriptions", "follows", "alerts_sent", "lifecycle_emails", "bet_checks", "events"]) {
      expect(await count(t, "usr_gone"), t).toBe(0);
      expect(await count(t, "usr_kept"), t).toBe(1);
    }
    expect((await pool.query("select id from terminal.users order by id")).rows).toEqual([{ id: "usr_kept" }]);
    expect((await pool.query("select user_id from terminal.events where visitor_id = 'v_usr_gone'")).rows).toEqual([{ user_id: null }]);
    expect(await deleteAccount(db, "usr_gone")).toBe(false);
  });
});
