/* Team marks for rows: each NBA, NFL, MLB and NHL team's abbreviation and its two public team colours (no logos).
 * Keyed by the nickname Polymarket titles use ("Hawks vs. Pacers", "Spread: Commanders (-6.5)"); a nickname shared by
 * two leagues (Kings, Rangers, Jets, Panthers, Giants, Cardinals) is resolved by the market's category.
 * Politics gets a D or R disc where the market clearly names a party; everything else a category tile. */
import type { CategorySlug } from "./categories";

export interface Team { abbr: string; c1: string; c2: string }
type League = "basketball" | "football" | "baseball" | "hockey";
const T = (abbr: string, c1: string, c2: string): Team => ({ abbr, c1, c2 });

const NBA: Record<string, Team> = {
  Hawks: T("ATL", "#E03A3E", "#C1D32F"), Celtics: T("BOS", "#007A33", "#BA9653"), Nets: T("BKN", "#000000", "#FFFFFF"), Hornets: T("CHA", "#1D1160", "#00788C"),
  Bulls: T("CHI", "#CE1141", "#000000"), Cavaliers: T("CLE", "#860038", "#FDBB30"), Mavericks: T("DAL", "#00538C", "#B8C4CA"), Nuggets: T("DEN", "#0E2240", "#FEC524"),
  Pistons: T("DET", "#C8102E", "#1D42BA"), Warriors: T("GSW", "#1D428A", "#FFC72C"), Rockets: T("HOU", "#CE1141", "#000000"), Pacers: T("IND", "#002D62", "#FDBB30"),
  Clippers: T("LAC", "#C8102E", "#1D428A"), Lakers: T("LAL", "#552583", "#FDB927"), Grizzlies: T("MEM", "#5D76A9", "#12173F"), Heat: T("MIA", "#98002E", "#F9A01B"),
  Bucks: T("MIL", "#00471B", "#EEE1C6"), Timberwolves: T("MIN", "#0C2340", "#78BE20"), Pelicans: T("NOP", "#0C2340", "#C8102E"), Knicks: T("NYK", "#006BB6", "#F58426"),
  Thunder: T("OKC", "#007AC1", "#EF3B24"), Magic: T("ORL", "#0077C0", "#C4CED4"), "76ers": T("PHI", "#006BB6", "#ED174C"), Suns: T("PHX", "#1D1160", "#E56020"),
  "Trail Blazers": T("POR", "#E03A3E", "#000000"), Blazers: T("POR", "#E03A3E", "#000000"), Kings: T("SAC", "#5A2D81", "#63727A"), Spurs: T("SAS", "#C4CED4", "#000000"),
  Raptors: T("TOR", "#CE1141", "#000000"), Jazz: T("UTA", "#002B5C", "#F9A01B"), Wizards: T("WAS", "#002B5C", "#E31837"),
};
const NFL: Record<string, Team> = {
  Cardinals: T("ARI", "#97233F", "#000000"), Falcons: T("ATL", "#A71930", "#000000"), Ravens: T("BAL", "#241773", "#9E7C0C"), Bills: T("BUF", "#00338D", "#C60C30"),
  Panthers: T("CAR", "#0085CA", "#101820"), Bears: T("CHI", "#0B162A", "#C83803"), Bengals: T("CIN", "#FB4F14", "#000000"), Browns: T("CLE", "#311D00", "#FF3C00"),
  Cowboys: T("DAL", "#003594", "#869397"), Broncos: T("DEN", "#FB4F14", "#002244"), Lions: T("DET", "#0076B6", "#B0B7BC"), Packers: T("GB", "#203731", "#FFB612"),
  Texans: T("HOU", "#03202F", "#A71930"), Colts: T("IND", "#002C5F", "#A2AAAD"), Jaguars: T("JAX", "#006778", "#D7A22A"), Chiefs: T("KC", "#E31837", "#FFB81C"),
  Raiders: T("LV", "#000000", "#A5ACAF"), Chargers: T("LAC", "#0080C6", "#FFC20E"), Rams: T("LAR", "#003594", "#FFA300"), Dolphins: T("MIA", "#008E97", "#FC4C02"),
  Vikings: T("MIN", "#4F2683", "#FFC62F"), Patriots: T("NE", "#002244", "#C60C30"), Saints: T("NO", "#D3BC8D", "#101820"), Giants: T("NYG", "#0B2265", "#A71930"),
  Jets: T("NYJ", "#125740", "#FFFFFF"), Eagles: T("PHI", "#004C54", "#A5ACAF"), Steelers: T("PIT", "#FFB612", "#101820"), "49ers": T("SF", "#AA0000", "#B3995D"),
  Seahawks: T("SEA", "#002244", "#69BE28"), Buccaneers: T("TB", "#D50A0A", "#34302B"), Titans: T("TEN", "#0C2340", "#4B92DB"), Commanders: T("WAS", "#5A1414", "#FFB612"),
};
const MLB: Record<string, Team> = {
  Diamondbacks: T("ARI", "#A71930", "#E3D4AD"), Braves: T("ATL", "#CE1141", "#13274F"), Orioles: T("BAL", "#DF4601", "#000000"), "Red Sox": T("BOS", "#BD3039", "#0C2340"),
  Cubs: T("CHC", "#0E3386", "#CC3433"), "White Sox": T("CWS", "#27251F", "#C4CED4"), Reds: T("CIN", "#C6011F", "#000000"), Guardians: T("CLE", "#00385D", "#E50022"),
  Rockies: T("COL", "#33006F", "#C4CED4"), Tigers: T("DET", "#0C2340", "#FA4616"), Astros: T("HOU", "#002D62", "#EB6E1F"), Royals: T("KC", "#004687", "#BD9B60"),
  Angels: T("LAA", "#BA0021", "#003263"), Dodgers: T("LAD", "#005A9C", "#EF3E42"), Marlins: T("MIA", "#00A3E0", "#EF3340"), Brewers: T("MIL", "#12284B", "#FFC52F"),
  Twins: T("MIN", "#002B5C", "#D31145"), Mets: T("NYM", "#002D72", "#FF5910"), Yankees: T("NYY", "#0C2340", "#C4CED3"), Athletics: T("ATH", "#003831", "#EFB21E"),
  Phillies: T("PHI", "#E81828", "#002D72"), Pirates: T("PIT", "#27251F", "#FDB827"), Padres: T("SD", "#2F241D", "#FFC425"), Giants: T("SF", "#FD5A1E", "#27251F"),
  Mariners: T("SEA", "#0C2C56", "#005C5C"), Cardinals: T("STL", "#C41E3A", "#0C2340"), Rays: T("TB", "#092C5C", "#8FBCE6"), Rangers: T("TEX", "#003278", "#C0111F"),
  "Blue Jays": T("TOR", "#134A8E", "#1D2D5C"), Nationals: T("WSH", "#AB0003", "#14225A"),
};
const NHL: Record<string, Team> = {
  Ducks: T("ANA", "#F47A38", "#B9975B"), Bruins: T("BOS", "#FFB81C", "#000000"), Sabres: T("BUF", "#003087", "#FFB81C"), Flames: T("CGY", "#C8102E", "#F1BE48"),
  Hurricanes: T("CAR", "#CC0000", "#000000"), Blackhawks: T("CHI", "#CF0A2C", "#000000"), Avalanche: T("COL", "#6F263D", "#236192"), "Blue Jackets": T("CBJ", "#002654", "#CE1126"),
  Stars: T("DAL", "#006847", "#8F8F8C"), "Red Wings": T("DET", "#CE1126", "#FFFFFF"), Oilers: T("EDM", "#041E42", "#FF4C00"), Panthers: T("FLA", "#041E42", "#C8102E"),
  Kings: T("LAK", "#111111", "#A2AAAD"), Wild: T("MIN", "#154734", "#A6192E"), Canadiens: T("MTL", "#AF1E2D", "#192168"), Predators: T("NSH", "#FFB81C", "#041E42"),
  Devils: T("NJD", "#CE1126", "#000000"), Islanders: T("NYI", "#00539B", "#F47D30"), Rangers: T("NYR", "#0038A8", "#CE1126"), Senators: T("OTT", "#C52032", "#C2912C"),
  Flyers: T("PHI", "#F74902", "#000000"), Penguins: T("PIT", "#000000", "#FCB514"), Sharks: T("SJS", "#006D75", "#EA7200"), Kraken: T("SEA", "#001628", "#99D9D9"),
  Blues: T("STL", "#002F87", "#FCB514"), Lightning: T("TBL", "#002868", "#FFFFFF"), "Maple Leafs": T("TOR", "#00205B", "#FFFFFF"), Utah: T("UTA", "#71AFE5", "#090909"),
  Canucks: T("VAN", "#00205B", "#00843D"), "Golden Knights": T("VGK", "#B4975A", "#333F42"), Capitals: T("WSH", "#041E42", "#C8102E"), Jets: T("WPG", "#041E42", "#004C97"),
};
const LEAGUES: Record<League, Record<string, Team>> = { basketball: NBA, football: NFL, baseball: MLB, hockey: NHL };
const ORDER: League[] = ["basketball", "football", "hockey", "baseball"];

/** A team by the name a title uses, in the market's league when it has one, else the first league that knows it. */
export function teamByName(name: string, category: CategorySlug | null): Team | null {
  const n = name.trim().replace(/\s*\(.*\)$/, "");
  const lgs = category && category in LEAGUES ? [category as League] : ORDER;
  for (const l of lgs) { const t = LEAGUES[l][n]; if (t) return t; }
  return null;
}

/** The two teams of "X vs. Y" (or the one team of "Spread: X (-6.5)"), when the league knows them. */
export function teamsOf(title: string, category: CategorySlug | null): Team[] {
  const vs = /^(?:[^:]*:\s*)?(.+?)\s+vs\.?\s+(.+?)(?::.*)?$/i.exec(title.trim());
  if (vs) return [teamByName(vs[1]!, category), teamByName(vs[2]!, category)].filter((t): t is Team => Boolean(t));
  const one = /^(?:spread|moneyline|total)[^:]*:\s*(.+?)\s*(?:\(|$)/i.exec(title.trim());
  const t = one ? teamByName(one[1]!, category) : null;
  return t ? [t] : [];
}

/** "d" or "r" when the market clearly names one party. */
export function partyOf(text: string): "d" | "r" | null {
  const d = /\b(democrats?|democratic|dem)\b|\(d\)|\bd (senate|house)\b/i.test(text), r = /\b(republicans?|gop)\b|\(r\)|\br (senate|house)\b/i.test(text);
  return d && !r ? "d" : r && !d ? "r" : null;
}
