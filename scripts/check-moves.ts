/* The accuracy check by hand (lib/accuracy/check.ts; the worker runs it every hour and acts on it). Picks n random
 * stored moves and n profile facts, re-reads each from its source, prints a table and exits 1 on any mismatch.
 * Report only: unlike the worker's run, nothing is stored, hidden or marked stale.
 *   DATABASE_URL=... npx tsx scripts/check-moves.ts [--n 20] [--profiles 20]
 * SEC moves and facts need SEC_USER_AGENT; without it they are reported as skipped. */
import { closeDb, getDb } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { checkMoves, checkProfiles, type CheckLine } from "@/lib/accuracy/check";
import { SecClient } from "@/lib/stocks/sec";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) || d : d; };
const STATUS = { ok: "ok      ", mismatch: "MISMATCH", skipped: "skipped " } as const;
const print = (l: CheckLine) => console.log(`${STATUS[l.status]}  ${l.what.padEnd(10)} ${l.label.slice(0, 70).padEnd(70)}  ${l.problems.join("; ")}`);
const sum = (ls: CheckLine[], what: string) =>
  console.log(`\n${ls.filter(l => l.status === "ok").length} of ${ls.filter(l => l.status !== "skipped").length} ${what} match the source` +
    `${ls.some(l => l.status === "skipped") ? ` (${ls.filter(l => l.status === "skipped").length} skipped)` : ""}.\n`);

async function main() {
  const db = getDb();
  const src = { poly: new PolymarketClient(), kalshi: new KalshiClient(), sec: SecClient.fromEnv() };
  const moves = await checkMoves(db, src, arg("--n", 20));
  moves.forEach(print);
  sum(moves, "moves");
  const n = arg("--profiles", 20);
  const profiles = n > 0 ? await checkProfiles(db, src, n, Date.now()) : [];
  profiles.forEach(print);
  if (n > 0) sum(profiles, "profile facts");
  await closeDb();
  process.exit([...moves, ...profiles].some(l => l.status === "mismatch") ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
