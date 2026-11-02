/* The brand's words, said once here and used by the landing, /go, the Read and the member home. Landing rules: section
 * headlines of six words or fewer, at most one sentence under each, numbers over adjectives, no paragraphs. Prices always
 * from lib/plans.ts. Never "guaranteed" or "risk-free" (test/compliance.test.ts). */
import { PLANS, TRIAL } from "@/lib/plans";

export const FIRST = { before: "See where ", accent: "millionaires", after: " are betting. Live." };
export const ASK_PLACEHOLDER = "Paste any Polymarket or Kalshi bet";
export const ASK_FREE = "One free Read, no account.";
export const START = `Start for $${TRIAL.fee}`;
export const PRICE_LINE = `for ${TRIAL.days} days, then $${PLANS.insidir.price}/month. Cancel anytime.`;
export const PAST = "Past results, not a promise.";
export const LEGAL = "Information, not financial or betting advice. Operated by Aethric LLC.";

/** Section heads: label, headline (≤ 6 words, `accent` is the one orange word), one line. */
export const SCENES = {
  mark: { line: "Where the money is." },
  markets: { label: "Markets", before: "Every market people ", accent: "bet", after: " on." },
  how: { label: "How it works", before: "One paste. The whole ", accent: "market", after: "." },
  proof: { label: "The record" },
  features: { label: "Features", before: "Everything you check before ", accent: "betting", after: "." },
  final: { before: "Ready to see where the ", accent: "money", after: " is?" },
} as const;

export const STEPS = [
  { k: "Paste", t: "Paste any market.", d: "A link, a few words, or a tap on the board." },
  { k: "Read", t: "Read the money.", d: "$1M+ wallets per side, counted." },
  { k: "Bet smarter", t: "Bet with eyes open.", d: "Best price, and a ping when they move." },
] as const;

export const FEATURES = [
  { k: "money", t: "Millionaire money", d: "Dollars per side from $1M+ wallets." },
  { k: "pings", t: "Pings", d: "A push when a millionaire bets $5K+." },
  { k: "follow", t: "Follow a millionaire", d: "Pick a wallet by its record." },
  { k: "price", t: "Best price", d: "Kalshi and Polymarket, side by side." },
] as const;

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
