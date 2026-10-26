/* Checks the cron matcher against the in-memory matcher: runs matchMarkets over every market the last run kept and
 * compares its pairs with terminal.pairs. Run after `npm run match` or scripts/bench-match.ts.
 *   DATABASE_URL=... npx tsx scripts/check-match-equivalence.ts */
import { getDb, closeDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import { matchMarkets, createMemoryCache } from "@/lib/matching";
async function main() {
  const db = getDb();
  const run = (await db.execute(sql`select max(id) as id from terminal.match_runs`)).rows[0] as { id: number };
  const k = (await db.execute(sql`select data from terminal.markets where venue='kalshi' and seen_run=${run.id}`)).rows.map((r: any) => r.data);
  const p = (await db.execute(sql`select data from terminal.markets where venue='polymarket' and seen_run=${run.id}`)).rows.map((r: any) => r.data);
  const byId = (x: { id: string }, y: { id: string }) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  k.sort(byId); p.sort(byId);
  const mem = await matchMarkets(k, p, { cache: createMemoryCache(), overrides: new Map(), now: Date.now() });
  const memSet = new Set(mem.pairs.map(x => x.id));
  const dbSet = new Set((await db.execute(sql`select id from terminal.pairs where not blocked`)).rows.map((r: any) => r.id));
  const onlyMem = [...memSet].filter(x => !dbSet.has(x)), onlyDb = [...dbSet].filter(x => !memSet.has(x));
  console.log(`in-memory ${memSet.size} pairs, database matcher ${dbSet.size}; only in-memory ${onlyMem.length}, only database ${onlyDb.length}`);
  console.log(onlyMem.slice(0, 5), onlyDb.slice(0, 5));
  await closeDb();
}
main();
