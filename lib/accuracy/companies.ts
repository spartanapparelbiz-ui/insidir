/* The company financials accuracy check (docs/INSIDIR-V3.md §6; V2 §2's Coming soon rule): n stored XBRL facts
 * (default 20, from up to 5 companies, spread evenly), each looked up again in the company's companyfacts file re-read from
 * EDGAR: the same concept, unit, period and filing must carry the same value. Company reports stay Coming soon until a
 * run of 20 passes on production and `companies` is in FEATURES_READY. Run hourly by the worker
 * ("accuracy:companies") and by hand with `npm run check:companies`. Stored in accuracy_checks (what: "xbrl"). The
 * financials page computes everything from these stored facts (lib/stocks/company.ts), so the facts are what's checked. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accuracyChecks } from "@/lib/db/schema";
import { parseFacts } from "@/lib/stocks/company";
import { cik10 } from "@/lib/stocks/form13f";
import type { SecClient } from "@/lib/stocks/sec";
import type { FilingCheckLine } from "./filings";

export const COMPANY_CHECK_ROWS = 20;

export async function runCompaniesCheck(db: Db, sec: SecClient | null, opts: { rows?: number; now?: number } = {}): Promise<{ runAt: number; lines: FilingCheckLine[] }> {
  const runAt = opts.now ?? Date.now(), n = opts.rows ?? COMPANY_CHECK_ROWS;
  // Up to 5 companies, n facts spread evenly over however many there are (one company gives all n).
  const rows = (await db.execute(sql`with picked as (select cik from terminal.companies where facts_at is not null and exists (select 1 from terminal.company_facts f where f.cik = companies.cik) order by random() limit 5),
      ranked as (select f.*, c.name, row_number() over (partition by f.cik order by random()) as k from picked p join terminal.companies c on c.cik = p.cik join terminal.company_facts f on f.cik = p.cik)
    select * from ranked where k <= ceil(${n}::float / (select count(*) from picked)) order by k, random() limit ${n}`)).rows as Array<Record<string, unknown>>;
  const lines: FilingCheckLine[] = [];
  const byCik = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) byCik.set(String(r.cik), [...(byCik.get(String(r.cik)) ?? []), r]);
  for (const [cik, list] of byCik) {
    let source: ReturnType<typeof parseFacts> | null = null, err: string | null = null;
    if (sec) {
      try { source = parseFacts(await sec.json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10(cik)}.json`), "0000-00-00"); }
      catch (e) { err = `source unavailable: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`; }
    }
    for (const r of list) {
      const base = { target: `${cik}:${r.concept}:${r.start}:${r.end}:${r.accn}`, label: `${r.name} · ${String(r.concept).split(":")[1]} · ${r.start ? `${r.start} to ` : ""}${r.end}`.slice(0, 160) };
      if (!sec) { lines.push({ ...base, status: "skipped", problems: ["SEC_USER_AGENT is not set"] }); continue; }
      if (!source) { lines.push({ ...base, status: "skipped", problems: [err ?? "source unavailable"] }); continue; }
      const hit = source.find(f => f.concept === r.concept && f.unit === r.unit && f.start === r.start && f.end === r.end && f.accn === r.accn);
      const problems = !hit ? ["not in the company's facts on EDGAR"] : hit.value !== Number(r.value) ? [`value ${r.value} vs EDGAR ${hit.value}`] : hit.form !== r.form ? [`form ${r.form} vs EDGAR ${hit.form}`] : [];
      lines.push({ ...base, status: problems.length ? "mismatch" : "ok", problems });
    }
  }
  if (lines.length) await db.insert(accuracyChecks).values(lines.map(l => ({ runAt: new Date(runAt), kind: "profile" as const, what: "xbrl", target: l.target, label: l.label, status: l.status, problems: l.problems })));
  return { runAt, lines };
}
