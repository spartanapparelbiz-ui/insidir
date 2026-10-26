/* The play in plain English ("Buy YES on Kalshi at 55¢ + NO on Polymarket at 40¢"). Pure, no I/O, so the browser can
 * re-word a row when a live price tick moves its prices. */
import type { Leg, OppKind } from "./types";
import { VENUE_NAME } from "./types";

type PlayLeg = Pick<Leg, "venue" | "side" | "label" | "avgPrice">;

const cents = (p: number): string => {
  const c = p * 100;
  return (c < 10 && c % 1 !== 0 ? c.toFixed(1) : String(Math.round(c))) + "¢";
};
const dollars = (v: number): string => (v >= 100 ? "$" + Math.round(v).toLocaleString("en-US") : "$" + v.toFixed(2));

/** "Buy YES on Kalshi at 55¢ + NO on Polymarket at 40¢" and the like. */
export function playText(o: { kind: OppKind; legs: readonly PlayLeg[]; gapCents: number | null }): string {
  const legs = o.legs;
  const venue = legs[0] ? VENUE_NAME[legs[0].venue] : "";
  switch (o.kind) {
    case "cross_arb":
      return legs.map((l, i) => `${i ? "" : "Buy "}${l.side.toUpperCase()} on ${VENUE_NAME[l.venue]} at ${cents(l.avgPrice)}`).join(" + ");
    case "multi_yes":
    case "multi_no": {
      const side = o.kind === "multi_yes" ? "YES" : "NO";
      const total = legs.reduce((a, l) => a + l.avgPrice, 0);
      return `Buy ${side} on all ${legs.length} outcomes on ${venue} for ${total < 1 ? cents(total) : dollars(total)} a set`;
    }
    case "ladder":
    case "implication":
      return legs.map((l, i) => `${i ? "" : "Buy "}${l.side.toUpperCase()} “${l.label}” at ${cents(l.avgPrice)}`).join(" + ") + ` on ${venue}`;
    case "second_opinion": {
      const l = legs[0];
      return l ? `${VENUE_NAME[l.venue]} prices YES at ${cents(l.avgPrice)}, ${o.gapCents ?? 0}¢ below the other venue (not a lock)` : "Price gap";
    }
  }
}
