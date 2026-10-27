/* Our own log-in and the billing webhook, against a throwaway Postgres next to E2E_DATABASE_URL, with Whop's and
 * Resend's APIs stood in by a fetch stub:
 *   code log-in: members get a 6-digit code by email and log in with it; the code dies after 10 minutes, 5 wrong
 *     tries or one use; someone without a plan gets "no plan" and no email
 *   rate limits: 5 codes per email and 20 per IP an hour
 *   webhook → plan: a payment makes the account (by email), links the Whop user, stores the plan and the paid period,
 *     and marks the checkout claim so the buyer's browser logs in once
 *   refund / end of period: access is removed */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { LIMITS, requestCode, verifyCode } from "@/lib/auth/login";
import { applyBillingEvent, effectivePlan } from "@/lib/billing/access";
import { newClaim, redeemClaim } from "@/lib/billing/claims";
import { webhookRef } from "@/lib/billing/whop";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_login_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;

/** A pretend Whop and Resend: memberships by id and by user, and every email sent. */
const whop = { memberships: new Map<string, Record<string, unknown>>(), payments: new Map<string, Record<string, unknown>>() };
const emails: Array<{ to: string; subject: string; text: string }> = [];
const codeIn = (to: string) => emails.filter(e => e.to === to).at(-1)?.subject.match(/^(\d{6})/)?.[1] ?? "";

function stubFetch() {
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (url.pathname === "/emails") { const b = JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string }; emails.push({ to: b.to[0]!, subject: b.subject, text: b.text }); return json({ id: "em_1" }); }
    let m: RegExpMatchArray | null;
    if ((m = url.pathname.match(/\/api\/v1\/memberships\/([^/]+)$/))) { const x = whop.memberships.get(m[1]!); return x ? json(x) : json({}, 404); }
    if (url.pathname.endsWith("/api/v1/memberships")) { const ids = url.searchParams.getAll("user_ids[]"); return json({ data: [...whop.memberships.values()].filter(x => ids.includes((x.user as { id: string }).id)) }); }
    if ((m = url.pathname.match(/\/api\/v1\/payments\/([^/]+)$/))) { const x = whop.payments.get(m[1]!); return x ? json(x) : json({}, 404); }
    return json({ error: "not stubbed" }, 404);
  });
}

const NOW = Date.UTC(2026, 9, 27, 18);
const membership = (o: Partial<{ id: string; status: string; user: string; email: string; end: number }> = {}) => ({
  id: o.id ?? "mem_1", status: o.status ?? "active", plan: { id: "plan_ins" }, product: { id: "prod_ins" }, cancel_at_period_end: false,
  manage_url: "https://whop.com/billing/manage/mem_1", renewal_period_end: new Date(o.end ?? NOW + 30 * 86_400_000).toISOString(),
  user: { id: o.user ?? "user_w1", email: o.email ?? "Buyer@Example.test", name: "Buyer" }, metadata: {},
});

describe.skipIf(!URL0)("own log-in and billing, in Postgres", () => {
  beforeAll(async () => {
    process.env.WHOP_PLAN_INSIDIR = "plan_ins"; process.env.WHOP_PRODUCT_INSIDIR = "prod_ins";
    process.env.RESEND_API_KEY = "re_test"; process.env.EMAIL_FROM = "Insidir <login@insidir.com>";
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  beforeEach(() => { stubFetch(); emails.length = 0; whop.memberships.clear(); whop.payments.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${NAME}`);
    await admin?.end();
  });

  it("checkout → webhook: the payment makes the account by email, logs the buyer's browser in once, and sets the plan", async () => {
    const claim = await newClaim(db);
    whop.memberships.set("mem_1", membership());
    whop.payments.set("pay_1", { id: "pay_1", membership: { id: "mem_1" }, user: { id: "user_w1", email: "buyer@example.test" }, metadata: { insidir_claim: claim } });
    expect(await redeemClaim(db, claim, NOW)).toBeNull(); // not paid yet
    const r = await applyBillingEvent(db, "payment.succeeded", webhookRef("payment.succeeded", { data: { id: "pay_1", membership: { id: "mem_1" }, metadata: { insidir_claim: claim } } }), NOW);
    expect(r).toMatchObject({ plan: "insidir", created: true });
    const u = (await db.select().from(schema.users).where(eq(schema.users.id, r.userId!)))[0]!;
    expect(u).toMatchObject({ email: "buyer@example.test", whopUserId: "user_w1", plan: "insidir", membershipId: "mem_1", membershipStatus: "active" });
    expect(u.id).toMatch(/^usr_/);
    expect(u.accessUntil?.getTime()).toBe(NOW + 30 * 86_400_000);
    // The same membership again (membership.activated after payment.succeeded) finds the same account.
    const again = await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: membership() }), NOW);
    expect(again).toMatchObject({ userId: r.userId, created: false });
    expect(await redeemClaim(db, claim, NOW)).toBe(r.userId);
    expect(await redeemClaim(db, claim, NOW)).toBeNull(); // once only
  });

  it("code log-in: members only; a code works once, for 10 minutes, with 5 tries", async () => {
    whop.memberships.set("mem_1", membership());
    await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: membership() }), NOW);
    expect(await requestCode(db, "nobody@example.test", "10.0.0.1", NOW)).toEqual({ ok: false, reason: "no_plan" });
    expect(emails).toEqual([]);
    expect(await requestCode(db, " Buyer@Example.test ", "10.0.0.1", NOW)).toEqual({ ok: true });
    const code = codeIn("buyer@example.test");
    expect(code).toMatch(/^\d{6}$/);
    expect(emails[0]!.text).toContain(code);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await verifyCode(db, "buyer@example.test", wrong, NOW)).toEqual({ ok: false, reason: "wrong", triesLeft: 4 });
    const ok = await verifyCode(db, "buyer@example.test", code, NOW + 1000);
    expect(ok.ok).toBe(true);
    expect(await verifyCode(db, "buyer@example.test", code, NOW + 2000)).toEqual({ ok: false, reason: "expired" }); // used
    // Expiry: 10 minutes.
    await requestCode(db, "buyer@example.test", "10.0.0.1", NOW + 60_000);
    expect(await verifyCode(db, "buyer@example.test", codeIn("buyer@example.test"), NOW + 60_000 + 10 * 60_000 + 1)).toEqual({ ok: false, reason: "expired" });
    // 5 wrong tries and the code is dead, even the right one.
    await requestCode(db, "buyer@example.test", "10.0.0.1", NOW + 120_000);
    const c = codeIn("buyer@example.test"), bad = c === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect((await verifyCode(db, "buyer@example.test", bad, NOW + 121_000)).ok).toBe(false);
    expect(await verifyCode(db, "buyer@example.test", bad, NOW + 121_000)).toEqual({ ok: false, reason: "locked" });
    expect(await verifyCode(db, "buyer@example.test", c, NOW + 121_000)).toEqual({ ok: false, reason: "expired" });
  });

  it("rate limits: 5 codes per email and 20 per IP address an hour", async () => {
    whop.memberships.set("mem_1", membership());
    await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: membership() }), NOW);
    const T = NOW + 3 * 3_600_000;
    for (let i = 0; i < LIMITS.perEmail; i++) expect((await requestCode(db, "buyer@example.test", `10.1.0.${i}`, T + i)).ok).toBe(true);
    expect(await requestCode(db, "buyer@example.test", "10.1.0.99", T + 10)).toEqual({ ok: false, reason: "rate_limited" });
    expect((await requestCode(db, "buyer@example.test", "10.1.0.99", T + LIMITS.windowMs + 10)).ok).toBe(true); // an hour later
    const U = NOW + 6 * 3_600_000;
    for (let i = 0; i < LIMITS.perIp; i++) await requestCode(db, `probe${i}@example.test`, "10.2.0.1", U + i);
    expect(await requestCode(db, "buyer@example.test", "10.2.0.1", U + 100)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("refund, cancel and failed payment: access ends", async () => {
    whop.memberships.set("mem_2", membership({ id: "mem_2", user: "user_w2", email: "r@example.test" }));
    const r = await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: membership({ id: "mem_2", user: "user_w2", email: "r@example.test" }) }), NOW);
    expect(r.plan).toBe("insidir");
    // Refunded: Whop ends the membership; the refund event re-reads it and the plan goes.
    whop.memberships.set("mem_2", membership({ id: "mem_2", user: "user_w2", email: "r@example.test", status: "canceled" }));
    whop.payments.set("pay_9", { id: "pay_9", membership: { id: "mem_2" }, user: { id: "user_w2" } });
    expect((await applyBillingEvent(db, "refund.created", webhookRef("refund.created", { data: { id: "rf_1", payment: { id: "pay_9" } } }), NOW)).plan).toBe("free");
    expect(await requestCode(db, "r@example.test", "10.3.0.1", NOW)).toEqual({ ok: false, reason: "no_plan" });
    // Failed payment: past_due keeps access only to the end of the paid period.
    whop.memberships.set("mem_2", membership({ id: "mem_2", user: "user_w2", email: "r@example.test", status: "past_due", end: NOW + 86_400_000 }));
    expect((await applyBillingEvent(db, "payment.failed", webhookRef("payment.failed", { data: { id: "pay_10", membership: { id: "mem_2" } } }), NOW)).plan).toBe("insidir");
    expect((await applyBillingEvent(db, "membership.updated", webhookRef("membership.updated", { data: membership({ id: "mem_2", user: "user_w2", status: "past_due", end: NOW + 86_400_000 }) }), NOW + 2 * 86_400_000)).plan).toBe("free");
    // Cancelled at period end: still active until then; a stored plan whose period ran out gives nothing.
    expect(effectivePlan({ plan: "insidir", accessUntil: new Date(NOW - 1), membershipStatus: "canceling" }, NOW)).toBe("free");
    expect(effectivePlan({ plan: "insidir", accessUntil: new Date(NOW + 1), membershipStatus: "canceling" }, NOW)).toBe("insidir");
  });
});
