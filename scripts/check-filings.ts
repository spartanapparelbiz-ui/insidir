/* The Form 4 database accuracy check by hand (lib/accuracy/filings.ts; the worker runs it every hour). Picks n random
 * stored transaction lines (default 20), re-reads each from its filing on SEC EDGAR, stores and prints the result, and
 * exits 0 only when all n match: that pass is what lets `filings` go into FEATURES_READY (docs/INSIDIR-V3.md §6).
 *   DATABASE_URL=... SEC_USER_AGENT="Name email@example.com" npx tsx scripts/check-filings.ts [--n 20] */
import { closeDb, getDb } from "@/lib/db";
import { FILINGS_CHECK_ROWS, passed, runFilingsCheck } from "@/lib/accuracy/filings";
import { SecClient } from "@/lib/stocks/sec";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) || d : d; };

async function main() {
  const n = arg("--n", FILINGS_CHECK_ROWS);
  const sec = SecClient.fromEnv();
  if (!sec) console.error("SEC_USER_AGENT is not set: every line will be skipped.");
  const r = await runFilingsCheck(getDb(), sec, { rows: n });
  for (const l of r.lines) console.log(`${l.status.padEnd(8)}  ${l.label.slice(0, 70).padEnd(70)}  ${l.problems.join("; ")}`);
  const ok = passed(r.lines, n);
  console.log(`\n${r.lines.filter(l => l.status === "ok").length} of ${r.lines.length} lines match EDGAR. ${ok ? "PASSED" : `NOT PASSED (needs ${n} of ${n})`}.`);
  await closeDb();
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
