/* The landing FAQ (docs/INSIDIR-V2.md §6), also on /pricing. Honest, short answers. */
import { PLANS, TRIAL } from "@/lib/plans";

export const FAQ_V2: Array<{ id: string; q: string; a: string }> = [
  { id: "what", q: "What is Insidir?", a: "Insidir shows you the biggest bets on sports and prediction markets the second they happen, in plain English. You can follow the traders behind them and get a ping when they move." },
  { id: "data", q: "Where does the data come from?", a: "Public records only: Polymarket trades (public on the Polygon blockchain), Kalshi's public trade feed (trades there are anonymous), and for Stocks, SEC EDGAR filings. Every card links its source, and every hour we re-read random moves and trader stats from the source; anything that doesn't match is hidden until it does." },
  { id: "advice", q: "Is this financial advice?", a: "No. We show what happened: who put money on what, and how it ended. We never tell you what to buy. Big traders lose too." },
  { id: "us", q: "Can I use it in the US?", a: "Yes. Everyone sees every move. If you're in the US, we only link you to apps that work in the US, like Kalshi." },
  { id: "alerts", q: "How do alerts work?", a: "Follow a trader or a market and we send a push to your phone or an email when they make a big move. On iPhone, add Insidir to your Home Screen first, then turn alerts on." },
  { id: "cancel", q: "How do I cancel?", a: `One click in Account. No emails, no calls. The trial is $${TRIAL.price} for ${TRIAL.days} days, then $${PLANS.insidir.price}/mo until you cancel.` },
  { id: "who", q: "Who's behind it?", a: "Insidir is built by Aethric LLC, Pompano Beach, FL. Write to hello@aethric.llc and a person will answer." },
];

export function FaqV2({ title = "Questions" }: { title?: string }) {
  return (
    <section className="sec2 sec2--alt" id="faq" aria-labelledby="faq-h">
      <div className="wrap faq2">
        <h2 id="faq-h" className="sec2__h">{title}</h2>
        <div className="faq2__list">
          {FAQ_V2.map(f => (
            <details key={f.id} className="faq2__item" id={`faq-${f.id}`}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export const faqSchemaV2 = (): string => JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: FAQ_V2.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
