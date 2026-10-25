/* 9. The closing CTA, and the sticky bottom bar on phones (.stickycta hides itself at 900px+). */
import Link from "next/link";
import { LOCK_LINE } from "@/lib/copy";

export function FinalCta({ checkout }: { checkout: string }) {
  return (
    <section className="sec lp-final" data-section="final" aria-labelledby="final-h">
      <h2 id="final-h" className="sec__h">See what the two apps disagree on today.</h2>
      <p className="sec__p">{LOCK_LINE}</p>
      <div className="lp-hero__ctas">
        <Link className="btn btn--primary" href="/terminal">See live deals</Link>
        <a className="btn btn--secondary" href={checkout} data-checkout="final">Start for $39</a>
      </div>
    </section>
  );
}

export function StickyCta({ checkout }: { checkout: string }) {
  return (
    <div className="stickycta" role="region" aria-label="Get started">
      <Link className="btn btn--primary" href="/terminal">See live deals</Link>
      <a className="btn btn--secondary" href={checkout} data-checkout="sticky">Start for $39</a>
    </div>
  );
}
