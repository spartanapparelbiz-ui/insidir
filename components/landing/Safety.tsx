/* Same rules?: one short section. Yes, Check, No, and what each means. */
import Link from "next/link";
import { SAFETY_MEANING, SafetyLight } from "@/components/SafetyLight";
import type { Safety } from "@/lib/types";

const ORDER: Safety[] = ["green", "yellow", "red"];

export function SafetySection() {
  return (
    <section className="sec" data-section="safety" aria-labelledby="safety-h">
      <h2 id="safety-h" className="sec__h">Same rules?</h2>
      <p className="sec__p">A deal only pays if both apps pick the winner the same way. We read both apps&apos; rules for every deal and answer Yes, Check or No.</p>
      <dl className="lights">
        {ORDER.map(s => (
          <div key={s} className="lights__row">
            <dt><SafetyLight safety={s} /></dt>
            <dd>{SAFETY_MEANING[s]}</dd>
          </div>
        ))}
      </dl>
      <p className="small muted">This is our reading of the rules, not a promise. When two apps did pick different winners, it&apos;s in <Link href="/receipts">past deals</Link>.</p>
    </section>
  );
}
