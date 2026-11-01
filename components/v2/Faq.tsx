/* The landing FAQ (docs/INSIDIR-V2.md §6), also on /pricing. Honest, short answers. */
import { PLANS } from "@/lib/plans";
import { WHAT_IS } from "@/lib/copy";

export const FAQ_V2: Array<{ id: string; q: string; a: string }> = [
  { id: "what", q: "What is Insidir?", a: WHAT_IS },
  { id: "winner", q: "What makes a wallet a winner?", a: "A record you could actually have followed. For every settled position we take the price Insidir showed it at, add one point for slippage, and hold it to settlement. Only wallets and trackers with 30 or more settled positions can be copied, ranked by that return. Losses count. Past results, not a promise." },
  { id: "copy", q: "What does copying do?", a: "Every new bet from the wallet or tracker you copy shows up on your home page: the price they got, the price you can still get, a one-line note and an Open button. You choose $10, $50 or $100 a move, and Insidir tracks what that would have made since you started. Insidir never places a bet for you." },
  { id: "us", q: "Can I use it in the US?", a: "Yes. If you're in the US, Open goes to the same market on Kalshi at Kalshi's price when there is one. When there isn't, the move is view only. We never send you to a site that doesn't serve the US." },
  { id: "who-wallet", q: "Do you say who is behind a wallet?", a: "No. A wallet is shown by its short address and its record. We never try to identify the person behind it." },
  { id: "data", q: "Where does the data come from?", a: "Public records only: Polymarket trades (public on the Polygon blockchain) and Kalshi's public trade feed (trades there are anonymous). Every move links its source, and every hour we re-read random positions from the source; anything that doesn't match is hidden until it does." },
  { id: "advice", q: "Is this financial advice?", a: "No. We show what happened: who put money on what, and how it ended. We never tell you what to buy. Winners lose too." },
  { id: "cancel", q: "How do I cancel?", a: `One tap in Account. No emails, no calls. Cancel in the first 7 days and you only pay the $1. After that it's $${PLANS.insidir.price}/month and you keep access until the month you paid for ends.` },
  { id: "who", q: "Who's behind it?", a: "Insidir is built by Aethric LLC, Pompano Beach, FL. Write to hello@aethric.llc and a person will answer." },
];

/** Billing questions, for /pricing (with the most asked general ones). */
export const FAQ_PRICING: Array<{ id: string; q: string; a: string }> = [
  { id: "price", q: "How much is it?", a: `Try it 7 days for $1, then $${PLANS.insidir.price}/month for everything: copy any winner, every new bet live, your P&L at your size. One plan, no tiers. Cancel anytime.` },
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
