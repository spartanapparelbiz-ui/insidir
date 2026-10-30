/* Each team's primary colour, the field its logo sits on (lib/art/render.ts teamArt). NBA, NFL, MLB and NHL by the
 * abbreviation its logo file has in public/logos/teams; the big soccer clubs by slug, with what markets call them.
 * Where a logo would vanish into its colour the art job puts it on white instead, so a colour here is never a risk. */

export const TEAM_COLOURS: Record<"nba" | "nfl" | "mlb" | "nhl", Record<string, string>> = {
  nba: {
    ATL: "#E03A3E", BOS: "#007A33", BK: "#000000", CHA: "#1D1160", CHI: "#CE1141", CLE: "#860038", DAL: "#00538C", DEN: "#0E2240",
    DET: "#C8102E", GSW: "#1D428A", HOU: "#CE1141", IND: "#002D62", LAC: "#1D428A", LAL: "#552583", MEM: "#5D76A9", MIA: "#98002E",
    MIL: "#00471B", MIN: "#0C2340", NO: "#0C2340", NYK: "#006BB6", OKC: "#007AC1", ORL: "#0077C0", PHI: "#006BB6", PHX: "#1D1160",
    POR: "#E03A3E", SAC: "#5A2D81", SAS: "#000000", TOR: "#CE1141", UTA: "#3E2680", WAS: "#002B5C",
  },
  nfl: {
    ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D", CAR: "#0085CA", CHI: "#0B162A", CIN: "#FB4F14", CLE: "#311D00",
    DAL: "#003594", DEN: "#FB4F14", DET: "#0076B6", GB: "#203731", HOU: "#03202F", IND: "#002C5F", JAX: "#006778", KC: "#E31837",
    LAC: "#0080C6", LAR: "#003594", LV: "#000000", MIA: "#008E97", MIN: "#4F2683", NE: "#002244", NO: "#101820", NYG: "#0B2265",
    NYJ: "#125740", PHI: "#004C54", PIT: "#101820", SEA: "#002244", SF: "#AA0000", TB: "#D50A0A", TEN: "#0C2340", WAS: "#5A1414",
  },
  mlb: {
    ARI: "#A71930", ATL: "#13274F", BAL: "#DF4601", BOS: "#BD3039", CHC: "#0E3386", CHW: "#27251F", CIN: "#C6011F", CLE: "#00385D",
    COL: "#333366", DET: "#0C2340", HOU: "#002D62", KAN: "#004687", LAA: "#BA0021", LAD: "#005A9C", MIA: "#00A3E0", MIL: "#12284B",
    MIN: "#002B5C", NYM: "#002D72", NYY: "#0C2340", OAK: "#003831", PHI: "#E81828", PIT: "#27251F", SD: "#2F241D", SF: "#FD5A1E",
    SEA: "#0C2C56", STL: "#C41E3A", TB: "#092C5C", TEX: "#003278", TOR: "#134A8E", WAS: "#AB0003",
  },
  nhl: {
    ANA: "#FC4C02", BOS: "#000000", BUF: "#003087", CAR: "#CC0000", CBJ: "#002654", CGY: "#C8102E", CHI: "#CF0A2C", COL: "#6F263D",
    DAL: "#006847", DET: "#CE1126", EDM: "#041E42", FLA: "#C8102E", LAK: "#111111", MIN: "#154734", MTL: "#AF1E2D", NJD: "#CE1126",
    NSH: "#FFB81C", NYI: "#00539B", NYR: "#0038A8", OTT: "#000000", PHI: "#F74902", PIT: "#000000", SEA: "#001628", SJS: "#006D75",
    STL: "#002F87", TBL: "#002868", TOR: "#00205B", UTA: "#000000", VAN: "#00205B", VGK: "#333F48", WAS: "#041E42", WPG: "#041E42",
  },
};

/** The big soccer clubs: slug, colour, English Wikipedia title (for its crest, when Commons has a free one), names. */
export const CLUBS: Array<{ slug: string; colour: string; wiki: string; names: string[] }> = [
  { slug: "arsenal", colour: "#EF0107", wiki: "Arsenal_F.C.", names: ["arsenal"] },
  { slug: "chelsea", colour: "#034694", wiki: "Chelsea_F.C.", names: ["chelsea"] },
  { slug: "liverpool", colour: "#C8102E", wiki: "Liverpool_F.C.", names: ["liverpool"] },
  { slug: "man-city", colour: "#6CABDD", wiki: "Manchester_City_F.C.", names: ["manchester city", "man city"] },
  { slug: "man-united", colour: "#DA291C", wiki: "Manchester_United_F.C.", names: ["manchester united", "man united", "man utd"] },
  { slug: "tottenham", colour: "#132257", wiki: "Tottenham_Hotspur_F.C.", names: ["tottenham", "spurs"] },
  { slug: "newcastle", colour: "#241F20", wiki: "Newcastle_United_F.C.", names: ["newcastle"] },
  { slug: "aston-villa", colour: "#670E36", wiki: "Aston_Villa_F.C.", names: ["aston villa"] },
  { slug: "real-madrid", colour: "#00529F", wiki: "Real_Madrid_CF", names: ["real madrid"] },
  { slug: "barcelona", colour: "#A50044", wiki: "FC_Barcelona", names: ["barcelona", "barça", "barca"] },
  { slug: "atletico", colour: "#CB3524", wiki: "Atlético_Madrid", names: ["atlético madrid", "atletico madrid", "atlético", "atletico"] },
  { slug: "bayern", colour: "#DC052D", wiki: "FC_Bayern_Munich", names: ["bayern munich", "bayern"] },
  { slug: "dortmund", colour: "#FDE100", wiki: "Borussia_Dortmund", names: ["borussia dortmund", "dortmund"] },
  { slug: "psg", colour: "#004170", wiki: "Paris_Saint-Germain_F.C.", names: ["paris saint-germain", "paris saint germain", "psg"] },
  { slug: "juventus", colour: "#000000", wiki: "Juventus_FC", names: ["juventus"] },
  { slug: "inter", colour: "#010E80", wiki: "Inter_Milan", names: ["inter milan", "internazionale", "inter"] },
  { slug: "milan", colour: "#FB090B", wiki: "AC_Milan", names: ["ac milan"] },
  { slug: "napoli", colour: "#12A0D7", wiki: "SSC_Napoli", names: ["napoli"] },
  { slug: "benfica", colour: "#E83030", wiki: "S.L._Benfica", names: ["benfica"] },
  { slug: "porto", colour: "#003893", wiki: "FC_Porto", names: ["fc porto", "porto"] },
];

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9à-ÿ'.-]+/g, " ").trim()} `;
/** The club a name is ("Arsenal", "FC Barcelona"), or null. */
export function clubOf(name: string): string | null {
  const w = words(name);
  for (const c of CLUBS) if (c.names.some(n => w.includes(` ${n} `))) return c.slug;
  return null;
}
