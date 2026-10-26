"use client";
/* Interactive gallery demos: a walkthrough whose price moves, and a live number that ticks. Example data only. */
import { useState } from "react";
import { Walkthrough } from "@/components/sig/Walkthrough";
import { RollNumber } from "@/components/ui/RollNumber";
import { CALC, WALK_LEGS } from "@/lib/dev-fixtures";

export function MovingWalkthrough() {
  const [b, setB] = useState(46);
  return (
    <div className="gal__demo">
      <button type="button" className="btn btn--secondary" onClick={() => setB(x => (x === 46 ? 47 : 46))}>Move the Polymarket US price</button>
      <Walkthrough legs={WALK_LEGS.map((l, i) => (i === 1 ? { ...l, priceCents: b } : l))}
        calc={{ ...CALC, legs: CALC.legs.map((l, i) => (i === 1 ? { ...l, avgPrice: b / 100 } : l)) }} closeTime={Date.UTC(2026, 10, 9)} />
    </div>
  );
}

export function TickingNumber() {
  const [v, setV] = useState(48);
  return (
    <div className="gal__demo">
      <p className="ticket__price"><RollNumber text={`${v}¢`} /></p>
      <button type="button" className="btn btn--secondary" onClick={() => setV(x => (x >= 52 ? 47 : x + 1))}>Tick the price</button>
    </div>
  );
}
