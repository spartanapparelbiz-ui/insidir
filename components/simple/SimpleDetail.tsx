/* One deal on its own page, in the Simple view: the card's sentence, the "Show me how" walkthrough, then "Same
 * rules?" with both apps' rule texts folded away. What the viewer may see comes from lib/deal-view.ts, exactly as
 * in the Pro view (components/app/DealDetail). */
import { Help } from "@/components/Help";
import type { DealOk } from "@/lib/deal-view";
import { money, simpleDeal } from "@/lib/simple";
import { SAFETY_MEANING } from "@/components/SafetyLight";
import { LockBar } from "@/components/DealRow";
import { HowTo } from "./HowTo";
import { PaysOut } from "./PaysOut";
import "./simple.css";

export function SimpleDetail({ view, now, unlockHref }: { view: DealOk; now: number; unlockHref: string }) {
  const { row, rules } = view;
  const d = simpleDeal(row);
  const tag = view.gone ? "No longer live" : row.locked ? "30 min delay" : row.stale ? "Prices may have moved" : null;
  return (
    <div className="dd sdd">
      <header className="dd-head">
        {tag ? <p className="dd-tags"><span className="tag">{tag}</span></p> : null}
        <h1 className="dd-h" tabIndex={-1}>{row.title}</h1>
        <p className="sd__buy sdd__buy">{d.buy}</p>
        {d.lock ? (
          <p className="sd__math">
            <span className="nw">Put in <b className="mono">{money(d.putIn)}</b><Help k="putIn" /></span> → get <b className="mono">{money(d.back)}</b> back{" "}
            <span className="nw">either way<Help k="back" />.</span>{" "}
            You keep <span className="nw"><b className="mono sd__keep">{money(d.keep)}</b><Help k="keep" /></span> after fees.
          </p>
        ) : <p className="dd-note">This is a tip, not a locked deal. One app sells YES for {row.gapCents ?? 0}¢ less than the other. If you buy, you could lose what you put in.</p>}
        <p className="sd__facts">
          <span className="sd__fact"><span className={`light light--${row.safety}`}>Same rules? {d.sameRules}.</span><Help k="rules" /></span>
          {d.lock ? <span className="sd__fact">Works up to {d.upTo !== null ? <b className="mono">{money(d.upTo)}</b>
            : <a className="sd__unlock" href={unlockHref} data-unlock="detail-size"><LockBar w={44} /> members only</a>}.<Help k="upTo" /></span> : null}
          <span className="sd__fact">Pays out <PaysOut closeTime={row.closeTime} now={now} />.<Help k="pays" /></span>
        </p>
      </header>

      {d.lock && !view.gone ? <HowTo row={row} unlockHref={unlockHref} />
        : view.gone ? <p className="dd-note">This deal is over. The prices above are from when it closed.</p> : null}

      <section className="dd-sec" id="rules" aria-labelledby="rules-h">
        <h2 id="rules-h" className="dd-sec__h">Same rules? {d.sameRules}</h2>
        <p className="muted">{SAFETY_MEANING[row.safety]}</p>
        {row.safetyNotes.length ? <ul className="notes">{row.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
        <details className="sdd__rules">
          <summary>Read both apps&apos; rules</summary>
          {rules.map(r => (
            <article key={r.key} className="rule">
              <p className="rule__venue">{r.venueName}</p>
              <p className="rule__h">{r.title ?? r.fallback}</p>
              <div className="rule__text">{r.rules === null ? "We don't have this rule text yet. Open the app to read it." : r.rules || "The app gives no rule text for this one."}</div>
            </article>
          ))}
        </details>
      </section>
    </div>
  );
}
