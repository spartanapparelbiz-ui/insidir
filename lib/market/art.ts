/* The image each market already carries in Polymarket's gamma API (the market's image, else its event's), shown on that
 * market only, plus the candidate name it's for (groupItemTitle, "James Talarico (D)") and its event ("Texas Senate
 * Election Winner"). A face is shown only when it checks out: the image's file name carries the candidate's name AND the
 * race (state and office), else initials. LOGOS=off removes every team and league image at once. Cached 10 minutes.
 * Server only. */
import { memo } from "@/lib/memo";

const GAMMA = "https://gamma-api.polymarket.com";
export interface MarketArt { marketId: string; image: string | null; name: string | null; party: "D" | "R" | "I" | null; event: string | null; eventSlug: string | null; price: number | null; question: string; closed: boolean }

export const logosOff = (): boolean => (process.env.LOGOS ?? "").toLowerCase() === "off";
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "James Talarico (D)" → { name: "James Talarico", party: "D" }. */
export function candidateOf(groupItemTitle: string | null | undefined): { name: string; party: "D" | "R" | "I" | null } | null {
  if (!groupItemTitle) return null;
  const m = /^(.+?)\s*\(([DRI])\)\s*$/.exec(groupItemTitle.trim());
  return m ? { name: m[1]!.trim(), party: m[2] as "D" | "R" | "I" } : null;
}

/** The race in an event title: "Texas Senate Election Winner" → ["texas", "senate"]; "Georgia Governor Election" →
 *  ["georgia", "governor"]. Null when it names no single state race. */
export function raceOf(event: string | null | undefined): string[] | null {
  const m = /^([A-Za-z.' ]+?)\s+(Senate|Governor|House|Gubernatorial|Mayor(?:al)?)\b/i.exec((event ?? "").trim());
  // A place is one to three words, never a question ("Which party will win the House").
  if (!m || m[1]!.split(/\s+/).length > 3 || /\b(which|will|win|party|who|control|the)\b/i.test(m[1]!)) return null;
  const office = m[2]!.toLowerCase().replace("gubernatorial", "governor").replace("mayoral", "mayor");
  return [...slug(m[1]!).split("-"), office];
}

/** Name AND race in the image's file name ("midterms-26-james-talarico-texas-senate-….jpg"), or no face. */
export function verifiedHeadshot(image: string | null | undefined, candidate: string | null | undefined, event: string | null | undefined): boolean {
  if (!image || !candidate) return false;
  const file = slug(decodeURIComponent(image.split("/").pop() ?? ""));
  const race = raceOf(event);
  return Boolean(race) && file.includes(slug(candidate)) && file.includes(race!.join("-"));
}

interface GammaMarket { closed?: boolean; conditionId?: string; question?: string; image?: string; icon?: string; groupItemTitle?: string; outcomePrices?: string; events?: Array<{ title?: string; slug?: string; image?: string }> }
const readPrice = (m: GammaMarket): number | null => { try { const p = JSON.parse(m.outcomePrices ?? "[]") as string[]; const v = Number(p[0]); return Number.isFinite(v) ? v : null; } catch { return null; } };
export const toArt = (m: GammaMarket): MarketArt => {
  const c = candidateOf(m.groupItemTitle);
  return { marketId: String(m.conditionId ?? ""), image: m.image || m.icon || m.events?.[0]?.image || null, name: c?.name ?? null, party: c?.party ?? null,
    event: m.events?.[0]?.title ?? null, eventSlug: m.events?.[0]?.slug ?? null, price: readPrice(m), question: String(m.question ?? ""), closed: Boolean(m.closed) };
};

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } }).catch(() => null);
  return r?.ok ? (await r.json().catch(() => null)) as T | null : null;
}

/** Art for up to 40 markets by condition id (one request), cached 10 minutes. Missing ones are left out. */
export async function artFor(marketIds: readonly string[]): Promise<Map<string, MarketArt>> {
  const ids = [...new Set(marketIds.filter(id => /^0x[0-9a-f]{64}$/i.test(id)))].slice(0, 40);
  if (!ids.length) return new Map();
  const key = `gamma:art:${ids.slice().sort().join(",")}`;
  const list = await memo(key, 10 * 60_000, () => getJson<GammaMarket[]>(`${GAMMA}/markets?${ids.map(i => `condition_ids=${i}`).join("&")}&limit=${ids.length}`)).catch(() => null);
  return new Map((list ?? []).map(toArt).filter(a => a.marketId).map(a => [a.marketId, a]));
}

/** Every candidate market of an event ("texas-senate-election-winner"), cached 2 minutes for live prices. */
export async function eventMarkets(eventSlug: string): Promise<MarketArt[]> {
  const ev = await memo(`gamma:event:${eventSlug}`, 2 * 60_000, () => getJson<Array<{ title?: string; slug?: string; image?: string; markets?: GammaMarket[] }>>(`${GAMMA}/events?slug=${encodeURIComponent(eventSlug)}`)).catch(() => null);
  const e = ev?.[0];
  if (!e?.markets) return [];
  // Closed markets stay: a settled race shows its result.
  return e.markets.map(m => toArt({ ...m, events: [{ title: e.title, slug: e.slug, image: e.image }] }));
}
