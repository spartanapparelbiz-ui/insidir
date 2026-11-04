/* Human addresses for every entity, and back:
 *   a market   /market/bulls-vs-76ers-3f9a2c   its title, then the first 6 hex characters of its Polymarket id
 *   a race     /race/florida-governor-election-winner   Polymarket's event slug (a race is an event), else as a market
 *   a wallet   /wallet/0x…                     the address (never a name)
 *   a bet      /bet/<id>                       the bet's id
 * The title part is only for people: a slug resolves by its id part, and a slug whose words no longer match the title
 * (a renamed market) is sent to the current one. Pure (the database lookup is ./resolve.ts), so client code can build
 * links. */

/** "Will the Fed cut rates in December?" → "will-the-fed-cut-rates-in-december" (at most 72 characters). */
export function slugWords(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 72).replace(/-+$/, "");
}

const HEX = /^0x([0-9a-f]{6})/i;

/** A market's human slug: its title's words, then the first 6 hex characters of its id. A Kalshi ticker is already a
 *  readable address, so it is its own slug (lower case). */
export function marketSlug(id: string, title: string): string {
  const h = HEX.exec(id);
  if (!h) return id.toLowerCase();
  const w = slugWords(title);
  return w ? `${w}-${h[1]!.toLowerCase()}` : h[1]!.toLowerCase();
}

export const marketPath = (id: string, title: string): string => `/market/${marketSlug(id, title)}`;
export const racePath = (slug: string): string => `/race/${slug}`;
export const walletPath = (address: string): string => `/wallet/${address.toLowerCase()}`;
export const betPath = (id: string): string => `/bet/${encodeURIComponent(id)}`;

/** What a /market/<slug> names: a full id (old links), a Polymarket id's 6-hex prefix, or a Kalshi ticker. */
export function parseMarketSlug(slug: string): { kind: "id"; id: string } | { kind: "prefix"; prefix: string } | { kind: "kalshi"; ticker: string } | null {
  const s = decodeURIComponent(slug).trim();
  if (/^0x\w{6,}$/i.test(s) && !/-/.test(s)) return { kind: "id", id: s.toLowerCase() };
  const m = /(?:^|-)([0-9a-f]{6})$/.exec(s);
  if (m && !/^kx/i.test(s)) return { kind: "prefix", prefix: `0x${m[1]}` };
  if (/^[a-z0-9][a-z0-9.\-]{2,80}$/i.test(s)) return { kind: "kalshi", ticker: s.toUpperCase() };
  return null;
}

/** A race's address: Polymarket's event slug, or its one market's slug. */
export const raceSlugOf = (key: string, title: string): string => (/^0x/i.test(key) ? marketSlug(key, title) : key);
