/* The V3 Form 4 database in a real Postgres (a throwaway database next to E2E_DATABASE_URL), fed real EDGAR filings
 * through a stand-in for EDGAR (test/fixtures/sec/v3): the daily-index backfill reads a day once and marks it done,
 * skips weekends and missing indexes, never re-reads a filing; a 4/A supersedes its original whichever is read first;
 * the insider page's open-market tab leaves superseded lines and every other code out; the filings search; the
 * 20-row accuracy check. Skipped when E2E_DATABASE_URL isn't set. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { passed, runFilingsCheck } from "@/lib/accuracy/filings";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { backfillOnce, coverageSince } from "@/lib/stocks/backfill";
import { openMarketTotals, readAndSave, searchFilings, searchTrades } from "@/lib/stocks/filings";
import { SecClient } from "@/lib/stocks/sec";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_secv3_${process.pid}`;
const fx = (name: string) => readFileSync(join(__dirname, "fixtures/sec/v3", name), "utf8");
/** Monday Nov 9, 2026, 10am in New York. */
const NOW = Date.parse("2026-11-09T15:00:00Z");
const ENV = { FORM4_BACKFILL_FROM: "2026-11-01" };

const FILINGS: Record<string, { cik: string; name: string; xml: string }> = {
  "000119312526448969": { cik: "1228454", name: "bcb-4", xml: "ownership.xml" },
  "000119312526450490": { cik: "1228454", name: "bcb-4a", xml: "ownership.xml" },
  "000008042426000271": { cik: "80424", name: "pg-ms", xml: "form4.xml" },
};
const INDEX = [
  "Form Type   Company Name                                                  CIK         Date Filed  File Name",
  "-".repeat(140),
  "4                BCB BANCORP INC                                               1228454     20261105    edgar/data/1228454/0001193125-26-448969.txt",
  "4                Coppola James                                                 1628816     20261105    edgar/data/1628816/0001193125-26-448969.txt",
  "4/A              BCB BANCORP INC                                               1228454     20261105    edgar/data/1228454/0001193125-26-450490.txt",
  "4                PROCTER & GAMBLE CO                                           80424       20261105    edgar/data/80424/0000080424-26-000271.txt",
  "8-K              PROCTER & GAMBLE CO                                           80424       20261105    edgar/data/80424/0000080424-26-000270.txt",
].join("\n");

/** What EDGAR really answers for a daily index that doesn't exist (a holiday): S3's AccessDenied, as 403. */
const ACCESS_DENIED = `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>AccessDenied</Code><Message>Access Denied</Message><RequestId>X</RequestId><HostId>Y</HostId></Error>`;
/** The SEC's rate-limit answer: an HTML page, also 403. */
const RATE_LIMITED = "<html><head><title>SEC.gov | Request Rate Threshold Exceeded</title></head><body>Your request has been identified as part of a network of automated tools…</body></html>";

/** A stand-in for EDGAR: the Nov 5 daily index, each filing's index.json and XML; 404 for everything else, or the
 *  answer `missing` gives for an index that isn't there. */
function edgar(only?: (acc: string) => boolean, missing: (url: string) => Response | null = () => null) {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    if (url.endsWith("/form.20261105.idx")) return new Response(INDEX);
    const m403 = url.endsWith(".idx") ? missing(url) : null;
    if (m403) return m403;
    const m = /\/data\/\d+\/(\d{18})\/(.+)$/.exec(url);
    const f = m ? FILINGS[m[1]!] : undefined;
    if (f && (!only || only(m![1]!))) {
      if (m![2] === "index.json") return new Response(fx(`${f.name}.index.json`));
      if (m![2] === f.xml) return new Response(fx(`${f.name}.xml`));
    }
    return new Response("Not found", { status: 404 });
  };
  return { sec: new SecClient("Insidir tests qa@insidir.com", fetcher as typeof fetch, 0), asked };
}

let admin: pg.Client, pool: pg.Pool, db: Db;

describe.skipIf(!URL0)("the Form 4 database in Postgres", () => {
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

  it("the 4/A read before its original still supersedes it (the backfill goes newest first)", async () => {
    const { sec } = edgar();
    await readAndSave(db, sec, "1228454", "000119312526450490", {});
    let f = (await db.execute(sql`select accession, amends, superseded_by from terminal.filings order by accession`)).rows;
    expect(f).toEqual([{ accession: "000119312526450490", amends: null, superseded_by: null }]);
    await readAndSave(db, sec, "1228454", "000119312526448969", {});
    f = (await db.execute(sql`select accession, form, amends, superseded_by, original_date from terminal.filings order by accession`)).rows;
    expect(f).toEqual([
      { accession: "000119312526448969", form: "4", amends: null, superseded_by: "000119312526450490", original_date: null },
      { accession: "000119312526450490", form: "4/A", amends: "000119312526448969", superseded_by: null, original_date: "2026-11-05" },
    ]);
    const t = (await db.execute(sql`select accession, superseded from terminal.insider_trades order by accession`)).rows;
    expect(t).toEqual([{ accession: "000119312526448969", superseded: true }, { accession: "000119312526450490", superseded: false }]);
    await db.execute(sql`truncate terminal.filings, terminal.insider_trades`);
  });

  it("backfills a day from the daily index: each filing once, weekends and missing days closed, coverage stated", async () => {
    const { sec, asked } = edgar();
    const r = await backfillOnce(db, sec, NOW, 150, ENV);
    expect(r).toMatchObject({ listed: 3, read: 3, errors: 0, failed: 0, since: "2026-11-01" });
    // Two requests a filing, plus one index per weekday (Nov 2–6); never for the weekend.
    expect(asked.filter(u => u.endsWith(".idx")).map(u => u.slice(-12, -4))).toEqual(["20261106", "20261105", "20261104", "20261103", "20261102"]);
    expect(asked.filter(u => !u.endsWith(".idx"))).toHaveLength(6);
    const days = (await db.execute(sql`select day, listed, done_at is not null as done from terminal.form4_days order by day`)).rows;
    expect(days).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"].map(d => ({ day: `2026-11-${d}`, listed: d === "05" ? 3 : 0, done: true })));
    expect(await coverageSince(db, NOW, ENV)).toBe("2026-11-01");
    // The filing time is EDGAR's own stamp (Eastern), not the index day.
    const pgRow = (await db.execute(sql`select filed_at from terminal.filings where accession = '000008042426000271'`)).rows[0] as { filed_at: Date };
    expect(new Date(pgRow.filed_at).toISOString()).toBe("2026-11-05T14:03:41.000Z");
    // A second run reads nothing again.
    const again = edgar();
    expect(await backfillOnce(db, again.sec, NOW, 150, ENV)).toMatchObject({ read: 0, listed: 0 });
    expect(again.asked).toEqual([]);
  });

  it("a day with no index (403 AccessDenied, as EDGAR answers for a holiday) is closed; a rate-limit 403 is an error that stops nothing", async () => {
    await db.execute(sql`truncate terminal.form4_days, terminal.sec_seen, terminal.filings, terminal.insider_trades`);
    // Nov 4 rate-limited, every other missing day S3's AccessDenied: the backfill still reads Nov 5 and closes the rest.
    const e = edgar(undefined, url => url.endsWith("/form.20261104.idx") ? new Response(RATE_LIMITED, { status: 403 }) : new Response(ACCESS_DENIED, { status: 403 }));
    const r = await backfillOnce(db, e.sec, NOW, 150, ENV);
    expect(r).toMatchObject({ listed: 3, read: 3, errors: 1 });
    const open = (await db.execute(sql`select day from terminal.form4_days where done_at is null order by day`)).rows;
    expect(open).toEqual([{ day: "2026-11-04" }]);
    // The day before it is still open, so coverage starts after it.
    expect(await coverageSince(db, NOW, ENV)).toBe("2026-11-05");
    // Once EDGAR answers, it closes too.
    expect(await backfillOnce(db, edgar(undefined, () => new Response(ACCESS_DENIED, { status: 403 })).sec, NOW, 150, ENV)).toMatchObject({ errors: 0 });
    expect(await coverageSince(db, NOW, ENV)).toBe("2026-11-01");
  });

  it("a filing EDGAR can't serve is retried, then set aside after three tries so the day can close", async () => {
    await db.execute(sql`truncate terminal.form4_days, terminal.sec_seen, terminal.filings, terminal.insider_trades`);
    const broken = edgar(acc => acc !== "000008042426000271");
    for (let i = 0; i < 3; i++) await backfillOnce(db, broken.sec, NOW, 150, ENV);
    const d = (await db.execute(sql`select pending, failed, done_at is not null as done from terminal.form4_days where day = '2026-11-05'`)).rows[0];
    expect(d).toEqual({ pending: [], failed: ["000008042426000271"], done: true });
    // The other two were read and linked.
    expect((await db.execute(sql`select count(*)::int as n from terminal.filings`)).rows[0]).toEqual({ n: 2 });
    // Put the missing one back for the page tests.
    await readAndSave(db, edgar().sec, "80424", "000008042426000271", {});
  });

  it("the insider page: open-market only on the first tab, superseded lines left out, every other code in its own tab", async () => {
    const open = await searchTrades(db, "open", {}, { limit: 100 });
    expect(open.map(t => [t.company, t.code, t.form])).toEqual([["BCB BANCORP", "P", "4/A"], ["Procter & Gamble", "S", "4"]].map(([c, code, form]) => [expect.stringMatching(new RegExp(c!, "i")), code, form]));
    expect(open.every(t => t.url.startsWith("https://www.sec.gov/Archives/edgar/data/") && t.url.includes(t.accession))).toBe(true);
    const ex = await searchTrades(db, "exercises", {}, { limit: 100 });
    expect(ex.map(t => [t.code, t.derivative])).toEqual(expect.arrayContaining([["M", false], ["M", true]]));
    expect(await searchTrades(db, "grants", {}, { limit: 100 })).toEqual([]);
    expect((await searchTrades(db, "open", { q: "schulten" }, { limit: 100 })).map(t => t.code)).toEqual(["S"]);
    expect(await searchTrades(db, "open", { ticker: "ZZZZ" }, { limit: 100 })).toEqual([]);
    const tot = await openMarketTotals(db, { from: "2026-10-01", to: "2026-11-09" }, NOW);
    const bcb = open.find(t => t.code === "P")!, sale = open.find(t => t.code === "S")!;
    expect(tot).toMatchObject({ buyers: 1, sellers: 1 });
    expect(tot.bought).toBeCloseTo(bcb.value!, 2);
    expect(tot.sold).toBeCloseTo(sale.value!, 2);
  });

  it("the filings search: every filing, amendments marked, filters by name, code and date", async () => {
    const all = await searchFilings(db, {}, { limit: 100 });
    expect(all).toHaveLength(3);
    const bcb = await searchFilings(db, { q: "bcb" }, { limit: 100 });
    expect(bcb.map(f => [f.form, Boolean(f.supersededBy), Boolean(f.amends)])).toEqual([["4/A", false, true], ["4", true, false]]);
    expect((await searchFilings(db, { code: "M" }, { limit: 100 })).map(f => f.accession)).toEqual(["000008042426000271"]);
    expect(await searchFilings(db, { from: "2026-11-06" }, { limit: 100 })).toEqual([]);
    const p = all.find(f => f.accession === "000008042426000271")!;
    expect(p.codes).toEqual(["M", "S"]);
    expect(p.sold).toBeGreaterThan(0);
    expect(p.bought).toBe(0);
  });

  it("the accuracy check: every stored line re-read from the filing matches, and that is a pass", async () => {
    const n = Number((await db.execute(sql`select count(*)::int as n from terminal.insider_trades`)).rows[0]!.n);
    const r = await runFilingsCheck(db, edgar().sec, { rows: 20 });
    expect(r.lines).toHaveLength(n);
    expect(r.lines.filter(l => l.status !== "ok")).toEqual([]);
    expect(passed(r.lines, n)).toBe(true);
    expect(passed(r.lines)).toBe(n >= 20);
    // A stored line that no longer matches its filing is a mismatch, never a pass.
    await db.execute(sql`update terminal.insider_trades set shares = shares + 1 where code = 'S'`);
    const bad = await runFilingsCheck(db, edgar().sec, { rows: 20 });
    expect(bad.lines.find(l => l.status === "mismatch")?.problems.join(" ")).toMatch(/^shares /);
    expect(passed(bad.lines, n)).toBe(false);
    // EDGAR down: skipped, never a pass and never a mismatch.
    const down = new SecClient("Insidir tests qa@insidir.com", (async () => { throw new Error("offline"); }) as unknown as typeof fetch, 0);
    const off = await runFilingsCheck(db, down, { rows: 20 });
    expect(off.lines.every(l => l.status === "skipped")).toBe(true);
    expect(passed(off.lines, n)).toBe(false);
    const stored = (await db.execute(sql`select count(*)::int as n from terminal.accuracy_checks where what = 'form4'`)).rows[0];
    expect(stored).toEqual({ n: 3 * n });
  });
});
