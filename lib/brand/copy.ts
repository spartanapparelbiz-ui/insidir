/* The brand's words: said once here, used by the landing, /go, the Read and the member home. Prices always from
 * lib/plans.ts. Never "guaranteed" or "risk-free" (test/compliance.test.ts). */
import { PLANS, TRIAL } from "@/lib/plans";

export const H1 = { before: "Bet with the ", accent: "millionaires", after: "." };
export const HERO_SUB = "Insidir tracks every big bet on Polymarket and Kalshi and shows you where wallets that have made $1M+ put their money.";
export const BASE_STRIP = "Reads every market on Polymarket · Kalshi";
export const START = `Start for $${TRIAL.fee}`;
export const PRICE_LINE = `$${TRIAL.fee} for your first ${TRIAL.days} days, then $${PLANS.insidir.price}/month. Cancel anytime.`;
export const DELAY_LABEL = "60-minute delay";
export const PAST = "Past results, not a promise.";
export const LOSSES = "Losses shown on the record.";
export const LEGAL = "Information, not financial or betting advice. Operated by Aethric LLC.";

export const STEPS = [
  { k: "Paste", t: "Paste any market.", d: "A Polymarket or Kalshi link, or the market in plain words. Or tap any market on the board." },
  { k: "Read", t: "Read the money.", d: "Where wallets that made $1M+ are, how many of them, the big bets of the last day and the best price now." },
  { k: "Bet smarter", t: "Bet with your eyes open.", d: "Follow the wallets you trust and get pinged the second they bet. You decide; we show the data." },
] as const;

export const FEATURES = [
  { k: "money", t: "Millionaire money", d: "Dollars on each side from wallets with $1M+ in all-time profit, and how many wallets. Pro wallets ($100K+) shown apart." },
  { k: "pings", t: "Pings", d: "A push the moment a millionaire bets $5K or more in the categories you pick." },
  { k: "follow", t: "Follow a millionaire", d: "Pick a wallet by its record, not its name, and see every bet it makes." },
  { k: "price", t: "Best price", d: "Kalshi and Polymarket side by side. In the US, Kalshi only." },
] as const;

export const FAQ: Array<{ id: string; q: string; a: string }> = [
  { id: "what", q: "What is Insidir?", a: HERO_SUB + " Paste any market and see the millionaire money on each side, the big bets of the last day and the best price." },
  { id: "who-counts", q: "Who counts as a millionaire?", a: "A Polymarket wallet with $1M or more in all-time profit on Polymarket's public leaderboard. We watch the top 1,000 wallets by all-time profit, re-read every day: $1M+ are Millionaires, $100K+ are Pro. A bet counts from $5,000." },
  { id: "who-wallet", q: "Do you say who is behind a wallet?", a: "No. A wallet is shown by its tier and short address only. We never show a username or a rank, and never try to identify the person behind it." },
  { id: "delay", q: "Is it live?", a: "For members, yes: bets show as they happen. Visitors see the board 60 minutes late, labeled." },
  { id: "kalshi", q: "What about Kalshi?", a: "Kalshi trades are anonymous, so millionaire money comes from Polymarket wallets. Every Read shows Kalshi's price, and in the US Open goes to Kalshi." },
  { id: "advice", q: "Is this betting advice?", a: "No. Insidir shows what the data says right now. Millionaires lose bets too; every loss stays on the record. You decide what to bet." },
  { id: "cancel", q: "How do I cancel?", a: `In Account, any time. Cancel in the first ${TRIAL.days} days and you only pay the $${TRIAL.fee}. After that it's $${PLANS.insidir.price}/month and you keep access until the month you paid for ends.` },
  { id: "who", q: "Who's behind it?", a: "Insidir is built by Aethric LLC, Pompano Beach, FL. Write to hello@aethric.llc and a person will answer." },
];

export const faqLd = (): string => JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
