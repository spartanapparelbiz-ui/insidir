/* Alias tables for cross-venue matching: the data the owner extends. Every phrase here is matched against
 * normalised text (lower case, punctuation stripped, see normalize.ts `normalizePhrase`), whole words only,
 * longest phrase first. Canonical ids are short and stable: they become cache keys indirectly (through the
 * entities they produce), so rename with care.
 *
 * To add an alias: append a phrase to the right entry. To add a team: append a row to the league table.
 * Abbreviations that are also English words ("DEN", "MIN", "SEA") are only matched when written in capitals
 * (CASE_SENSITIVE_ALIASES and team `abbr`), never from lower-case text. */

export type League = "nfl" | "nba" | "mlb" | "nhl";
export const LEAGUES: readonly League[] = ["nfl", "nba", "mlb", "nhl"];

/** Words that tell us which league a market is about (matched in title, event title, rules, series ticker). */
export const LEAGUE_HINTS: Readonly<Record<League, readonly string[]>> = {
  nfl: ["nfl", "pro football", "professional football", "super bowl", "afc", "nfc"],
  nba: ["nba", "pro basketball", "professional basketball", "nba finals"],
  mlb: ["mlb", "pro baseball", "professional baseball", "world series", "baseball"],
  nhl: ["nhl", "pro hockey", "professional hockey", "stanley cup", "hockey"],
};
/** Leagues we have no team table for. When one of these is detected, team aliases from the four big leagues are
 *  not applied (a WNBA "Los Angeles" is not the Lakers). */
export const OTHER_LEAGUE_HINTS: readonly string[] = [
  "wnba", "ncaa", "ncaaf", "ncaab", "college football", "college basketball", "mls", "epl", "premier league",
  "la liga", "serie a", "bundesliga", "ligue 1", "champions league", "ufc", "atp", "wta", "pga", "f1", "nascar",
];

export interface TeamRow {
  abbr: readonly string[];
  city: string;
  name: string;
  /** Extra phrases: short nicknames, Kalshi's "Los Angeles L" style, former names. */
  extra?: readonly string[];
}

/** City strings that several teams of one league share; Kalshi writes these as "<city> <first letter>". */
const T = (abbr: string | string[], city: string, name: string, extra: string[] = []): TeamRow => ({
  abbr: Array.isArray(abbr) ? abbr : [abbr],
  city,
  name,
  extra,
});

export const TEAMS: Readonly<Record<League, readonly TeamRow[]>> = {
  nfl: [
    T("ARI", "Arizona", "Cardinals"), T("ATL", "Atlanta", "Falcons"), T("BAL", "Baltimore", "Ravens"),
    T("BUF", "Buffalo", "Bills"), T("CAR", "Carolina", "Panthers"), T("CHI", "Chicago", "Bears"),
    T("CIN", "Cincinnati", "Bengals"), T("CLE", "Cleveland", "Browns"), T("DAL", "Dallas", "Cowboys"),
    T("DEN", "Denver", "Broncos"), T("DET", "Detroit", "Lions"), T("GB", "Green Bay", "Packers"),
    T("HOU", "Houston", "Texans"), T("IND", "Indianapolis", "Colts"), T("JAX", "Jacksonville", "Jaguars", ["jags"]),
    T("KC", "Kansas City", "Chiefs"), T("LV", "Las Vegas", "Raiders"), T("LAC", "Los Angeles", "Chargers"),
    T("LAR", "Los Angeles", "Rams"), T("MIA", "Miami", "Dolphins"), T("MIN", "Minnesota", "Vikings"),
    T("NE", "New England", "Patriots", ["pats"]), T("NO", "New Orleans", "Saints"), T("NYG", "New York", "Giants"),
    T("NYJ", "New York", "Jets"), T("PHI", "Philadelphia", "Eagles"), T("PIT", "Pittsburgh", "Steelers"),
    T("SF", "San Francisco", "49ers", ["niners"]), T("SEA", "Seattle", "Seahawks"),
    T("TB", "Tampa Bay", "Buccaneers", ["bucs"]), T("TEN", "Tennessee", "Titans"),
    T(["WAS", "WSH"], "Washington", "Commanders"),
  ],
  nba: [
    T("ATL", "Atlanta", "Hawks"), T("BOS", "Boston", "Celtics"), T(["BKN", "BRK"], "Brooklyn", "Nets"),
    T("CHA", "Charlotte", "Hornets"), T("CHI", "Chicago", "Bulls"), T("CLE", "Cleveland", "Cavaliers", ["cavs"]),
    T("DAL", "Dallas", "Mavericks", ["mavs"]), T("DEN", "Denver", "Nuggets"), T("DET", "Detroit", "Pistons"),
    T(["GSW", "GS"], "Golden State", "Warriors"), T("HOU", "Houston", "Rockets"), T("IND", "Indiana", "Pacers"),
    T("LAC", "Los Angeles", "Clippers", ["la clippers"]), T("LAL", "Los Angeles", "Lakers", ["la lakers"]),
    T("MEM", "Memphis", "Grizzlies"), T("MIA", "Miami", "Heat"), T("MIL", "Milwaukee", "Bucks"),
    T("MIN", "Minnesota", "Timberwolves", ["wolves", "t wolves"]), T(["NOP", "NO"], "New Orleans", "Pelicans"),
    T(["NYK", "NY"], "New York", "Knicks"), T("OKC", "Oklahoma City", "Thunder"), T("ORL", "Orlando", "Magic"),
    T("PHI", "Philadelphia", "76ers", ["sixers"]), T(["PHX", "PHO"], "Phoenix", "Suns"),
    T("POR", "Portland", "Trail Blazers", ["blazers"]), T("SAC", "Sacramento", "Kings"),
    T(["SAS", "SA"], "San Antonio", "Spurs"), T("TOR", "Toronto", "Raptors"), T(["UTA", "UTAH"], "Utah", "Jazz"),
    T(["WAS", "WSH"], "Washington", "Wizards"),
  ],
  mlb: [
    T(["ARI", "AZ"], "Arizona", "Diamondbacks", ["d backs", "dbacks"]), T("ATL", "Atlanta", "Braves"),
    T("BAL", "Baltimore", "Orioles"), T("BOS", "Boston", "Red Sox"), T("CHC", "Chicago", "Cubs"),
    T(["CWS", "CHW"], "Chicago", "White Sox", ["chicago ws"]), T("CIN", "Cincinnati", "Reds"),
    T("CLE", "Cleveland", "Guardians"), T("COL", "Colorado", "Rockies"), T("DET", "Detroit", "Tigers"),
    T("HOU", "Houston", "Astros"), T(["KC", "KCR"], "Kansas City", "Royals"), T("LAA", "Los Angeles", "Angels"),
    T("LAD", "Los Angeles", "Dodgers"), T("MIA", "Miami", "Marlins"), T("MIL", "Milwaukee", "Brewers"),
    T("MIN", "Minnesota", "Twins"), T("NYM", "New York", "Mets"), T("NYY", "New York", "Yankees"),
    T(["ATH", "OAK"], "Athletics", "Athletics", ["oakland athletics", "a s", "sacramento athletics"]),
    T("PHI", "Philadelphia", "Phillies"), T("PIT", "Pittsburgh", "Pirates"), T(["SD", "SDP"], "San Diego", "Padres"),
    T(["SF", "SFG"], "San Francisco", "Giants"), T("SEA", "Seattle", "Mariners"),
    T(["STL"], "St Louis", "Cardinals", ["saint louis cardinals"]), T(["TB", "TBR"], "Tampa Bay", "Rays"),
    T("TEX", "Texas", "Rangers"), T("TOR", "Toronto", "Blue Jays", ["jays"]),
    T(["WSH", "WAS"], "Washington", "Nationals", ["nats"]),
  ],
  nhl: [
    T("ANA", "Anaheim", "Ducks"), T("BOS", "Boston", "Bruins"), T("BUF", "Buffalo", "Sabres"),
    T("CGY", "Calgary", "Flames"), T("CAR", "Carolina", "Hurricanes", ["canes"]),
    T("CHI", "Chicago", "Blackhawks"), T("COL", "Colorado", "Avalanche", ["avs"]),
    T("CBJ", "Columbus", "Blue Jackets"), T("DAL", "Dallas", "Stars"), T("DET", "Detroit", "Red Wings"),
    T("EDM", "Edmonton", "Oilers"), T("FLA", "Florida", "Panthers"), T(["LAK", "LA"], "Los Angeles", "Kings"),
    T("MIN", "Minnesota", "Wild"), T("MTL", "Montreal", "Canadiens", ["habs"]),
    T("NSH", "Nashville", "Predators", ["preds"]), T("NJD", "New Jersey", "Devils"),
    T("NYI", "New York", "Islanders"), T("NYR", "New York", "Rangers"), T("OTT", "Ottawa", "Senators"),
    T("PHI", "Philadelphia", "Flyers"), T("PIT", "Pittsburgh", "Penguins"), T(["SJS", "SJ"], "San Jose", "Sharks"),
    T("SEA", "Seattle", "Kraken"), T("STL", "St Louis", "Blues"), T(["TBL", "TB"], "Tampa Bay", "Lightning"),
    T("TOR", "Toronto", "Maple Leafs", ["leafs"]), T("UTA", "Utah", "Mammoth", ["utah hockey club"]),
    T("VAN", "Vancouver", "Canucks"), T(["VGK", "VEG"], "Vegas", "Golden Knights"),
    T(["WSH", "WAS"], "Washington", "Capitals", ["caps"]), T("WPG", "Winnipeg", "Jets"),
  ],
};

/** People: canonical id → phrases. Single surnames are fine here (they are matched as whole words). */
export const PEOPLE: Readonly<Record<string, readonly string[]>> = {
  trump: ["donald trump", "donald j trump", "trump"],
  biden: ["joe biden", "biden"],
  harris: ["kamala harris", "harris"],
  vance: ["jd vance", "j d vance", "vance"],
  newsom: ["gavin newsom", "newsom"],
  desantis: ["ron desantis", "desantis"],
  obama: ["barack obama", "michelle obama", "obama"],
  musk: ["elon musk", "musk"],
  powell: ["jerome powell", "jay powell", "powell"],
  aoc: ["alexandria ocasio cortez", "ocasio cortez", "aoc"],
  rfk: ["robert f kennedy jr", "robert f kennedy", "rfk jr", "rfk"],
  buttigieg: ["pete buttigieg", "buttigieg"],
  shapiro: ["josh shapiro", "shapiro"],
  whitmer: ["gretchen whitmer", "whitmer"],
  pritzker: ["jb pritzker", "j b pritzker", "pritzker"],
  rubio: ["marco rubio", "rubio"],
  haley: ["nikki haley", "haley"],
  mamdani: ["zohran mamdani", "mamdani"],
  cuomo: ["andrew cuomo", "cuomo"],
  putin: ["vladimir putin", "putin"],
  zelensky: ["volodymyr zelensky", "zelenskyy", "zelensky"],
  netanyahu: ["benjamin netanyahu", "bibi netanyahu", "netanyahu"],
  xi: ["xi jinping"],
  starmer: ["keir starmer", "starmer"],
  macron: ["emmanuel macron", "macron"],
  carney: ["mark carney", "carney"],
  poilievre: ["pierre poilievre", "poilievre"],
  milei: ["javier milei", "milei"],
  warsh: ["kevin warsh", "warsh"],
  hassett: ["kevin hassett", "hassett"],
  bessent: ["scott bessent", "bessent"],
  swift: ["taylor swift"],
};

/** Tradable assets and indices. Ids match lib/exchanges/strike.ts subjects where they overlap. */
export const ASSETS: Readonly<Record<string, readonly string[]>> = {
  btc: ["bitcoin", "btc", "xbt"],
  eth: ["ethereum", "eth", "ether"],
  sol: ["solana", "sol"],
  xrp: ["xrp", "ripple"],
  doge: ["dogecoin", "doge"],
  ada: ["cardano", "ada"],
  bnb: ["bnb", "binance coin"],
  ltc: ["litecoin", "ltc"],
  spx: ["spx", "sp500", "sp 500 index", "inx"],
  ndx: ["ndx", "nasdaq100", "nasdaq"],
  dji: ["dow jones", "djia", "the dow", "dow jones industrial average"],
  rut: ["russell2000", "rut"],
  gold: ["gold", "xau"],
  silver: ["silver", "xag"],
  oil: ["wti", "crude oil", "crude", "oil"],
  natgas: ["natural gas", "natgas"],
};

/** Institutions and economic quantities. */
export const ORGS: Readonly<Record<string, readonly string[]>> = {
  fed: ["federal reserve", "fed", "fomc", "federal open market committee", "fed funds", "federal funds"],
  ecb: ["ecb", "european central bank"],
  boe: ["bank of england", "boe"],
  boj: ["bank of japan", "boj"],
  cpi: ["cpi", "consumer price index", "inflation"],
  pce: ["pce", "core pce"],
  gdp: ["gdp", "gross domestic product"],
  unemployment: ["unemployment", "unemployment rate", "jobless rate"],
  payrolls: ["nonfarm payrolls", "non farm payrolls", "payrolls", "jobs report", "nfp"],
  "high-temp": ["high temperature", "highest temperature", "high temp", "max temperature", "daily high"],
  "low-temp": ["low temperature", "lowest temperature", "low temp", "min temperature", "daily low"],
  shutdown: ["government shutdown", "shutdown"],
  recession: ["recession"],
  "supreme-court": ["supreme court", "scotus"],
  senate: ["senate"],
  house: ["house of representatives"],
};

/** Places (cities, states, countries). A city that is also a team city becomes a team only in a sports context. */
export const PLACES: Readonly<Record<string, readonly string[]>> = {
  ny: ["new york", "new york city", "nyc", "central park", "manhattan"],
  la: ["los angeles"],
  chicago: ["chicago"],
  miami: ["miami"],
  austin: ["austin"],
  denver: ["denver"],
  philadelphia: ["philadelphia"],
  houston: ["houston"],
  seattle: ["seattle"],
  boston: ["boston"],
  sf: ["san francisco"],
  dc: ["washington dc", "washington d c", "district of columbia"],
  atlanta: ["atlanta"],
  dallas: ["dallas"],
  "las-vegas": ["las vegas"],
  phoenix: ["phoenix"],
  us: ["united states", "usa"],
  uk: ["united kingdom", "britain", "great britain", "england"],
  canada: ["canada"], mexico: ["mexico"], china: ["china"], russia: ["russia"], ukraine: ["ukraine"],
  israel: ["israel"], iran: ["iran"], india: ["india"], france: ["france"], germany: ["germany"], japan: ["japan"],
  brazil: ["brazil"], argentina: ["argentina"], taiwan: ["taiwan"], venezuela: ["venezuela"],
  alabama: ["alabama"], alaska: ["alaska"], arizona: ["arizona"], arkansas: ["arkansas"], california: ["california"],
  colorado: ["colorado"], connecticut: ["connecticut"], delaware: ["delaware"], florida: ["florida"],
  georgia: ["georgia"], hawaii: ["hawaii"], idaho: ["idaho"], illinois: ["illinois"], indiana: ["indiana"],
  iowa: ["iowa"], kansas: ["kansas"], kentucky: ["kentucky"], louisiana: ["louisiana"], maine: ["maine"],
  maryland: ["maryland"], massachusetts: ["massachusetts"], michigan: ["michigan"], minnesota: ["minnesota"],
  mississippi: ["mississippi"], missouri: ["missouri"], montana: ["montana"], nebraska: ["nebraska"],
  nevada: ["nevada"], "new-hampshire": ["new hampshire"], "new-jersey": ["new jersey"],
  "new-mexico": ["new mexico"], "north-carolina": ["north carolina"], "north-dakota": ["north dakota"],
  ohio: ["ohio"], oklahoma: ["oklahoma"], oregon: ["oregon"], pennsylvania: ["pennsylvania"],
  "rhode-island": ["rhode island"], "south-carolina": ["south carolina"], "south-dakota": ["south dakota"],
  tennessee: ["tennessee"], texas: ["texas"], utah: ["utah"], vermont: ["vermont"], virginia: ["virginia"],
  washington: ["washington state"], "west-virginia": ["west virginia"], wisconsin: ["wisconsin"],
  wyoming: ["wyoming"],
};

/** Aliases matched only in the original capitalisation (whole words), because the lower-case form is an English
 *  word or too short. Maps to `kind:id`. */
export const CASE_SENSITIVE_ALIASES: Readonly<Record<string, string>> = {
  US: "place:us",
  USA: "place:us",
  UK: "place:uk",
  NYC: "place:ny",
  DC: "place:dc",
  LA: "place:la",
  SF: "place:sf",
  GOP: "word:republican",
};

/** Phrases containing digits or symbols that must be protected before number parsing (applied to the raw text,
 *  case-insensitive). The replacement is a single alias word from the tables above. */
export const PROTECTED_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bS\s*&\s*P\s*-?\s*500\b/gi, " sp500 "],
  [/\bS\s*&\s*P\b/gi, " sp500 "],
  [/\bnasdaq\s*-?\s*100\b/gi, " nasdaq100 "],
  [/\brussell\s*-?\s*2000\b/gi, " russell2000 "],
  [/\bU\.S\.A?\.?(?=\s|$|[^\w])/g, " US "],
  [/\bU\.K\.(?=\s|$|[^\w])/g, " UK "],
  [/\bWashington,?\s+D\.?\s?C\.?(?=\s|$|[^\w])/g, " Washington DC "],
  [/\bA's\b/g, " Athletics "],
  [/\bSt\.\s+Louis\b/gi, " St Louis "],
];

/** Word-level normalisations applied after lower-casing (one token → one token). Keep these meaning-preserving. */
export const WORD_MAP: Readonly<Record<string, string>> = {
  versus: "vs", v: "vs",
  democrat: "democratic", democrats: "democratic", dem: "democratic", dems: "democratic",
  republicans: "republican", gop: "republican",
  decrease: "cut", decreases: "cut", decreased: "cut", cuts: "cut", reduce: "cut", reduces: "cut",
  increase: "hike", increases: "hike", increased: "hike", raise: "hike", raises: "hike", hikes: "hike",
  pause: "hold", pauses: "hold", unchanged: "hold", maintain: "hold", maintains: "hold", holds: "hold",
  wins: "win", winner: "win", winning: "win", won: "win", beats: "beat", defeats: "defeat",
  degree: "deg", degrees: "deg", fahrenheit: "f",
  pts: "points", point: "points",
  nominee: "nomination", nominated: "nomination",
  presidential: "president", presidents: "president",
};

/** Groups of mutually exclusive condition words. A market that says one and a market that says another from the
 *  same group (and not the first) are different markets ("Democratic nomination" vs "Republican nomination",
 *  "Fed cuts" vs "Fed hikes"). */
export const CONFLICT_GROUPS: ReadonlyArray<readonly string[]> = [
  ["democratic", "republican", "independent", "libertarian", "green"],
  ["cut", "hike", "hold"],
  ["house", "senate", "governor", "mayor", "president"],
  ["men", "women", "womens", "mens"],
  ["popular", "electoral"],
  ["primary", "general"],
  ["high-temp", "low-temp"],
  ["rain", "snow"],
  ["first", "second", "third"],
  ["mvp", "dpoy", "roy", "coach"],
];

/** Words that mark a season-level (futures) market rather than a single game. */
export const FUTURES_WORDS: readonly string[] = [
  "championship", "champion", "champions", "finals", "super bowl", "world series", "stanley cup", "playoffs",
  "playoff", "mvp", "division", "conference", "title", "pennant", "season",
];

/** Resolution sources recognised in rules text. Pattern (tested on the raw rules) → display name. Patterns that
 *  share a display name are the same source. The owner can extend this list. */
export const RESOLUTION_SOURCES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bAssociated Press\b|\bAP\b/, "AP"],
  [/\bFox News\b|\bFOX\b/, "Fox News"],
  [/\bNBC( News)?\b/, "NBC"],
  [/\bCNN\b/, "CNN"],
  [/\bABC News\b/, "ABC News"],
  [/\bCBS( News)?\b/, "CBS"],
  [/\bDecision Desk( HQ)?\b|\bDDHQ\b/, "Decision Desk HQ"],
  [/\bReuters\b/, "Reuters"],
  [/\bBloomberg\b/, "Bloomberg"],
  [/\bNew York Times\b|\bNYT\b/, "New York Times"],
  [/\bofficial (election )?results\b|\bcertified (election )?results\b|\bsecretary of state\b|\bofficial government sources?\b|\belection officials?\b/i, "official results"],
  [/\bnfl\.com\b|\bnba\.com\b|\bmlb\.com\b|\bnhl\.com\b|\bofficial (league|NFL|NBA|MLB|NHL)\b|\b(league|NFL|NBA|MLB|NHL)('s)? official\b/i, "official league site"],
  [/\bESPN\b/, "ESPN"],
  [/\bCoinGecko\b/i, "CoinGecko"],
  [/\bCoinMarketCap\b/i, "CoinMarketCap"],
  [/\bBinance\b/i, "Binance"],
  [/\bCoinbase\b/i, "Coinbase"],
  [/\bKraken\b/, "Kraken"],
  [/\bCF Benchmarks\b|\bCME CF\b|\bBRTI\b|\bCME\b/i, "CF Benchmarks / CME"],
  [/\bChainlink\b/i, "Chainlink"],
  [/\bPyth\b/i, "Pyth"],
  [/\bBureau of Labor Statistics\b|\bBLS\b/, "BLS"],
  [/\bBureau of Economic Analysis\b|\bBEA\b/, "BEA"],
  [/\bfederalreserve\.gov\b|\bFOMC('s)? statement\b|\bFederal Reserve('s)? (website|statement|press release)\b/i, "Federal Reserve"],
  [/\bNational Weather Service\b|\bNWS\b|\bNOAA\b/, "NWS/NOAA"],
  [/\bWeather Underground\b|\bwunderground\b/i, "Weather Underground"],
  [/\bAccuWeather\b/i, "AccuWeather"],
  [/\bBox Office Mojo\b/i, "Box Office Mojo"],
  [/\bcredible reporting\b|\bconsensus of credible\b/i, "credible reporting"],
];
