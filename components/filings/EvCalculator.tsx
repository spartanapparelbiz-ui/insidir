"use client";
/* The expected-value calculator (docs/RESEARCH-DESK.md §2.4, §8.4). Every field starts empty and every number is the
 * member's: Insidir never fills, suggests or estimates a probability. The result shows the formula with their numbers
 * in it, in neutral type (no good/bad colours). Runs entirely in the browser. */
import { useId, useState } from "react";
import { expectedValue, parseInput } from "@/lib/filings/calc";
import { signedUsd } from "@/lib/filings/format";
import { CalcLine } from "./Bits";

export function EvCalculator() {
  const [price, setPrice] = useState("");
  const [prob, setProb] = useState("");
  const [count, setCount] = useState("");
  const [fee, setFee] = useState("");
  const id = useId();
  const r = expectedValue({ priceCents: parseInput(price), probabilityPct: parseInput(prob), contracts: parseInput(count), feePerContract: parseInput(fee) });
  const field = (key: string, label: string, value: string, set: (v: string) => void, hint: string) => (
    <label className="fl-field" htmlFor={`${id}-${key}`}><span className="fl-label">{label}</span>
      <input id={`${id}-${key}`} className="fl-in fl-in--n" inputMode="decimal" autoComplete="off" value={value} onChange={e => set(e.target.value)} aria-describedby={`${id}-${key}-h`} />
      <span id={`${id}-${key}-h`} className="fl-faint">{hint}</span>
    </label>
  );
  return (
    <section aria-labelledby={`${id}-h`} data-testid="fl-ev">
      <div className="fl-pane__bar"><h3 id={`${id}-h`} className="fl-h">Expected value · $1 contract</h3><span className="fl-faint">Your probability; Insidir doesn&apos;t estimate it.</span></div>
      <div className="fl-section">
        <div className="fl-grid">
          {field("price", "Price you pay ¢", price, setPrice, "1 to 99")}
          {field("prob", "Your probability %", prob, setProb, "your own number")}
          {field("count", "Contracts", count, setCount, "whole number")}
          {field("fee", "Fee / contract $", fee, setFee, "type 0 if none")}
        </div>
      </div>
      <div className="fl-section">
        {r ? (
          <>
            <dl className="fl-result" data-testid="fl-ev-result">
              <div><dt>EV per contract</dt><dd>{signedUsd(r.perContract)}</dd></div>
              <div><dt>All contracts</dt><dd>{signedUsd(r.total)}</dd></div>
              <div><dt>Break-even probability</dt><dd>{r.breakevenPct}%</dd></div>
            </dl>
            <p className="fl-formula">p × (1 − price) − (1 − p) × price − fee = {r.formula}</p>
          </>
        ) : <p className="fl-faint" data-testid="fl-ev-waiting">Fill in all four fields to see the arithmetic.</p>}
        <CalcLine />
      </div>
    </section>
  );
}
