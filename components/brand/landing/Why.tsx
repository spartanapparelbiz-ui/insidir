/* The landing's story, shown not told:
 *   Why Insidir: the problem in four rows (what you can't see today → what Insidir shows you).
 *   How it works: three steps.
 *   See it work: the demo player (./Demo.tsx), recordings of the live site, big. */
import type { CSSProperties } from "react";
import { HOW, PROBLEM, STAGES } from "@/lib/brand/copy";
import { slotPhoto } from "@/lib/brand/images";
import { Lines, m } from "../Bits";
import { Stage } from "../Stage";
import { Demo } from "./Demo";

export function WhyStage() {
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("why"), dark: 0.62 }} testid="why" labelledBy="why-h">
      <div className="b-head">
        <Lines id="why-h" lines={STAGES.why} size={64} />
        <p className="b-sub" {...m("lift", 0.4)}>{PROBLEM.h1.join(" ")} {PROBLEM.sub}</p>
      </div>
      <ol className="b-why" data-stagger="" data-testid="why-rows">
        {PROBLEM.rows.map(([pain, fix], i) => (
          <li key={i} className="b-glass b-why__row" data-m="settle" style={{ "--d": `${0.5 + i * 0.08}s` } as CSSProperties}>
            <span className="b-why__n b-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="b-why__pain">{pain}</span>
            <span className="b-why__fix">{fix}</span>
          </li>
        ))}
      </ol>
    </Stage>
  );
}

export function HowStage() {
  return (
    <Stage testid="how" labelledBy="how-h" className="b-stage--how">
      <div className="b-head"><Lines id="how-h" lines={STAGES.how} size={64} /></div>
      <ol className="b-how" data-testid="how-steps">
        {HOW.map((s, i) => (
          <li key={s.t} className="b-how__step" data-m="settle" style={{ "--d": `${0.45 + i * 0.1}s` } as CSSProperties}>
            <span className="b-how__n b-num">{i + 1}</span>
            <h3 className="b-how__t">{s.t}</h3>
            <p className="b-how__d">{s.d}</p>
          </li>
        ))}
      </ol>
    </Stage>
  );
}

export function WatchStage() {
  return (
    <Stage testid="watch" labelledBy="watch-h" className="b-stage--watch">
      <div className="b-head">
        <Lines id="watch-h" lines={STAGES.watch} size={64} />
        <p className="b-sub" {...m("lift", 0.4)}>{STAGES.watchSub}</p>
      </div>
      <Demo />
    </Stage>
  );
}
