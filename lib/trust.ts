/* The facts behind the trust block (components/TrustBlock.tsx), read from the database: the settled record (every
 * move whose market has settled, won or lost, the same rows as /results) and the latest hourly accuracy check.
 * Nothing here is typed in by hand. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";

export interface TrustFacts {
  settled: { won: number; lost: number; refunded: number } | null;
  accuracy: { runAt: number; ok: number; checked: number } | null;
}

export async function trustFacts(db: Db): Promise<TrustFacts> {
  const tabs = liveTabs();
  const [s, a] = await Promise.all([
    db.execute(sql`select count(*) filter (where result = 'won')::int as won, count(*) filter (where result = 'lost')::int as lost,
      count(*) filter (where result = 'void')::int as refunded from terminal.moves where result is not null and hidden_at is null
      and tab in (${sql.join(tabs.map(t => sql`${t}`), sql`, `)})`),
    db.execute(sql`select run_at, count(*) filter (where status = 'ok')::int as ok, count(*) filter (where status <> 'skipped')::int as checked
      from terminal.accuracy_checks where run_at = (select max(run_at) from terminal.accuracy_checks) group by run_at`),
  ]);
  const sr = s.rows[0] as { won: number; lost: number; refunded: number } | undefined;
  const ar = a.rows[0] as { run_at: string; ok: number; checked: number } | undefined;
  return {
    settled: sr && sr.won + sr.lost + sr.refunded > 0 ? { won: Number(sr.won), lost: Number(sr.lost), refunded: Number(sr.refunded) } : null,
    accuracy: ar && Number(ar.checked) > 0 ? { runAt: new Date(ar.run_at).getTime(), ok: Number(ar.ok), checked: Number(ar.checked) } : null,
  };
}
