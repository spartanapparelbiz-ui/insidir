/* The proof on the site: the settled record (counts, the average odds and the net, the same in the trust block and on
 * /results), the trust block's hourly-check wording (and what it says once the check is old), the locked record
 * visitors see (no digits), and where each move's source link goes. The SQL half runs against a throwaway database
 * next to E2E_DATABASE_URL and is skipped without it. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TrustBlock } from "@/components/TrustBlock";
import { LockedRecord } from "@/components/v2/LockedRecord";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { moveSource } from "@/lib/moves/source";
import { listMoves, upsertMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { recordOf, settledRecord, type TrustFacts } from "@/lib/trust";

const NOW = Date.UTC(2026, 9, 27, 23, 55, 0); // 7:55 PM ET
const ROWS = [
  { result: "won", amount: 10_000, avgPrice: 0.5 },  // +10,000
  { result: "won", amount: 30_000, avgPrice: 0.75 }, // +10,000
  { result: "lost", amount: 20_000, avgPrice: 0.4 }, // −20,000
  { result: "void", amount: 50_000, avgPrice: 0.9 }, // 0, and not in the odds
  { result: null, amount: 99_000, avgPrice: 0.5 },   // not settled: ignored
];

describe("the settled record", () => {
  it("counts won, lost and refunded; odds weighted by amount; a win pays amount/price − amount, a loss −amount, a refund 0", () => {
    const r = recordOf(ROWS);
    expect([r.won, r.lost, r.refunded]).toEqual([2, 1, 1]);
    // (10k·0.5 + 30k·0.75 + 20k·0.4) / 60k = 35.5k / 60k
    expect(r.oddsPct).toBeCloseTo((35_500 / 60_000) * 100, 6);
    expect(r.net).toBeCloseTo(0, 6);
    expect(recordOf([]).oddsPct).toBeNull();
  });
});

describe("the trust block", () => {
  const facts = (runAt: number): TrustFacts => ({
    settled: { won: 877, lost: 298, refunded: 3, oddsPct: 61.4, net: 1_234_000 },
    accuracy: { runAt, ok: 47, checked: 48, hidden: 1 },
  });
  it("a fresh check: 'Checked every hour', the time in ET, matched of checked, hidden, and How we check → /data", () => {
    const html = renderToStaticMarkup(createElement(TrustBlock, { facts: facts(NOW), now: NOW + 5 * 60_000 }));
    const text = html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "");
    expect(html).toContain("Checked every hour");
    expect(text).toMatch(/Last check 7:55\s?PM ET: 47 of 48 matched\. 1 hidden until it matches\./);
    expect(html).toContain('href="/data"');
    expect(html).toContain("How we check");
    expect(text).toContain("877 won, 298 lost");
    expect(text).toContain("Average odds when they bet: 61%");
    expect(text).toMatch(/Net for these traders: \+\$1\.2M/);
  });
  it("a check more than 2 hours old never claims hourly", () => {
    const html = renderToStaticMarkup(createElement(TrustBlock, { facts: facts(NOW), now: NOW + 2 * 3_600_000 + 60_000 }));
    const text = html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "");
    expect(html).not.toContain("every hour");
    expect(html).toContain("Last check");
    expect(text).toContain("47 of 48 matched");
  });
});

describe("the locked record", () => {
  it("says what's locked and shows no digits", () => {
    const html = renderToStaticMarkup(createElement(LockedRecord, {}));
    expect(html).toContain("Win rate · All-time profit");
    expect(html).toContain("members only");
    expect(html.replace(/<[^>]+>/g, "")).not.toMatch(/\d|NaN/);
  });
});

describe("source links", () => {
  const base = { id: "pm:x", source: "polymarket" as const, marketId: "0xc1", wallet: `0x${"1".padStart(40, "0")}`, at: NOW, url: null };
  it("Polymarket → the Polygonscan transaction; Kalshi → the market page; SEC → the filing", () => {
    const tx = `0x${"b".repeat(64)}`;
    expect(moveSource({ ...base, sourceRefs: [tx] })?.href).toBe(`https://polygonscan.com/tx/${tx}`);
    expect(moveSource({ ...base, id: "ks:1", source: "kalshi", marketId: "KXNBA-1", wallet: null, url: "https://kalshi.com/markets/kxnba/nba-games/kxnba-1" })?.href)
      .toBe("https://kalshi.com/markets/kxnba/nba-games/kxnba-1");
    expect(moveSource({ ...base, source: "sec", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/" })?.href)
      .toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/");
    // A link that isn't the real source is never shown.
    expect(moveSource({ ...base, source: "sec", url: "https://example.com/x" })).toBeNull();
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_proof_${process.pid}`;

describe.skipIf(!URL0)("the settled record in Postgres", () => {
  let admin: pg.Client, pool: pg.Pool, db: Db;
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

  it("the SQL gives the same record as the rows, and refunded moves stay in the settled list", async () => {
    const mv = (i: number, r: (typeof ROWS)[number]): Move => ({
      id: `pm:p${i}`, source: "polymarket", marketId: `C${i}`, eventTitle: "Chiefs vs Bills", marketTitle: "Chiefs vs Bills", outcome: "Chiefs",
      outcomeSide: "yes", amount: r.amount, avgPrice: r.avgPrice, wallet: base40, walletName: null, at: NOW - i * 60_000, lastAt: NOW - i * 60_000,
      fills: 1, tab: "sports", league: "NFL", category: "sports", url: null, result: null, settledAt: null, sourceRefs: null,
    });
    const base40 = `0x${"2".padStart(40, "0")}`;
    await upsertMoves(db, ROWS.map((r, i) => mv(i, r)));
    for (const [i, r] of ROWS.entries()) if (r.result) await pool.query(`update terminal.moves set result = $1, settled_at = now() where id = $2`, [r.result, `pm:p${i}`]);
    const sqlR = await settledRecord(db);
    const pure = recordOf(ROWS);
    expect(sqlR).not.toBeNull();
    expect([sqlR!.won, sqlR!.lost, sqlR!.refunded]).toEqual([pure.won, pure.lost, pure.refunded]);
    expect(sqlR!.oddsPct).toBeCloseTo(pure.oddsPct!, 6);
    expect(sqlR!.net).toBeCloseTo(pure.net, 4);
    const settled = await listMoves(db, { settled: true, limit: 10 });
    expect(settled.map(m => m.result).sort()).toEqual(["lost", "void", "won", "won"]);
    // Pages: offset walks the list with no repeats.
    const p1 = await listMoves(db, { settled: true, limit: 2 });
    const p2 = await listMoves(db, { settled: true, limit: 2, offset: 2 });
    expect(new Set([...p1, ...p2].map(m => m.id)).size).toBe(4);
  });
});
