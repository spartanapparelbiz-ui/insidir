/* 1. The hero: one idea, one example, one button. Above the fold on every screen, nothing else.
 *   The sentence: when two apps price the same game differently, you can buy both sides and keep the difference.
 *   The example, animated once on load (CSS, app/landing.css; none with reduced motion): YES 55¢ on Kalshi + NO 40¢
 *   on Polymarket = 95¢ in, and $1 back whichever way it ends.
 *   The button: into the live deals.
 * Everything else (a real deal right now, the numbers, pricing) starts below the fold. */
import Link from "next/link";

export function Hero({ headline, cta }: { headline: string; cta: string }) {
  return (
    <section className="hero hx" data-section="hero" aria-labelledby="hero-h">
      <h1 id="hero-h" className="hero__h">{headline}</h1>
      <figure className="hx__ex" aria-label="Example: YES on Kalshi for 55¢ plus NO on Polymarket for 40¢ is 95¢ in. One side pays $1 back.">
        <div className="hx__row" aria-hidden="true">
          <div className="hx__side hx__s1"><span className="hx__app">Kalshi</span><span className="hx__dir">YES</span><b className="hx__num">55¢</b></div>
          <span className="hx__op hx__s2">+</span>
          <div className="hx__side hx__s2"><span className="hx__app">Polymarket</span><span className="hx__dir">NO</span><b className="hx__num">40¢</b></div>
          <span className="hx__op hx__s3">=</span>
          <div className="hx__side hx__side--in hx__s3"><span className="hx__app">You put in</span><span className="hx__dir">&nbsp;</span><b className="hx__num">95¢</b></div>
        </div>
        <p className="hx__back hx__s4" aria-hidden="true"><b className="hx__dollar">$1</b> back, either way.</p>
        <figcaption className="hx__cap">Example. One side always wins and pays $1. The 5¢ gap is yours, minus fees.</figcaption>
      </figure>
      <div className="hero__cta">
        <Link className="btn btn--primary btn--big" href="/terminal">{cta}</Link>
        <span className="hero__note">Free to look. No signup.</span>
      </div>
    </section>
  );
}
