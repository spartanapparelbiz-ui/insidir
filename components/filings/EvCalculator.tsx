"use client";
/* The expected-value calculator (docs/RESEARCH-DESK.md §2.4, §8.4). Every field starts empty and every number is the
 * member's: Insidir never fills, suggests or estimates a probability. The result shows the formula with their
 * numbers in it, in neutral type (no good/bad colours). Runs entirely in the browser. */
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
    <label className="fl-field" htmlFor={`${id}-${key}`}>{label}
      <input id={`${id}-${key}`} className="fl-input fl-input--num" inputMode="decimal" autoComplete="off" value={value} onChange={e => set(e.target.value)} aria-describedby={`${id}-${key}-h`} />
      <span id={`${id}-${key}-h`} className="fl-small">{hint}</span>
    </label>
  );
  return (
    <section className="fl-calc" aria-labelledby={`${id}-h`} data-testid="fl-ev">
      <h3 id={`${id}-h`} className="fl-h3">Expected value calculator</h3>
      <p className="fl-sub">For a contract that pays $1 if your side wins. The probability is yours; Insidir does not estimate it.</p>
      <div className="fl-grid">
        {field("price", "Price you pay (¢)", price, setPrice, "1 to 99")}
        {field("prob", "Your probability estimate (%)", prob, setProb, "0 to 100, your own number")}
        {field("count", "Contracts", count, setCount, "Whole number")}
        {field("fee", "Fee per contract ($)", fee, setFee, "Type 0 if none")}
      </div>
      {r ? (
        <dl className="fl-result" data-testid="fl-ev-result">
          <div><dt>Expected value per contract</dt><dd className="fl-mono">{signedUsd(r.perContract)}</dd></div>
          <div><dt>For all contracts</dt><dd className="fl-mono">{signedUsd(r.total)}</dd></div>
          <div><dt>Break-even probability at your price and fee</dt><dd className="fl-mono">{r.breakevenPct}%</dd></div>
          <div className="fl-result__formula"><dt>Arithmetic</dt><dd className="fl-mono">p × (1 − price) − (1 − p) × price − fee = {r.formula}</dd></div>
        </dl>
      ) : <p className="fl-small" data-testid="fl-ev-waiting">Fill in all four fields to see the arithmetic.</p>}
      <CalcLine />
    </section>
  );
}
