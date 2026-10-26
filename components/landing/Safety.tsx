/* 5. Safety lights: one short section. Three lights, what each means. */
import Link from "next/link";
import { SAFETY_MEANING, SafetyLight } from "@/components/SafetyLight";
import type { Safety } from "@/lib/types";

const ORDER: Safety[] = ["green", "yellow", "red"];

export function SafetySection() {
  return (
    <section className="sec" data-section="safety" aria-labelledby="safety-h">
      <h2 id="safety-h" className="sec__h">Same question, same rules?</h2>
      <p className="sec__p">A deal only pays if both apps settle it the same way. We read both rule texts for every pair and give it a light.</p>
      <dl className="lights">
        {ORDER.map(s => (
          <div key={s} className="lights__row">
            <dt><SafetyLight safety={s} /></dt>
            <dd>{SAFETY_MEANING[s]}</dd>
          </div>
        ))}
      </dl>
      <p className="small muted">The light is our reading of the rules, not a promise. When two apps did settle differently, it&apos;s in the <Link href="/receipts">receipts</Link>.</p>
    </section>
  );
}
