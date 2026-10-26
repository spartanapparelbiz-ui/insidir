/* The 30-second "How it works": three panels, one sentence each, with the same real numbers as the landing page's
 * example (55¢ + 40¢; the fees come from the real fee functions in components/landing/HowItWorks exampleMath).
 * On the landing page, and once on the Terminal the first time someone opens it (FirstVisit). */
import { money } from "@/lib/simple";
import "./simple.css";

/** The example's math for 100 of each (from components/landing/HowItWorks exampleMath, passed in to avoid a cycle). */
export interface ExampleMath { cost: number; fees: number; payout: number; profit: number }

export function Explainer({ m, heading = "h2", id = "how-h" }: { m: ExampleMath; heading?: "h2" | "h3"; id?: string }) {
  const H = heading;
  return (
    <div className="ex" role="group" aria-labelledby={id}>
      <H id={id} className="ex__h">How it works</H>
      <ol className="ex__panels">
        <li className="ex__panel">
          <span className="ex__n">1</span>
          <p className="ex__line">Two apps sell the same bet.</p>
          <div className="ex__pic" aria-hidden="true">
            <span className="ex__chip"><span className="dim">Kalshi</span> Hawks win?</span>
            <span className="ex__chip"><span className="dim">Polymarket</span> Hawks win?</span>
          </div>
        </li>
        <li className="ex__panel">
          <span className="ex__n">2</span>
          <p className="ex__line">Sometimes they disagree on the price.</p>
          <div className="ex__pic">
            <span className="ex__chip"><span className="dim">Kalshi</span> YES <b className="mono">55¢</b></span>
            <span className="ex__chip"><span className="dim">Polymarket</span> YES <b className="mono">60¢</b>, so NO is <b className="mono">40¢</b></span>
          </div>
        </li>
        <li className="ex__panel">
          <span className="ex__n">3</span>
          <p className="ex__line">Buy both sides, keep the difference.</p>
          <div className="ex__pic">
            <span className="ex__sum">YES <b className="mono">55¢</b> + NO <b className="mono">40¢</b> = <b className="mono">95¢</b> in. <b className="mono">$1</b> back.</span>
            <span className="ex__small">Do it 100 times: put in {money(m.cost)}, get {money(m.payout)} back. You keep {money(m.profit)} after fees.</span>
          </div>
        </li>
      </ol>
    </div>
  );
}
