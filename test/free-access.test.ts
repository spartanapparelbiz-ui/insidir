/* The owner's free-access list (FREE_ACCESS_EMAILS), the /start list, onboarding picks and the funnel's drop-off. The
 * account part (a Whop sign-in with a listed email is a member; anyone else is signed in without Insidir) runs against a throwaway database
 * next to E2E_DATABASE_URL and is skipped without it. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dropOff, FUNNEL_LABEL, FUNNEL } from "@/lib/analytics";
import { signInAs } from "@/lib/auth/whop-login";
import { effectivePlan } from "@/lib/billing/access";
import { freeAccessEmails, isFreeAccess } from "@/lib/billing/free";
import { comingSoonLine, startList } from "@/components/v2/Pricing";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { parsePicks, topicCategories } from "@/lib/picks";

const ENV0 = process.env.FREE_ACCESS_EMAILS;
afterEach(() => { if (ENV0 === undefined) delete process.env.FREE_ACCESS_EMAILS; else process.env.FREE_ACCESS_EMAILS = ENV0; });

describe("free access", () => {
  it("parses the list trimmed and case-insensitively", () => {
    expect([...freeAccessEmails(" Owner@Insidir.com ,friend@x.io;; ,not-an-email ")]).toEqual(["owner@insidir.com", "friend@x.io"]);
    expect(isFreeAccess("  OWNER@insidir.com ", "owner@insidir.com")).toBe(true);
    expect(isFreeAccess("someone@else.com", "owner@insidir.com")).toBe(false);
    expect(isFreeAccess(null, "owner@insidir.com")).toBe(false);
  });
  it("an email on the list is a full member; removed, access ends at once unless they really pay", () => {
    const u = { plan: "free" as const, accessUntil: null, membershipStatus: null, email: "Owner@insidir.com" };
    process.env.FREE_ACCESS_EMAILS = "owner@insidir.com";
    expect(effectivePlan(u)).toBe("insidir");
    process.env.FREE_ACCESS_EMAILS = "";
    expect(effectivePlan(u)).toBe("free");
    const paying = { ...u, plan: "insidir" as const, accessUntil: new Date(Date.now() + 86_400_000), membershipStatus: "active" };
    expect(effectivePlan(paying)).toBe("insidir");
  });
});

describe("/start", () => {
  it("at most five live lines, no repeats, and one quiet line for what's coming", () => {
    const list = startList();
    expect(list.length).toBeLessThanOrEqual(5);
    expect(new Set(list).size).toBe(list.length);
    expect(list.filter(l => /insider stock trades/i.test(l))).toHaveLength(1);
    expect(list.join(" ")).not.toMatch(/coming soon/i);
    process.env.FEATURES_READY = "feed,records,follows,stocks";
    expect(comingSoonLine()).toBe("More coming: phone alerts, custom alert rules, price gaps, crypto.");
    delete process.env.FEATURES_READY;
  });
});

describe("onboarding picks", () => {
  it("keeps only known tabs, leagues and topics; a league or topic implies its tab", () => {
    expect(parsePicks({ tabs: ["crypto"], leagues: ["NFL", "XFL"], topics: ["world", "sports"] })).toEqual({ tabs: ["sports", "markets"], leagues: ["NFL"], topics: ["world"] });
    expect(parsePicks({ tabs: [] })).toBeNull();
    expect(topicCategories(["economy", "world"])).toEqual(["economics", "finance", "geopolitics"]);
  });
});

describe("the funnel", () => {
  it("has the eight steps in order and drop-off between them", () => {
    expect(FUNNEL.map(k => FUNNEL_LABEL[k])).toEqual(["Landing view", "CTA click", "/start view", "Account created", "Payment started", "Paid", "Onboarding done", "First follow"]);
    expect(dropOff(25, 100)).toBeCloseTo(0.75);
    expect(dropOff(0, 0)).toBeNull();
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_free_${process.pid}`;
describe.skipIf(!URL0)("free access accounts in Postgres", () => {
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

  it("a Whop sign-in with an email on the list is a member (one account); one not on the list signs in without Insidir", async () => {
    process.env.FREE_ACCESS_EMAILS = "Owner@Insidir.com";
    const r = await signInAs(db, { id: "user_owner", email: " owner@insidir.com", name: "Owner", picture: null }, null);
    expect(r).toMatchObject({ member: true, created: true });
    expect(r.userId).toMatch(/^usr_/);
    expect(await signInAs(db, { id: "user_owner", email: "owner@insidir.com", name: "Owner", picture: null }, null)).toEqual({ ...r, created: false });
    expect((await pool.query("select count(*)::int as n from terminal.users where email = 'owner@insidir.com'")).rows[0].n).toBe(1);
    expect((await signInAs(db, { id: "user_x", email: "stranger@insidir.com", name: null, picture: null }, null)).member).toBe(false);
  });
});
