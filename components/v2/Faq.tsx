/* The landing FAQ (docs/INSIDIR-V2.md §6), also on /pricing. Honest, short answers. */
import { PLANS, TRIAL } from "@/lib/plans";
import { WHAT_IS } from "@/lib/copy";

export const FAQ_V2: Array<{ id: string; q: string; a: string }> = [
  { id: "what", q: "What is Insidir?", a: WHAT_IS },
  { id: "data", q: "Where does the data come from?", a: "Public records only: Polymarket trades (public on the Polygon blockchain), Kalshi's public trade feed (trades there are anonymous), and for Stocks, SEC EDGAR filings. Every card links its source, and every hour we re-read random moves and trader stats from the source; anything that doesn't match is hidden until it does." },
  { id: "advice", q: "Is this financial advice?", a: "No. We show what happened: who put money on what, and how it ended. We never tell you what to buy. Big traders lose too." },
  { id: "us", q: "Can I use it in the US?", a: "Yes. Everyone sees every move. If you're in the US, we only link you to apps that work in the US, like Kalshi." },
  { id: "alerts", q: "How do alerts work?", a: "Follow a trader or a market and we send a push to your phone or an email when they make a big move. On iPhone, add Insidir to your Home Screen first, then turn alerts on." },
  { id: "cancel", q: "How do I cancel?", a: `One click in Account. No emails, no calls. The trial is $${TRIAL.price} for ${TRIAL.days} days, then $${PLANS.insidir.price}/mo until you cancel.` },
  { id: "who", q: "Who's behind it?", a: "Insidir is built by Aethric LLC, Pompano Beach, FL. Write to hello@aethric.llc and a person will answer." },
];

/** Billing questions, for /pricing (with the most asked general ones). */
export const FAQ_PRICING: Array<{ id: string; q: string; a: string }> = [
  { id: "trial", q: "What do I get for $1?", a: `Everything in Insidir for ${TRIAL.days} days: every big move live, trader records and follows. After ${TRIAL.days} days it's $${PLANS.insidir.price}/mo until you cancel.` },
  FAQ_V2.find(f => f.id === "cancel")!,
  { id: "switch", q: "Can I go Pro later?", a: "Yes. Start with Insidir and tap Go Pro in Account whenever you want more." },
  { id: "pay", q: "How do I pay?", a: "Through Whop, our payment provider, on its secure checkout. We never see or store your card." },
  { id: "free", q: "Is the free plan really free?", a: "Yes, no card needed. You see the same moves, 30 minutes late, and every result, won or lost." },
  FAQ_V2.find(f => f.id === "advice")!,
];

/** Every question in one place, for /faq. */
export const FAQ_ALL = [...FAQ_V2, ...FAQ_PRICING.filter(f => !FAQ_V2.some(g => g.id === f.id))];

export function FaqV2({ title = "Questions", items = FAQ_V2, level = 2 }: { title?: string; items?: Array<{ id: string; q: string; a: string }>; level?: 1 | 2 }) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <section className="sec2 sec2--alt" id="faq" aria-labelledby="faq-h">
      <div className="wrap faq2">
        <H id="faq-h" className="sec2__h rv">{title}</H>
        <div className="faq2__list">
          {items.map((f, i) => (
            <details key={f.id} className="faq2__item rv" style={{ ["--i" as string]: Math.min(i, 5) }} id={`faq-${f.id}`}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export const faqSchemaV2 = (items = FAQ_V2): string => JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: items.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
