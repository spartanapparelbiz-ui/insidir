"use client";
/* Math on the amount the user types (lib/calculator.ts): how many complete sets fit, and what they cost, pay and
 * leave after fees. No recommendations. */
import { useId, useState } from "react";
import { calculate, type CalcLeg } from "@/lib/calculator";
import { LOCK_LINE } from "@/lib/copy";
import { pct } from "@/lib/format";
import { VENUE_NAME } from "@/lib/types";

const money = (v: number): string => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const REASON = {
  ok: null,
  too_small: "That amount doesn't cover one complete set with fees.",
  no_profit: "At that size the fees, rounded up, take the whole gap. Try a larger amount.",
  invalid: "Type an amount in dollars.",
} as const;

export function Calculator({ legs, payoutPerSet, maxSets }: { legs: CalcLeg[]; payoutPerSet: number; maxSets: number }) {
  const id = useId();
  const [raw, setRaw] = useState("");
  const amount = Number(raw.replace(/[$,\s]/g, ""));
  const r = calculate({ legs, payoutPerSet, maxSets }, raw.trim() ? amount : NaN);
  return (
    <section className="card calc" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="calc__h">Calculator</h2>
      <div className="field">
        <label htmlFor={`${id}-a`}>Amount ($)</label>
        <input id={`${id}-a`} className="input input--big" inputMode="decimal" placeholder="0.00" value={raw} onChange={e => setRaw(e.target.value)} autoComplete="off" />
      </div>
      {r.reason !== "ok" ? <p className="muted small" role="status">{raw.trim() ? REASON[r.reason] : "Type an amount to see the numbers."}</p> : (
        <div role="status">
          <div className="scroll-x">
            <table className="table calc__t">
              <thead><tr><th>Side</th><th className="r">Contracts</th><th className="r">Cost</th><th className="r">Fees</th></tr></thead>
              <tbody>
                {r.legs.map((l, i) => (
                  <tr key={i}><td>{l.side.toUpperCase()} · {VENUE_NAME[l.venue]}<span className="dim tiny calc__lbl">{l.label}</span></td>
                    <td className="r">{l.contracts.toLocaleString("en-US")}</td><td className="r">{money(l.cost)}</td><td className="r">{money(l.fee)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="kv">
            <div><dt>Total cost</dt><dd>{money(r.total)}</dd></div>
            <div><dt>Payout</dt><dd>{money(r.payout)}</dd></div>
            <div><dt>Profit</dt><dd className="profit">{money(r.profit)}</dd></div>
            <div><dt>ROI</dt><dd>{pct(r.roi, 2)}</dd></div>
          </dl>
          {r.capped ? <p className="muted small">Capped at the {r.sets.toLocaleString("en-US")} sets the order books can fill right now.</p> : null}
        </div>
      )}
      <p className="dim tiny">{LOCK_LINE} Fees are worked out as one fill per side at the average price; prices move.</p>
    </section>
  );
}
