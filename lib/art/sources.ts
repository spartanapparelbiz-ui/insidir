/* Where the art comes from, all free and keyless:
 *   Wikidata / Wikimedia Commons  people's portraits (P18), logos (P154), brand colours (P465), CIKs (P5531). Every
 *                                 request sends WIKI_UA and waits its turn: one request a second at most, to every
 *                                 Wikimedia host together; a 429 waits as long as it says and tries again.
 *   Unsplash's image CDN          tracker photos (lib/photos.ts), under the Unsplash License
 *   Simple Icons (CC0)            brand marks and their colours, from the npm package on jsDelivr
 *   flag-icons (MIT)              flags, from the npm package on jsDelivr
 *   public/logos                  team logos; league files; company logos at 128px (art of 64px or less only)
 * Server only (the art job). */
import { readFile } from "node:fs/promises";

export const WIKI_UA = "InsidirBot/1.0 (hello@aethric.llc)";
const WIKI_HOST = /(^|\.)(wikidata|wikimedia|wikipedia)\.org$/;
const SIMPLE_ICONS = "https://cdn.jsdelivr.net/npm/simple-icons@16.36.0";
const FLAG_ICONS = "https://cdn.jsdelivr.net/npm/flag-icons@7.5.0";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastWiki = 0;
let wikiQueue: Promise<void> = Promise.resolve();
export let wikiRequests = 0;

/** A fetch that, for Wikimedia hosts, sends the bot's User-Agent and keeps to one request a second (in order). */
export async function get(url: string, init: RequestInit = {}, tries = 4): Promise<Response> {
  const wiki = WIKI_HOST.test(new URL(url).host);
  const headers = { "user-agent": wiki ? WIKI_UA : "Insidir art job (https://insidir.com/credits)", ...(init.headers as Record<string, string> | undefined) };
  for (let i = 0; ; i++) {
    if (wiki) {
      const turn = wikiQueue.then(async () => { const wait = lastWiki + 1100 - Date.now(); if (wait > 0) await sleep(wait); lastWiki = Date.now(); });
      wikiQueue = turn.catch(() => undefined);
      await turn;
      wikiRequests++;
    }
    const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(60_000) }).catch((e: unknown) => e as Error);
    if (res instanceof Response && res.status !== 429 && res.status < 500) return res;
    if (i >= tries - 1) { if (res instanceof Response) return res; throw res; }
    const after = res instanceof Response ? Number(res.headers.get("retry-after")) : NaN;
    await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** i);
  }
}

export async function bytes(url: string): Promise<Buffer> {
  const r = await get(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

/* ---------- Wikidata ---------- */
export type Binding = Record<string, { value: string } | undefined>;
export async function sparql(query: string): Promise<Binding[]> {
  const r = await get("https://query.wikidata.org/sparql", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/sparql-results+json" }, body: new URLSearchParams({ query }).toString() });
  if (!r.ok) throw new Error(`sparql ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { results: { bindings: Binding[] } }).results.bindings;
}

export interface WikiItem { qid: string; label: string; claims: Record<string, string[]> }
/** Wikidata items by English Wikipedia title (50 a request): their label and the claims named (best rank first). */
export async function itemsByEnwiki(titles: string[], props: string[]): Promise<Map<string, WikiItem>> {
  const out = new Map<string, WikiItem>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&sites=enwiki&props=labels|claims|sitelinks&languages=en&sitefilter=enwiki&titles=${encodeURIComponent(batch.join("|"))}`;
    const j = await (await get(u)).json() as { entities?: Record<string, { id: string; labels?: { en?: { value: string } }; sitelinks?: { enwiki?: { title: string } }; claims?: Record<string, Array<{ rank: string; mainsnak: { datavalue?: { value: unknown } } }>> }> };
    for (const e of Object.values(j.entities ?? {})) {
      const title = e.sitelinks?.enwiki?.title?.replace(/ /g, "_");
      if (!title || !e.id?.startsWith("Q")) continue;
      const claims: Record<string, string[]> = {};
      for (const p of props) {
        const cs = (e.claims?.[p] ?? []).filter(c => c.rank !== "deprecated").sort((a, b) => (b.rank === "preferred" ? 1 : 0) - (a.rank === "preferred" ? 1 : 0));
        claims[p] = cs.map(c => c.mainsnak.datavalue?.value).filter((v): v is string => typeof v === "string");
      }
      out.set(title, { qid: e.id, label: e.labels?.en?.value ?? title.replace(/_/g, " "), claims });
    }
  }
  return out;
}

/** A Commons file name from a SPARQL image value ("http://commons.wikimedia.org/wiki/Special:FilePath/X.jpg"). */
export const commonsName = (v: string) => decodeURIComponent(v.replace(/^.*Special:FilePath\//, "")).replace(/_/g, " ");

/* ---------- Commons ---------- */
export interface CommonsFile {
  name: string; url: string; page: string; mime: string; w: number; h: number;
  /** A copy at most 2048 wide (the original when it is smaller). */
  thumb: string;
  license: string; licenseUrl: string | null; author: string | null;
}
const text = (html: string | undefined) => html ? html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim() || null : null;

export async function commonsFiles(names: string[]): Promise<Map<string, CommonsFile>> {
  const out = new Map<string, CommonsFile>();
  const uniq = [...new Set(names)];
  for (let i = 0; i < uniq.length; i += 50) {
    const titles = uniq.slice(i, i + 50).map(n => `File:${n}`).join("|");
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=2048&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist&titles=${encodeURIComponent(titles)}`;
    const j = await (await get(u)).json() as { query?: { normalized?: Array<{ from: string; to: string }>; pages?: Record<string, { title: string; imageinfo?: Array<{ url: string; descriptionurl: string; mime: string; width: number; height: number; thumburl?: string; thumbwidth?: number; extmetadata?: Record<string, { value: string }> }> }> } };
    const from = new Map((j.query?.normalized ?? []).map(n => [n.to, n.from]));
    for (const p of Object.values(j.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const name = (from.get(p.title) ?? p.title).replace(/^File:/, "");
      const m = ii.extmetadata ?? {};
      out.set(name, {
        name, url: ii.url, page: ii.descriptionurl, mime: ii.mime, w: ii.width, h: ii.height,
        thumb: ii.thumburl && (ii.thumbwidth ?? 0) <= ii.width ? ii.thumburl : ii.url,
        license: text(m.LicenseShortName?.value) ?? "", licenseUrl: m.LicenseUrl?.value ?? null, author: text(m.Artist?.value),
      });
    }
  }
  return out;
}

/** Portraits may only be Public Domain, CC0, CC BY or CC BY-SA (any version); never NC or ND. */
export const freeForPeople = (license: string): boolean =>
  !/\b(nc|nd)\b|non-?commercial|no ?deriv/i.test(license) && /^(public domain|pd\b|pd-|cc0|cc[ -]?zero|cc[ -]by(-sa)?(\s|$|-?\d))/i.test(license.trim());
/** CC BY-SA: the duotone is adapted and shared alike. */
export const shareAlike = (license: string) => /by-sa/i.test(license);

/* ---------- Unsplash ---------- */
/** The CDN's own crop around a focal point, square, at most 2048 (it never enlarges past the original). */
export const unsplashSquare = (id: string, fx: number, fy: number, w = 2048) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&crop=focalpoint&fp-x=${fx}&fp-y=${fy}&w=${w}&h=${w}&q=85&fm=jpg`;

/* ---------- Simple Icons ---------- */
export interface SimpleIcon { slug: string; title: string; hex: string; aka: string[] }
let icons: SimpleIcon[] | null = null;
export async function simpleIcons(): Promise<SimpleIcon[]> {
  if (!icons) {
    const raw = await (await get(`${SIMPLE_ICONS}/data/simple-icons.json`)).json() as Array<{ title: string; slug: string; hex: string; aliases?: { aka?: string[] } }>;
    icons = raw.map(i => ({ slug: i.slug, title: i.title, hex: `#${i.hex.toUpperCase()}`, aka: i.aliases?.aka ?? [] }));
  }
  return icons;
}
export const simpleIconSvg = (slug: string) => bytes(`${SIMPLE_ICONS}/icons/${slug}.svg`);
export const simpleIconPage = (slug: string) => `https://simpleicons.org/?q=${slug}`;

/** A company's name as a brand: "NVIDIA CORP" → "nvidia", "Meta Platforms, Inc." → "meta platforms". */
export const brandName = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[,.]/g, " ")
  .replace(/\b(inc|incorporated|corp|corporation|co|company|holdings?|group|plc|ltd|limited|llc|lp|sa|nv|ag|se|class [abc]|the|new|de)\b/g, " ").replace(/[^a-z0-9&+ ]/g, "").replace(/\s+/g, " ").trim();

export async function iconFor(name: string): Promise<SimpleIcon | null> {
  const n = brandName(name);
  if (!n) return null;
  const all = await simpleIcons();
  const norm = (t: string) => brandName(t);
  return all.find(i => norm(i.title) === n) ?? all.find(i => i.aka.some(a => norm(a) === n)) ?? all.find(i => i.slug === n.replace(/[^a-z0-9]/g, "")) ?? null;
}

/* ---------- flags and repo files ---------- */
export const flagSvg = (iso2: string) => bytes(`${FLAG_ICONS}/flags/4x3/${iso2}.svg`);
export const flagPage = (iso2: string) => `https://github.com/lipis/flag-icons/blob/main/flags/4x3/${iso2}.svg`;
export const repoFile = (path: string) => readFile(`public${path}`);
