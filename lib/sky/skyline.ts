/* The money skyline: the last 24 hours' biggest real bets (lib/sky/skyline.ts), drawn as glass bars by the 3D hero
 * (components/sky/SkylineScene.ts) and by its static SVG fallback (components/sky/SkylineSvg.tsx). One layout for both:
 * a radial golden-angle spiral, the biggest bet in the middle; a bar's height grows with log(dollars).
 * Server: skyBets (from terminal.moves, combos left out). Pure: skyLayout, barHeight, betLine. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { notComboSql } from "@/lib/moves/combos";
import { artFor, sideFirst } from "@/lib/sky/art";
import { fullTeamNames } from "@/lib/sports/team-names";
import { catOf, catSql, type Cat } from "@/lib/nx/data";

export type { SkyBet } from "./sky-pure";
import type { SkyBet } from "./sky-pure";

export const SKY_MAX = 40;
const DAY = 86_400_000;

/** The biggest bets of the last 24 hours (up to SKY_MAX), biggest first; `cats` narrows to those categories. */
export async function skyBets(db: Db, now: number, o: { cats?: readonly Cat[] | null; where?: SQL | null; limit?: number } = {}): Promise<SkyBet[]> {
  const conds = [sql`hidden_at is null`, sql`source in ('polymarket', 'kalshi')`, notComboSql, sql`at > ${new Date(now - DAY)}`, sql`at <= ${new Date(now)}`, sql`avg_price > 0`, sql`avg_price < 1`];
  if (o.cats?.length) conds.push(sql`(${sql.join(o.cats.map(c => catSql(c)), sql` or `)})`);
  if (o.where) conds.push(o.where);
  const r = await db.execute(sql`select id, source, market_id, amount::float as amount, outcome, outcome_side, avg_price::float as price, at, market_title, event_title, tab, league, category
    from terminal.moves where ${sql.join(conds, sql` and `)} order by amount desc limit ${o.limit ?? SKY_MAX}`);
  return (r.rows as Array<{ id: string; source: "polymarket" | "kalshi"; market_id: string; amount: number; outcome: string | null; outcome_side: string; price: number; at: string | Date;
    market_title: string; event_title: string | null; tab: string; league: string | null; category: string | null }>).map(x => {
    const title = fullTeamNames(x.market_title, x.league);
    const side = fullTeamNames(x.outcome ?? (x.outcome_side === "yes" ? "Yes" : "No"), x.league);
    const cat = catOf({ tab: x.tab, category: x.category, text: `${x.event_title ?? ""} ${x.market_title}` });
    return { id: x.id, venue: x.source, marketId: x.market_id, amount: Number(x.amount), side, price: Number(x.price), at: new Date(x.at).getTime(), title,
      art: sideFirst(artFor({ tab: x.tab, league: x.league, title, event: x.event_title, cat, yesLabel: x.outcome ?? undefined }), side, title) };
  });
}

export { barHeight, betLine, skyLayout } from "./sky-pure";
