/* The trial reminder (lib/billing/trial-reminder.ts): about a day before a $1 trial turns into $39 a month, one push,
 * on the member's clock, never twice, not to members who turned it off or already cancelled. Words and timing are
 * pure; the selection runs against a throwaway database next to E2E_DATABASE_URL. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { remindNow, trialReminderMessage, trialRemindersOnce } from "@/lib/billing/trial-reminder";

const HOUR = 3_600_000;
// Fri Nov 6 2026, 14:00 in New York (19:00 UTC).
const NOW = Date.UTC(2026, 10, 6, 19);

describe("trial reminder, pure", () => {
  it("says when the charge lands on the member's clock, and how to cancel", () => {
    const m = trialReminderMessage({ endsAt: NOW + 22 * HOUR, timeZone: null }, "https://insidir.com", NOW);
    expect(m).toEqual({ title: "Your Insidir trial ends tomorrow", body: "At 12:00 PM it becomes $39 a month. Keep it and do nothing, or cancel any time in Account.", url: "https://insidir.com/settings" });
    expect(trialReminderMessage({ endsAt: NOW + 5 * HOUR, timeZone: "America/Los_Angeles" }, "https://insidir.com", NOW).body).toMatch(/^At 4:00 PM /);
  });
  it("waits for morning, unless the charge is too close to wait", () => {
    const night = Date.UTC(2026, 10, 7, 5); // 00:00 in New York
    expect(remindNow({ userId: "u", endsAt: night + 20 * HOUR, timeZone: null, quietStart: null, quietEnd: null }, night)).toBe(false);
    expect(remindNow({ userId: "u", endsAt: night + 9 * HOUR, timeZone: null, quietStart: null, quietEnd: null }, night)).toBe(true);
    expect(remindNow({ userId: "u", endsAt: NOW + 20 * HOUR, timeZone: null, quietStart: null, quietEnd: null }, NOW)).toBe(true);
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_trial_${process.pid}`;

describe.skipIf(!URL0)("trial reminder, in Postgres", () => {
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

  it("reminds trials ending within a day, once each; skips reminders off, cancelled, paid and far-off trials", async () => {
    const add = (id: string, o: Partial<typeof schema.users.$inferInsert>) => db.insert(schema.users).values({ id, email: `${id}@example.test`, plan: "insidir", membershipStatus: "trialing", accessUntil: new Date(NOW + 20 * HOUR), settings: schema.DEFAULT_SETTINGS, ...o });
    await add("usr_due", {});
    await add("usr_off", { settings: { ...schema.DEFAULT_SETTINGS, remindBeforeCharge: false } });
    await add("usr_cancelled", { cancelAtPeriodEnd: true });
    await add("usr_paid", { membershipStatus: "active" });
    await add("usr_far", { accessUntil: new Date(NOW + 60 * HOUR) });
    const sent: string[] = [];
    const deps = { appUrl: "https://insidir.com", async push(u: string) { sent.push(u); } };
    expect(await trialRemindersOnce(db, NOW, deps)).toBe(1);
    expect(sent).toEqual(["usr_due"]);
    expect(await trialRemindersOnce(db, NOW + 15 * 60_000, deps)).toBe(0);
    expect(sent).toEqual(["usr_due"]);
  });
});
