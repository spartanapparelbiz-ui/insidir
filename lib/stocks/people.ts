/* People (docs/INSIDIR-V3.md §3): an officer, director or 10% owner by their reporting-owner CIK, and every company
 * they file Forms 3, 4 and 5 for (every board they sit on, as far as those forms show). The name is as filed, put in
 * normal order; the relationship and title are as filed on their latest filing at each company. Nothing from outside
 * the filings: no photos, no biographies, no estimated wealth. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

export interface Seat {
  issuerCik: string; company: string; ticker: string | null;
  isDirector: boolean; isOfficer: boolean; isTenPercent: boolean; officerTitle: string | null; role: string;
  firstFiled: Date; lastFiled: Date; filings: number; lastUrl: string; lastForm: string;
}
export interface Person { cik: string; name: string; seats: Seat[] }

/** A person's companies, the latest relationship at each first. null when no filing names them. */
export async function personByCik(db: Db, cik: string): Promise<Person | null> {
  const id = String(Number(cik));
  if (!/^\d{1,10}$/.test(id) || id === "0") return null;
  const who = JSON.stringify([{ cik: id }]);
  const r = await db.execute(sql`
    with mine as (
      select f.issuer_cik, f.company, f.ticker, f.filed_at, f.url, f.form, o.value as owner
      from terminal.filings f, jsonb_array_elements(f.owners) o
      where f.owners @> ${who}::jsonb and o.value->>'cik' = ${id}
    ), latest as (
      select distinct on (issuer_cik) issuer_cik, company, ticker, owner, url, form from mine order by issuer_cik, filed_at desc
    )
    select l.issuer_cik, l.company, l.ticker, l.owner, l.url, l.form, min(m.filed_at) as first_filed, max(m.filed_at) as last_filed, count(*)::int as filings
    from latest l join mine m on m.issuer_cik = l.issuer_cik
    group by l.issuer_cik, l.company, l.ticker, l.owner, l.url, l.form
    order by max(m.filed_at) desc`);
  const rows = r.rows as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  const seats: Seat[] = rows.map(x => {
    const o = (x.owner ?? {}) as { name?: string; role?: string; isDirector?: boolean; isOfficer?: boolean; isTenPercent?: boolean; officerTitle?: string | null };
    return {
      issuerCik: String(x.issuer_cik), company: String(x.company), ticker: (x.ticker as string | null) ?? null,
      isDirector: Boolean(o.isDirector), isOfficer: Boolean(o.isOfficer), isTenPercent: Boolean(o.isTenPercent), officerTitle: o.officerTitle ?? null, role: String(o.role ?? "An insider"),
      firstFiled: new Date(x.first_filed as string), lastFiled: new Date(x.last_filed as string), filings: Number(x.filings), lastUrl: String(x.url), lastForm: String(x.form),
    };
  });
  const name = String(((rows[0]!.owner ?? {}) as { name?: string }).name ?? `CIK ${id}`);
  return { cik: id, name, seats };
}

/** People whose name matches, for the watchlist form and search (at most `limit`). */
export async function findPeople(db: Db, q: string, limit = 10): Promise<Array<{ cik: string; name: string }>> {
  const like = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
  const r = await db.execute(sql`select owner_cik as cik, max(owner_name) as name from terminal.insider_trades where owner_name ilike ${like} group by owner_cik order by max(filed_at) desc limit ${limit}`);
  return r.rows as Array<{ cik: string; name: string }>;
}
