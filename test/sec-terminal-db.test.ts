/* V3 steps 3–6 in a real Postgres (a throwaway database next to E2E_DATABASE_URL), fed real EDGAR files through a
 * stand-in for EDGAR (test/fixtures/sec/v3): a company read from its submissions and facts, the financials accuracy
 * check, People from the Form 4 database, watchlists and their alerts (once per member and filing, never for an old
 * filing read late, with the latency from EDGAR), the journal, and that deleting an account takes all of it with it.
 * Skipped when E2E_DATABASE_URL isn't set. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCompaniesCheck } from "@/lib/accuracy/companies";
import { passed } from "@/lib/accuracy/filings";
import { deleteAccount } from "@/lib/account/delete";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { deleteEntry, entryFor, journalFor, saveEntry } from "@/lib/journal";
import { companiesOnce, companyByTicker, factsFor, filingsFor, financials, wantCompanies } from "@/lib/stocks/company";
import { saveFiling } from "@/lib/stocks/filings";
import { filingIndexUrl, parseOwnership } from "@/lib/stocks/form4";
import { personByCik } from "@/lib/stocks/people";
import { SecClient } from "@/lib/stocks/sec";
import { addItem, alertsOnce, createList, inbox, listsFor, markRead, unreadCount, updateList } from "@/lib/stocks/watchlists";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_secterm_${process.pid}`;
const fx = (n: string) => readFileSync(join(__dirname, "fixtures/sec/v3", n), "utf8");
const NOW = Date.parse("2026-11-07T16:00:00Z");

function edgar(down = false) {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    if (down) throw new Error("offline");
    if (url.endsWith("/submissions/CIK0000080424.json")) return new Response(fx("pg-submissions.json"));
    if (url.endsWith("/companyfacts/CIK0000080424.json")) return new Response(fx("pg-companyfacts.json"));
    return new Response("Not found", { status: 404 });
  };
  return { sec: new SecClient("Insidir tests qa@insidir.com", fetcher as typeof fetch, 0), asked };
}

let admin: pg.Client, pool: pg.Pool, db: Db;
const user = "user_secterm", other = "user_secterm_2";

describe.skipIf(!URL0)("the SEC terminal in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    for (const id of [user, other]) await db.execute(sql`insert into terminal.users (id, email, plan) values (${id}, ${`${id}@example.test`}, 'insidir')`);
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${NAME}`);
    await admin?.end();
  });

  it("reads a company asked for: header, filings and the facts the report uses", async () => {
    await wantCompanies(db, ["80424"], NOW);
    const { sec, asked } = edgar();
    const r = await companiesOnce(db, sec, NOW);
    expect(r).toMatchObject({ read: 1, errors: 0 });
    expect(asked).toEqual(["https://data.sec.gov/submissions/CIK0000080424.json", "https://data.sec.gov/api/xbrl/companyfacts/CIK0000080424.json"]);
    const co = await companyByTicker(db, "pg");
    expect(co).toMatchObject({ cik: "80424", name: "PROCTER & GAMBLE Co", fiscalYearEnd: "0630" });
    const rev = financials(await factsFor(db, "80424")).find(f => f.metric === "revenue")!;
    expect(rev).toMatchObject({ basis: "ttm", value: 87_922_000_000 });
    const eightKs = await filingsFor(db, "80424", ["8-K"]);
    expect(eightKs.length).toBeGreaterThan(0);
    expect(eightKs.every(f => f.form.replace(/\/A$/, "") === "8-K")).toBe(true);
    // Done: not read again until something asks.
    expect((await companiesOnce(db, edgar().sec, NOW + 60_000)).read).toBe(0);
  });

  it("the financials accuracy check passes against EDGAR, fails on a changed value, and is skipped when EDGAR is down", async () => {
    const n = Math.min(20, Number((await db.execute(sql`select count(*)::int as n from terminal.company_facts`)).rows[0]!.n));
    const ok = await runCompaniesCheck(db, edgar().sec, { rows: 20 });
    expect(ok.lines.length).toBe(n);
    expect(ok.lines.filter(l => l.status !== "ok")).toEqual([]);
    expect(passed(ok.lines, n)).toBe(true);
    await db.execute(sql`update terminal.company_facts set value = value + 1`);
    const bad = await runCompaniesCheck(db, edgar().sec, { rows: 20 });
    expect(bad.lines.every(l => l.status === "mismatch" && /^value /.test(l.problems[0]!))).toBe(true);
    await db.execute(sql`update terminal.company_facts set value = value - 1`);
    const off = await runCompaniesCheck(db, edgar(true).sec, { rows: 20 });
    expect(off.lines.every(l => l.status === "skipped")).toBe(true);
    expect(passed(off.lines, n)).toBe(false);
  });

  it("People: a reporting owner and the company on their filings, as filed", async () => {
    await saveFiling(db, parseOwnership(fx("pg-ms.xml")), "000008042426000271", Date.parse("2026-11-05T14:03:41Z"), filingIndexUrl("80424", "000008042426000271"));
    const owner = (await db.execute(sql`select owner_cik from terminal.insider_trades limit 1`)).rows[0] as { owner_cik: string };
    const p = await personByCik(db, owner.owner_cik);
    expect(p).toMatchObject({ name: "Schulten Andre" });
    expect(p!.seats).toHaveLength(1);
    expect(p!.seats[0]).toMatchObject({ issuerCik: "80424", ticker: "PG", isOfficer: true, filings: 1 });
    expect(p!.seats[0]!.lastUrl).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/80424\/000008042426000271\//);
    expect(await personByCik(db, "999999999")).toBeNull();
  });

  it("watchlists: an alert for a new filing, once, with its latency; none for an old filing; only for its owner", async () => {
    const list = await createList(db, user, "Staples");
    if ("error" in list) throw new Error(list.error);
    await addItem(db, user, list.id, { kind: "company", cik: "80424", label: "Procter & Gamble (PG)" });
    expect(await addItem(db, other, list.id, { kind: "company", cik: "1", label: "x" })).toEqual({ error: "That watchlist isn't yours." });
    // The 8-K arrives from the live feed two minutes after EDGAR accepted it.
    const accepted = NOW - 120_000;
    await db.execute(sql`insert into terminal.company_filings (accession, cik, form, filed_on, accepted_at, url, seen_at)
      values ('000162828026999999', '80424', '8-K', '2026-11-07', ${new Date(accepted)}, 'https://www.sec.gov/Archives/edgar/data/80424/000162828026999999/x.htm', ${new Date(NOW - 60_000)})`);
    // An old 10-Q, found today by a company refresh: never an alert.
    await db.execute(sql`insert into terminal.company_filings (accession, cik, form, filed_on, accepted_at, url, seen_at)
      values ('000008042424000001', '80424', '10-Q', '2024-10-22', ${new Date("2024-10-22T12:00:00Z")}, 'https://www.sec.gov/x', ${new Date(NOW - 60_000)})`);
    // The default list alerts on insider filings only.
    expect((await alertsOnce(db, NOW)).made).toBe(0);
    await updateList(db, user, list.id, { forms: ["ownership", "8-K", "10-Q"] });
    const r = await alertsOnce(db, NOW);
    expect(r).toMatchObject({ made: 1, p50Ms: 120_000 });
    expect((await alertsOnce(db, NOW + 30_000)).made).toBe(0);
    const box = await inbox(db, user);
    expect(box.map(a => [a.form, a.title, a.latencyMs])).toEqual([["8-K", "8-K · PROCTER & GAMBLE Co (PG)", 120_000]]);
    expect(await inbox(db, other)).toEqual([]);
    expect(await unreadCount(db, user)).toBe(1);
    await markRead(db, user, null, NOW);
    expect(await unreadCount(db, user)).toBe(0);
  });

  it("a person on a watchlist alerts on their own Form 4, at any company", async () => {
    const l = (await listsFor(db, user))[0]!;
    const owner = (await db.execute(sql`select owner_cik from terminal.insider_trades limit 1`)).rows[0] as { owner_cik: string };
    await addItem(db, user, l.id, { kind: "person", cik: owner.owner_cik, label: "Andre Schulten" });
    // Read just now (the live feed) and filed today.
    await db.execute(sql`update terminal.filings set read_at = ${new Date(NOW - 30_000)}, filed_at = ${new Date(NOW - 90_000)}`);
    const r = await alertsOnce(db, NOW);
    expect(r.made).toBe(1);
    expect((await inbox(db, user))[0]).toMatchObject({ form: "4", latencyMs: 90_000 });
  });

  it("the journal: private to its member, sorted by status, and gone with the account", async () => {
    await saveEntry(db, user, { cik: "80424", status: "passed", note: "Valuation." }, NOW);
    await saveEntry(db, user, { cik: "1", status: "researching", note: "" }, NOW + 1);
    expect((await journalFor(db, user, "status")).map(e => [e.cik, e.status, e.company])).toEqual([["1", "researching", "CIK 1"], ["80424", "passed", "PROCTER & GAMBLE Co"]]);
    expect(await journalFor(db, other, "status")).toEqual([]);
    expect(await entryFor(db, other, "80424")).toBeNull();
    await deleteEntry(db, user, "1");
    expect((await journalFor(db, user, "recent")).map(e => e.cik)).toEqual(["80424"]);
    await deleteAccount(db, user);
    for (const t of ["journal_entries", "sec_watchlists", "sec_alerts"]) {
      expect((await db.execute(sql.raw(`select count(*)::int as n from terminal.${t} where ${t === "sec_watchlists" || t === "sec_alerts" || t === "journal_entries" ? "user_id" : "id"} = '${user}'`))).rows[0], t).toEqual({ n: 0 });
    }
    expect((await db.execute(sql`select count(*)::int as n from terminal.sec_watchlist_items`)).rows[0]).toEqual({ n: 0 });
  });
});
