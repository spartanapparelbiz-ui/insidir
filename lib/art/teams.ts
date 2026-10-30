/* The big soccer clubs markets name: slug, English Wikipedia title (for their crest, when Commons has it), names.
 * NBA, NFL, MLB and NHL teams use their logo files in public/logos/teams (lib/logos.ts). */

export const CLUBS: Array<{ slug: string; wiki: string; names: string[] }> = [
  { slug: "arsenal", wiki: "Arsenal_F.C.", names: ["arsenal"] },
  { slug: "chelsea", wiki: "Chelsea_F.C.", names: ["chelsea"] },
  { slug: "liverpool", wiki: "Liverpool_F.C.", names: ["liverpool"] },
  { slug: "man-city", wiki: "Manchester_City_F.C.", names: ["manchester city", "man city"] },
  { slug: "man-united", wiki: "Manchester_United_F.C.", names: ["manchester united", "man united", "man utd"] },
  { slug: "tottenham", wiki: "Tottenham_Hotspur_F.C.", names: ["tottenham", "spurs"] },
  { slug: "newcastle", wiki: "Newcastle_United_F.C.", names: ["newcastle"] },
  { slug: "aston-villa", wiki: "Aston_Villa_F.C.", names: ["aston villa"] },
  { slug: "real-madrid", wiki: "Real_Madrid_CF", names: ["real madrid"] },
  { slug: "barcelona", wiki: "FC_Barcelona", names: ["barcelona", "barça", "barca"] },
  { slug: "atletico", wiki: "Atlético_Madrid", names: ["atlético madrid", "atletico madrid", "atlético", "atletico"] },
  { slug: "bayern", wiki: "FC_Bayern_Munich", names: ["bayern munich", "bayern"] },
  { slug: "dortmund", wiki: "Borussia_Dortmund", names: ["borussia dortmund", "dortmund"] },
  { slug: "psg", wiki: "Paris_Saint-Germain_F.C.", names: ["paris saint-germain", "paris saint germain", "psg"] },
  { slug: "juventus", wiki: "Juventus_FC", names: ["juventus"] },
  { slug: "inter", wiki: "Inter_Milan", names: ["inter milan", "internazionale", "inter"] },
  { slug: "milan", wiki: "AC_Milan", names: ["ac milan"] },
  { slug: "napoli", wiki: "SSC_Napoli", names: ["napoli"] },
  { slug: "benfica", wiki: "S.L._Benfica", names: ["benfica"] },
  { slug: "porto", wiki: "FC_Porto", names: ["fc porto", "porto"] },
];

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9à-ÿ'.-]+/g, " ").trim()} `;
/** The club a name is ("Arsenal", "FC Barcelona"), or null. */
export function clubOf(name: string): string | null {
  const w = words(name);
  for (const c of CLUBS) if (c.names.some(n => w.includes(` ${n} `))) return c.slug;
  return null;
}
