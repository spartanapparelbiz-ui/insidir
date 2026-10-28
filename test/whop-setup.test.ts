/* `npm run whop:setup` (lib/billing/setup.ts) against a stand-in Whop API and a throwaway Postgres next to
 * E2E_DATABASE_URL: picks the right plan and keeps checkout closed when it isn't exactly 7 days for $1 then
 * $39/month; creates the webhook once and stores its secret encrypted; never duplicates; finds or creates the
 * env vars override; no secret in the logs. The crypto and plan checks run without a database. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, readConfig, resolveRuntime } from "@/lib/billing/config";
import { EVENTS, planProblems, runWhopSetup } from "@/lib/billing/setup";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const KEY = "apik_owner_test_key";
const GOOD = { id: "plan_good", visibility: "visible", billing_type: "renewal", renewal_price: 39, initial_price: 1, trial_period_days: 7, billing_period: 30, currency: "usd", product: { id: "prod_ins" } };

describe("crypto and plan checks", () => {
  it("encrypts with a key from WHOP_API_KEY; another key can't read it", () => {
    const box = encryptSecret("whsec_abc", KEY);
    expect(box).not.toContain("whsec_abc");
    expect(decryptSecret(box, KEY)).toBe("whsec_abc");
    expect(decryptSecret(box, "another_key")).toBeNull();
  });
  it("says exactly what's wrong with a plan", () => {
    expect(planProblems(GOOD)).toEqual([]);
    expect(planProblems({ ...GOOD, trial_period_days: 3, initial_price: 0 })).toEqual(["trial is 3 days, not 7", "initial fee is $0, not $1"]);
    expect(planProblems({ ...GOOD, trial_period_days: null, billing_period: 365 })).toEqual(["bills every 365 days, not monthly", "trial is 0 days, not 7"]);
  });
  it("env overrides what setup stored", () => {
    const stored = { plan_id: "plan_db", app_id: "app_db", webhook_secret: encryptSecret("whsec_db", KEY) };
    expect(resolveRuntime(stored, { WHOP_API_KEY: KEY })).toEqual({ planId: "plan_db", webhookSecret: "whsec_db", clientId: "app_db" });
    expect(resolveRuntime(stored, { WHOP_API_KEY: KEY, WHOP_PLAN_INSIDIR: "plan_env", WHOP_WEBHOOK_SECRET: "whsec_env", WHOP_CLIENT_ID: "app_env" }))
      .toEqual({ planId: "plan_env", webhookSecret: "whsec_env", clientId: "app_env" });
  });
});

/** A stand-in for Whop's API: plans, webhooks and apps, in memory. */
function fakeWhop(plans: Array<Record<string, unknown>>) {
  const s = { webhooks: [] as Array<Record<string, unknown>>, apps: [] as Array<Record<string, unknown>>, calls: [] as string[], n: 0 };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input)), m = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    s.calls.push(`${m} ${u.pathname}`);
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${KEY}`) return json({ error: { message: "unauthorized" } }, 401);
    const p = u.pathname.replace(/^\/api\/v1/, "");
    if (m === "GET" && p === "/plans") return json({ data: plans.filter(x => (x.product as { id: string }).id === u.searchParams.get("product_ids[]")) });
    if (m === "GET" && p === "/webhooks") return json({ data: s.webhooks.map(w => ({ ...w, webhook_secret: "" })) });
    // Whop refuses api_version on new webhooks (they always use v1 events).
    if (m === "POST" && p === "/webhooks" && "api_version" in body) return json({ error: { message: "api_version is no longer supported." } }, 400);
    if (m === "POST" && p === "/webhooks") { const w = { id: `hook_${++s.n}`, ...body, webhook_secret: `whsec_secret${s.n}` }; s.webhooks.push(w); return json(w); }
    const hook = p.match(/^\/webhooks\/(.+)$/);
    if (hook && m === "DELETE") { s.webhooks = s.webhooks.filter(w => w.id !== hook[1]); return json({}); }
    if (hook && m === "PATCH") { const w = s.webhooks.find(x => x.id === hook[1])!; Object.assign(w, body); return json(w); }
    if (m === "GET" && p === "/apps") return json({ data: s.apps });
    if (m === "POST" && p === "/apps") { const a = { id: `app_${++s.n}`, company: { id: body.account_id }, ...body }; s.apps.push(a); return json(a); }
    const app = p.match(/^\/apps\/(.+)$/);
    if (app && m === "PATCH") { const a = s.apps.find(x => x.id === app[1])!; Object.assign(a, body); return json(a); }
    return json({ error: { message: "not found" } }, 404);
  }) as typeof fetch;
  return { s, f };
}

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_whop_${process.pid}`;

describe.skipIf(!URL0)("whop:setup against a stand-in Whop", () => {
  let admin: pg.Client, pool: pg.Pool, db: Db;
  const ENV = { WHOP_API_KEY: KEY, WHOP_COMPANY_ID: "biz_1", WHOP_PRODUCT_INSIDIR: "prod_ins", APP_URL: "https://insidir.com", WHOP_API_ORIGIN: "https://whop.test" };
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
  beforeEach(async () => { await pool.query("truncate terminal.whop_config"); });

  it("first run: picks the $39 plan, creates the webhook and the app; second run changes nothing; no secret in the logs", async () => {
    const w = fakeWhop([{ ...GOOD, id: "plan_annual", renewal_price: 390, billing_period: 365 }, { ...GOOD, id: "plan_hidden", visibility: "hidden" }, GOOD]);
    const logs: string[] = [];
    const r1 = await runWhopSetup({ db, env: ENV, fetch: w.f, log: l => logs.push(l) });
    expect(r1.line).toBe("Whop setup: plan ok, webhook ok");
    expect(logs).toContain("Whop plan plan_good: $39 every 30 days, trial 7 days, initial fee $1.");
    expect(w.s.webhooks).toHaveLength(1);
    expect(w.s.webhooks[0]).toMatchObject({ url: "https://insidir.com/api/billing/webhook", events: [...EVENTS], resource_id: "biz_1" });
    // Log-in is our own now: no login app is made.
    expect(w.s.apps).toEqual([]);
    const stored = await readConfig(db);
    expect(stored.plan_id).toBe("plan_good");
    expect(stored.webhook_secret).not.toContain("whsec_");
    expect(decryptSecret(stored.webhook_secret!, KEY)).toBe("whsec_secret1");
    expect(resolveRuntime(stored, { WHOP_API_KEY: KEY })).toEqual({ planId: "plan_good", webhookSecret: "whsec_secret1", clientId: null });

    const before = w.s.calls.length;
    const r2 = await runWhopSetup({ db, env: ENV, fetch: w.f, log: l => logs.push(l) });
    expect(r2.line).toBe("Whop setup: plan ok, webhook ok");
    expect(w.s.webhooks).toHaveLength(1);
    expect(w.s.calls.slice(before).filter(c => !c.startsWith("GET"))).toEqual([]);
    for (const l of logs) expect(l).not.toMatch(/whsec_|apik_/);
  });

  it("a plan that isn't exactly 7 days for $1 then $39/month: checkout stays closed and the log says why", async () => {
    await pool.query("insert into terminal.whop_config (key, value) values ('plan_id', 'plan_old')");
    const w = fakeWhop([{ ...GOOD, trial_period_days: 3, initial_price: 0 }]);
    const logs: string[] = [];
    const r = await runWhopSetup({ db, env: ENV, fetch: w.f, log: l => logs.push(l) });
    expect(r.line).toBe("Whop setup: plan wrong, webhook ok");
    expect(logs.join("\n")).toContain("Whop plan plan_good is not what the site says (7 days for $1, then $39/month): trial is 3 days, not 7; initial fee is $0, not $1. Checkout stays closed.");
    expect((await readConfig(db)).plan_id).toBeUndefined();
  });

  it("an existing webhook: adds missing events; one whose secret we don't hold is replaced, never duplicated", async () => {
    const w = fakeWhop([GOOD]);
    w.s.webhooks.push({ id: "hook_old", url: "https://insidir.com/api/billing/webhook", events: ["payment.succeeded"], enabled: true });
    const logs: string[] = [];
    // No secret stored and none in env: replaced (deleted, then one created).
    await runWhopSetup({ db, env: ENV, fetch: w.f, log: l => logs.push(l) });
    expect(w.s.webhooks.map(x => x.id)).toEqual(["hook_1"]);
    expect(logs).toContain("Whop webhook: the existing one's secret wasn't stored, so it was replaced.");
    // With the secret known (env), an existing webhook is kept and only gets the missing events.
    w.s.webhooks = [{ id: "hook_env", url: "https://insidir.com/api/billing/webhook", events: ["payment.succeeded"], enabled: true }];
    await runWhopSetup({ db, env: { ...ENV, WHOP_WEBHOOK_SECRET: "whsec_env" }, fetch: w.f, log: l => logs.push(l) });
    expect(w.s.webhooks).toHaveLength(1);
    expect(w.s.webhooks[0]!.id).toBe("hook_env");
    expect(new Set(w.s.webhooks[0]!.events as string[])).toEqual(new Set(EVENTS));
    for (const l of logs) expect(l).not.toMatch(/whsec_|apik_/);
  });
});
