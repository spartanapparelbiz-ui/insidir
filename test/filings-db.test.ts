/* Filings against Postgres (lib/filings): one poll stores each filing once from a stand-in EDGAR (8-Ks straight from
 * the feed, Form 4s from their XML), a second poll costs only the feed requests and writes nothing, the Stream is
 * computed at ingestion (whale + a cluster with an earlier filing), the shared feed slices by cursor, and the member
 * stores (lists, journal with version guard and server-side history, positions, read cursor, export) behave. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { filingsOnce } from "@/lib/filings/ingest";
import { acknowledge, exportAll, feedAfter, markSeen, memberState, resolveTicker, saveJournal, savePositions, saveWatchlists, watchedSince } from "@/lib/filings/store";
import { tickersOnce } from "@/lib/filings/tickers";
import type { Position } from "@/lib/filings/types";
import { SecClient } from "@/lib/stocks/sec";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_filings_${process.pid}`;
const fx = (name: string) => readFileSync(join(__dirname, "fixtures/sec", name), "utf8");
const EMPTY = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Latest Filings</title></feed>`;
const ACC = "000032019326000101";
const NOW = Date.parse("2026-10-26T20:40:00Z");

/** A stand-in EDGAR: the two feeds (first page only), one Form 4's index and XML, a 4/A with no XML, the tickers file. */
function fakeEdgar(tickers: unknown) {
  const calls: string[] = [];
  const fetcher = async (url: string): Promise<Response> => {
    calls.push(url);
    const u = new URL(url);
    const body = (() => {
      if (u.pathname === "/cgi-bin/browse-edgar") return u.searchParams.get("start") ? EMPTY : u.searchParams.get("type") === "8-K" ? fx("atom-8k.xml") : fx("atom-current.xml");
      if (u.pathname === "/files/company_tickers.json") return JSON.stringify(tickers);
      if (u.pathname.endsWith(`${ACC}/index.json`)) return JSON.stringify({ directory: { item: [{ name: "form4.xml" }, { name: "0000320193-26-000101-index.htm", "last-modified": "2026-10-26 10:12:44" }] } });
      if (u.pathname.endsWith(`${ACC}/form4.xml`)) return fx("form4-ceo-buy.xml");
      if (u.pathname.endsWith("/index.json")) return JSON.stringify({ directory: { item: [] } });
      return null;
    })();
    return body === null ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  };
  return { sec: new SecClient("Insidir tests hello@aethric.llc", fetcher, 0), calls };
}

describe.skipIf(!URL0)("Filings in Postgres", () => {
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
    await db.insert(schema.users).values([{ id: "usr_a", email: "a@example.com", plan: "insidir" }, { id: "usr_b", email: "b@example.com", plan: "insidir" }]);
    // An earlier Form 4 at the same company: another director bought on Oct 20, the same week as the CEO's buys.
    await db.insert(schema.secFilings).values({ accession: "000032019326000090", form: "4", issuerCik: "320193", ticker: "EXDV", company: "Example Devices",
      acceptedAt: new Date("2026-10-22T20:00:00Z"), filedOn: "2026-10-22", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000090/x-index.htm",
      payload: { kind: "4", owners: [{ cik: "999", name: "Roe Sam", role: "Director" }], codes: ["P"], derivativeLines: 0,
        lines: [{ code: "P", ad: "A", date: "2026-10-20", shares: 1000, price: 180, value: 180_000 }] } });
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("the ticker directory is written once and skipped while unchanged", async () => {
    const rows = Object.fromEntries(Array.from({ length: 1200 }, (_, i) => [String(i), { cik_str: 5000 + i, ticker: `T${i}`, title: `Company ${i}` }]));
    rows["9999"] = { cik_str: 320193, ticker: "EXDV", title: "Example Devices Inc." };
    const a = fakeEdgar(rows);
    expect(await tickersOnce(db, a.sec)).toEqual({ changed: true, rows: 1201 });
    expect(await tickersOnce(db, a.sec)).toEqual({ changed: false, rows: 0 });
    expect(await resolveTicker(db, "exdv")).toEqual({ ticker: "EXDV", cik: "320193", title: "Example Devices Inc." });
    expect((await resolveTicker(db, "0000320193"))?.ticker).toBe("EXDV");
  });

  it("one poll stores each filing once, then a second poll reads only the feeds and writes nothing", async () => {
    const e = fakeEdgar({});
    const r = await filingsOnce(db, e.sec, NOW);
    expect(r).toMatchObject({ form4: 2, eightK: 2, errors: 0 });
    const rows = await db.select().from(schema.secFilings);
    expect(rows).toHaveLength(5);
    const k = rows.find(x => x.accession === "000032019326000205")!;
    expect(k).toMatchObject({ form: "8-K", issuerCik: "320193", ticker: "EXDV", company: "Example Devices", filedOn: "2026-10-26", payload: { kind: "8-K", items: ["2.02", "9.01"] } });
    const f = rows.find(x => x.accession === ACC)!;
    expect(f).toMatchObject({ form: "4", issuerCik: "320193", ticker: "EXDV", filedOn: "2026-10-26" });
    expect(f.acceptedAt.toISOString()).toBe("2026-10-26T14:12:44.000Z");
    expect(rows.find(x => x.accession === "000000000226000888")?.payload).toMatchObject({ unparsed: true });

    const again = fakeEdgar({});
    expect(await filingsOnce(db, again.sec, NOW)).toMatchObject({ form4: 0, eightK: 0, anomalies: 0 });
    expect(again.calls.every(c => c.includes("/cgi-bin/browse-edgar"))).toBe(true);
    expect(again.calls).toHaveLength(2);
    expect(await db.select().from(schema.secFilings)).toHaveLength(5);
  });

  it("the Stream is computed at ingestion: the CEO's $1.4M whale and a two-owner cluster that week", async () => {
    const a = await db.select().from(schema.filingAnomalies);
    const whale = a.find(x => x.kind === "whale")!;
    expect(whale).toMatchObject({ key: `whale:${ACC}`, total: 1_401_817.5, ticker: "EXDV", ruleVersion: 1 });
    const cluster = a.find(x => x.kind === "cluster")!;
    expect(cluster).toMatchObject({ key: "cluster:320193:2026-10-19", windowStart: "2026-10-19", windowEnd: "2026-10-25", total: 1_581_817.5 });
    expect(cluster.facts.groups).toBe(2);
    expect(cluster.facts.buys?.map(b => b.date)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(a).toHaveLength(2);
  });

  it("the shared feed slices by cursor; watched companies load by index; unparsed filings never show", async () => {
    const first = await feedAfter(db, 0);
    expect(first.rows).toEqual([]);
    const all = await feedAfter(db, 1);
    expect(all.rows.map(r => r.accession)).not.toContain("000000000226000888");
    expect(all.rows.every(r => r.id > 1)).toBe(true);
    expect(all.cursor).toBe(Math.max(...all.rows.map(r => r.id)));
    const w = await watchedSince(db, ["320193"], Date.parse("2026-10-20T00:00:00Z"));
    expect(w.map(r => r.accession)).toEqual(["000032019326000205", ACC, "000032019326000090"]);
    expect(await watchedSince(db, [], 0)).toEqual([]);
  });

  it("lists save as a set: ids kept, removed ones deleted, other members untouched", async () => {
    const one = await saveWatchlists(db, "usr_a", [{ name: "Semis", items: [{ cik: "320193", ticker: "EXDV" }] }, { name: "Banks", items: [] }]);
    await saveWatchlists(db, "usr_b", [{ name: "Mine", items: [] }]);
    const two = await saveWatchlists(db, "usr_a", [{ id: one[0]!.id, name: "Chips", items: [] }]);
    expect(two).toEqual([{ id: one[0]!.id, name: "Chips", items: [] }]);
    expect((await memberState(db, "usr_a")).watchlists).toEqual(two);
    expect((await memberState(db, "usr_b")).watchlists.map(l => l.name)).toEqual(["Mine"]);
    // Another member's list id can't be taken over.
    const theirs = (await memberState(db, "usr_b")).watchlists[0]!.id;
    await saveWatchlists(db, "usr_a", [{ id: theirs, name: "Hijack", items: [] }]);
    expect((await memberState(db, "usr_b")).watchlists[0]!.name).toBe("Mine");
  });

  it("the journal saves by version, records status history on the server, and refuses a stale save", async () => {
    const note = { id: "n1", body: "CEO bought twice", anchor: { kind: "filing" as const, ref: ACC, label: "Form 4 · 2026-10-26", url: "https://www.sec.gov/x" }, pinned: false, createdAt: 1, updatedAt: 1 };
    const a = await saveJournal(db, "usr_a", "320193", "EXDV", { status: "researching", reason: null, notes: [note], version: 0 }, 1000);
    expect(a).toMatchObject({ version: 1, status: "researching", history: [{ from: null, to: "researching", reason: null, at: 1000 }] });
    const b = await saveJournal(db, "usr_a", "320193", "EXDV", { status: "passed", reason: "Waiting for the 10-Q", notes: [note], version: 1 }, 2000);
    expect(b?.history).toEqual([{ from: null, to: "researching", reason: null, at: 1000 }, { from: "researching", to: "passed", reason: "Waiting for the 10-Q", at: 2000 }]);
    expect(await saveJournal(db, "usr_a", "320193", "EXDV", { status: null, reason: null, notes: [], version: 1 })).toBeNull();
    const c = await saveJournal(db, "usr_a", "320193", "EXDV", { status: "passed", reason: null, notes: [note, { ...note, id: "n2" }], version: 2 });
    expect(c?.history).toHaveLength(2);
    expect((await memberState(db, "usr_a")).journals).toEqual([{ cik: "320193", ticker: "EXDV", status: "passed", notes: 2, updatedAt: expect.any(Number) }]);
  });

  it("positions save by version; the read cursor only moves forward; the disclaimer is recorded", async () => {
    const p: Position = { id: "p1", kind: "equity", tickers: ["EXDV"], venue: null, label: null, side: "long", quantity: 200, entryPrice: 180.1, entryDate: "2026-10-01",
      fees: 0, exitPrice: null, resolution: null, closedOn: null, note: "" };
    expect(await savePositions(db, "usr_a", [p], 0)).toBe(1);
    expect(await savePositions(db, "usr_a", [], 0)).toBeNull();
    await markSeen(db, "usr_a", 7);
    await markSeen(db, "usr_a", 3);
    await acknowledge(db, "usr_a", 1);
    const s = await memberState(db, "usr_a");
    expect(s).toMatchObject({ seenId: 7, ackVersion: 1, positions: [p], positionsVersion: 1 });
    const out = await exportAll(db, "usr_a");
    expect(out).toMatchObject({ positions: [p], journals: [{ ticker: "EXDV", status: "passed" }] });
  });

  it("deleting an account deletes its lists, journal and desk", async () => {
    await db.delete(schema.users).where(eq(schema.users.id, "usr_a"));
    expect(await db.select().from(schema.userWatchlists).where(eq(schema.userWatchlists.userId, "usr_a"))).toEqual([]);
    expect(await db.select().from(schema.researchJournal)).toEqual([]);
    expect(await db.select().from(schema.researchMembers).where(eq(schema.researchMembers.userId, "usr_a"))).toEqual([]);
    expect((await memberState(db, "usr_b")).watchlists).toHaveLength(1);
  });
});
