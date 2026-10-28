/* The league a sports move is shown with ("Sports · Serie A"), from its titles and market id: the competition when
 * the words name it, else the league of a club they name, else the sport. Every sports move gets one; a game we
 * can't place at all says "Sports" only. The filter league (types.ts League) is derived from the same rules. */
import type { League } from "./types";

type Rule = readonly [label: string, league: League, words: RegExp];

/** Competitions and sports named in titles or tickers, most specific first. */
const COMPETITIONS: readonly Rule[] = [
  ["Champions League", "soccer", /\b(uefa )?champions league\b|\bucl\b/i],
  ["Europa League", "soccer", /\beuropa (conference )?league\b|\buel\b/i],
  ["Premier League", "soccer", /\b(english )?premier league\b|\bepl\b/i],
  ["La Liga", "soccer", /\bla ?liga\b/i],
  ["Serie A", "soccer", /\bserie a\b/i],
  ["Bundesliga", "soccer", /\bbundesliga\b/i],
  ["Ligue 1", "soccer", /\bligue 1\b/i],
  ["MLS", "soccer", /\bmls\b/i],
  ["Liga MX", "soccer", /\bliga mx\b/i],
  ["World Cup", "soccer", /\b(fifa )?world cup\b/i],
  ["WNBA", "NBA", /\bwnba\b/i],
  ["NBA", "NBA", /\bnba\b|\bkxnba/i],
  ["NFL", "NFL", /\bnfl\b|\bsuper bowl\b|\bkxnfl/i],
  ["MLB", "MLB", /\bmlb\b|\bworld series\b|\bkxmlb/i],
  ["NHL", "NHL", /\bnhl\b|\bstanley cup\b|\bkxnhl/i],
  ["College football", "college", /\b(ncaaf|cfb|college football)\b|\bkxncaaf/i],
  ["College basketball", "college", /\b(ncaab|cbb|college basketball|march madness)\b|\bkxncaab/i],
  ["College", "college", /\bncaa\b|\bkxncaa/i],
  ["UFC", "UFC", /\bufc\b|\bkxufc/i],
  ["Boxing", "other", /\bboxing\b|\bkxbox/i],
  ["ATP", "tennis", /\batp\b|\bkxatp/i],
  ["WTA", "tennis", /\bwta\b|\bkxwta/i],
  ["Tennis", "tennis", /\btennis\b|\b(wimbledon|roland garros|australian open|us open tennis)\b/i],
  ["Golf", "golf", /\b(golf|pga|lpga|ryder cup|the masters)\b|\bkxpga/i],
  ["F1", "other", /\b(f1|formula 1|formula one|grand prix)\b|\bkxf1/i],
  ["NASCAR", "other", /\bnascar\b/i],
  ["Cricket", "other", /\b(cricket|ipl|t20|odi)\b/i],
  ["Counter-Strike", "other", /\b(counter-strike|cs2|csgo)\b/i],
  ["Dota 2", "other", /\bdota 2?\b/i],
  ["League of Legends", "other", /\b(league of legends|lol:)/i],
  ["Valorant", "other", /\bvalorant\b/i],
  ["Rocket League", "other", /\brocket league\b/i],
  ["Call of Duty", "other", /\bcall of duty\b/i],
  ["Soccer", "soccer", /\bsoccer\b/i],
];

/** Clubs of the big five European leagues, as they appear in market titles. */
const CLUBS: readonly Rule[] = [
  ["Premier League", "soccer", /\b(arsenal|aston villa|bournemouth|brentford|brighton|burnley|chelsea|crystal palace|everton|fulham|leeds|liverpool|man(chester)? city|man(chester)? united|man utd|newcastle|nottingham forest|sunderland|tottenham( hotspur)?|west ham|wolverhampton)\b/i],
  ["La Liga", "soccer", /\b(real madrid|barcelona|atl[eé]tico( madrid)?|athletic (club|bilbao)|real sociedad|sevilla|villarreal|real betis|valencia|girona|celta( vigo)?|osasuna|getafe|rayo vallecano|mallorca|espanyol|alav[eé]s|levante|elche|real oviedo)\b/i],
  ["Serie A", "soccer", /\b(internazionale|inter milan|ac milan|juventus|napoli|as roma|lazio|atalanta|fiorentina|bologna|torino|udinese|genoa|cagliari|lecce|parma|sassuolo|hellas verona|cremonese|pisa)\b/i],
  ["Bundesliga", "soccer", /\b(bayern|dortmund|leverkusen|rb leipzig|eintracht frankfurt|vfb stuttgart|wolfsburg|sc freiburg|m[öo]nchengladbach|union berlin|werder bremen|hoffenheim|mainz|augsburg|heidenheim|hamburger sv|k[öo]ln|st\.? pauli)\b/i],
  ["Ligue 1", "soccer", /\b(psg|paris saint[- ]germain|olympique (de )?marseille|marseille|as monaco|olympique lyonnais|lyon|losc|lille|rc lens|ogc nice|stade rennais|rennes|strasbourg|fc nantes|toulouse|stade brestois|auxerre|angers|le havre|lorient|fc metz|paris fc)\b/i],
];

/** A club-style name ("SSC Napoli", "FC Pohang", "Will X FC win on <date>?"): a soccer game we can't place further. */
const CLUB_STYLE = /\b(fc|cf|afc|sc|ssc|sk|fk|cd|ud|rcd|vfb|vfl|tsg|bsc)\b|\bwill .{2,40} win on \d{4}-\d{2}-\d{2}\b/i;

const text = (words: ReadonlyArray<string | null | undefined>) => words.filter(Boolean).join(" \n ");

/** The competition the words name, with its filter league. */
export function competitionOf(words: ReadonlyArray<string | null | undefined>): { label: string; league: League } | null {
  const t = text(words);
  for (const [label, league, re] of COMPETITIONS) if (re.test(t)) return { label, league };
  return null;
}

/** A soccer league from a club the words name (or "Soccer" for a club-style name we can't place further). */
export function clubLeagueOf(words: ReadonlyArray<string | null | undefined>): { label: string; league: League } | null {
  const t = text(words);
  for (const [label, league, re] of CLUBS) if (re.test(t)) return { label, league };
  if (CLUB_STYLE.test(t)) return { label: "Soccer", league: "soccer" };
  return null;
}

const US_LEAGUES = new Set<League>(["NFL", "NBA", "MLB", "NHL", "UFC"]);

const SPORT_NAME: Partial<Record<League, string>> = { soccer: "Soccer", tennis: "Tennis", golf: "Golf", college: "College" };

/** What a sports card says after "Sports · ". Null only when nothing about the game names its league or sport. */
export function leagueLabel(m: { tab: string; league: League | null; eventTitle?: string | null; marketTitle?: string | null; marketId?: string | null }): string | null {
  if (m.tab !== "sports") return null;
  const words = [m.eventTitle, m.marketTitle, m.marketId];
  const c = competitionOf(words);
  if (c) return c.label;
  // A US league already known wins over a club name ("Spurs", "Rangers" are teams there too).
  if (m.league && US_LEAGUES.has(m.league)) return m.league;
  const club = clubLeagueOf(words);
  if (club) return club.label;
  if (m.league && m.league !== "other") return SPORT_NAME[m.league] ?? m.league;
  return null;
}
