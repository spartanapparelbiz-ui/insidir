/* The brand's words, said once here and used by the landing, /go, the Read and the member home. Landing rules: section
 * headlines of six words or fewer, at most one sentence under each, numbers over adjectives, no paragraphs. Prices always
 * from lib/plans.ts. Never "guaranteed" or "risk-free" (test/compliance.test.ts). */
import { PLANS, TRIAL } from "@/lib/plans";

/** The product in one line: "Bet with the people who actually win, on Kalshi, in seconds, and know when they get out." */
export const ONE_LINE = "Bet with the people who actually win, on Kalshi, in seconds, and know when they get out.";
export const HERO = {
  h1: ["Bet with the people", "who actually win."],
  sub: "On Kalshi, in seconds, and know when they get out.",
  /** Under it, the live line (components/brand/HeroLine.tsx): "Wallets up $1M+ bet $X today. Which side were you on?" */
  /** The onboarding's first question, on the first screen: one tap answers it and opens /go at the next step. */
  ask: "What do you bet on?",
  picks: ["football", "basketball", "soccer", "elections", "tennis", "esports"],
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
/** How it works: three steps, one sentence each. */
export const HOW = [
  { t: "See the money.", d: "Every $5K+ bet from a wallet up $1M+, the second it lands: the market, the side, the price." },
  { t: "Get the ping.", d: "A push the moment a millionaire buys, adds to or sells out of a position in your categories." },
  { t: "Bet at the better price.", d: "Kalshi's price beside Polymarket's, and one tap to the same bet. You decide; we never hold your money." },
] as const;

/** The demo's chapters (qa/record-site.ts → public/media/site-<id>-<desk|phone>.*), what each shows. */
export const WATCH = [
  { id: "board", t: "The board", url: "insidir.com/board", d: "Every millionaire bet with its side, live, then a copy ticket: their price and the price now." },
  { id: "markets", t: "Every market", url: "insidir.com/markets", d: "Each category ranked by millionaire money, down to the game." },
  { id: "record", t: "The record", url: "insidir.com/results", d: "How the millionaires' bets settled, by category. Losses included." },
] as const;
export const START = `Start for $${TRIAL.fee}`;
export const PAST = "Past results, not a promise.";
export const LEGAL = "Information, not financial or betting advice. Operated by Aethric LLC.";
export const STAGES = {
  live: ["Millionaire money,", "right now."],
  pulse: ["The pulse.", "Live, today."],
  election: ["Election Day.", "Every race, live."],
  spotlight: ["One wallet.", "Every result."],
  stake: ["Your stake."],
  gaps: ["Same bet.", "Two prices."],
  free: ["Free right now.", "No account."],
  members: ["Everything the", "millionaires do.", "As it happens."],
  markets: ["Every market", "people bet on."],
  pricing: ["Less than", "one bad bet."],
  pricingSub: `$${TRIAL.fee} for three days, then $${PLANS.insidir.price} a month. Cancel anytime.`,
  faq: ["Questions."],
  why: ["Why Insidir."],
  how: ["How it works."],
  watch: ["See it work."],
  watchSub: "What members see, recorded with live data: real bets, real money, nothing staged.",
  final: ["Bet with the people", "who actually win."],
} as const;

/** Five questions, one sentence each. */
/** Every question (/faq and /help); the landing shows five of them (FAQ). */
export const FAQ_ALL: Array<{ id: string; q: string; a: string }> = [
  { id: "what", q: "What is Insidir?", a: "Polymarket's bets are public and Kalshi's aren't. Insidir watches the most profitable Polymarket wallets, shows every bet they make as it lands, and puts the same market on Kalshi next to it, with both prices." },
  { id: "who-counts", q: "Who counts as a millionaire?", a: "A Polymarket wallet with $1M+ all-time profit on the public leaderboard; we watch the top 1,000 daily, and $100K+ wallets show as Pro." },
  { id: "kalshi", q: "What about Kalshi?", a: "Kalshi's trades are anonymous, so the bets come from Polymarket wallets. When Kalshi lists the same market (the same game, side, line, source and close date), its page leads with Kalshi's price and one tap to it. In the US, Kalshi is the only venue we link." },
  { id: "who-wallet", q: "Do you say who is behind a wallet?", a: "No: a wallet is its tier and a short address, never a username, a picture or a person." },
  { id: "advice", q: "Is this betting advice?", a: "No: Insidir shows the data, millionaires lose bets too, and every loss stays on the record." },
  { id: "get", q: "What do members get?", a: `Every millionaire bet live with its side and price, a ping when one buys, adds to, trims or sells out of a position in your categories (with Kalshi's price when Kalshi lists the market), every race, every wallet's record, and a copy ticket for any bet. $${TRIAL.fee} for ${TRIAL.days} days, then $${PLANS.insidir.price}/month.` },
  { id: "late", q: "What do visitors see?", a: "The board 60 minutes late without the side, one race in full, and today's biggest millionaire bet whole." },
  { id: "place", q: "Do you place bets for me?", a: "Never. Insidir never places a bet, holds money or holds keys. A copy ticket opens the market on Kalshi (or Polymarket outside the US) and you decide there." },
  { id: "record", q: "Where's the record?", a: "Every wallet's page shows its settled markets, losses included, and the record page shows how the bets settled. Past results, not a promise." },
  { id: "cancel", q: "How do I cancel?", a: `In Account, any time: cancel in the first ${TRIAL.days} days and you pay only the $${TRIAL.fee}, then it's $${PLANS.insidir.price}/month.` },
];
export const FAQ: Array<{ id: string; q: string; a: string }> = FAQ_ALL.filter(f => ["who-counts", "kalshi", "who-wallet", "advice", "cancel"].includes(f.id));

export const faqLd = (): string => JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

/** What members get, said once: the five rows on the landing, the five tabs of their home. */
export const MEMBERS = [
  { k: "before", when: "Any time", tab: "Search", t: "Search any market, race or wallet, or paste a Polymarket or Kalshi link: who is on each side, and the price now." },
  { k: "allday", when: "All day", tab: "Board", t: "The live board of every millionaire bet, and a ping the second one lands in your categories. Unusual bets flagged." },
  { k: "morning", when: "Every morning", tab: "Brief", t: "The Daily Brief: the 3 markets with the most millionaire money today, and how yesterday's went." },
  { k: "overtime", when: "Over time", tab: "Following", t: "Follow a wallet that's up millions and get pinged on every bet it makes. Every result public, losses included." },
  { k: "nights", when: "Big nights", tab: "Live", t: "Election night and game nights: a live board pinned to the races and games that matter." },
] as const;

/** What a member gets, said once. */
export const MEMBER_GETS = [
  "A ping when a millionaire buys, adds, trims or sells out in your categories, with Kalshi's price beside it",
  "Every millionaire bet, live, with the side and the price they paid",
  "Every race: who the millionaires back, and where",
  "Every wallet's record, losses included",
  "A copy ticket for any bet: their price, the price now, one tap to the market",
] as const;

/** The terminal landing (components/brand/landing/Landing.tsx): five blocks, plain words, two Start for $1 buttons. */
export const LANDING = {
  h1: "See what the $1M+ wallets bet, before the game.",
  sub: "Every Polymarket bet of $5K+ from wallets up $1M+, with what it needs to win.",
  price: `$${TRIAL.fee} FOR ${TRIAL.days} DAYS · THEN $${PLANS.insidir.price}/MO · CANCEL ANYTIME`,
  boardNote: "Members see these the minute they land, with the side.",
  three: [
    { k: "BEFORE YOU BET", title: "Before you bet", t: "What the bet needs to win, and who's on each side." },
    { k: "WHILE YOU HOLD", title: "While you hold", t: "An alert when a $1M+ wallet takes the other side or gets out." },
    { k: "AFTER IT SETTLES", title: "After it settles", t: "What happened, and what following each wallet would have made." },
  ],
  access: `$${TRIAL.fee} · ${TRIAL.days} DAYS → $${PLANS.insidir.price}/MO · CANCEL ANYTIME`,
  /** The price, in words, under each Start for $1. */
  priceLine: `$${TRIAL.fee} for ${TRIAL.days} days, then $${PLANS.insidir.price}/month. Cancel anytime.`,
  /** Under the Start for $1 label, inside the button. */
  ctaSub: `${TRIAL.days} days of everything, live`,
  gets: ["Every $1M+ bet the minute it lands, with its side", "Bet Briefings, alerts on your bets, the 8 AM brief", "Ask Insidir: answers from the data, never guesses"],
  fine: `Then $${PLANS.insidir.price}/month. Cancel in Account, any time. Checkout by Whop.`,
} as const;
