/* Log-in through Whop and the billing webhook, against a throwaway Postgres next to E2E_DATABASE_URL, with Whop's API
 * stood in by a fetch stub:
 *   sign-up: /start keeps the email with the checkout claim; the payment makes the account, links the Whop user,
 *     stores the plan, and the buyer's browser logs in once
 *   log-in: the Whop user (else the email) → the account; members and free-access emails get in, anyone else gets
 *     "No Insidir membership"; 30 sign-ins per IP every 15 minutes
 *   token exchange: sends the client secret; a failure logs Whop's status and error, never a token or an email
 *   refund / failed payment / end of period: access ends */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { finishLogin, LIMIT, LoginFailed, rateLimited, signInAs, startLogin } from "@/lib/auth/whop-login";
import { applyBillingEvent, effectivePlan } from "@/lib/billing/access";
import { newClaim, redeemClaim } from "@/lib/billing/claims";
import { webhookRef } from "@/lib/billing/whop";

describe("Whop sign-in", () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });
  it("the authorize URL: our callback, PKCE, the email scope; a fresh sign-in asks Whop to log in again", async () => {
    process.env.WHOP_CLIENT_ID = "app_test"; process.env.APP_URL = "https://insidir.com";
    const u = new URL((await startLogin()).url);
    expect(u.origin + u.pathname).toBe("https://api.whop.com/oauth/authorize");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: "app_test", redirect_uri: "https://insidir.com/login/callback", scope: "openid profile email", code_challenge_method: "S256" });
    expect(u.searchParams.has("prompt")).toBe(false);
    expect(new URL((await startLogin(true)).url).searchParams.get("prompt")).toBe("login");
  });
  it("the token exchange sends the client secret; a failure logs Whop's status and error, never a token or an email", async () => {
    process.env.WHOP_CLIENT_ID = "app_test"; process.env.WHOP_CLIENT_SECRET = "secret_xyz"; process.env.APP_URL = "https://insidir.com";
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => { logs.push(l); });
    let body: Record<string, unknown> = {};
    const ok = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/token")) { body = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ access_token: "at_1", refresh_token: "rt_1" })); }
      if (String(url).endsWith("/userinfo")) return new Response(JSON.stringify({ sub: "user_9", email: "who@example.test" }));
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await finishLogin("code_1", "verifier_1", ok)).toEqual({ id: "user_9", email: "who@example.test" });
    expect(body).toMatchObject({ grant_type: "authorization_code", code: "code_1", code_verifier: "verifier_1", client_id: "app_test", client_secret: "secret_xyz", redirect_uri: "https://insidir.com/login/callback" });
    const bad = (async () => new Response(JSON.stringify({ error: "invalid_client", error_description: "Client authentication failed" }), { status: 401 })) as unknown as typeof fetch;
    await expect(finishLogin("code_2", "verifier_2", bad)).rejects.toBeInstanceOf(LoginFailed);
    expect(logs).toEqual(["login: token exchange failed (401 invalid_client: Client authentication failed)"]);
    for (const l of logs) expect(l).not.toMatch(/secret_xyz|at_1|rt_1|code_|@/);
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

/** Sign-up as /start does it (just the email), then the payment as Whop sends it. */
async function signUpAndPay(email: string, mem = membership()): Promise<string> {
  const claim = await newClaim(db, { email });
  whop.memberships.set(mem.id, mem);
  whop.payments.set(`pay_${mem.id}`, { id: `pay_${mem.id}`, membership: { id: mem.id }, user: mem.user, metadata: { insidir_claim: claim } });
  const r = await applyBillingEvent(db, "payment.succeeded", webhookRef("payment.succeeded", { data: { id: `pay_${mem.id}`, membership: { id: mem.id }, metadata: { insidir_claim: claim } } }), NOW);
  expect(r.plan).toBe("insidir");
  expect(await redeemClaim(db, claim)).toBe(r.userId);
  expect(await redeemClaim(db, claim)).toBeNull(); // once only
  return r.userId!;
}

describe.skipIf(!URL0)("log-in through Whop and billing, in Postgres", () => {
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

  it("sign-up → payment: the account is made with the email typed on /start, linked to the Whop user, and logs the browser in once", async () => {
    const id = await signUpAndPay("Buyer@Example.test");
    const u = (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0]!;
    expect(u).toMatchObject({ email: "buyer@example.test", whopUserId: "user_w1", plan: "insidir", membershipStatus: "active" });
    expect(u.id).toMatch(/^usr_/);
    expect(Object.keys(u)).not.toContain("passwordHash");
    // membership.activated after payment.succeeded: the same account.
    expect(await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: membership() }), NOW)).toMatchObject({ userId: id, created: false });
  });

  it("log-in: by Whop user, else by email (linking it); members get in; no plan, a stranger or someone else's account don't", async () => {
    const id = await signUpAndPay("m@example.test", membership({ id: "mem_m", user: "user_m", email: "m@example.test" }));
    expect(await signInAs(db, { id: "user_m", email: "different@whop.test" }, "10.0.0.1", NOW)).toEqual({ ok: true, userId: id, why: "member" });
    // Bought with a Whop account whose user id we don't have yet: found by email and linked.
    await pool.query("update terminal.users set whop_user_id = null where id = $1", [id]);
    expect(await signInAs(db, { id: "user_m", email: " M@Example.test " }, "10.0.0.1", NOW)).toEqual({ ok: true, userId: id, why: "member" });
    expect((await pool.query("select whop_user_id from terminal.users where id = $1", [id])).rows[0].whop_user_id).toBe("user_m");
    // Another Whop user with the same email can't take an account already linked.
    expect(await signInAs(db, { id: "user_other", email: "m@example.test" }, "10.0.0.1", NOW)).toEqual({ ok: false, email: "m@example.test" });
    expect(await signInAs(db, { id: "user_nobody", email: "nobody@example.test" }, "10.0.0.1", NOW)).toEqual({ ok: false, email: "nobody@example.test" });
    whop.memberships.set("mem_m", membership({ id: "mem_m", user: "user_m", email: "m@example.test", status: "expired" }));
    await applyBillingEvent(db, "membership.updated", webhookRef("membership.updated", { data: whop.memberships.get("mem_m") }), NOW);
    expect(await signInAs(db, { id: "user_m", email: "m@example.test" }, "10.0.0.1", NOW)).toEqual({ ok: false, email: "m@example.test" });
  });

  it("free access: a listed email gets in (an account is made the first time); taken off the list, it doesn't", async () => {
    process.env.FREE_ACCESS_EMAILS = "Owner@Insidir.com";
    const r = await signInAs(db, { id: "user_owner", email: " owner@insidir.com" }, "10.0.5.1", NOW);
    expect(r).toMatchObject({ ok: true, why: "free access" });
    expect(await signInAs(db, { id: "user_owner", email: "owner@insidir.com" }, "10.0.5.1", NOW)).toEqual(r);
    expect((await pool.query("select count(*)::int as n from terminal.users where email = 'owner@insidir.com'")).rows[0].n).toBe(1);
    process.env.FREE_ACCESS_EMAILS = "";
    expect((await signInAs(db, { id: "user_owner", email: "owner@insidir.com" }, "10.0.5.1", NOW)).ok).toBe(false);
    delete process.env.FREE_ACCESS_EMAILS;
  });

  it("rate limit: 30 sign-ins per IP address every 15 minutes", async () => {
    const T = NOW + 3_600_000;
    for (let i = 0; i < LIMIT.perIp; i++) await signInAs(db, { id: `user_p${i}`, email: `probe${i}@example.test` }, "10.2.0.1", T + i);
    expect(await rateLimited(db, "10.2.0.1", T + 100)).toBe(true);
    expect(await rateLimited(db, "10.2.0.2", T + 100)).toBe(false);
    expect(await rateLimited(db, "10.2.0.1", T + LIMIT.windowMs + 100)).toBe(false);
  });

  it("refund, failed payment and the end of the period: access ends", async () => {
    await signUpAndPay("r@example.test", membership({ id: "mem_2", user: "user_w2", email: "r@example.test" }));
    whop.memberships.set("mem_2", membership({ id: "mem_2", user: "user_w2", email: "r@example.test", status: "canceled" }));
    whop.payments.set("pay_9", { id: "pay_9", membership: { id: "mem_2" }, user: { id: "user_w2" } });
    expect((await applyBillingEvent(db, "refund.created", webhookRef("refund.created", { data: { id: "rf_1", payment: { id: "pay_9" } } }), NOW)).plan).toBe("free");
    expect((await signInAs(db, { id: "user_w2", email: "r@example.test" }, "10.4.0.1", NOW)).ok).toBe(false);
    whop.memberships.set("mem_2", membership({ id: "mem_2", user: "user_w2", email: "r@example.test", status: "past_due", end: NOW + 86_400_000 }));
    expect((await applyBillingEvent(db, "payment.failed", webhookRef("payment.failed", { data: { id: "pay_10", membership: { id: "mem_2" } } }), NOW)).plan).toBe("insidir");
    expect((await applyBillingEvent(db, "membership.updated", webhookRef("membership.updated", { data: membership({ id: "mem_2", user: "user_w2", status: "past_due", end: NOW + 86_400_000 }) }), NOW + 2 * 86_400_000)).plan).toBe("free");
    expect(effectivePlan({ plan: "insidir", accessUntil: new Date(NOW - 1), membershipStatus: "canceling" }, NOW)).toBe("free");
    expect(effectivePlan({ plan: "insidir", accessUntil: new Date(NOW + 1), membershipStatus: "canceling" }, NOW)).toBe("insidir");
  });
});
