/* The brand's words, said once here and used by the landing, /go, the Read and the member home. Landing rules: section
 * headlines of six words or fewer, at most one sentence under each, numbers over adjectives, no paragraphs. Prices always
 * from lib/plans.ts. Never "guaranteed" or "risk-free" (test/compliance.test.ts). */
import { PLANS, TRIAL } from "@/lib/plans";

export const HERO = {
  h1: ["Stop betting", "blind."],
  sub: ["Every market has wallets that have made millions.", "Insidir shows you which side they're on before you bet,", "and pings you the moment they move."],
} as const;
export const ASK_PLACEHOLDER = "Paste your bet: a Kalshi or Polymarket link, or type it";
export const PROBLEM = {
  h1: ["You're not betting", "against the market."],
  sub: "You're betting against the wallets that have made millions.",
  rows: [
    ["You can't see who's on the other side.", "Millionaire money on every market, live."],
    ["Big bets hit X after the price moved.", "A ping the second a millionaire bets."],
    ["Leaderboards show volume, not winners.", "Every wallet's real all-time profit."],
    ["You might be paying more than you need to.", "The better price, Kalshi vs. Polymarket."],
  ],
} as const;
export const START = `Start for $${TRIAL.fee}`;
export const PAST = "Past results, not a promise.";
export const LEGAL = "Information, not financial or betting advice. Operated by Aethric LLC.";
export const STAGES = {
  live: ["Millionaire money,", "right now."],
  check: ["Check your bet", "before you place it."],
  markets: ["Every market", "people bet on."],
  pricing: ["Less than", "one bad bet."],
  pricingSub: `$${TRIAL.fee} for three days, then $${PLANS.insidir.price} a month. Cancel anytime.`,
  faq: ["Questions."],
  final: ["Bet with the", "millionaires."],
} as const;

/** Five questions, one sentence each. */
export const FAQ: Array<{ id: string; q: string; a: string }> = [
  { id: "who-counts", q: "Who counts as a millionaire?", a: "A Polymarket wallet with $1M+ all-time profit on the public leaderboard; we watch the top 1,000 daily, and $100K+ wallets show as Pro." },
  { id: "who-wallet", q: "Do you say who is behind a wallet?", a: "No: a wallet is its tier and a short address, never a username, a rank or a person." },
  { id: "kalshi", q: "What about Kalshi?", a: "Kalshi trades are anonymous, so millionaire money comes from Polymarket wallets, and every Read shows Kalshi's price (US: Kalshi only)." },
  { id: "advice", q: "Is this betting advice?", a: "No: Insidir shows the data, millionaires lose bets too, and every loss stays on the record." },
  { id: "cancel", q: "How do I cancel?", a: `In Account, any time: cancel in the first ${TRIAL.days} days and you pay only the $${TRIAL.fee}, then it's $${PLANS.insidir.price}/month.` },
];

export const faqLd = (): string => JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
