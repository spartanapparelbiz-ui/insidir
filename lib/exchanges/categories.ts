/* Normalise the venues' categories and tags to one lower-case set shared by every venue: the keys of
 * POLYMARKET_RATES in lib/fees.ts (crypto, sports, economics, culture, weather, finance, politics, mentions, tech,
 * geopolitics, combos, other). Pure. */

export type Category =
  | "crypto"
  | "sports"
  | "economics"
  | "culture"
  | "weather"
  | "finance"
  | "politics"
  | "mentions"
  | "tech"
  | "geopolitics"
  | "combos"
  | "other";

export const OTHER: Category = "other";

/** Keywords (matched against lower-cased tag labels / slugs / category names, as whole words or slug parts) per
 *  category. Checked in this order, most specific first: a "Trump says X" market tagged politics + mentions is a
 *  mentions market; a war market tagged politics + geopolitics is geopolitics. */
const RULES: ReadonlyArray<readonly [Category, readonly string[]]> = [
  ["combos", ["combo", "combos", "parlay", "parlays", "multivariate"]],
  ["mentions", ["mention", "mentions"]],
  ["crypto", ["crypto", "cryptocurrency", "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "xrp", "doge", "dogecoin", "stablecoin", "defi", "memecoin", "airdrop"]],
  ["sports", ["sport", "sports", "nba", "nfl", "mlb", "nhl", "wnba", "ncaa", "ncaab", "ncaaf", "cfb", "cbb", "soccer", "football", "basketball", "baseball", "hockey", "tennis", "golf", "ufc", "mma", "boxing", "f1", "formula-1", "nascar", "cricket", "epl", "premier-league", "champions-league", "la-liga", "serie-a", "bundesliga", "mls", "olympics", "esports", "world-cup", "super-bowl", "chess"]],
  ["weather", ["weather", "climate", "climate-and-weather", "temperature", "hurricane", "hurricanes", "snow", "rain", "tornado", "earthquake"]],
  ["geopolitics", ["geopolitics", "world", "war", "ukraine", "russia", "israel", "gaza", "iran", "middle-east", "china-taiwan", "nato", "ceasefire", "foreign-policy"]],
  ["economics", ["economics", "economy", "economic", "fed", "fed-rates", "interest-rates", "inflation", "cpi", "gdp", "jobs", "unemployment", "recession", "fomc", "macro", "tariffs", "trade-war"]],
  ["finance", ["finance", "financials", "financial", "stocks", "stock", "equities", "business", "companies", "company", "earnings", "ipo", "ipos", "sp500", "s-p-500", "nasdaq", "commodities", "gold", "oil", "forex", "indices"]],
  ["tech", ["tech", "technology", "science", "science-and-technology", "ai", "artificial-intelligence", "openai", "space", "spacex", "apple", "big-tech"]],
  ["culture", ["culture", "pop-culture", "entertainment", "movies", "movie", "music", "tv", "awards", "oscars", "grammys", "celebrities", "celebrity", "social", "social-media", "youtube", "twitter", "tiktok", "gaming", "box-office", "religion"]],
  ["politics", ["politics", "political", "elections", "election", "us-politics", "us-elections", "trump", "congress", "senate", "house", "president", "presidential", "government", "policy", "supreme-court", "scotus", "primaries", "governor", "mayor", "global-elections"]],
];

/** The words of a label as slug parts plus the whole slug ("Climate and Weather" → climate-and-weather, climate,
 *  and, weather). */
function words(label: string): string[] {
  const slug = label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return [];
  return [slug, ...slug.split("-")];
}

/** The first matching category for any of the labels (venue category names, tag labels or slugs), else "other". */
export function normaliseCategory(labels: ReadonlyArray<string | null | undefined>): Category {
  const seen = new Set<string>();
  for (const l of labels) if (l) for (const w of words(l)) seen.add(w);
  if (seen.size === 0) return OTHER;
  for (const [cat, keys] of RULES) for (const k of keys) if (seen.has(k)) return cat;
  return OTHER;
}

/** Kalshi's own category names (series / event `category`), mapped directly. Unknown names fall back to the
 *  keyword rules. */
const KALSHI_CATEGORIES: Readonly<Record<string, Category>> = {
  politics: "politics",
  elections: "politics",
  economics: "economics",
  financials: "finance",
  companies: "finance",
  crypto: "crypto",
  "climate and weather": "weather",
  sports: "sports",
  entertainment: "culture",
  social: "culture",
  "science and technology": "tech",
  world: "geopolitics",
  mentions: "mentions",
  health: "other",
  transportation: "other",
};

export function kalshiCategory(...names: ReadonlyArray<string | null | undefined>): Category {
  for (const n of names) {
    const hit = n ? KALSHI_CATEGORIES[n.trim().toLowerCase()] : undefined;
    if (hit) return hit;
  }
  return normaliseCategory(names);
}
