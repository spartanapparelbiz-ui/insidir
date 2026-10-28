/* Our own log-in and the billing webhook, against a throwaway Postgres next to E2E_DATABASE_URL, with Whop's API
 * stood in by a fetch stub:
 *   passwords: scrypt (Node's crypto), at least 8 characters, constant-time compare
 *   sign-up: /start keeps the email and password hash with the checkout claim; the payment makes the account with
 *     them, links the Whop user, stores the plan, and the buyer's browser logs in once
 *   log-in: right password + plan → in; wrong → no; right password, no plan → "no_plan"; rate limits per email and IP
 *   Continue with Google: by Google id, else verified email (linked); members and free-access emails in; the token
 *     exchange sends the client secret and logs only Google's status and error
 *   refund / failed payment / end of period: access ends */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { hashPassword, LIMITS, logIn, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { finishGoogle, LoginFailed, startGoogle, signInWithGoogle } from "@/lib/auth/google";
import { applyBillingEvent, effectivePlan } from "@/lib/billing/access";
import { newClaim, redeemClaim } from "@/lib/billing/claims";
import { webhookRef } from "@/lib/billing/whop";

describe("passwords", () => {
  it("scrypt: the right password matches, anything else doesn't; each hash is salted", async () => {
    const h = await hashPassword("correct horse");
    expect(h).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("correct hors", h)).toBe(false);
    expect(await verifyPassword("correct horse", null)).toBe(false);
    expect(await hashPassword("correct horse")).not.toBe(h);
    expect(passwordProblem("1234567")).toBe("Use at least 8 characters.");
    expect(passwordProblem("12345678")).toBeNull();
  });
});

describe("Continue with Google", () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });
  it("Google's consent URL: our callback, PKCE, openid email profile", () => {
    process.env.GOOGLE_CLIENT_ID = "gid.apps.googleusercontent.com"; process.env.APP_URL = "https://insidir.com";
    const u = new URL(startGoogle().url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: "gid.apps.googleusercontent.com", redirect_uri: "https://insidir.com/login/google/callback", scope: "openid email profile", code_challenge_method: "S256", response_type: "code" });
  });
  it("the token exchange sends the client secret; a failure logs Google's status and error, never a token or an email", async () => {
    process.env.GOOGLE_CLIENT_ID = "gid"; process.env.GOOGLE_CLIENT_SECRET = "gsecret_xyz"; process.env.APP_URL = "https://insidir.com";
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => { logs.push(l); });
    let body = new URLSearchParams();
    const ok = (async (url: string, init?: RequestInit) => {
      if (String(url).includes("/token")) { body = new URLSearchParams(String(init!.body)); return new Response(JSON.stringify({ access_token: "ya29.at", id_token: "x" })); }
      return new Response(JSON.stringify({ sub: "g_1", email: "who@gmail.com", email_verified: true }));
    }) as unknown as typeof fetch;
    expect(await finishGoogle("code_1", "verifier_1", ok)).toEqual({ id: "g_1", email: "who@gmail.com", verified: true });
    expect(Object.fromEntries(body)).toMatchObject({ grant_type: "authorization_code", code: "code_1", code_verifier: "verifier_1", client_id: "gid", client_secret: "gsecret_xyz", redirect_uri: "https://insidir.com/login/google/callback" });
    const bad = (async () => new Response(JSON.stringify({ error: "invalid_client", error_description: "The OAuth client was not found." }), { status: 401 })) as unknown as typeof fetch;
    await expect(finishGoogle("code_2", "verifier_2", bad)).rejects.toBeInstanceOf(LoginFailed);
    expect(logs).toEqual(["google login: token exchange failed (401 invalid_client: The OAuth client was not found.)"]);
    for (const l of logs) expect(l).not.toMatch(/gsecret|ya29|code_|@/);
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_login_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;

const whop = { memberships: new Map<string, Record<string, unknown>>(), payments: new Map<string, Record<string, unknown>>() };
function stubFetch() {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    let m: RegExpMatchArray | null;
    if ((m = url.pathname.match(/\/api\/v1\/memberships\/([^/]+)$/))) { const x = whop.memberships.get(m[1]!); return x ? json(x) : json({}, 404); }
    if (url.pathname.endsWith("/api/v1/memberships")) { const ids = url.searchParams.getAll("user_ids[]"); return json({ data: [...whop.memberships.values()].filter(x => ids.includes((x.user as { id: string }).id)) }); }
    if ((m = url.pathname.match(/\/api\/v1\/payments\/([^/]+)$/))) { const x = whop.payments.get(m[1]!); return x ? json(x) : json({}, 404); }
    return json({ error: "not stubbed" }, 404);
  });
}

const NOW = Date.UTC(2026, 9, 28, 18);
const membership = (o: Partial<{ id: string; status: string; user: string; email: string; end: number }> = {}) => ({
  id: o.id ?? "mem_1", status: o.status ?? "active", plan: { id: "plan_ins" }, product: { id: "prod_ins" }, cancel_at_period_end: false,
  manage_url: "https://whop.com/billing/manage/mem_1", renewal_period_end: new Date(o.end ?? NOW + 30 * 86_400_000).toISOString(),
  user: { id: o.user ?? "user_w1", email: o.email ?? "Buyer@Example.test", name: "Buyer" }, metadata: {},
});

/** Sign-up as /start does it, then the payment as Whop sends it. */
async function signUpAndPay(email: string, password: string, mem = membership()): Promise<string> {
  const claim = await newClaim(db, { email, passwordHash: await hashPassword(password) });
  whop.memberships.set(mem.id, mem);
  whop.payments.set(`pay_${mem.id}`, { id: `pay_${mem.id}`, membership: { id: mem.id }, user: mem.user, metadata: { insidir_claim: claim } });
  const r = await applyBillingEvent(db, "payment.succeeded", webhookRef("payment.succeeded", { data: { id: `pay_${mem.id}`, membership: { id: mem.id }, metadata: { insidir_claim: claim } } }), NOW);
  expect(r.plan).toBe("insidir");
  expect(await redeemClaim(db, claim)).toBe(r.userId);
  expect(await redeemClaim(db, claim)).toBeNull(); // once only
  return r.userId!;
}

describe.skipIf(!URL0)("own log-in and billing, in Postgres", () => {
  beforeAll(async () => {
    process.env.WHOP_PLAN_INSIDIR = "plan_ins"; process.env.WHOP_PRODUCT_INSIDIR = "prod_ins";
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  beforeEach(() => { stubFetch(); whop.memberships.clear(); whop.payments.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${NAME}`);
    await admin?.end();
  });

  it("sign-up → payment: the account is made with the email and password typed on /start, and logs the browser in once", async () => {
    const id = await signUpAndPay("Buyer@Example.test", "hunter2hunter2");
    const u = (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0]!;
    expect(u).toMatchObject({ email: "buyer@example.test", whopUserId: "user_w1", plan: "insidir", membershipStatus: "active" });
    expect(u.id).toMatch(/^usr_/);
    expect(await verifyPassword("hunter2hunter2", u.passwordHash)).toBe(true);
    // membership.activated after payment.succeeded: the same account.
    expect(await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: membership() }), NOW)).toMatchObject({ userId: id, created: false });
  });

  it("log-in: members with the right password get in; a wrong one, an unknown email or no plan don't", async () => {
    const id = await signUpAndPay("m@example.test", "rightpassword", membership({ id: "mem_m", user: "user_m", email: "m@example.test" }));
    expect(await logIn(db, " M@Example.test ", "rightpassword", "10.0.0.1", NOW)).toEqual({ ok: true, userId: id });
    expect(await logIn(db, "m@example.test", "wrongpassword", "10.0.0.1", NOW)).toEqual({ ok: false, reason: "wrong" });
    expect(await logIn(db, "nobody@example.test", "whatever1", "10.0.0.1", NOW)).toEqual({ ok: false, reason: "wrong" });
    whop.memberships.set("mem_m", membership({ id: "mem_m", user: "user_m", email: "m@example.test", status: "expired" }));
    await applyBillingEvent(db, "membership.updated", webhookRef("membership.updated", { data: whop.memberships.get("mem_m") }), NOW);
    expect(await logIn(db, "m@example.test", "rightpassword", "10.0.0.1", NOW)).toEqual({ ok: false, reason: "no_plan" });
  });

  it("an account paid for without a password (bought elsewhere) is told to use Continue with Google", async () => {
    whop.memberships.set("mem_np", membership({ id: "mem_np", user: "user_np", email: "np@example.test" }));
    await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: whop.memberships.get("mem_np") }), NOW);
    expect(await logIn(db, "np@example.test", "anything1", "10.0.1.1", NOW)).toEqual({ ok: false, reason: "no_password" });
  });

  it("rate limits: 10 tries per email and 30 per IP address every 15 minutes", async () => {
    const T = NOW + 3_600_000;
    for (let i = 0; i < LIMITS.perEmail; i++) await logIn(db, "rl@example.test", "wrongwrong", `10.1.0.${i}`, T + i);
    expect(await logIn(db, "rl@example.test", "wrongwrong", "10.1.0.99", T + 20)).toEqual({ ok: false, reason: "rate_limited" });
    expect(await logIn(db, "rl@example.test", "wrongwrong", "10.1.0.99", T + LIMITS.windowMs + 20)).toEqual({ ok: false, reason: "wrong" });
    const U = NOW + 5 * 3_600_000;
    for (let i = 0; i < LIMITS.perIp; i++) await logIn(db, `probe${i}@example.test`, "wrongwrong", "10.2.0.1", U + i);
    expect(await logIn(db, "m@example.test", "rightpassword", "10.2.0.1", U + 100)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("Continue with Google: by Google id, else verified email (linked); no plan, unverified or someone else's account don't get in", async () => {
    const id = await signUpAndPay("g@example.test", "gpassword1", membership({ id: "mem_g", user: "user_g", email: "g@example.test" }));
    // First time with Google: found by the verified email, and linked.
    expect(await signInWithGoogle(db, { id: "g_1", email: "G@Example.test", verified: true }, "10.3.0.1", NOW)).toEqual({ ok: true, userId: id, why: "member" });
    expect((await pool.query("select google_id from terminal.users where id = $1", [id])).rows[0].google_id).toBe("g_1");
    // Next time by the Google id, whatever its email is now.
    expect(await signInWithGoogle(db, { id: "g_1", email: "renamed@gmail.com", verified: true }, "10.3.0.1", NOW)).toEqual({ ok: true, userId: id, why: "member" });
    // An unverified email never matches; another Google account can't take a linked one.
    expect(await signInWithGoogle(db, { id: "g_2", email: "g@example.test", verified: false }, "10.3.0.1", NOW)).toEqual({ ok: false, email: null });
    expect(await signInWithGoogle(db, { id: "g_3", email: "g@example.test", verified: true }, "10.3.0.1", NOW)).toEqual({ ok: false, email: "g@example.test" });
    expect(await signInWithGoogle(db, { id: "g_4", email: "nobody@gmail.com", verified: true }, "10.3.0.1", NOW)).toEqual({ ok: false, email: "nobody@gmail.com" });
    // The password still works for the same account.
    expect(await logIn(db, "g@example.test", "gpassword1", "10.3.0.2", NOW)).toEqual({ ok: true, userId: id });
  });

  it("Google sign-up: the claim carries the Google account; the payment makes the account linked to it (no password)", async () => {
    const claim = await newClaim(db, { email: "new@gmail.com", googleId: "g_new" });
    const mem = membership({ id: "mem_new", user: "user_new", email: "whatever@whop.test" });
    whop.memberships.set(mem.id, mem);
    whop.payments.set("pay_new", { id: "pay_new", membership: { id: mem.id }, user: mem.user, metadata: { insidir_claim: claim } });
    const r = await applyBillingEvent(db, "payment.succeeded", webhookRef("payment.succeeded", { data: { id: "pay_new", membership: { id: mem.id }, metadata: { insidir_claim: claim } } }), NOW);
    const u = (await db.select().from(schema.users).where(eq(schema.users.id, r.userId!)))[0]!;
    expect(u).toMatchObject({ email: "new@gmail.com", googleId: "g_new", passwordHash: null, plan: "insidir" });
    expect(await signInWithGoogle(db, { id: "g_new", email: "new@gmail.com", verified: true }, "10.3.1.1", NOW)).toEqual({ ok: true, userId: u.id, why: "member" });
    expect(await logIn(db, "new@gmail.com", "anything1", "10.3.1.2", NOW)).toEqual({ ok: false, reason: "no_password" });
  });

  it("free access with Google: a verified listed email gets in (an account made once); taken off the list, it doesn't", async () => {
    process.env.FREE_ACCESS_EMAILS = "Owner@Insidir.com";
    const r = await signInWithGoogle(db, { id: "g_owner", email: " owner@insidir.com", verified: true }, "10.0.5.1", NOW);
    expect(r).toMatchObject({ ok: true, why: "free access" });
    expect(await signInWithGoogle(db, { id: "g_owner", email: "owner@insidir.com", verified: true }, "10.0.5.1", NOW)).toEqual(r);
    expect((await pool.query("select count(*)::int as n from terminal.users where email = 'owner@insidir.com'")).rows[0].n).toBe(1);
    process.env.FREE_ACCESS_EMAILS = "";
    expect((await signInWithGoogle(db, { id: "g_owner", email: "owner@insidir.com", verified: true }, "10.0.5.1", NOW)).ok).toBe(false);
    delete process.env.FREE_ACCESS_EMAILS;
  });

  it("refund, failed payment and the end of the period: access ends", async () => {
    await signUpAndPay("r@example.test", "refundme1", membership({ id: "mem_2", user: "user_w2", email: "r@example.test" }));
    whop.memberships.set("mem_2", membership({ id: "mem_2", user: "user_w2", email: "r@example.test", status: "canceled" }));
    whop.payments.set("pay_9", { id: "pay_9", membership: { id: "mem_2" }, user: { id: "user_w2" } });
    expect((await applyBillingEvent(db, "refund.created", webhookRef("refund.created", { data: { id: "rf_1", payment: { id: "pay_9" } } }), NOW)).plan).toBe("free");
    expect(await logIn(db, "r@example.test", "refundme1", "10.4.0.1", NOW)).toEqual({ ok: false, reason: "no_plan" });
    whop.memberships.set("mem_2", membership({ id: "mem_2", user: "user_w2", email: "r@example.test", status: "past_due", end: NOW + 86_400_000 }));
    expect((await applyBillingEvent(db, "payment.failed", webhookRef("payment.failed", { data: { id: "pay_10", membership: { id: "mem_2" } } }), NOW)).plan).toBe("insidir");
    expect((await applyBillingEvent(db, "membership.updated", webhookRef("membership.updated", { data: membership({ id: "mem_2", user: "user_w2", status: "past_due", end: NOW + 86_400_000 }) }), NOW + 2 * 86_400_000)).plan).toBe("free");
    expect(effectivePlan({ plan: "insidir", accessUntil: new Date(NOW - 1), membershipStatus: "canceling" }, NOW)).toBe("free");
    expect(effectivePlan({ plan: "insidir", accessUntil: new Date(NOW + 1), membershipStatus: "canceling" }, NOW)).toBe("insidir");
  });
});
