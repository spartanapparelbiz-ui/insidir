/* Sign-in with Whop and the billing webhook, against a throwaway Postgres next to E2E_DATABASE_URL, with Whop's API
 * stood in by a fetch stub:
 *   OAuth: the authorize URL (our login app, the redirect URI: WHOP_REDIRECT_URI, else stored, else /login/callback;
 *     PKCE S256, openid profile email); the token exchange sends the same redirect URI and the client secret; userinfo gives who they are; a failure logs only Whop's status and error
 *   sign-in: the account by Whop user, else by email (linked), else a new one; member = Whop's access check, or the
 *     free-access list
 *   checkout: our account id in the metadata links the membership; a buyer who paid signed out gets an account their
 *     Whop sign-in finds
 *   access check: cached 5 minutes, refreshed at once by sign-in and the webhook; refund / deactivation end access */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { finishLogin, LoginFailed, redirectUri, signInAs, startLogin } from "@/lib/auth/whop-login";
import { applyBillingEvent, effectivePlan } from "@/lib/billing/access";
import { webhookRef } from "@/lib/billing/whop";

describe("Whop OAuth", () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });
  it("the authorize URL: our login app, /login/callback by default, PKCE, openid profile email", async () => {
    process.env.WHOP_CLIENT_ID = "app_login"; process.env.APP_URL = "https://insidir.com"; delete process.env.WHOP_API_ORIGIN; delete process.env.WHOP_REDIRECT_URI;
    const { url, state, verifier, redirect } = await startLogin();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://api.whop.com/oauth/authorize");
    expect(redirect).toBe("https://insidir.com/login/callback");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: "app_login", redirect_uri: "https://insidir.com/login/callback", scope: "openid profile email", code_challenge_method: "S256", response_type: "code", state });
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(new URL((await startLogin(true)).url).searchParams.get("prompt")).toBe("login");
    // WHOP_REDIRECT_URI wins.
    process.env.WHOP_REDIRECT_URI = "https://insidir.com/reset/callback";
    expect(await redirectUri()).toBe("https://insidir.com/reset/callback");
    const s2 = await startLogin();
    expect(s2.redirect).toBe("https://insidir.com/reset/callback");
    expect(new URL(s2.url).searchParams.get("redirect_uri")).toBe("https://insidir.com/reset/callback");
  });
  it("the token exchange sends the client secret; userinfo gives sub, email, name, picture; a failure logs only Whop's status and error", async () => {
    process.env.WHOP_CLIENT_ID = "app_login"; process.env.WHOP_CLIENT_SECRET = "wsecret_xyz"; process.env.APP_URL = "https://insidir.com";
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => { logs.push(l); });
    let body: Record<string, string> = {};
    const ok = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/token")) { body = JSON.parse(String(init!.body)) as Record<string, string>; return new Response(JSON.stringify({ access_token: "at_123", refresh_token: "rt_1" })); }
      if (String(url).endsWith("/userinfo")) return new Response(JSON.stringify({ sub: "user_w1", email: "who@example.test", name: "Who", picture: "https://img/x.png" }));
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await finishLogin("code_1", "verifier_1", "https://insidir.com/login/callback", ok)).toEqual({ id: "user_w1", email: "who@example.test", name: "Who", picture: "https://img/x.png" });
    expect(body).toMatchObject({ grant_type: "authorization_code", code: "code_1", code_verifier: "verifier_1", client_id: "app_login", client_secret: "wsecret_xyz", redirect_uri: "https://insidir.com/login/callback" });
    const bad = (async () => new Response(JSON.stringify({ error: "invalid_client", error_description: "Client authentication failed." }), { status: 401 })) as unknown as typeof fetch;
    await expect(finishLogin("code_2", "verifier_2", "https://insidir.com/login/callback", bad)).rejects.toBeInstanceOf(LoginFailed);
    expect(logs).toEqual(["login: token exchange failed (401 invalid_client: Client authentication failed.)"]);
    for (const l of logs) expect(l).not.toMatch(/wsecret|at_123|code_|@/);
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_login_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;

const whop = { memberships: new Map<string, Record<string, unknown>>(), payments: new Map<string, Record<string, unknown>>(), access: new Map<string, boolean>(), calls: [] as string[] };
function stubFetch() {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    whop.calls.push(url.pathname);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    let m: RegExpMatchArray | null;
    if ((m = url.pathname.match(/\/api\/v1\/users\/([^/]+)\/access\/([^/]+)$/))) return json({ has_access: whop.access.get(m[1]!) ?? false, access_level: whop.access.get(m[1]!) ? "customer" : "no_access" });
    if ((m = url.pathname.match(/\/api\/v1\/memberships\/([^/]+)$/))) { const x = whop.memberships.get(m[1]!); return x ? json(x) : json({}, 404); }
    if (url.pathname.endsWith("/api/v1/memberships")) { const ids = url.searchParams.getAll("user_ids[]"); return json({ data: [...whop.memberships.values()].filter(x => ids.includes((x.user as { id: string }).id)) }); }
    if ((m = url.pathname.match(/\/api\/v1\/payments\/([^/]+)$/))) { const x = whop.payments.get(m[1]!); return x ? json(x) : json({}, 404); }
    return json({ error: "not stubbed" }, 404);
  });
}

const NOW = Date.UTC(2026, 9, 28, 18);
const membership = (o: Partial<{ id: string; status: string; user: string; email: string; end: number; metadata: Record<string, string> }> = {}) => ({
  id: o.id ?? "mem_1", status: o.status ?? "active", plan: { id: "plan_ins" }, product: { id: "prod_ins" }, cancel_at_period_end: false,
  manage_url: "https://whop.com/billing/manage/mem_1", renewal_period_end: new Date(o.end ?? NOW + 30 * 86_400_000).toISOString(),
  user: { id: o.user ?? "user_w1", email: o.email ?? "buyer@example.test", name: "Buyer" }, metadata: o.metadata ?? {},
});
const who = (id: string, email: string | null) => ({ id, email, name: "Buyer", picture: null });

describe.skipIf(!URL0)("sign-in with Whop and billing, in Postgres", () => {
  beforeAll(async () => {
    process.env.WHOP_PLAN_INSIDIR = "plan_ins"; process.env.WHOP_PRODUCT_INSIDIR = "prod_ins"; process.env.WHOP_API_KEY = "apik_test";
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  beforeEach(() => { stubFetch(); whop.memberships.clear(); whop.payments.clear(); whop.access.clear(); whop.calls = []; });
  afterEach(() => { vi.unstubAllGlobals(); });
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("accounts only if you pay: a new Whop user without Insidir gets no account (and goes to the paywall); with a paid membership, one is made, a member", async () => {
    expect(await signInAs(db, who("user_new", "New@Example.test"), "10.0.0.1", NOW)).toEqual({ userId: null, member: false, created: false });
    expect((await db.select().from(schema.users).where(eq(schema.users.whopUserId, "user_new")))).toHaveLength(0);
    whop.access.set("user_paid", true);
    whop.memberships.set("mem_paid", membership({ id: "mem_paid", user: "user_paid", email: "paid@example.test" }));
    const r = await signInAs(db, who("user_paid", "Paid@Example.test"), "10.0.0.1", NOW);
    expect(r).toMatchObject({ member: true, created: true });
    expect(await signInAs(db, who("user_paid", "paid@example.test"), "10.0.0.1", NOW)).toEqual({ ...r, created: false });
    const u = (await db.select().from(schema.users).where(eq(schema.users.id, r.userId!)))[0]!;
    expect(u).toMatchObject({ email: "paid@example.test", whopUserId: "user_paid", name: "Buyer" });
  });

  it("sign-in links an existing account with the same email; one linked to another Whop user isn't taken over", async () => {
    await db.insert(schema.users).values({ id: "usr_old", email: "old@example.test", settings: schema.DEFAULT_SETTINGS });
    whop.access.set("user_old", true);
    whop.memberships.set("mem_old", membership({ id: "mem_old", user: "user_old", email: "old@example.test" }));
    expect(await signInAs(db, who("user_old", "old@example.test"), null, NOW)).toEqual({ userId: "usr_old", member: true, created: false });
    expect((await db.select().from(schema.users).where(eq(schema.users.id, "usr_old")))[0]!.whopUserId).toBe("user_old");
    whop.access.set("user_other", true);
    const other = await signInAs(db, who("user_other", "old@example.test"), null, NOW);
    expect(other.userId).not.toBe("usr_old");
    expect((await db.select().from(schema.users).where(eq(schema.users.id, other.userId!)))[0]!.email).toBeNull();
  });

  it("checkout signed in: our id in the metadata links the membership, Whop's access check makes them a member", async () => {
    // An older account (made before accounts required payment) checking out signed in.
    await db.insert(schema.users).values({ id: "usr_buy", email: "buy@example.test", whopUserId: "user_buy", settings: schema.DEFAULT_SETTINGS });
    const r = { userId: "usr_buy" };
    const mem = membership({ id: "mem_buy", user: "user_buy", email: "buy@example.test", metadata: { insidir_user_id: r.userId } });
    whop.memberships.set("mem_buy", mem); whop.access.set("user_buy", true);
    const a = await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: mem }), NOW);
    expect(a).toEqual({ userId: r.userId, plan: "insidir", created: false });
    expect(whop.calls).toContain("/api/v1/users/user_buy/access/prod_ins");
  });

  it("checkout signed out: the webhook makes an account for the buyer's Whop user, and their Whop sign-in lands in it, a member", async () => {
    const mem = membership({ id: "mem_out", user: "user_out", email: "out@example.test" });
    whop.memberships.set("mem_out", mem); whop.access.set("user_out", true);
    whop.payments.set("pay_out", { id: "pay_out", membership: { id: "mem_out" }, user: mem.user, metadata: {} });
    const a = await applyBillingEvent(db, "payment.succeeded", webhookRef("payment.succeeded", { data: { id: "pay_out", membership: { id: "mem_out" } } }), NOW);
    expect(a).toMatchObject({ plan: "insidir", created: true });
    expect(await signInAs(db, who("user_out", "out@example.test"), null, NOW)).toEqual({ userId: a.userId, member: true, created: false });
  });

  it("deactivated or refunded: Whop's access check says no and access ends", async () => {
    await db.insert(schema.users).values({ id: "usr_end", email: "end@example.test", whopUserId: "user_end", settings: schema.DEFAULT_SETTINGS });
    const r = { userId: "usr_end" };
    const mem = membership({ id: "mem_end", user: "user_end", email: "end@example.test", metadata: { insidir_user_id: r.userId } });
    whop.memberships.set("mem_end", mem); whop.access.set("user_end", true);
    expect((await applyBillingEvent(db, "membership.activated", webhookRef("membership.activated", { data: mem }), NOW)).plan).toBe("insidir");
    whop.access.set("user_end", false);
    whop.memberships.set("mem_end", membership({ id: "mem_end", user: "user_end", status: "canceled", metadata: { insidir_user_id: r.userId } }));
    expect((await applyBillingEvent(db, "membership.deactivated", webhookRef("membership.deactivated", { data: whop.memberships.get("mem_end") }), NOW)).plan).toBe("free");
    expect(effectivePlan({ plan: "insidir", accessUntil: new Date(NOW - 1), membershipStatus: "canceling" }, NOW)).toBe("free");
  });

  it("Whop's API is down: a webhook never takes a member's access away, and the next request re-checks", async () => {
    await db.insert(schema.users).values({ id: "usr_down", email: "down@example.test", whopUserId: "user_down", plan: "insidir", membershipStatus: "active", planCheckedAt: new Date(NOW), settings: schema.DEFAULT_SETTINGS });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    const a = await applyBillingEvent(db, "payment.succeeded", webhookRef("payment.succeeded", { data: { id: "pay_down", user: { id: "user_down" } } }), NOW);
    expect(a.plan).toBe("insidir");
    const row = (await db.select().from(schema.users).where(eq(schema.users.id, "usr_down")))[0]!;
    expect(row.plan).toBe("insidir");
    expect(row.planCheckedAt).toBeNull();
  });
});
