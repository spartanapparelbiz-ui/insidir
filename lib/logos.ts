/* Which real logo goes with a position or a tracker (public/logos, built by scripts/logos.mjs): the team a sports
 * position is on (by nickname or city, within its league), else its league's; the company of a Form 4 or 13F by
 * ticker; the company or coin a market is about, by name. Null when there's no logo that is clearly the subject, and
 * the drawn subject art (components/SubjectArt) shows instead. Server only: the ticker list stays out of the browser.
 * The logos are the trademarks of their owners, shown only to say which team, league or company a position is about. */
import manifest from "@/public/logos/manifest.json";

type League = "nba" | "nfl" | "mlb" | "nhl";
const STOCKS = new Set<string>(manifest.stocks);
const TEAMS: Record<League, Set<string>> = { nba: new Set(manifest.teams.nba), nfl: new Set(manifest.teams.nfl), mlb: new Set(manifest.teams.mlb), nhl: new Set(manifest.teams.nhl) };
const LEAGUES = manifest.leagues as Record<string, string>;
const BRANDS = manifest.brands as Record<string, string>;

/** Each team's file name, then what a market calls it: nickname first, then the city or school name when it is
 *  unique in its league. */
const NAMES: Record<League, Array<[string, ...string[]]>> = {
  nba: [["ATL", "hawks", "atlanta"], ["BOS", "celtics", "boston"], ["BK", "nets", "brooklyn"], ["CHA", "hornets", "charlotte"], ["CHI", "bulls", "chicago"],
    ["CLE", "cavaliers", "cavs", "cleveland"], ["DAL", "mavericks", "mavs", "dallas"], ["DEN", "nuggets", "denver"], ["DET", "pistons", "detroit"],
    ["GSW", "warriors", "golden state"], ["HOU", "rockets", "houston"], ["IND", "pacers", "indiana"], ["LAC", "clippers"], ["LAL", "lakers"],
    ["MEM", "grizzlies", "memphis"], ["MIA", "heat", "miami"], ["MIL", "bucks", "milwaukee"], ["MIN", "timberwolves", "wolves", "minnesota"],
    ["NO", "pelicans", "new orleans"], ["NYK", "knicks", "new york"], ["OKC", "thunder", "oklahoma city"], ["ORL", "magic", "orlando"],
    ["PHI", "76ers", "sixers", "philadelphia"], ["PHX", "suns", "phoenix"], ["POR", "trail blazers", "blazers", "portland"], ["SAC", "kings", "sacramento"],
    ["SAS", "spurs", "san antonio"], ["TOR", "raptors", "toronto"], ["UTA", "jazz", "utah"], ["WAS", "wizards", "washington"]],
  nfl: [["ARI", "cardinals", "arizona"], ["ATL", "falcons", "atlanta"], ["BAL", "ravens", "baltimore"], ["BUF", "bills", "buffalo"], ["CAR", "panthers", "carolina"],
    ["CHI", "bears", "chicago"], ["CIN", "bengals", "cincinnati"], ["CLE", "browns", "cleveland"], ["DAL", "cowboys", "dallas"], ["DEN", "broncos", "denver"],
    ["DET", "lions", "detroit"], ["GB", "packers", "green bay"], ["HOU", "texans", "houston"], ["IND", "colts", "indianapolis"], ["JAX", "jaguars", "jacksonville"],
    ["KC", "chiefs", "kansas city"], ["LAC", "chargers"], ["LAR", "rams"], ["LV", "raiders", "las vegas"], ["MIA", "dolphins", "miami"],
    ["MIN", "vikings", "minnesota"], ["NE", "patriots", "new england"], ["NO", "saints", "new orleans"], ["NYG", "giants"], ["NYJ", "jets"],
    ["PHI", "eagles", "philadelphia"], ["PIT", "steelers", "pittsburgh"], ["SEA", "seahawks", "seattle"], ["SF", "49ers", "niners", "san francisco"],
    ["TB", "buccaneers", "bucs", "tampa bay"], ["TEN", "titans", "tennessee"], ["WAS", "commanders", "washington"]],
  mlb: [["ARI", "diamondbacks", "d-backs", "arizona"], ["ATL", "braves", "atlanta"], ["BAL", "orioles", "baltimore"], ["BOS", "red sox", "boston"],
    ["CHC", "cubs"], ["CHW", "white sox"], ["CIN", "reds", "cincinnati"], ["CLE", "guardians", "cleveland"], ["COL", "rockies", "colorado"],
    ["DET", "tigers", "detroit"], ["HOU", "astros", "houston"], ["KAN", "royals", "kansas city"], ["LAA", "angels"], ["LAD", "dodgers"],
    ["MIA", "marlins", "miami"], ["MIL", "brewers", "milwaukee"], ["MIN", "twins", "minnesota"], ["NYM", "mets"], ["NYY", "yankees"],
    ["OAK", "athletics", "a's", "oakland"], ["PHI", "phillies", "philadelphia"], ["PIT", "pirates", "pittsburgh"], ["SD", "padres", "san diego"],
    ["SF", "giants", "san francisco"], ["SEA", "mariners", "seattle"], ["STL", "cardinals", "st. louis", "st louis"], ["TB", "rays", "tampa bay"],
    ["TEX", "rangers", "texas"], ["TOR", "blue jays", "toronto"], ["WAS", "nationals", "washington"]],
  nhl: [["ANA", "ducks", "anaheim"], ["BOS", "bruins", "boston"], ["BUF", "sabres", "buffalo"], ["CAR", "hurricanes", "carolina"], ["CBJ", "blue jackets", "columbus"],
    ["CGY", "flames", "calgary"], ["CHI", "blackhawks", "chicago"], ["COL", "avalanche", "colorado"], ["DAL", "stars", "dallas"], ["DET", "red wings", "detroit"],
    ["EDM", "oilers", "edmonton"], ["FLA", "panthers", "florida"], ["LAK", "kings", "los angeles"], ["MIN", "wild", "minnesota"], ["MTL", "canadiens", "montreal"],
    ["NJD", "devils", "new jersey"], ["NSH", "predators", "nashville"], ["NYI", "islanders"], ["NYR", "rangers"], ["OTT", "senators", "ottawa"],
    ["PHI", "flyers", "philadelphia"], ["PIT", "penguins", "pittsburgh"], ["SEA", "kraken", "seattle"], ["SJS", "sharks", "san jose"], ["STL", "blues", "st. louis", "st louis"],
    ["TBL", "lightning", "tampa bay"], ["TOR", "maple leafs", "leafs", "toronto"], ["UTA", "mammoth", "utah"], ["VAN", "canucks", "vancouver"],
    ["VGK", "golden knights", "vegas"], ["WAS", "capitals", "washington"], ["WPG", "jets", "winnipeg"]],
};
const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9'.-]+/g, " ").trim()} `;

/** The team a name is, in a league: "Chiefs", "Kansas City Chiefs", "Kansas City" → KC. */
export function teamOf(league: League, name: string): string | null {
  const w = words(name);
  for (const [abbr, ...aliases] of NAMES[league]) if (TEAMS[league].has(abbr) && aliases.some(a => w.includes(` ${a} `))) return abbr;
  return null;
}

const LEAGUE_OF: Array<[RegExp, string]> = [
  [/^nba$/i, "nba"], [/^nfl$/i, "nfl"], [/^mlb$/i, "mlb"], [/^nhl$/i, "nhl"], [/premier league|^epl$/i, "epl"], [/la ?liga/i, "laliga"], [/serie a/i, "seriea"],
  [/bundesliga/i, "bundesliga"], [/ligue 1/i, "ligue1"], [/champions league|^ucl$/i, "ucl"], [/ufc|mma/i, "ufc"], [/college football|ncaaf|^cfb$/i, "cfb"],
  [/world cup|fifa/i, "fifa"], [/formula 1|^f1$/i, "f1"], [/dota/i, "dota2"], [/counter-strike|cs2|csgo/i, "counterstrike"], [/league of legends|^lol$/i, "leagueoflegends"],
  [/valorant/i, "valorant"],
];
const TEAM_LEAGUE: Record<string, League> = { nba: "nba", nfl: "nfl", mlb: "mlb", nhl: "nhl" };
export const leagueLogo = (id: string): string | null => (LEAGUES[id] ? `/logos/leagues/${LEAGUES[id]}` : null);
const leagueId = (label: string | null | undefined): string | null => { if (!label) return null; for (const [re, id] of LEAGUE_OF) if (re.test(label)) return id; return null; };

/** A company or coin named in a market's words, with its logo. */
const BRAND_TEXT: Array<[RegExp, string]> = [
  [/bitcoin|\bbtc\b/i, "bitcoin"], [/ethereum|\beth\b/i, "ethereum"], [/solana|\bsol\b/i, "solana"], [/dogecoin|\bdoge\b/i, "dogecoin"], [/\bxrp\b|ripple/i, "ripple"],
  [/nvidia/i, "nvidia"], [/\bapple\b|iphone/i, "apple"], [/tesla/i, "tesla"], [/google|alphabet|gemini/i, "google"], [/\bmeta\b|facebook|instagram/i, "meta"],
  [/spacex|starship/i, "spacex"], [/netflix/i, "netflix"], [/\bintel\b/i, "intel"], [/\bamd\b/i, "amd"], [/tiktok/i, "tiktok"], [/youtube|mrbeast/i, "youtube"],
  [/spotify/i, "spotify"], [/\buber\b/i, "uber"], [/coinbase/i, "coinbase"], [/binance/i, "binance"], [/samsung/i, "samsung"], [/nintendo|switch 2/i, "nintendo"],
  [/playstation|\bgta\b|gta vi/i, "playstation"], [/openai|chatgpt|\bgpt-?\d/i, "openai"], [/anthropic|claude/i, "anthropic"], [/amazon|\baws\b/i, "amazon"],
  [/microsoft|xbox/i, "microsoft"], [/disney/i, "disney"], [/boeing/i, "boeing"], [/\bford\b/i, "ford"], [/toyota/i, "toyota"], [/twitter|\bx\.com\b/i, "x"],
];
/** Large companies by the names filings and markets use, to their ticker's logo. */
const NAME_TICKER: Array<[RegExp, string]> = [
  [/\bnvidia\b/i, "NVDA"], [/\bapple\b/i, "AAPL"], [/\bmicrosoft\b/i, "MSFT"], [/\bamazon\b/i, "AMZN"], [/\balphabet\b|\bgoogle\b/i, "GOOG"],
  [/\bmeta platforms\b|\bfacebook\b/i, "META"], [/\btesla\b/i, "TSLA"], [/\bberkshire\b/i, "BRK-B"], [/\bjpmorgan\b|\bj\.?p\.? morgan\b/i, "JPM"],
  [/\bexxon\b/i, "XOM"], [/\bvisa\b/i, "V"], [/\bmastercard\b/i, "MA"], [/\bunitedhealth\b/i, "UNH"], [/\beli lilly\b|\blilly\b/i, "LLY"],
  [/\bbroadcom\b/i, "AVGO"], [/\bwalmart\b/i, "WMT"], [/\bcostco\b/i, "COST"], [/\bjohnson & johnson\b|\bjohnson and johnson\b/i, "JNJ"],
  [/\bprocter\b/i, "PG"], [/\bhome depot\b/i, "HD"], [/\bchevron\b/i, "CVX"], [/\bcoca[- ]cola\b/i, "KO"], [/\bpepsico\b/i, "PEP"],
  [/\boracle\b/i, "ORCL"], [/\bsalesforce\b/i, "CRM"], [/\badobe\b/i, "ADBE"], [/\bnetflix\b/i, "NFLX"], [/\bpalantir\b/i, "PLTR"],
  [/\bbank of america\b/i, "BAC"], [/\bwells fargo\b/i, "WFC"], [/\bgoldman\b/i, "GS"], [/\bmorgan stanley\b/i, "MS"], [/\babbvie\b/i, "ABBV"],
  [/\bmerck\b/i, "MRK"], [/\bpfizer\b/i, "PFE"], [/\badvanced micro\b|\bamd\b/i, "AMD"], [/\bintel\b/i, "INTC"], [/\bqualcomm\b/i, "QCOM"],
  [/\bcisco\b/i, "CSCO"], [/\binternational business machines\b|\bibm\b/i, "IBM"], [/\bdisney\b/i, "DIS"], [/\bnike\b/i, "NKE"],
  [/\bmcdonald/i, "MCD"], [/\bstarbucks\b/i, "SBUX"], [/\bboeing\b/i, "BA"], [/\bcaterpillar\b/i, "CAT"], [/\buber\b/i, "UBER"],
  [/\bairbnb\b/i, "ABNB"], [/\bcoinbase\b/i, "COIN"], [/\bmicron\b/i, "MU"], [/\btaiwan semiconductor\b|\btsmc\b/i, "TSM"], [/\bspotify\b/i, "SPOT"],
  [/\bshopify\b/i, "SHOP"], [/\bpaypal\b/i, "PYPL"], [/\bstrategy inc\b|\bmicrostrategy\b/i, "MSTR"], [/\bgamestop\b/i, "GME"],
];
export const tickerOfName = (name: string): string | null => { for (const [re, t] of NAME_TICKER) if (STOCKS.has(t) && re.test(name)) return t; return null; };

export function brandOf(text: string): string | null {
  const t = tickerOfName(text);
  if (t) return `/logos/stocks/${t}.webp`;
  for (const [re, slug] of BRAND_TEXT) if (BRANDS[slug] && re.test(text)) return `/logos/brands/${BRANDS[slug]}`;
  return null;
}
/** Share classes filed under one logo. */
const SAME_LOGO: Record<string, string> = { GOOGL: "GOOG", "BRK-A": "BRK-B", "FOXA": "FOX", "NWSA": "NWS" };
export const stockLogo = (ticker: string | null | undefined): string | null => {
  const raw = ticker?.toUpperCase().replace(/\./g, "-");
  const t = raw ? (STOCKS.has(raw) ? raw : SAME_LOGO[raw]) : undefined;
  return t && STOCKS.has(t) ? `/logos/stocks/${t}.webp` : null;
};

/** The logo for a position: its team, else its league (sports); its company by ticker (filings); a company or coin it
 *  names (markets). */
export function moveLogo(m: { tab: string; source: string; league?: string | null; leagueLabel?: string | null; outcome?: string | null;
  marketTitle?: string | null; eventTitle?: string | null; ticker?: string | null; company?: string | null }): string | null {
  if (m.source === "sec" || m.tab === "stocks") return stockLogo(m.ticker) ?? (m.company ? stockLogo(tickerOfName(m.company)) : null);
  const text = `${m.eventTitle ?? ""} ${m.marketTitle ?? ""}`;
  if (m.tab === "sports") {
    const id = leagueId(m.leagueLabel) ?? leagueId(m.league);
    const tl = id ? TEAM_LEAGUE[id] : undefined;
    if (tl) {
      const abbr = (m.outcome && teamOf(tl, m.outcome)) || teamOf(tl, m.marketTitle ?? "");
      if (abbr) return `/logos/teams/${tl}/${abbr}.svg`;
    }
    return id ? leagueLogo(id) : null;
  }
  return brandOf(`${text} ${m.outcome ?? ""}`);
}
