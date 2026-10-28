/* What a newcomer sees on the home page (the feed keeps everything): only mainstream moves, said short.
 *   Mainstream: $10k+, and one of NFL, NBA, MLB, NHL, college (football, basketball), a major soccer league, politics,
 *   the economy, or a large, well-known stock. No esports, no crypto, no multi-leg parlays, no obscure markets.
 *   Short copy: "googleplay put $566,682 on Suns" over "Spread: Thunder (-8.5)"; "Nippon Life bought $8.7M of
 *   Corebridge (CRBG)" over "Traded Oct 22 · filed Oct 24" (a Form 4 card always shows both dates); company names in
 *   normal case with the ticker; market titles trimmed to the essentials.
 * Pure: words in, words out; the home page applies it to rows it already has. */
import { dollars } from "@/lib/moves/copy";
import type { Move } from "@/lib/moves/types";

export const HOME_MIN = 10_000;

const MAJOR_LEAGUES = new Set(["NFL", "NBA", "MLB", "NHL", "college"]);

/** Clubs of the big European leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1) and Champions League
 *  regulars, as they appear in market titles. A soccer market counts as major when it names one of them. */
const MAJOR_CLUBS = /\b(arsenal|aston villa|bournemouth|brentford|brighton|burnley|chelsea|crystal palace|everton|fulham|leeds|liverpool|man(chester)? city|man(chester)? united|man utd|newcastle|nottingham forest|sunderland|tottenham|spurs|west ham|wolves|wolverhampton|real madrid|barcelona|atl[eé]tico|athletic (club|bilbao)|real sociedad|sevilla|villarreal|real betis|valencia|girona|celta|osasuna|getafe|rayo vallecano|mallorca|espanyol|alav[eé]s|levante|elche|real oviedo|inter( milan)?|internazionale|ac milan|milan|juventus|napoli|as roma|roma|lazio|atalanta|fiorentina|bologna|torino|udinese|genoa|como|cagliari|lecce|parma|sassuolo|verona|cremonese|pisa|bayern|dortmund|leverkusen|rb leipzig|leipzig|eintracht frankfurt|frankfurt|stuttgart|wolfsburg|freiburg|m[öo]nchengladbach|union berlin|werder bremen|bremen|hoffenheim|mainz|augsburg|heidenheim|hamburg|k[öo]ln|st\.? pauli|psg|paris saint[- ]germain|marseille|monaco|lyon|lille|lens|nice|rennes|strasbourg|nantes|toulouse|brest|auxerre|angers|le havre|lorient|metz|paris fc|benfica|porto|sporting|ajax|psv|feyenoord|celtic|rangers|galatasaray|fenerbah[cç]e)\b/i;

const POLITICS = /\b(election|elected|president(ial)?|prime minister|senate|house|congress|governor|mayor|democrat(s|ic)?|republican(s)?|gop|party|seats|nominee|nomination|primary|supreme court|justice|impeach\w*|cabinet|parliament|vote|ballot|trump|vance|newsom|harris|biden|white house|government shutdown|speaker)\b/i;
const ECONOMY = /\b(fed|federal reserve|interest rates?|rate (cut|hike)s?|bps|inflation|cpi|pce|gdp|recession|unemployment|jobs report|nonfarm|payrolls|s&p 500|s&p|nasdaq|dow( jones)?|treasury|10-year|tariffs?|oil price|gas prices?)\b/i;
const NOT_HOME = /\b(counter-strike|cs2|dota|valorant|league of legends|lol:|overwatch|rocket league|call of duty|esports?|\(bo\d\)|map \d|bitcoin|btc|ethereum|eth|solana|sol|xrp|dogecoin|crypto|memecoin|token|airdrop|up or down)\b/i;
/** Several legs in one ("yes San Antonio,yes Drake Batherson: 1+"): a parlay, too much to read. */
const PARLAY = /(^|,)\s*(yes|no)\s+[^,]+,\s*(yes|no)\s/i;

/** Large, well-known US companies: ticker → the short name a reader knows. */
export const KNOWN_STOCKS: Record<string, string> = {
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "Nvidia", AMZN: "Amazon", GOOGL: "Alphabet", GOOG: "Alphabet", META: "Meta", TSLA: "Tesla",
  "BRK.B": "Berkshire Hathaway", "BRK.A": "Berkshire Hathaway", AVGO: "Broadcom", JPM: "JPMorgan Chase", LLY: "Eli Lilly", V: "Visa", MA: "Mastercard",
  UNH: "UnitedHealth", XOM: "Exxon Mobil", JNJ: "Johnson & Johnson", WMT: "Walmart", PG: "Procter & Gamble", HD: "Home Depot", COST: "Costco",
  ORCL: "Oracle", ABBV: "AbbVie", BAC: "Bank of America", CVX: "Chevron", KO: "Coca-Cola", PEP: "PepsiCo", MRK: "Merck", ADBE: "Adobe",
  CRM: "Salesforce", NFLX: "Netflix", AMD: "AMD", TMO: "Thermo Fisher", WFC: "Wells Fargo", CSCO: "Cisco", ACN: "Accenture", MCD: "McDonald's",
  ABT: "Abbott", DIS: "Disney", INTU: "Intuit", QCOM: "Qualcomm", TXN: "Texas Instruments", VZ: "Verizon", CMCSA: "Comcast", PFE: "Pfizer",
  NKE: "Nike", IBM: "IBM", AMGN: "Amgen", PM: "Philip Morris", CAT: "Caterpillar", GE: "GE Aerospace", UNP: "Union Pacific", HON: "Honeywell",
  NOW: "ServiceNow", SPGI: "S&P Global", BA: "Boeing", GS: "Goldman Sachs", MS: "Morgan Stanley", RTX: "RTX", LOW: "Lowe's", INTC: "Intel",
  AMAT: "Applied Materials", BKNG: "Booking", SBUX: "Starbucks", DE: "Deere", ISRG: "Intuitive Surgical", BLK: "BlackRock", LMT: "Lockheed Martin",
  GILD: "Gilead", MDLZ: "Mondelez", ADP: "ADP", AXP: "American Express", C: "Citigroup", SCHW: "Charles Schwab", TJX: "TJX", CVS: "CVS Health",
  MO: "Altria", BMY: "Bristol-Myers Squibb", T: "AT&T", UPS: "UPS", NEE: "NextEra Energy", MMM: "3M", F: "Ford", GM: "General Motors",
  UBER: "Uber", ABNB: "Airbnb", PYPL: "PayPal", PLTR: "Palantir", COIN: "Coinbase", HOOD: "Robinhood", DELL: "Dell", MU: "Micron",
  PANW: "Palo Alto Networks", CRWD: "CrowdStrike", SNOW: "Snowflake", SHOP: "Shopify", TGT: "Target", EBAY: "eBay", SPOT: "Spotify",
  OXY: "Occidental Petroleum", KHC: "Kraft Heinz", COP: "ConocoPhillips", USB: "U.S. Bancorp", PNC: "PNC", CB: "Chubb", MCO: "Moody's",
  DAL: "Delta Air Lines", UAL: "United Airlines", LUV: "Southwest Airlines", HPQ: "HP", ANET: "Arista Networks", ARM: "Arm", SMCI: "Super Micro",
};
/** The same companies by the words of their SEC names (13F holdings carry a name, not a ticker). */
const KNOWN_BY_NAME: Array<[RegExp, string]> = Object.entries(KNOWN_STOCKS).map(([t, n]) => [new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "(&|and)")}\\b`, "i"), t]);

export { niceName } from "@/lib/stocks/names";
import { niceName, shareClassOf } from "@/lib/stocks/names";

/** The company and ticker of a stock move, when it is one a newcomer knows. */
export function knownStock(m: Pick<Move, "detail">): { name: string; ticker: string } | null {
  const d = m.detail;
  if (!d) return null;
  if (d.kind === "insider" && d.ticker && KNOWN_STOCKS[d.ticker.toUpperCase()]) return { name: KNOWN_STOCKS[d.ticker.toUpperCase()]!, ticker: d.ticker.toUpperCase() };
  const hit = KNOWN_BY_NAME.find(([re]) => re.test(niceName(d.company)));
  return hit ? { name: KNOWN_STOCKS[hit[1]]!, ticker: hit[1] } : null;
}

type HomeMove = Pick<Move, "amount" | "tab" | "league" | "source" | "eventTitle" | "marketTitle" | "outcome" | "detail">;

export function isMainstream(m: HomeMove): boolean {
  if (m.amount < HOME_MIN) return false;
  if (m.tab === "stocks") return Boolean(knownStock(m));
  if (m.tab === "crypto") return false;
  const words = `${m.eventTitle} ${m.marketTitle} ${m.outcome}`;
  if (NOT_HOME.test(words) || PARLAY.test(m.marketTitle) || PARLAY.test(m.outcome)) return false;
  if (m.tab === "sports") {
    if (m.league && MAJOR_LEAGUES.has(m.league)) return true;
    return MAJOR_CLUBS.test(words);
  }
  return MAJOR_CLUBS.test(words) || POLITICS.test(words) || ECONOMY.test(words);
}

/** A market's question, kept as a question ("Will Benjamin Netanyahu be the next…?" never loses its "Will"): drops
 *  dates like "on 2026-10-27" and a "Full game:" prefix, and caps at about 48 characters on a word boundary. */
export function trimTitle(t: string, max = 48): string {
  let s = t.replace(/\s+/g, " ").trim()
    .replace(/\s+(on|by|before|after)\s+\d{4}-\d{2}-\d{2}\b/gi, "").replace(/,?\s+\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/^full game:\s*/i, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[,:;\s-]+$/, "")}…`;
}

const YES_NO = /^(yes|no)$/i;
const side = (o: string) => (YES_NO.test(o.trim()) ? o.trim()[0]!.toUpperCase() + o.trim().slice(1).toLowerCase() : o.trim());
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_ET = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const calDay = (d: string) => DAY.format(new Date(`${d}T12:00:00Z`));
const quarter = (p: string) => { const [y, mo] = p.split("-").map(Number); return `Q${Math.ceil(mo! / 3)} ${y}`; };

/** The short line and its one line of context. `who` is the name the feed already shows for this viewer. */
export function homeCopy(m: HomeMove, who: string): { line: string; context: string | null } {
  const d = m.detail;
  if (m.source === "sec" && d) {
    const k = knownStock(m);
    const t = d.kind === "insider" ? d.ticker?.toUpperCase() ?? null : null;
    const what = k ? `${k.name} (${k.ticker})` : `${niceName(d.company)}${t ? ` (${t})` : ""}`;
    if (d.kind === "insider") {
      return { line: `${niceName(d.ownerName)} bought ${dollars(m.amount)} of ${what}`,
        context: `${d.tradeDate ? `Traded ${calDay(d.tradeDate)} · ` : ""}filed ${DAY_ET.format(new Date(d.filedAt))}` };
    }
    const cls = shareClassOf(d.shareClass ? `class ${d.shareClass}` : null, d.cusip);
    return { line: `${niceName(d.fund)} added ${dollars(m.amount)} of ${cls ? `${k ? k.name : niceName(d.company)} Class ${cls}` : what}`, context: `${d.period ? `${quarter(d.period)} holdings` : "Holdings"} · filed ${calDay(d.filedOn)}` };
  }
  const o = side(m.outcome);
  const title = trimTitle(m.marketTitle || m.eventTitle);
  const yesNo = YES_NO.test(m.outcome.trim());
  return { line: `${who} put ${dollars(m.amount)} on ${o}`, context: yesNo || title.toLowerCase() !== o.toLowerCase() ? title : null };
}

/** "$48K", "$1.2M": the ticker's amounts. */
export function compactDollars(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}
