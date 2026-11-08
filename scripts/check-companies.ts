/* The company financials accuracy check by hand (lib/accuracy/companies.ts; the worker runs it every hour). Exits 0
 * only when all n facts match EDGAR: that pass lets `companies` go into FEATURES_READY (docs/INSIDIR-V3.md §6).
 *   DATABASE_URL=... SEC_USER_AGENT="Name email@example.com" npx tsx scripts/check-companies.ts [--n 20] */
import { closeDb, getDb } from "@/lib/db";
import { COMPANY_CHECK_ROWS, runCompaniesCheck } from "@/lib/accuracy/companies";
import { passed } from "@/lib/accuracy/filings";
import { SecClient } from "@/lib/stocks/sec";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) || d : d; };

async function main() {
  const n = arg("--n", COMPANY_CHECK_ROWS);
  const sec = SecClient.fromEnv();
  if (!sec) console.error("SEC_USER_AGENT is not set: every fact will be skipped.");
  const r = await runCompaniesCheck(getDb(), sec, { rows: n });
  for (const l of r.lines) console.log(`${l.status.padEnd(8)}  ${l.label.slice(0, 80).padEnd(80)}  ${l.problems.join("; ")}`);
  const ok = passed(r.lines, n);
  console.log(`\n${r.lines.filter(l => l.status === "ok").length} of ${r.lines.length} facts match EDGAR. ${ok ? "PASSED" : `NOT PASSED (needs ${n} of ${n})`}.`);
  await closeDb();
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
