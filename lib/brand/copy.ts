/* The brand's words, said once here and used by the landing, /go, the Read and the member home. Landing rules: section
 * headlines of six words or fewer, at most one sentence under each, numbers over adjectives, no paragraphs. Prices always
 * from lib/plans.ts. Never "guaranteed" or "risk-free" (test/compliance.test.ts). */
import { PLANS, TRIAL } from "@/lib/plans";

/** The product in one line. */
export const ONE_LINE = "Who to copy, how much, and when to get out.";
export const HERO = {
  h1: ["The intelligence layer", "for prediction markets."],
  sub: "We track every Polymarket wallet up $1M+, verify which ones are consistently good, and tell you the moment they move.",
  /** The product, said as what you get: over the live top five. */
  pitch: "Who to copy, how much, and when to get out.",
  /** The three proof points (the bio's second line), each linking to where it's shown. */
  proof: [["Verified wallets", "/wallets"], ["Live signals", "/board"], ["Public track record", "/record"]] as const,
  /** The one contrast line, under the top five. */
  contrast: "Free trackers show you the buy. Insidir shows you who's worth copying, your size, and the sell.",
  cta: `Start for $${TRIAL.fee}`,
  /** The onboarding's first question (kept for /go's chips). */
  ask: "What do you trade?",
  picks: ["football", "basketball", "soccer", "elections", "tennis", "esports"],
} as const;
export const ASK_PLACEHOLDER = "Paste a Kalshi or Polymarket link, or type a market";
export const PROBLEM = {
  h1: ["You're not trading", "against the market."],
  sub: "You're trading against the wallets that have made millions.",
  rows: [
    ["You can't see who's on the other side.", "Millionaire money on every market, live."],
    ["Big trades hit X after the price moved.", "A ping the second a millionaire trades."],
    ["Leaderboards show volume, not winners.", "Every wallet's real all-time profit."],
    ["You might be paying more than you need to.", "The better price, Kalshi vs. Polymarket."],
  ],
} as const;
/** How it works: three steps, one sentence each. */
export const HOW = [
  { t: "Follow a verified wallet.", d: "Wallets up $1M+ that pass four tests, re-tested daily: 50+ settled trades, profitable in 2 of the last 3 months, no single lucky trade, no hedging." },
  { t: "Get your size when it trades.", d: "A push within seconds: the market, the side, the price on Kalshi and Polymarket, and your size, the same share of your bankroll as theirs." },
  { t: "Get pinged when it exits.", d: "When the wallet you copied sells, you hear right away, with your entry next to its exit, and one tap to the market." },
] as const;

/** The demo's chapters (qa/record-site.ts → public/media/site-<id>-<desk|phone>.*), what each shows. */
export const WATCH = [
  { id: "board", t: "The board", url: "insidir.com/board", d: "Every millionaire trade with its side, live, then a copy ticket: their price and the price now." },
  { id: "markets", t: "Every market", url: "insidir.com/markets", d: "Each category ranked by millionaire money, down to the game." },
  { id: "record", t: "The record", url: "insidir.com/results", d: "How the millionaires' trades settled, by category. Losses included." },
] as const;
export const START = `Start for $${TRIAL.fee}`;
export const PAST = "Past results, not a promise.";
export const LEGAL = "Information, not financial advice. Operated by Aethric LLC.";
export const STAGES = {
  live: ["Millionaire money,", "right now."],
  pulse: ["The pulse.", "Live, today."],
  election: ["Election Day.", "Every race, live."],
  spotlight: ["One wallet.", "Every result."],
  stake: ["Your stake."],
  gaps: ["Same trade.", "Two prices."],
  free: ["Free right now.", "No account."],
  members: ["Everything the", "millionaires do.", "As it happens."],
  markets: ["Every market", "people trade on."],
  pricing: ["One plan."],
  pricingSub: `$${TRIAL.fee} for ${TRIAL.days} days, then $${PLANS.insidir.price}/mo. Cancel anytime.`,
  faq: ["Questions."],
  why: ["Why Insidir."],
  how: ["How it works."],
  watch: ["See it work."],
  watchSub: "What members see, recorded with live data: real trades, real money, nothing staged.",
  final: ["The intelligence layer", "for prediction markets."],
} as const;

/** Five questions, one sentence each. */
/** Every question (/faq and /help); the landing shows five of them (FAQ). */
export const FAQ_ALL: Array<{ id: string; q: string; a: string }> = [
  { id: "what", q: "What is Insidir?", a: "We track every Polymarket wallet up $1M+, verify which ones are consistently good, and tell you the moment they move: who to copy, your size, and a push when they sell." },
  { id: "verified", q: "What makes a wallet Verified?", a: "It's up $1M+ all time and passes four tests, re-tested every day: 50+ settled trades, profitable in at least 2 of the last 3 months, no single trade over 40% of its profit, and it doesn't regularly hold both sides of a market. Each wallet's page shows every test and its numbers." },
  { id: "size", q: "How is my size worked out?", a: "From the wallet's trade as a share of its bankroll (the most it has held in open positions at once in 90 days): if it put in 2%, your size is 2% of the bankroll you set, never above your max per trade. It's a matched size, not advice." },
  { id: "kalshi", q: "Kalshi or Polymarket?", a: "Each alert shows the same side's price on both when both list the market, and marks the cheaper one. Copy opens that market on the cheaper app you can use (in the US, Kalshi). You confirm the trade in your own account." },
  { id: "place", q: "Do you place trades for me?", a: "Never. Insidir never places a trade, never asks for API keys, wallet keys or exchange logins, and never holds funds." },
  { id: "who-wallet", q: "Do you say who is behind a wallet?", a: "No: a wallet is a short address, never a username, a picture or a person." },
  { id: "advice", q: "Is this financial advice?", a: "No. It's information: Verified wallets lose trades too, every loss stays on the record, and past results don't predict future results." },
  { id: "record", q: "Where's the record?", a: "Every wallet's page shows its last 10 settled trades and its checks; My copies shows yours, losses included." },
  { id: "cancel", q: "How do I cancel?", a: `In Account, one click, effective immediately. It's $${TRIAL.fee} for ${TRIAL.days} days, then $${PLANS.insidir.price}/mo.` },
];
export const FAQ: Array<{ id: string; q: string; a: string }> = FAQ_ALL.filter(f => ["verified", "size", "kalshi", "place", "advice", "cancel"].includes(f.id));

export const faqLd = (): string => JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

/** What members get, said once: the five rows on the landing, the five tabs of their home. */
export const MEMBERS = [
  { k: "before", when: "Any time", tab: "Search", t: "Search any market, race or wallet, or paste a Polymarket or Kalshi link: who is on each side, and the price now." },
  { k: "allday", when: "All day", tab: "Board", t: "The live board of every millionaire trade, and a ping the second one lands in your categories. Unusual trades flagged." },
  { k: "morning", when: "Every morning", tab: "Brief", t: "The Daily Brief: the 3 markets with the most millionaire money today, and how yesterday's went." },
  { k: "overtime", when: "Over time", tab: "Following", t: "Follow a wallet that's up millions and get pinged on every trade it makes. Every result public, losses included." },
  { k: "nights", when: "Big nights", tab: "Live", t: "Election night and game nights: a live board pinned to the races and games that matter." },
] as const;

/** What a member gets, said once. */
export const MEMBER_GETS = [
  "A ping when a millionaire buys, adds, trims or sells out in your categories, with Kalshi's price beside it",
  "Every millionaire trade, live, with the side and the price they paid",
  "Every race: who the millionaires back, and where",
  "Every wallet's record, losses included",
  "A copy ticket for any trade: their price, the price now, one tap to the market",
] as const;
