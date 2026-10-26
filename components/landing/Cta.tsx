/* 9. The closing CTA. Same single goal as the hero: into the feed. */
import Link from "next/link";
import { LOCK_LINE } from "@/lib/copy";

export function FinalCta({ cta }: { cta: string }) {
  return (
    <section className="sec lp-final" data-section="final" aria-labelledby="final-h">
      <h2 id="final-h" className="sec__h">See where the two apps disagree today.</h2>
      <p className="sec__p">{LOCK_LINE}</p>
      {/* The page's one primary action is the hero's; this repeats it, quieter. */}
      <Link className="btn btn--secondary btn--big lp-cta" href="/terminal">{cta}</Link>
    </section>
  );
}
