/* The Bet Briefing (a market's page, /briefing): before you bet, what it actually takes to win, what it costs and
 * pays, how the price got here, who's on each side, how they're playing it, when the money came in, the better price,
 * and the honest read, in that order. Server-rendered from lib/briefing (already gated: a visitor's copy holds only
 * the first line of each section, side-neutral until the market settles). Information, not advice. */
import { Pill } from "@/components/system";
import { GET_CTA } from "@/lib/copy";
import type { GatedBriefing } from "@/lib/briefing/gate";
import "@/app/briefing.css";

export function BetBriefing({ b }: { b: GatedBriefing }) {
  return (
    <div className="bb" data-testid="bet-briefing" data-origin={b.origin}>
      {b.sections.map((s, i) => (
        <section key={s.key} className="bb__sec" data-testid="briefing-section" data-key={s.key} aria-labelledby={`bb-${s.key}`}>
          <h3 className="bb__h" id={`bb-${s.key}`}><span className="bb__n">{i + 1}</span>{s.title}</h3>
          {s.lines.map((l, j) => <p key={j} className="bb__line">{l}</p>)}
        </section>
      ))}
      {b.locked ? (
        <div className="bb__lock" data-testid="briefing-locked">
          <p className="b-small">Members get every line: who&apos;s on each side and their records, how they&apos;re playing it, and the honest read. Plus Watch my bet.</p>
          <Pill href="/go" data-checkout="briefing">{GET_CTA}</Pill>
        </div>
      ) : null}
      <p className="b-small bb__foot">Information, not advice. Built from Polymarket&apos;s rules and prices and Insidir&apos;s own data on $1M+ wallets; every number is computed, never guessed.</p>
    </div>
  );
}
