/* 6. Safety lights: how the two rule texts are compared. The trust builder. */
import Link from "next/link";
import { SafetyLight } from "@/components/SafetyLight";
import type { Safety } from "@/lib/types";

const LIGHTS: Array<{ s: Safety; what: string }> = [
  { s: "green", what: "Same event, same date, same resolution source. Shown in the feed." },
  { s: "yellow", what: "Minor differences in the wording or timing. Shown, with the differences spelled out so you can read both rules." },
  { s: "red", what: "The rules differ in a way that could settle the two sides differently. Hidden by default." },
];

export function SafetySection() {
  return (
    <section className="sec" data-section="safety" aria-labelledby="safety-h">
      <h2 id="safety-h" className="sec__h">Every pair gets a safety light</h2>
      <p className="sec__p">A lock only works if both markets settle the same way. So for every pair we compare both rule texts side by side: the event, the date and time it resolves, and the source each one resolves on.</p>
      <ul className="lp-lights">
        {LIGHTS.map(l => <li key={l.s} className="card"><SafetyLight safety={l.s} /><p className="small muted">{l.what}</p></li>)}
      </ul>
      <p className="small muted">The light is our reading of the rules, not a promise. When two markets did settle differently, it shows in the <Link href="/receipts">receipts log</Link>.</p>
    </section>
  );
}
