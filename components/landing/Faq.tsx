/* FAQ, as <details>. Honest answers in one or two sentences each; shared (a subset) with /pricing. The one place
 * the word "arbitrage" appears, explained. */
import type { ReactNode } from "react";
import Link from "next/link";
import { RISK_QUESTION } from "./model";

export type FaqId = "what" | "risk" | "trade" | "fees" | "settle" | "where" | "iphone" | "cancel";


export const FAQ: Array<{ id: FaqId; q: string; a: ReactNode }> = [
  { id: "what", q: "What is this, in plain words?", a: (
    <p>Two apps sometimes sell the same bet at different prices, so you buy YES on one and NO on the other for less than $1 and get $1 back either way. Traders call this arbitrage; we call it a price gap, and we find them for you.</p>
  ) },
  { id: "risk", q: RISK_QUESTION, a: (
    <p>No, it is not risk-free. Both buys must go through at our prices, and both apps must pick the same winner, or you can lose money.</p>
  ) },
  { id: "trade", q: "Do you trade for me?", a: <p>No. You buy on each app yourself, and we never ask for your passwords or keys.</p> },
  { id: "fees", q: "How are fees counted?", a: <p>Every number already takes off both apps&apos; fees. We use the fee you pay when you buy right away, which is the higher one.</p> },
  { id: "settle", q: "What if the two apps pick different winners?", a: <p>That is the main risk, so we read both apps&apos; rules and mark each deal &ldquo;Same rules? Yes, Check or No&rdquo;. Every time it went wrong is in <Link href="/receipts">past deals</Link>.</p> },
  { id: "where", q: "Can I use Polymarket where I live?", a: <p>In the US, we only show Kalshi and Polymarket US, the apps open to US users. Outside the US, check your local rules first.</p> },
  { id: "iphone", q: "How do alerts work on iPhone?", a: <p>Tap Share, then Add to Home Screen. Open Insidir from the new icon and turn on alerts.</p> },
  { id: "cancel", q: "Can I cancel anytime?", a: <p>Yes, with one click in Settings. You keep access until the end of the month you paid for.</p> },
];

export function Faq({ ids, title = "Questions" }: { ids?: readonly FaqId[]; title?: string }) {
  const items = ids ? FAQ.filter(f => ids.includes(f.id)) : FAQ;
  return (
    <section className="sec" id="faq" data-section="faq" aria-labelledby="faq-h">
      <h2 id="faq-h" className="sec__h">{title}</h2>
      <div className="lp-faq">
        {items.map(f => (
          <details key={f.id} className="lp-faq__item" id={`faq-${f.id}`}>
            <summary>{f.q}</summary>
            <div className="lp-faq__a">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
