/* A team mark's data and its monogram helpers: tiny and client safe (the registry stays on the server). */
export interface TeamArt { league: string; abbr: string; name: string; short: string; color: string; logo: string | null; dark: boolean }

/** Text for a monogram: the abbreviation, up to three letters (fits a 28px disc). */
export const monogram = (t: TeamArt) => t.abbr.toUpperCase().slice(0, 3);

/** A team colour that reads on the light neutral disc of a monogram (very light colours are darkened). */
export function discInk(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.62 ? "#3a3a40" : hex;
}
