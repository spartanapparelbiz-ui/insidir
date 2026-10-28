/* Multi-leg combos (parlays): hidden everywhere: one "move" that is really several bets glued together is too much to
 * read and isn't a position anyone can follow. Kalshi's multivariate markets (KXMVE… tickers, titles like
 * "yes Roma,yes Como") and Polymarket's "… AND …" parlays. Pure, plus the same rule in SQL for the lists. */
import { sql } from "drizzle-orm";

/** Several "yes X"/"no Y" legs, comma separated. */
const LEGS = /(^|,)\s*(yes|no)\s+[^,]+,\s*(yes|no)\s/i;
/** A Polymarket parlay: legs joined by a capital AND ("Lakers win AND Over 220.5"). */
const AND_LEGS = /\S\s+AND\s+\S/;

export function isCombo(m: { source: string; marketId: string; marketTitle: string; outcome?: string | null; eventTitle?: string | null }): boolean {
  if (m.source === "kalshi" && /^KXMVE/i.test(m.marketId)) return true;
  if (LEGS.test(m.marketTitle) || LEGS.test(m.outcome ?? "") || LEGS.test(m.eventTitle ?? "")) return true;
  return m.source === "polymarket" && (AND_LEGS.test(m.marketTitle) || AND_LEGS.test(m.eventTitle ?? ""));
}

/** The same rule over terminal.moves (for listMoves and the record). */
export const notComboSql = sql`not (
  (terminal.moves.source = 'kalshi' and terminal.moves.market_id ilike 'KXMVE%')
  or terminal.moves.market_title ~* '(^|,)\\s*(yes|no)\\s+[^,]+,\\s*(yes|no)\\s'
  or terminal.moves.outcome ~* '(^|,)\\s*(yes|no)\\s+[^,]+,\\s*(yes|no)\\s'
  or terminal.moves.event_title ~* '(^|,)\\s*(yes|no)\\s+[^,]+,\\s*(yes|no)\\s'
  or (terminal.moves.source = 'polymarket' and (terminal.moves.market_title ~ '\\S\\s+AND\\s+\\S' or terminal.moves.event_title ~ '\\S\\s+AND\\s+\\S')))`;
