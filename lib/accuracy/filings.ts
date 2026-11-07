/* The Form 4 database accuracy check (docs/INSIDIR-V3.md §6; V2 §2's Coming soon rule): n random stored transaction
 * lines (default 20), each re-read from its filing on EDGAR and compared field by field, plus the filing's own row.
 * /filings and /insiders stay Coming soon until a run of 20 passes on production and `filings` is added to
 * FEATURES_READY. Run by the worker every hour ("accuracy:filings") and by hand with `npm run check:filings`.
 * A source that can't be reached is "skipped", never a mismatch. Every line is stored in terminal.accuracy_checks
 * (what: "form4"). */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accuracyChecks } from "@/lib/db/schema";
import { tradeFromRow, filingRow } from "@/lib/stocks/filings";
import { readOwnership, tradeRows } from "@/lib/stocks/history";
import type { SecClient } from "@/lib/stocks/sec";

export const FILINGS_CHECK_ROWS = 20;
export type Status = "ok" | "mismatch" | "skipped";
export interface FilingCheckLine { target: string; label: string; status: Status; problems: string[] }

const same = (a: number | null, b: number | null, tol: number) => (a === null || b === null ? a === b : Math.abs(a - b) <= tol);

/** One stored line (a terminal.insider_trades row as SQL returns it) against its filing re-read from EDGAR, and the
 *  line's terminal.filings row when given (null: there should be one and there isn't). Throws only when EDGAR can't be
 *  reached. */
export async function checkTradeLine(sec: SecClient, raw: Record<string, unknown>, filing?: Record<string, unknown> | null): Promise<string[]> {
  const t = tradeFromRow(raw);
  const m = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//.exec(t.url);
  if (!m || m[2] !== t.accession) return ["link is not this filing on sec.gov"];
  const got = await readOwnership(sec, `https://www.sec.gov/Archives/edgar/data/${m[1]}/${t.accession}/`);
  if (!got) return ["no ownership XML in the filing"];
  const line = tradeRows(got.ownership, t.accession, 0, t.url).find(r => r.line === t.line && r.ownerCik === t.ownerCik);
  if (!line) return ["line not in the filing"];
  const errs: string[] = [];
  const cmp = (name: string, ours: unknown, theirs: unknown) => { if ((ours ?? null) !== (theirs ?? null)) errs.push(`${name} ${String(ours)} vs filing ${String(theirs)}`); };
  cmp("form", t.form, line.form);
  cmp("code", t.code, line.code);
  cmp("acquired/disposed", t.acquiredDisposed, line.acquiredDisposed);
  cmp("derivative", t.derivative, line.derivative);
  cmp("date", t.tradeDate, line.tradeDate);
  cmp("issuer", t.issuerCik, line.issuerCik);
  cmp("direct", t.direct, line.direct);
  cmp("10b5-1", t.plan10b5_1, line.plan10b5_1);
  if (!same(t.shares, line.shares ?? null, 0)) errs.push(`shares ${t.shares} vs filing ${line.shares}`);
  if (!same(t.price, line.price ?? null, 0.00005)) errs.push(`price ${t.price} vs filing ${line.price}`);
  if (!same(t.value, line.value ?? null, 0.01)) errs.push(`value ${t.value} vs filing ${line.value}`);
  if (!same(t.ownedAfter, line.ownedAfter ?? null, 0)) errs.push(`owned after ${t.ownedAfter} vs filing ${line.ownedAfter}`);
  if (filing === undefined) return errs;
  if (filing) {
    const f = filingRow(got.ownership, t.accession, 0, t.url);
    cmp("filing form", filing.form, f.form);
    cmp("filing issuer", filing.issuer_cik, f.issuerCik);
    cmp("filing period", filing.period ?? null, f.period ?? null);
    cmp("filing lines", Number(filing.lines), f.lines);
  } else errs.push("no filings row for this line");
  return errs;
}

/** One run: n random lines, checked and stored. */
export async function runFilingsCheck(db: Db, sec: SecClient | null, opts: { rows?: number; now?: number } = {}): Promise<{ runAt: number; lines: FilingCheckLine[] }> {
  const runAt = opts.now ?? Date.now();
  const rows = (await db.execute(sql`select t.*, row_to_json(f) as filing from terminal.insider_trades t
    left join terminal.filings f on f.accession = t.accession
    where t.form is not null and f.accession is not null order by random() limit ${opts.rows ?? FILINGS_CHECK_ROWS}`)).rows as Array<Record<string, unknown>>;
  const lines: FilingCheckLine[] = [];
  for (const r of rows) {
    const base = { target: `${r.accession}:${r.owner_cik}:${r.line}`, label: `${r.owner_name} · ${r.code} · ${r.company}`.slice(0, 160) };
    if (!sec) { lines.push({ ...base, status: "skipped", problems: ["SEC_USER_AGENT is not set"] }); continue; }
    try {
      const errs = await checkTradeLine(sec, r, r.filing as Record<string, unknown> | null);
      lines.push({ ...base, status: errs.length ? "mismatch" : "ok", problems: errs });
    } catch (e) {
      lines.push({ ...base, status: "skipped", problems: [`source unavailable: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`] });
    }
  }
  if (lines.length) await db.insert(accuracyChecks).values(lines.map(l => ({ runAt: new Date(runAt), kind: "profile" as const, what: "form4", target: l.target, label: l.label, status: l.status, problems: l.problems })));
  return { runAt, lines };
}

/** Passed: exactly `rows` lines checked, every one ok (a skipped line is not a pass). Pure. */
export const passed = (lines: readonly FilingCheckLine[], rows = FILINGS_CHECK_ROWS): boolean => lines.length >= rows && lines.every(l => l.status === "ok");
