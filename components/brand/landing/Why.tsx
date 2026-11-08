/* Two landing stages that show instead of tell:
 *   Why Insidir: the problem it solves, in four rows (what you can't see today → what Insidir shows you).
 *   See it work: three real recordings of the live site on a phone (qa/record-site.ts), playing on a loop. */
import type { CSSProperties } from "react";
import { PROBLEM, STAGES, WATCH } from "@/lib/brand/copy";
import { slotPhoto } from "@/lib/brand/images";
import { Lines, m } from "../Bits";
import { Stage } from "../Stage";

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

export function WatchStage() {
  return (
    <Stage testid="watch" labelledBy="watch-h" className="b-stage--watch">
      <div className="b-head">
        <Lines id="watch-h" lines={STAGES.watch} size={64} />
        <p className="b-sub" {...m("lift", 0.4)}>{STAGES.watchSub}</p>
      </div>
      <div className="b-watch" data-testid="watch-videos">
        {WATCH.map((w, i) => (
          <figure key={w.id} className="b-watch__item" data-m="settle" style={{ "--d": `${0.5 + i * 0.1}s` } as CSSProperties}>
            <div className="b-phone">
              <video className="b-phone__screen" autoPlay muted loop playsInline preload="metadata" poster={`/media/site-${w.id}-poster.jpg`}
                aria-label={`${w.t}: a recording of the live site`} data-testid="watch-video">
                <source src={`/media/site-${w.id}.webm`} type="video/webm" />
                <source src={`/media/site-${w.id}.mp4`} type="video/mp4" />
              </video>
            </div>
            <figcaption className="b-watch__cap"><b>{w.t}</b><span>{w.d}</span></figcaption>
          </figure>
        ))}
      </div>
    </Stage>
  );
}
