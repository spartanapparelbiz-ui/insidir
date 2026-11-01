/* The money-path monitor against a throwaway Postgres next to E2E_DATABASE_URL and a stand-in site: every step passing;
 * Whop answering "redirect_uri is invalid" (the sign-in step fails, one email to hello@aethric.llc); still failing within
 * the hour (no second email); recovering (one "working again" email); and what /status reads. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADLINE } from "@/lib/copy";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { Email } from "@/lib/emails/transport";
import { moneyPathOnce, monitorView } from "@/lib/monitor/money-path";

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
      if (u.pathname === "/api/read" && m === "POST") return Response.json({ id: "abc123" });
      if (u.pathname === "/read/abc123") return html('<article data-testid="read-card"></article>');
      if (u.pathname === "/start") return html('<div data-testid="start-pay"></div>');
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
    await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, at, last_at, tab, category)
      values ('m1', 'polymarket', '0xopen', 'E', 'E', 'Yes', 'yes', 50000, 0.5, $1, $1, 'sports', 'sports')`, [new Date(NOW - 3_600_000)]);
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("passes every step, reads an open market as a monitor visitor, and emails nobody", async () => {
    const mails: Email[] = [];
    const { f, seen } = site("ok");
    const r = await moneyPathOnce(db, { base: B, f, now: NOW, send: async e => { mails.push(e); return "sent"; } });
    expect(r.ok).toBe(true);
    expect(r.steps.map(s => [s.step, s.ok])).toEqual([["landing", true], ["read", true], ["checkout", true], ["sign-in", true]]);
    expect(seen).toEqual(["GET /", "POST /api/read", "GET /read/abc123", "GET /start", "POST /api/checkout/start", "GET /login/start", "GET /oauth/authorize"]);
    expect(mails).toEqual([]);
  });

  it("Whop rejecting the redirect URI fails the sign-in step, emails once, again only after an hour, and once on recovery", async () => {
    const mails: Email[] = [];
    const send = async (e: Email) => { mails.push(e); return "sent" as const; };
    const r = await moneyPathOnce(db, { base: B, f: site("invalid").f, now: NOW + 600_000, send });
    expect(r.ok).toBe(false);
    expect(r.steps.at(-1)).toMatchObject({ step: "sign-in", ok: false, detail: 'Whop said "redirect_uri is invalid" (https://insidir.com/login/callback)' });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "hello@aethric.llc", subject: "Insidir money path failing: sign-in" });
    expect(mails[0]!.text).toContain("FAIL sign-in");
    await moneyPathOnce(db, { base: B, f: site("invalid").f, now: NOW + 1_200_000, send });
    expect(mails).toHaveLength(1);
    await moneyPathOnce(db, { base: B, f: site("invalid").f, now: NOW + 600_000 + 3_600_000, send });
    expect(mails).toHaveLength(2);
    await moneyPathOnce(db, { base: B, f: site("ok").f, now: NOW + 600_000 + 4_200_000, send });
    expect(mails.at(-1)!.subject).toBe("Insidir money path working again");
    const v = await monitorView(db, NOW + 600_000 + 4_200_000);
    expect(v.last).toMatchObject({ ok: true });
    expect(v.failures24h.map(x => x.step)).toEqual(["sign-in", "sign-in", "sign-in"]);
    expect(v.runs24h).toBe(5);
  });
});
