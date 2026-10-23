/* The Alerts inbox's extra detail (GET /v1/me/notifications?scores=1): for each insider-trade alert, the trade in one
 * plain sentence and its signal score (src/signal-score.mjs), from the largest open-market line of the filing behind it.
 * Company disclosures and amendments keep the engine's own headline and carry no score. */
import { LINE_SQL, withRole, kindOf, money, personName } from "./site-v2.mjs";
import { scoreRow } from "./signal-score.mjs";

export const ALERT_LINE_SQL = LINE_SQL + `
  WHERE t.accession=$1 AND t.transaction_code IN ('P','S') AND NOT t.derivative ORDER BY t.estimated_value DESC NULLS LAST LIMIT 1`;

const article = role => role ? (/^(CEO|CFO|COO|president|general counsel)$/.test(role) ? "the " + role : (/^[aeiou]/i.test(role) ? "an " : "a ") + role) : null;

/* "Jane Doe, a director, bought $943K of EXMP." / "3 insiders bought $4.1M of EXMP within 10 days." */
export function alertSentence(e, line) {
  const t = e.ticker || "the company";
  if (e.type === "multi_insider_purchase") {
    const n = Number(e.facts?.distinctReportingOwners) || 0, v = money(e.facts?.totalValue);
    return `${n || "Several"} insiders bought ${v ? v + " of " : ""}${t}${e.transactionDate && e.transactionDateEnd ? " within " + (Math.round((Date.parse(e.transactionDateEnd) - Date.parse(e.transactionDate)) / 864e5) + 1) + " days" : ""}.`;
  }
  if (!line) return null;
  const k = kindOf(line), who = personName(line.owner_name), r = article(line.role), v = money(line.estimated_value);
  return `${who}${r ? ", " + r + "," : ""} ${k === "buy" ? "bought" : "sold"} ${v ? v + " of " : "shares of "}${t}${k === "sell" && line.rule_10b5_1 === true ? " under a pre-set plan" : ""}.`;
}

export async function withScores(query, list) {
  const items = list.items || [];
  await Promise.all(items.map(async it => {
    const e = it.event || {};
    const acc = e.type === "multi_insider_purchase" ? (e.facts?.purchases || [])[0]?.accession : (e.accessions || [])[0];
    if (!["insider_purchase", "insider_sale", "multi_insider_purchase"].includes(e.type) || !acc) return;
    const line = withRole((await query(ALERT_LINE_SQL, [acc]).catch(() => ({ rows: [] }))).rows)[0] || null;
    it.sentence = alertSentence(e, line);
    if (line) {
      const s = await scoreRow(query, { ...line, code: line.transaction_code }).catch(() => null);
      if (s) it.score = { score: s.score, band: s.band };
      it.trade = { kind: kindOf(line), planned: kindOf(line) === "sell" && line.rule_10b5_1 === true, value: Number(line.estimated_value) || null };
    }
  }));
  return list;
}
