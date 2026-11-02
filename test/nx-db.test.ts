/* The new pages' data in a throwaway Postgres next to E2E_DATABASE_URL: market cards (proven split in dollars, a Kalshi
 * pair folded into its Polymarket market and turned when inverted, one card per title, categories), related markets,
 * the Library's search, and the member home's "+$X proven on YES since…" from read_seen. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { marketCards, relatedCards, suggestionChips, tickerBets } from "@/lib/nx/data";
import { memberTabs } from "@/lib/nx/member";
import { movedLine } from "@/components/nx/MemberHome";
import { yourMarkets } from "@/lib/read/member";
import { library, saveRead } from "@/lib/read/store";
import type { ReadData } from "@/lib/read/types";

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_nx_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;
const H = 3_600_000, NOW = Date.now();
const WIN = "0x" + "a".repeat(40);

async function move(id: string, o: { source?: "polymarket" | "kalshi"; market: string; title: string; event?: string; side: "yes" | "no"; outcome: string; amount: number; tab?: string; category?: string; league?: string | null; wallet?: string | null; at?: number }) {
  await pool.query(`insert into terminal.moves (id, source, market_id, event_title, market_title, outcome, outcome_side, amount, avg_price, wallet, at, last_at, tab, league, category)
    values ($1, $2, $3, $4, $5, $6, $7, $8, 0.5, $9, $10, $10, $11, $12, $13)`,
    [id, o.source ?? "polymarket", o.market, o.event ?? o.title, o.title, o.outcome, o.side, o.amount, o.wallet ?? null, new Date(o.at ?? NOW - H), o.tab ?? "markets", o.league ?? null, o.category ?? "politics"]);
}
const data = (key: string, q: string, yes: number, no: number, share: number | null): ReadData => ({
  key, question: q, event: null, yesLabel: "Yes", noLabel: "No", closeTime: null, polymarket: { venue: "polymarket", id: key.slice(2), title: q, url: null, yesPrice: 0.6, volume24h: null }, kalshi: null,
  proven: { yes: { dollars: yes, wallets: 1 }, no: { dollars: no, wallets: 0 }, wallets: 1, yesShare: share }, bets: [],
  prices: { yes: { polymarket: 0.6, kalshi: null, best: "polymarket" }, no: { polymarket: 0.4, kalshi: null, best: "polymarket" } }, line: null, at: NOW });

describe.skipIf(!URL0)("the new pages' data, in Postgres", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
    // A proven wallet by its public record.
    await pool.query(`insert into terminal.wallet_pnl (wallet, closed, closed_at_least, pnl, read_at) values ($1, 40, false, 9000, now())`, [WIN]);
    // Senate control on Polymarket, paired (inverted) with Kalshi: Kalshi's YES $50K is Polymarket's NO.
    await move("s1", { market: "0xsen", title: "Which party wins Senate control?", event: "Senate control", side: "yes", outcome: "Republicans", amount: 120_000, wallet: WIN });
    await move("s2", { market: "0xsen", title: "Which party wins Senate control?", event: "Senate control", side: "no", outcome: "Democrats", amount: 30_000 });
    await move("s3", { source: "kalshi", market: "KXSENATE-26", title: "Will Democrats win the Senate?", event: "Senate control", side: "yes", outcome: "Yes", amount: 50_000 });
    await pool.query(`insert into terminal.pairs (id, data, safety) values ('ps', $1, 'green')`, [JSON.stringify({ id: "ps", a: { venue: "polymarket", id: "0xsen" }, b: { venue: "kalshi", id: "KXSENATE-26" }, inverted: true, method: "llm", confidence: 0.9, safety: "green", safetyNotes: [], blocked: false })]);
    await pool.query(`insert into terminal.market_info (source, market_id, yes_price, history_key) values ('polymarket', '0xsen', 0.62, 'tok1')`);
    // House control; two listings with the same words (one card); a game.
    await move("h1", { market: "0xhouse", title: "Which party wins House control?", event: "House control", side: "no", outcome: "Democrats", amount: 80_000 });
    await move("h2", { market: "0xhouse2", title: "Which party wins House control?", event: "House control", side: "yes", outcome: "Republicans", amount: 10_000 });
    await move("g1", { market: "0xkcden", title: "Kansas City at Denver", event: "NFL: Chiefs vs. Broncos", side: "yes", outcome: "Kansas City", amount: 200_000, tab: "sports", category: "sports", league: "NFL" });
  }, 60_000);
  afterAll(async () => { await pool?.end(); await admin?.query(`drop database if exists ${NAME}`); await admin?.end(); });

  it("cards: proven split in dollars, a pair folded and turned, one card per title, full team names, categories", async () => {
    const all = await marketCards(db, NOW, { limit: 10 });
    const sen = all.find(c => c.id === "0xsen")!;
    expect(sen).toMatchObject({ venue: "polymarket", cat: "elections", title: "Which party wins Senate control?", yesLabel: "Republicans", noLabel: "Democrats", yesPrice: 0.62, historyKey: "tok1" });
    expect(sen.proven).toEqual({ yes: 120_000, no: 0 });
    expect(sen.money).toEqual({ yes: 120_000, no: 80_000 }); // $30K + Kalshi's $50K YES, which is Polymarket's NO
    expect(all.filter(c => c.title === "Which party wins House control?")).toHaveLength(1);
    const game = all.find(c => c.id === "0xkcden")!;
    expect(game).toMatchObject({ cat: "sports", title: "Chiefs at Broncos" });
    expect((await marketCards(db, NOW, { cat: "sports" })).map(c => c.id)).toEqual(["0xkcden"]);
    expect((await marketCards(db, NOW, { cat: "elections", sort: "proven" }))[0]!.id).toBe("0xsen");
    expect((await marketCards(db, NOW, { q: "house" })).map(c => c.id)).toEqual(["0xhouse"]);
  });

  it("chips: the busiest market in each category; related markets; the ticker; the member's tabs", async () => {
    expect((await suggestionChips(db, NOW)).map(c => c.id)).toEqual(["0xsen", "0xkcden"]);
    const rel = await relatedCards(db, NOW, { key: "p:0xsen", event: "Senate control", polymarket: { id: "0xsen" }, kalshi: null });
    expect(rel.map(c => c.id)).toEqual(["0xhouse"]);
    const t = await tickerBets(db, NOW);
    expect(t.find(b => b.id === "g1")).toMatchObject({ amount: 200_000, side: "Chiefs", price: 0.5, cat: "sports" });
    expect(memberTabs(["nfl", "elections"]).map(x => x.label)).toEqual(["NFL", "Elections"]);
    expect(memberTabs([]).map(x => x.label)).toEqual(["Elections", "Sports", "Economy", "World", "Culture"]);
  });

  it("the Library: every Read, newest first, searchable by what they asked; moved when proven money moved since", async () => {
    await saveRead(db, { userId: "u1", visitorId: null, input: "text", data: data("p:0xsen", "Which party wins Senate control?", 100_000, 0, 1), ms: 1, question: "senate control" }, NOW - 2 * H);
    await saveRead(db, { userId: "u1", visitorId: null, input: "text", data: data("p:0xhouse", "Which party wins House control?", 0, 50_000, 0), ms: 1, question: "house" }, NOW - H);
    await saveRead(db, { userId: null, visitorId: null, input: "refresh", data: data("p:0xsen", "Which party wins Senate control?", 120_000, 80_000, 0.6), ms: 1 }, NOW);
    const all = await library(db, "u1");
    expect(all.map(r => [r.question, r.moved])).toEqual([["house", false], ["senate control", true]]);
    expect((await library(db, "u1", { q: "senate" })).map(r => r.question)).toEqual(["senate control"]);
  });

  it("member home: proven money's dollar change since the last visit", async () => {
    // First visit: nothing to compare. Then the market's latest Read (anyone's) changes.
    const first = await yourMarkets(db, "u1", NOW);
    expect(first.find(m => m.key === "p:0xsen")!.since).toBeNull();
    await saveRead(db, { userId: null, visitorId: null, input: "refresh", data: data("p:0xsen", "Which party wins Senate control?", 240_000, 80_000, 0.75), ms: 1 }, NOW + H);
    const later = await yourMarkets(db, "u1", NOW + 2 * H);
    const m = later.find(x => x.key === "p:0xsen")!;
    expect(m.since).toEqual({ yes: 120_000, no: 0, at: NOW });
    expect(m.moved).not.toBeNull();
    expect(movedLine(m, NOW + 2 * H)).toMatch(/^\+\$120K proven on Yes since /);
    expect(m.price).toBe(0.6);
  });
});
