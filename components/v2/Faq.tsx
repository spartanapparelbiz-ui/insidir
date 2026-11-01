/* The landing FAQ (docs/INSIDIR-V2.md §6), also on /pricing. Honest, short answers. */
import { PLANS } from "@/lib/plans";
import { WHAT_IS } from "@/lib/copy";

export const FAQ_V2: Array<{ id: string; q: string; a: string }> = [
  { id: "what", q: "What is Insidir?", a: WHAT_IS },
  { id: "paste", q: "What can I paste?", a: "A Polymarket or Kalshi market link, or the market in plain words, like “Senate control” or “Lakers tonight”. If it could be more than one market, you pick from three. You can also upload a sportsbook slip screenshot; we read it and drop it, never keep it." },
  { id: "proven", q: "What counts as proven money?", a: "Dollars from wallets with 30 or more settled positions and a positive followable return: what following every one of their positions at the price Insidir showed, plus one point, would have made. Losses count. Kalshi trades are anonymous, so proven money comes from Polymarket wallets." },
  { id: "unusual", q: "What makes a bet unusual?", a: "A fresh wallet with no history, a size that is big next to that market's own day of trading, or money on the long-shot side. Unusual describes the data. It never means anyone knows anything." },
  { id: "us", q: "Can I use it in the US?", a: "Yes. In the US you see Kalshi's price and Open goes to Kalshi. We never send you to a site that doesn't serve the US." },
  { id: "who-wallet", q: "Do you say who is behind a wallet?", a: "No. A wallet is shown by its short address only. We never try to identify the person behind it." },
  { id: "advice", q: "Is this financial advice?", a: "No. A Read shows what the data says right now. We never tell you what to bet." },
  { id: "cancel", q: "How do I cancel?", a: `In Account: pick one reason and confirm. No emails, no calls. Cancel in the first 7 days and you only pay the $1. After that it's $${PLANS.insidir.price}/month and you keep access until the month you paid for ends.` },
  { id: "who", q: "Who's behind it?", a: "Insidir is built by Aethric LLC, Pompano Beach, FL. Write to hello@aethric.llc and a person will answer." },
];

/** Billing questions, for /pricing (with the most asked general ones). */
export const FAQ_PRICING: Array<{ id: string; q: string; a: string }> = [
  { id: "price", q: "How much is it?", a: `Try it 7 days for $1, then $${PLANS.insidir.price}/month for everything: unlimited Reads on any Polymarket or Kalshi market. One plan, no tiers. Cancel anytime.` },
  FAQ_V2.find(f => f.id === "cancel")!,
  { id: "pay", q: "How do I pay?", a: "On Whop's secure checkout, right on this site. Apple Pay, Google Pay or card. We never see or store your card. Manage or cancel your subscription anytime on your Whop orders page." },
  { id: "login", q: "How do I log in?", a: "Tap Log in, then Continue. You sign in with your Whop account: Google, Apple or email. There's no password to remember here." },
  FAQ_V2.find(f => f.id === "advice")!,
];

/** Every question in one place, for /faq. */
export const FAQ_ALL = [...FAQ_V2, ...FAQ_PRICING.filter(f => !FAQ_V2.some(g => g.id === f.id))];

export function FaqV2({ title = "Questions", items = FAQ_V2, level = 2 }: { title?: string; items?: Array<{ id: string; q: string; a: string }>; level?: 1 | 2 }) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <section className="sec2 sec2--alt" id="faq" aria-labelledby="faq-h">
      <div className="pg faq2">
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
