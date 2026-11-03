/* Every market gets exactly one category, and every category has a photo (lib/brand/images.ts). Pure: from the market's
 * titles, the venue's normalised category (lib/exchanges/categories.ts) and the league the move classifier found
 * (lib/moves/classify.ts). Order matters: the first rule that matches wins, so specific beats general (a hurricane market
 * is Hurricane, not Weather; a Fed market is Markets, not Politics). */
import { sportsLeagueOf } from "@/lib/moves/classify";
import type { League } from "@/lib/moves/types";
import { FALLBACK, FALLBACKS, PHOTOS, type Photo, type PhotoFile } from "./images";

export const CATEGORY_SLUGS = [
  "elections", "politics", "football", "basketball", "soccer", "baseball", "tennis", "hockey", "golf", "racing", "esports",
  "weather", "hurricane", "space", "tech", "markets", "world", "culture", "oil",
] as const;
export type CategorySlug = typeof CATEGORY_SLUGS[number];

export interface Category { slug: CategorySlug; name: string; /** One short line for the quiz tile. */ blurb: string; sport: boolean }

const c = (slug: CategorySlug, name: string, blurb: string, sport = false): Category => ({ slug, name, blurb, sport });
export const CATEGORIES: readonly Category[] = [
  c("football", "Football", "NFL and college", true),
  c("basketball", "Basketball", "NBA and college", true),
  c("elections", "Elections", "Races, primaries, the midterms"),
  c("politics", "Politics", "Congress, the White House, the courts"),
  c("soccer", "Soccer", "Premier League, Champions League, MLS", true),
  c("baseball", "Baseball", "MLB", true),
  c("hockey", "Hockey", "NHL", true),
  c("tennis", "Tennis", "ATP, WTA, the Slams", true),
  c("golf", "Golf", "PGA, the majors", true),
  c("racing", "Racing", "F1, NASCAR, IndyCar", true),
  c("esports", "Esports", "Dota 2, CS2, League of Legends, Valorant", true),
  c("markets", "Markets", "The economy and the Fed"),
  c("tech", "Tech & AI", "AI, chips, big tech"),
  c("world", "World", "Wars, leaders, treaties"),
  c("culture", "Culture", "Awards, music, film, celebrities"),
  c("weather", "Weather", "Temperatures, rain, snow"),
  c("hurricane", "Hurricanes", "Storms and landfalls"),
  c("space", "Space & science", "Launches, missions, discoveries"),
  c("oil", "Oil & commodities", "Crude, gold, gas"),
];
const BY_SLUG = new Map(CATEGORIES.map(x => [x.slug, x]));

export const isCategory = (s: unknown): s is CategorySlug => typeof s === "string" && BY_SLUG.has(s as CategorySlug);
export const category = (slug: CategorySlug): Category => BY_SLUG.get(slug)!;

/** The photo for a category: its own, or the nearest related one (lib/brand/images.ts FALLBACK). */
export function categoryPhoto(slug: CategorySlug): Photo {
  const own = (slug in PHOTOS ? slug : FALLBACK[slug] ?? "markets") as PhotoFile;
  return PHOTOS[own];
}

/** Photos for a row of categories shown together: each its own, else its first fallback no other card uses yet. */
export function categoryPhotos(slugs: readonly CategorySlug[]): Photo[] {
  const used = new Set<PhotoFile>(slugs.filter(s => s in PHOTOS) as PhotoFile[]);
  return slugs.map(slug => {
    if (slug in PHOTOS) return PHOTOS[slug as PhotoFile];
    const list = FALLBACKS[slug] ?? ["markets"];
    const pick = list.find(f => !used.has(f)) ?? list[0]!;
    used.add(pick);
    return PHOTOS[pick];
  });
}

const LEAGUE_CATEGORY: Partial<Record<League, CategorySlug>> = { NFL: "football", NBA: "basketball", MLB: "baseball", NHL: "hockey", soccer: "soccer", tennis: "tennis", golf: "golf" };

/** Esports, by name: games and their circuits. Checked before any sport, so a "Masters" or "Major" in an esports event
 *  is never golf or tennis. */
export const ESPORTS_RE = /\b(esports?|e-sports|dota ?2|counter-strike|cs2|cs:go|csgo|league of legends|lol:|lck|lpl|lec|valorant|vct|rocket league|call of duty|overwatch|rainbow six|r6|starcraft|pubg|apex legends|fortnite|epl masters|esl pro league|blast premier|iem|pgl|the international|bo[1-5])\b/i;

const RULES: ReadonlyArray<readonly [CategorySlug, RegExp]> = [
  ["hurricane", /\b(hurricane|tropical storm|cyclone|typhoon|landfall|named storms?)\b/i],
  ["racing", /\b(f1|formula 1|formula one|grand prix|nascar|indycar|indy 500|motogp|daytona 500|le mans|verstappen|hamilton|norris|leclerc)\b/i],
  ["football", /\b(nfl|super bowl|afc|nfc|touchdowns?|quarterback|college football|cfp|heisman|ncaaf|cfb)\b/i],
  ["basketball", /\b(nba|wnba|ncaab|march madness|final four|nba finals)\b/i],
  ["baseball", /\b(mlb|world series|home runs?|al mvp|nl mvp|cy young)\b/i],
  ["hockey", /\b(nhl|stanley cup)\b/i],
  ["tennis", /\b(tennis|atp|wta|wimbledon|roland garros|french open|australian open|us open tennis|paris masters|rolex paris|masters 1000|masters cup|atp finals)\b/i],
  // "The Masters" is golf only as the tournament itself ("Will Scheffler win the Masters?"); a Masters Cup, Masters 1000
  // or an esports "EPL Masters" never is.
  ["golf", /\b(golf|pga|lpga|masters tournament|ryder cup|open championship|augusta)\b|(?:^|\n)\s*(?:will .{1,60}? win )?the masters\b(?!\s+(?:cup|1000|series|playoffs?|finals?))/i],
  ["soccer", /\b(soccer|premier league|epl|la liga|serie a|bundesliga|ligue 1|champions league|uefa|mls|fifa|world cup|fc)\b/i],
  ["elections", /\b(elections?|electoral|primary|primaries|nominee|nomination|midterms?|ballot|runoff|caucus|popular vote|win the seat|mayoral|mayor of|governor race|senate race|house race|wins? the (?:presidency|senate|house))\b/i],
  ["oil", /\b(oil|crude|wti|brent|opec|natural gas|gasoline|gas prices?|gold|silver|copper|commodit(?:y|ies))\b/i],
  ["markets", /\b(fed|fomc|federal reserve|interest rates?|rate (?:cut|hike)s?|bps|inflation|cpi|pce|gdp|recession|unemployment|jobs report|payrolls|s&p|s&p 500|nasdaq|dow|treasury|yields?|tariffs?|stocks?|ipo|earnings|bitcoin|btc|ethereum|eth|crypto|solana)\b/i],
  ["space", /\b(spacex|nasa|starship|rocket|launch(?:es)?|orbit|moon|mars|asteroid|artemis|blue origin|space|science|nobel)\b/i],
  ["tech", /\b(ai|a\.i\.|openai|chatgpt|gpt-?\d*|anthropic|claude|gemini|grok|xai|nvidia|apple|iphone|google|alphabet|microsoft|meta|amazon|tesla|tiktok|chips?|semiconductors?|tech)\b/i],
  ["weather", /\b(weather|temperature|°f|°c|degrees|rain(?:fall)?|snow(?:fall)?|heat ?wave|hottest|coldest|tornado(?:es)?|precipitation)\b/i],
  ["world", /\b(war|ukraine|russia|putin|zelensky|israel|gaza|hamas|iran|china|xi jinping|taiwan|north korea|nato|ceasefire|invasion|prime minister|pope|un security council|treaty|sanctions)\b/i],
  ["politics", /\b(trump|biden|vance|harris|congress|senate|house|speaker|supreme court|scotus|white house|president|cabinet|impeach\w*|executive order|shutdown|approval rating|democrats?|republicans?|gop|doge|veto|bill|governor)\b/i],
  ["culture", /\b(oscars?|grammys?|emmys?|golden globes?|box office|movie|film|album|song|billboard|spotify|netflix|taylor swift|kanye|drake|celebrity|tweets?|mentions?|say|youtube|mrbeast|eurovision|time person of the year)\b/i],
];

/** Where the venue category alone decides, when no words matched. */
const VENUE: Readonly<Record<string, CategorySlug>> = {
  politics: "politics", economics: "markets", finance: "markets", crypto: "markets", culture: "culture", mentions: "culture",
  weather: "weather", tech: "tech", geopolitics: "world",
};

export interface CategoryInput {
  title: string;
  event?: string | null;
  /** Venue category (lib/exchanges/categories.ts Category). */
  venueCategory?: string | null;
  /** The move classifier's tab and league, when known. */
  tab?: string | null;
  league?: string | null;
  /** The market's link: Polymarket's event slug starts with its league ("nba-atl-ind-2026-11-02"). */
  url?: string | null;
}

/** Polymarket event-slug prefixes → category (the slug names the league even when the title is just two teams). */
const SLUG: Readonly<Record<string, CategorySlug>> = {
  nfl: "football", cfb: "football", ncaaf: "football",
  nba: "basketball", wnba: "basketball", cbb: "basketball", ncaab: "basketball", euroleague: "basketball",
  mlb: "baseball", kbo: "baseball", npb: "baseball",
  nhl: "hockey", khl: "hockey", shl: "hockey",
  atp: "tennis", wta: "tennis",
  pga: "golf", lpga: "golf", liv: "golf",
  f1: "racing", nascar: "racing", indycar: "racing", motogp: "racing",
  epl: "soccer", ucl: "soccer", uel: "soccer", uecl: "soccer", lal: "soccer", es2: "soccer", bun: "soccer", bl2: "soccer", sea: "soccer", itsb: "soccer",
  fl1: "soccer", fl2: "soccer", por: "soccer", ere: "soccer", mls: "soccer", lmx: "soccer", bra: "soccer", arg: "soccer", tur: "soccer", efl: "soccer",
  elc: "soccer", spl: "soccer", jpn: "soccer", kor: "soccer", fifa: "soccer", wc: "soccer",
  ufc: "culture", boxing: "culture",
  // Esports series (Polymarket names the game first in the event slug).
  dota2: "esports", cs2: "esports", csgo: "esports", lol: "esports", val: "esports", valorant: "esports", rl: "esports", cod: "esports", ow: "esports", r6: "esports", esports: "esports",
};

/** Kalshi's series tickers name the game too ("KXDOTA2GAME-…", "KXCS2MAP-…", "KXLOLGAME-…", "KXVALORANT…"). */
const KALSHI_ESPORTS = /\bkx(dota|cs2|csgo|lol|valorant|val|r6|cod|ow)\w*/i;

/** The category a Polymarket link's event slug names, if any. */
export function slugCategory(url: string | null | undefined): CategorySlug | null {
  const m = /polymarket\.com\/event\/([a-z0-9]+)-/.exec(url ?? "");
  return m ? SLUG[m[1]!] ?? null : null;
}

/** The one category a market belongs to. */
export function categoryOf(m: CategoryInput): CategorySlug {
  const words = [m.event ?? "", m.title];
  const text = words.join(" \n ");
  if (RULES[0]![1].test(text)) return "hurricane";
  // The venue knows these better than any word list ("Will Powell say 'inflation'?" is a mentions market).
  if (m.venueCategory === "mentions") return "culture";
  if (m.venueCategory === "weather") return "weather";
  const bySlug = slugCategory(m.url);
  if (bySlug) return bySlug;
  // The exchange's own series for esports (Kalshi ticker), then the game's name: never golf or tennis.
  if (KALSHI_ESPORTS.test(m.url ?? "") || ESPORTS_RE.test(text)) return "esports";
  // Sports first, from the classifier's league when it has one (it knows club names and Kalshi series tickers).
  const isSport = m.tab === "sports" || m.venueCategory === "sports";
  const league = (m.league as League | null | undefined) ?? (isSport ? sportsLeagueOf(words) : null);
  if (league === "golf" && RULES.find(r => r[0] === "tennis")![1].test(text)) return "tennis"; // "Rolex Paris Masters" is tennis
  if (league && LEAGUE_CATEGORY[league]) return LEAGUE_CATEGORY[league]!;
  if (league === "college") return /\b(basketball|ncaab|march madness|final four)\b/i.test(text) ? "basketball" : "football";
  for (const [slug, re] of RULES.slice(1)) {
    // Sports words only count for sports markets or where they can't be anything else; non-sports rules never
    // claim a market the venue called sports.
    const sportRule = BY_SLUG.get(slug)!.sport;
    if (isSport && !sportRule) continue;
    if (re.test(text)) return slug;
  }
  if (isSport) return "culture"; // UFC, boxing, esports, cricket: none of the sports above
  return VENUE[m.venueCategory ?? ""] ?? "world";
}
