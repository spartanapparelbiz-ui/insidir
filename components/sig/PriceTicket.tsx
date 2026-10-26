/* The price ticket (docs/BRIEF.md §4.2): a neutral "app card" with the venue's name in plain text, the outcome
 * (YES/NO) and the price in JetBrains Mono. Never styled like Kalshi or Polymarket: no logos, no brand colours.
 * `from` sets which edge it slides in from in the hero sequence; `state` greys it when stale or paused. */
import type { ReactNode } from "react";

export function PriceTicket({ venue, side, price, from, state = "live", note }: {
  venue: string;
  side: "yes" | "no";
  /** The price, already formatted (or a RollNumber, so a live tick rolls). */
  price: ReactNode;
  from?: "left" | "right";
  state?: "live" | "stale" | "paused";
  note?: ReactNode;
}) {
  return (
    <div className={`ticket${from ? ` ticket--from-${from}` : ""}${state !== "live" ? " ticket--grey" : ""}`}>
      <p className="ticket__venue">{venue}</p>
      <p className="ticket__side">{side === "yes" ? "YES" : "NO"}</p>
      <p className="ticket__price">{price}</p>
      {note ? <p className="ticket__note">{note}</p> : null}
    </div>
  );
}
