"use client";
/* The walkthrough (docs/BRIEF.md §4.5): three steps for one deal at the amount the user types. 1 and 2 buy each side
 * (the button opens that app at the market), 3 says what happens at payout. Plain math on the typed amount
 * (lib/calculator), nothing tailored to the person. Prices are live: when a leg's price moves, its step updates and
 * says so. Without the deal's sizes and fees (`calc` null: a free viewer, or a closed deal used as a tutorial) the
 * steps still say what to buy, and `locked` explains what's missing. */
import { useRef, useState, type ReactNode } from "react";
import { calculate, type CalcInput } from "@/lib/calculator";
import { centsText, money2 } from "@/lib/format";

export interface WalkLeg { venueName: string; side: "yes" | "no"; priceCents: number; url: string }

const DATE = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const parseAmount = (s: string): number => Number(s.replace(/[$,\s]/g, ""));

export function Walkthrough({ legs, calc, closeTime, defaultAmount = 100, locked, onAmount, closed = false }: {
  legs: readonly WalkLeg[];
  calc: CalcInput | null;
  closeTime: number | null;
  defaultAmount?: number;
  /** Shown in place of the numbers when `calc` is null (e.g. the upgrade line). */
  locked?: ReactNode;
  /** Called with each valid amount typed (analytics: amount_entered). */
  onAmount?: (amount: number) => void;
  /** A closed deal shown as a tutorial: buttons still open the apps, the copy says it's closed. */
  closed?: boolean;
}) {
  const [raw, setRaw] = useState(String(defaultAmount));
  const first = useRef(legs.map(l => l.priceCents));
  const amount = parseAmount(raw);
  const r = calc && Number.isFinite(amount) && amount > 0 ? calculate(calc, amount) : null;
  const ok = r?.reason === "ok";
  return (
    <section className="walk" aria-label="How to take this deal">
      {calc ? (
        <label className="walk__amount">
          <span className="walk__q">How much do you want to put in?</span>
          <span className="walk__field">
            <span className="walk__cur" aria-hidden="true">$</span>
            <input className="input walk__input" inputMode="decimal" autoComplete="off" value={raw}
              onChange={e => { setRaw(e.target.value); const v = parseAmount(e.target.value); if (Number.isFinite(v) && v > 0) onAmount?.(v); }} />
          </span>
        </label>
      ) : null}
      {calc && !ok && r ? (
        <p className="walk__warn" role="status">{r.reason === "too_small" ? "That's less than one set costs with fees. Try a bigger amount."
          : r.reason === "no_profit" ? "At that size the fees take the whole gap. Try a bigger amount." : "Type an amount in dollars."}</p>
      ) : null}
      <ol className="walk__steps">
        {legs.map((l, i) => {
          const leg = ok ? r!.legs[i] : undefined;
          const was = first.current[i];
          const moved = was !== undefined && was !== l.priceCents;
          return (
            <li key={i} className="walk__step">
              <span className="walk__n" aria-hidden="true">{i + 1}</span>
              <div className="walk__body">
                <p className="walk__do">
                  Buy {leg ? <span className="mono">{leg.contracts.toLocaleString("en-US")}</span> : null} {l.side === "yes" ? "YES" : "NO"} on {l.venueName} at{" "}
                  <span className="mono">{centsText(l.priceCents)}</span>
                  {leg ? <> for <span className="mono">{money2(leg.cost + leg.fee)}</span> with fees</> : null}.
                </p>
                {moved ? <p className="walk__moved" role="status">Price moved from <span className="mono">{centsText(was)}</span> to <span className="mono">{centsText(l.priceCents)}</span>. The numbers above are updated.</p> : null}
                <a className={`btn ${i === 0 ? "btn--primary" : "btn--secondary"} walk__open`} href={l.url} target="_blank" rel="noopener noreferrer">Open {l.venueName}</a>
              </div>
            </li>
          );
        })}
        <li className="walk__step">
          <span className="walk__n" aria-hidden="true">{legs.length + 1}</span>
          <div className="walk__body">
            {ok ? (
              <p className="walk__do">Done. When it ends, one side pays <span className="mono">$1</span> a contract: <span className="mono">{money2(r!.payout)}</span>.
                {" "}You keep <span className="profit">{money2(r!.profit)}</span> after <span className="mono">{money2(r!.fees)}</span> in fees{closeTime ? <>, around {DATE.format(new Date(closeTime))}</> : null}.
                {r!.capped ? " That's the most these prices can fill right now." : ""}</p>
            ) : (
              <p className="walk__do">Done. When it ends, one side pays $1 a contract{closeTime ? <>, around {DATE.format(new Date(closeTime))}</> : null}. What you keep is that $1 minus what you paid for both sides and the fees.</p>
            )}
            <p className="walk__fine">Locks in a profit if both sides fill and both apps settle the same way.{closed ? " This deal has closed: shown as an example." : ""}</p>
          </div>
        </li>
      </ol>
      {!calc && locked ? <div className="walk__locked">{locked}</div> : null}
    </section>
  );
}
