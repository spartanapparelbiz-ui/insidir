/* Activation and retention emails (lib/emails/lifecycle.ts): who gets which and when, that every line is a stored
 * move, and that each goes out once. The DB part runs against a throwaway database next to E2E_DATABASE_URL. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { dueKinds, isoWeek, lifecycleOnce, trialEndingEmail, weeklyEmail, type LifecycleEmail } from "@/lib/emails/lifecycle";
import { upsertMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";

const H = 3_600_000, DAY = 24 * H;
// Monday Oct 26 2026, 10:00 ET.
const MON = Date.UTC(2026, 9, 26, 14, 0, 0);
const W = `0x${"a".padStart(40, "0")}`;
const member = { plan: "insidir" as const, email: "m@example.test", cancelAtPeriodEnd: false, optedOut: false, follows: 2 };
const move = (o: Partial<Move>): Move => ({
  id: `pm:${Math.random()}`, source: "polymarket", marketId: "C1", eventTitle: "Chiefs vs Bills", marketTitle: "Chiefs vs Bills", outcome: "Chiefs", outcomeSide: "yes",
  amount: 412_000, avgPrice: 0.62, wallet: W, walletName: "kch123", at: MON - DAY, lastAt: MON - DAY, fills: 1, tab: "sports", league: "NFL",
  category: "sports", url: null, result: null, settledAt: null, ...o,
});

describe("which emails are due", () => {
  it("welcome on day 0, the trial email on day 2 of the Insidir trial, weekly on Monday mornings ET", () => {
    expect(dueKinds({ ...member, paidAt: MON - H }, new Set(), MON)).toEqual([{ kind: "welcome", period: "once" }]);
    expect(dueKinds({ ...member, paidAt: MON - 2 * DAY - H }, new Set(["welcome:once"]), MON)).toEqual([{ kind: "trial_ending", period: "once" }]);
    expect(dueKinds({ ...member, paidAt: MON - 9 * DAY }, new Set(), MON)).toEqual([{ kind: "weekly", period: isoWeek(MON) }]);
    expect(isoWeek(MON)).toBe("2026-W44");
  });
  it("never twice, never after unsubscribing, never to free accounts, no trial email once cancelled", () => {
    expect(dueKinds({ ...member, paidAt: MON - H }, new Set(["welcome:once"]), MON)).toEqual([]);
    expect(dueKinds({ ...member, paidAt: MON - H, optedOut: true }, new Set(), MON)).toEqual([]);
    expect(dueKinds({ ...member, plan: "free", paidAt: MON - H }, new Set(), MON)).toEqual([]);
    expect(dueKinds({ ...member, paidAt: MON - 2 * DAY - H, cancelAtPeriodEnd: true }, new Set(["welcome:once"]), MON)).toEqual([]);
    expect(dueKinds({ ...member, paidAt: MON - 9 * DAY, follows: 0 }, new Set(), MON)).toEqual([]);
    expect(dueKinds({ ...member, paidAt: MON - 9 * DAY }, new Set(), MON - 4 * H)).toEqual([]); // 6am ET: not yet
  });
  it("says only real things: what they caught, or that nothing has moved yet; no weekly email without results", () => {
    const e = trialEndingEmail([move({})], true, new Map(), "https://insidir.com");
    expect(e.subject).toBe("Your trial ends tomorrow, here's what you caught");
    expect(e.lines[1]!.text).toBe("kch123 put $412,000 on Chiefs · Chiefs vs Bills · Oct 25");
    expect(trialEndingEmail([], true, new Map(), "https://insidir.com").lines[0]!.text).toMatch(/^No big moves from the traders you follow yet/);
    expect(weeklyEmail([], new Map(), "2026-W44", "https://insidir.com")).toBeNull();
    expect(weeklyEmail([move({ result: "won", settledAt: MON - H })], new Map(), "2026-W44", "https://insidir.com")!.lines[0]!.text).toBe("kch123: 1 won, 0 lost this week");
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_life_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;

describe.skipIf(!URL0)("lifecycle emails in Postgres", () => {
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
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${NAME}`);
    await admin?.end();
  });

  it("day 2: the moves of the traders they follow since they joined, sent once", async () => {
    await db.insert(schema.users).values({ id: "u1", email: "u1@example.test", plan: "insidir" });
    await db.insert(schema.events).values({ name: "paid", visitorId: "v", userId: "u1", at: new Date(MON - 2 * DAY - H) });
    await db.insert(schema.follows).values({ userId: "u1", kind: "trader", target: W });
    await db.insert(schema.lifecycleEmails).values({ userId: "u1", kind: "welcome", period: "once" });
    await upsertMoves(db, [move({ id: "pm:caught", at: MON - DAY }), move({ id: "pm:before", at: MON - 5 * DAY, amount: 999_000 })]);
    const sent: LifecycleEmail[] = [];
    const send = async (_to: string, _id: string, e: LifecycleEmail) => { sent.push(e); return true; };
    expect(await lifecycleOnce(db, MON, "https://insidir.com", send)).toBe(1);
    expect(sent[0]!.kind).toBe("trial_ending");
    expect(sent[0]!.lines.map(l => l.text).join("\n")).toContain("$412,000");
    expect(sent[0]!.lines.map(l => l.text).join("\n")).not.toContain("$999,000"); // before they joined
    expect(await lifecycleOnce(db, MON + 10 * 60_000, "https://insidir.com", send)).toBe(0);
  });
});
