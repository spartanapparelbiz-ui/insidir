/* The home page's live proof strip: what Insidir has tracked in the last 30 days, how many positions this week, how
 * many accounts have a record verified from their own trades, and the last hourly accuracy check. All from the
 * database; nothing typed in by hand. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";
import { notComboSql } from "@/lib/moves/combos";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";
import { trustFacts, type TrustFacts } from "@/lib/trust";

const DAY = 86_400_000;

export interface Proof {
  volume30d: number;
  positionsWeek: number;
  verifiedAccounts: number;
  accuracy: TrustFacts["accuracy"];
  at: number;
}

export async function proofStrip(db: Db, now: number): Promise<Proof> {
  const T = sql`terminal.moves`;
  const [m, r, facts] = await Promise.all([
    db.execute(sql`select coalesce(sum(${T}.amount) filter (where ${T}.at > ${new Date(now - 30 * DAY)}), 0)::float as vol,
        count(*) filter (where ${T}.at > ${new Date(now - 7 * DAY)})::int as week
      from ${T} where ${T}.hidden_at is null and ${notComboSql} and ${T}.tab in (${sql.join(liveTabs().map(t => sql`${t}`), sql`, `)}) and ${T}.at <= ${new Date(now)}`),
    db.execute(sql`select count(*)::int as n from terminal.trader_records where resolved >= ${RECORD_MIN_RESOLVED}`),
    trustFacts(db),
  ]);
  const x = m.rows[0] as { vol: number; week: number } | undefined;
  return { volume30d: Number(x?.vol ?? 0), positionsWeek: Number(x?.week ?? 0), verifiedAccounts: Number((r.rows[0] as { n: number } | undefined)?.n ?? 0), accuracy: facts.accuracy, at: now };
}
