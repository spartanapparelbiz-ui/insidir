/* 8. FAQ, as <details>. Honest answers; shared (a subset) with /pricing. */
import type { ReactNode } from "react";
import Link from "next/link";
import { RISK_QUESTION } from "./model";

export type FaqId = "what" | "risk" | "trade" | "fees" | "settle" | "where" | "iphone" | "cancel";


export const FAQ: Array<{ id: FaqId; q: string; a: ReactNode }> = [
  { id: "what", q: "What is this, in plain words?", a: (
    <>
      <p>Sometimes two apps put different prices on the same yes-or-no question. If you buy YES on one and NO on the other, and the two together cost less than $1, you get $1 back whichever way it ends. The difference, after fees, is yours.</p>
      <p>Traders call this arbitrage: buying the same thing in two places at two prices. Insidir finds these gaps and does the math. It does not guess who will win.</p>
    </>
  ) },
  { id: "risk", q: RISK_QUESTION, a: (
    <>
      <p>No. It is not risk-free. A deal locks in a profit only if both sides fill at the prices shown and both markets settle the same way. Things that can go wrong:</p>
      <ul>
        <li>Your order may not fill, or only part of it fills, and the other side is left on its own.</li>
        <li>Prices move. By the time you place the second leg, the gap can be gone.</li>
        <li>The two markets can settle differently, even when they look like the same question.</li>
        <li>Fees. We include them in every number, but a venue can change its fees.</li>
      </ul>
    </>
  ) },
  { id: "trade", q: "Do you trade for me?", a: <p>No. Insidir only shows the math. You place every trade yourself, on each venue, in your own account. We never ask for or hold your exchange passwords or API keys.</p> },
  { id: "fees", q: "How are fees counted?", a: <p>Every profit and ROI number is after taker fees on every leg, as if you pay the worst case: you take the price on the book rather than waiting as a maker. Kalshi&apos;s fee is 7% × contracts × price × (1 − price) (times the series&apos; fee multiplier where Kalshi sets one), rounded up to the cent per fill; Polymarket charges a rate by market category on the same formula. When an order needs several price levels to fill, each level is charged separately.</p> },
  { id: "settle", q: "What if the markets settle differently?", a: <p>That is the main risk. Two venues can word the same event differently, use a different deadline, or resolve on a different source. The safety light compares both rule texts for exactly that, and red pairs are hidden by default. The <Link href="/receipts">receipts log</Link> shows every case, including the ones that settled differently.</p> },
  { id: "where", q: "Can I use Polymarket where I live?", a: <p>If you are in the US, Insidir only shows Kalshi and Polymarket US, the venues available to US users. Outside the US, check your local rules before you trade.</p> },
  { id: "iphone", q: "How do alerts work on iPhone?", a: <p>Add Insidir to your Home Screen (Share → Add to Home Screen), open it from the icon, and turn on alerts. iOS only allows web push for home-screen apps.</p> },
  { id: "cancel", q: "Can I cancel anytime?", a: <p>Yes. One click in Settings, handled through Whop. You keep access until the end of the period you paid for.</p> },
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
