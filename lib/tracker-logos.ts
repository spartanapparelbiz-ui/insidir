/* A tracker's real logo (public/logos, scripts/logos.mjs): its league's, or its topic's coin. Null for the styles, the
 * Fed, elections and the rest, which show their drawn subject (components/SubjectArt). No imports, so it is safe in
 * client components; test/logos.test.ts checks every file is there. */
const LOGO: Record<string, string> = {
  "nfl-big-money": "/logos/leagues/nfl.svg", "nba-big-money": "/logos/leagues/nba.svg", "mlb-big-money": "/logos/leagues/mlb.svg",
  "nhl-big-money": "/logos/leagues/nhl.svg", "college-football": "/logos/leagues/cfb.webp", "premier-league": "/logos/leagues/epl.webp",
  "champions-league": "/logos/leagues/ucl.webp", "la-liga": "/logos/leagues/laliga.webp", "serie-a": "/logos/leagues/seriea.webp",
  ufc: "/logos/leagues/ufc.webp", "soccer-big-money": "/logos/leagues/fifa.svg", "crypto-prices": "/logos/brands/bitcoin.svg",
};
export const TRACKER_LOGOS: Readonly<Record<string, string>> = LOGO;
export const trackerLogo = (slug: string): string | null => LOGO[slug] ?? null;
