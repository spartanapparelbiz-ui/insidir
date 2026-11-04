/* The money-path monitor against a throwaway Postgres next to E2E_DATABASE_URL and a stand-in site: every step passing;
 * Whop answering "redirect_uri is invalid" (the sign-in step fails, one push alert); still failing within the hour (no
 * second alert); recovering (one "working again" alert); what /status reads; and the alert going as a web push to every
 * device of the FREE_ACCESS_EMAILS accounts (dropped subscriptions deleted; none → "no_subscription"). */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADLINE } from "@/lib/copy";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { moneyPathOnce, monitorView, pushOwners, type Alert } from "@/lib/monitor/money-path";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_monitor_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const B = "https://insidir.test", NOW = Date.UTC(2026, 10, 1, 18);

/** The site and Whop; `whop` says how Whop's authorize answers. */
function site(whop: "ok" | "invalid") {
  const seen: string[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input)), m = init?.method ?? "GET";
    seen.push(`${m} ${u.pathname}`);
    const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html" } });
    if (u.host === "insidir.test") {
      if (u.pathname === "/") return html(`<h1>${HEADLINE}</h1>`);
      if (u.pathname.startsWith("/market/")) return html('<main data-testid="market-page"></main>');
      if (u.pathname === "/go") return html('<section data-testid="go-hook"></section>');
      if (u.pathname === "/api/checkout/start") return Response.json({ planId: "plan_1" });
      if (u.pathname === "/login/start") return new Response(null, { status: 303, headers: { location: "https://api.whop.test/oauth/authorize?client_id=app_1&redirect_uri=https%3A%2F%2Finsidir.com%2Flogin%2Fcallback" } });
    }
    if (u.host === "api.whop.test" && u.pathname === "/oauth/authorize") {
      return whop === "ok" ? new Response(null, { status: 302, headers: { location: "https://whop.test/login?next=x" } }) : html("<p>Error: redirect_uri is invalid</p>", 400);
    }
    return html("not found", 404);
  }) as unknown as typeof fetch;
  return { f, seen };
}

describe.skipIf(!URL0)("the money-path monitor", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    await pool.query(`insert into terminal.millionaire_bets (id, wallet, tier, source, market_id, event_title, market_title, outcome, outcome_side, amount, price, category, at, last_at)
      values ('b1', '0xw', 'millionaire', 'polymarket', '0xopen', 'E', 'E', 'Yes', 'yes', 50000, 0.5, 'football', $1, $1)`, [new Date(NOW - 3_600_000)]);
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("passes every step, opens a market page as a monitor visitor, and emails nobody", async () => {
    const mails: Alert[] = [];
    const { f, seen } = site("ok");
    const r = await moneyPathOnce(db, { base: B, f, now: NOW, notify: async a => { mails.push(a); return "sent"; } });
    expect(r.ok).toBe(true);
    expect(r.steps.map(s => [s.step, s.ok])).toEqual([["landing", true], ["market", true], ["checkout", true], ["sign-in", true]]);
    expect(seen).toEqual(["GET /", "GET /market/0xopen", "GET /go", "POST /api/checkout/start", "GET /login/start", "GET /oauth/authorize"]);
    expect(mails).toEqual([]);
  });

  it("Whop rejecting the redirect URI fails the sign-in step, emails once, again only after an hour, and once on recovery", async () => {
    const mails: Alert[] = [];
    const notify = async (a: Alert) => { mails.push(a); return "sent" as const; };
    const r = await moneyPathOnce(db, { base: B, f: site("invalid").f, now: NOW + 600_000, notify });
    expect(r.ok).toBe(false);
    expect(r.steps.at(-1)).toMatchObject({ step: "sign-in", ok: false, detail: 'Whop said "redirect_uri is invalid" (https://insidir.com/login/callback)' });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ title: "Money path failing: sign-in", body: 'Whop said "redirect_uri is invalid" (https://insidir.com/login/callback)', url: "https://insidir.test/status" });
    await moneyPathOnce(db, { base: B, f: site("invalid").f, now: NOW + 1_200_000, notify });
    expect(mails).toHaveLength(1);
    await moneyPathOnce(db, { base: B, f: site("invalid").f, now: NOW + 600_000 + 3_600_000, notify });
    expect(mails).toHaveLength(2);
    await moneyPathOnce(db, { base: B, f: site("ok").f, now: NOW + 600_000 + 4_200_000, notify });
    expect(mails.at(-1)!.title).toBe("Money path working again");
    const v = await monitorView(db, NOW + 600_000 + 4_200_000);
    expect(v.last).toMatchObject({ ok: true });
    expect(v.failures24h.map(x => x.step)).toEqual(["sign-in", "sign-in", "sign-in"]);
    expect(v.runs24h).toBe(5);
  });

  it("the alert goes as a web push to every device of the free-access accounts; none subscribed is said so", async () => {
    const prev = process.env.FREE_ACCESS_EMAILS;
    process.env.FREE_ACCESS_EMAILS = "Owner@Example.test, partner@example.test";
    try {
      const alert: Alert = { title: "Money path failing: sign-in", body: "x", url: "https://insidir.test/status" };
      const pushed: string[] = [];
      const send = async (t: { endpoint: string }) => { pushed.push(t.endpoint); return t.endpoint.endsWith("/gone") ? "gone" as const : "sent" as const; };
      expect(await pushOwners(db, alert, send)).toBe("no_subscription");
      await pool.query(`insert into terminal.users (id, email, plan) values ('o1', 'owner@example.test', 'insidir'), ('o2', 'partner@example.test', 'insidir'), ('m1x', 'member@example.test', 'insidir')`);
      await pool.query(`insert into terminal.push_subscriptions (endpoint, user_id, p256dh, auth) values
        ('https://push.test/o1-phone', 'o1', 'k', 'a'), ('https://push.test/o2/gone', 'o2', 'k', 'a'), ('https://push.test/member', 'm1x', 'k', 'a')`);
      expect(await pushOwners(db, alert, send)).toBe("sent");
      expect(pushed.sort()).toEqual(["https://push.test/o1-phone", "https://push.test/o2/gone"]);
      // The dropped subscription is gone; a member who isn't an owner never gets the alert.
      expect((await pool.query("select endpoint from terminal.push_subscriptions order by endpoint")).rows.map(r => r.endpoint)).toEqual(["https://push.test/member", "https://push.test/o1-phone"]);
      process.env.FREE_ACCESS_EMAILS = "";
      expect(await pushOwners(db, alert, send)).toBe("no_subscription");
    } finally { process.env.FREE_ACCESS_EMAILS = prev; }
  });
});