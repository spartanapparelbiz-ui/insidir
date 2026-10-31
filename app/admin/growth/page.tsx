/* /admin/growth: the pay prompt's funnel, by delay variant: shown → clicked → checkout started → paid, each person
 * once, with the rate between steps and how people closed it; and by page and by UTM source, so the delay can be
 * tuned (A/B 6s vs. 12s, 50/50 by visitor cookie). Behind the admin sign-in. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import "../../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Growth", robots: { index: false, follow: false } };

type Row = { k: string; shown: number; clicked: number; started: number; paid: number };
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

async function funnel(by: "variant" | "page" | "utm", days: number): Promise<Row[]> {
  const key = by === "variant" ? sql`coalesce(e.variant, '?')` : by === "page" ? sql`coalesce(e.props->>'page', '?')` : sql`coalesce(nullif(e.props->>'utm', ''), '(none)')`;
  const r = await getDb().execute(sql`with shown as (
      select distinct on (e.visitor_id) e.visitor_id, ${key} as k from terminal.events e where e.name = 'popup_shown' and e.at > now() - make_interval(days => ${days}) order by e.visitor_id, e.at)
    select s.k, count(*)::int as shown,
      count(*) filter (where exists (select 1 from terminal.events c where c.visitor_id = s.visitor_id and c.name = 'popup_click'))::int as clicked,
      count(*) filter (where exists (select 1 from terminal.events c where c.visitor_id = s.visitor_id and c.name = 'checkout_start' and c.props->>'where' = 'popup'))::int as started,
      count(*) filter (where exists (select 1 from terminal.events c where c.visitor_id = s.visitor_id and c.name = 'paid_seen'))::int as paid
    from shown s group by s.k order by count(*) desc limit 30`);
  return r.rows as Row[];
}

export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) return <main className="wrap app adm"><h1 className="page__h">Growth</h1><p className="muted">Sign in on <Link href="/admin">/admin</Link> first.</p></main>;
  const d = (await searchParams).days;
  const days = d === "7" ? 7 : d === "90" ? 90 : 30;
  const [byVariant, byPage, byUtm, closes] = hasDatabase() ? await Promise.all([
    funnel("variant", days), funnel("page", days), funnel("utm", days),
    getDb().execute(sql`select coalesce(props->>'how', '?') as how, count(*)::int as n from terminal.events where name = 'popup_dismissed' and at > now() - make_interval(days => ${days}) group by 1 order by 2 desc`).then(r => r.rows as Array<{ how: string; n: number }>),
  ]).catch(() => [[], [], [], []] as [Row[], Row[], Row[], Array<{ how: string; n: number }>]) : [[], [], [], []];
  const table = (title: string, rows: Row[], testid: string) => (
    <section className="block" data-testid={testid}>
      <h2 className="block__h">{title}</h2>
      <table className="table"><thead><tr><th></th><th className="r">Shown</th><th className="r">Clicked</th><th className="r">Checkout</th><th className="r">Paid</th><th className="r">Show → paid</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.k}><td>{r.k}</td><td className="r">{r.shown}</td><td className="r">{r.clicked} <span className="muted">{pct(r.clicked, r.shown)}</span></td><td className="r">{r.started} <span className="muted">{pct(r.started, r.clicked)}</span></td><td className="r">{r.paid} <span className="muted">{pct(r.paid, r.started)}</span></td><td className="r">{pct(r.paid, r.shown)}</td></tr>)}</tbody></table>
    </section>
  );
  return (
    <main className="wrap app adm">
      <h1 className="page__h">Growth: the pay prompt</h1>
      <p className="muted">Last {days} days · <Link href="/admin/growth?days=7">7</Link> · <Link href="/admin/growth?days=30">30</Link> · <Link href="/admin/growth?days=90">90</Link>. Each visitor counted once, from the first time it was shown.</p>
      {table("By delay variant", byVariant, "growth-variant")}
      {table("By page", byPage, "growth-page")}
      {table("By UTM source", byUtm, "growth-utm")}
      <section className="block"><h2 className="block__h">How it was closed</h2><ul>{closes.map(c => <li key={c.how}>{c.how}: {c.n}</li>)}</ul></section>
    </main>
  );
}
