/* The team registry: every team Polymarket lists in the leagues we show (its gamma teams data: name, abbreviation,
 * logo, colour), each with a self-hosted, normalized logo in public/teams/<league>/<abbr>-{128,256}.webp and its entry in
 * lib/teams/registry.json. Run daily (.github/workflows/teams-sync.yml) and by hand:  npx tsx scripts/teams-sync.ts
 *
 * Logo source, best first: Polymarket's own logo when it is at least 400px; else, for the four US pro leagues (whose
 * Polymarket logos are 256px), the team's official mark from ESPN's team API (4096px "on black" variant, else 500px),
 * matched by the team's full name exactly. Anything smaller, blank or blurry is rejected: that team gets a monogram.
 * Normalized: transparent background (a flat background colour keyed out from the edges), padding trimmed, scaled so
 * every logo has the same optical size (the same inked area, never wider than 88% of the box) and centred on its visual
 * weight. "Dark" marks (a dark outline and mostly dark ink: they'd vanish on black) are flagged; they sit on a light disc.
 * College teams: only those in Polymarket's open college games (the list grows as the sync runs daily). */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const GAMMA = "https://gamma-api.polymarket.com";
const OUT = "public/teams", REG = "lib/teams/registry.json";
const LEAGUES: Record<string, { label: string; espn?: string; college?: string; soccer?: boolean }> = {
  nba: { label: "NBA", espn: "basketball/nba" }, nfl: { label: "NFL", espn: "football/nfl" }, mlb: { label: "MLB", espn: "baseball/mlb" },
  nhl: { label: "NHL", espn: "hockey/nhl" },
  cfb: { label: "College football", college: "cfb", espn: "football/college-football" },
  cbb: { label: "College basketball", college: "ncaa-basketball", espn: "basketball/mens-college-basketball" },
  epl: { label: "Premier League", espn: "soccer/eng.1,soccer/eng.2", soccer: true }, lal: { label: "La Liga", espn: "soccer/esp.1,soccer/esp.2", soccer: true },
  bun: { label: "Bundesliga", espn: "soccer/ger.1,soccer/ger.2", soccer: true }, sea: { label: "Serie A", espn: "soccer/ita.1,soccer/ita.2", soccer: true },
  fl1: { label: "Ligue 1", espn: "soccer/fra.1,soccer/fra.2", soccer: true }, mls: { label: "MLS", espn: "soccer/usa.1", soccer: true },
  ucl: { label: "Champions League", espn: "soccer/uefa.champions,soccer/uefa.europa,soccer/uefa.europa.conf,soccer/eng.1,soccer/esp.1,soccer/ger.1,soccer/ita.1,soccer/fra.1,soccer/por.1,soccer/ned.1,soccer/bel.1,soccer/tur.1,soccer/sco.1,soccer/aut.1,soccer/sui.1,soccer/den.1,soccer/gre.1,soccer/cze.1", soccer: true }, por: { label: "Primeira Liga", espn: "soccer/por.1,soccer/por.2", soccer: true },
};
const MIN_SOURCE = 400, BOX = 512, TARGET = 300, MAXDIM = 450;

export interface RegTeam { abbr: string; name: string; short: string; color: string; logo: string | null; dark: boolean; source: "polymarket" | "espn" | null; sourceUrl: string | null; espn?: string; note?: string }
interface GammaTeam { name?: string; abbreviation?: string; logo?: string; color?: string; league?: string }

const json = async <T>(url: string): Promise<T | null> => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (r?.ok) return (await r.json()) as T;
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
};
const bytes = async (url: string): Promise<Buffer | null> => {
  const r = await fetch(encodeURI(decodeURI(url)), { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  return r?.ok ? Buffer.from(await r.arrayBuffer()) : null;
};
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const hex = (c: string | undefined | null) => (c && /^#?[0-9a-f]{6}$/i.test(c) ? `#${c.replace("#", "").toLowerCase()}` : "#8a8a93");

async function gammaTeams(league: string): Promise<GammaTeam[]> {
  const all: GammaTeam[] = [];
  for (let off = 0; off < 3000; off += 100) {
    const page = await json<GammaTeam[]>(`${GAMMA}/teams?league=${league}&limit=100&offset=${off}`);
    if (!page?.length) break;
    all.push(...page);
    if (page.length < 100) break;
  }
  return all.filter(t => t.abbreviation && t.name);
}

/** Abbreviations in Polymarket's open games of a league ("cfb-ala-aub-2026-11-28" → ala, aub). */
async function activeAbbrs(league: string, tag: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let off = 0; off < 2000; off += 100) {
    const evs = await json<Array<{ slug?: string }>>(`${GAMMA}/events?tag_slug=${tag}&closed=false&limit=100&offset=${off}`);
    if (!evs?.length) break;
    for (const e of evs) { const m = new RegExp(`^${league}-([a-z0-9]+)-([a-z0-9]+)-\\d{4}-\\d{2}-\\d{2}`).exec(e.slug ?? ""); if (m) { out.add(m[1]!); out.add(m[2]!); } }
    if (evs.length < 100) break;
  }
  return out;
}

interface EspnTeam { displayName: string; shortDisplayName: string; name?: string; location?: string; color?: string; logos: Array<{ rel: string[]; href: string; width: number }> }
async function espnTeams(path: string): Promise<EspnTeam[]> {
  const d = await json<{ sports: Array<{ leagues: Array<{ teams: Array<{ team: EspnTeam }> }> }> }>(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams?limit=500`);
  return d?.sports[0]?.leagues[0]?.teams.map(t => t.team) ?? [];
}
const espnLogo = (t: EspnTeam) => t.logos.find(l => l.rel.includes("primary_logo_on_black_color"))?.href ?? t.logos.find(l => l.rel.includes("default") && !l.rel.includes("dark"))?.href ?? null;

/** The same team on ESPN, or none: its full name exactly; else its nickname when only one team in the league has it
 *  ("Hawks"); for soccer, the name without club words ("Crystal Palace FC" = "Crystal Palace"), else the one team whose
 *  name's words all appear in ours ("Olympique de Marseille" ⊇ "Marseille"). Ambiguous: none (a monogram, never another
 *  team's logo). */
const CLUB = new Set(["bc", "acf", "cfc", "ss", "sco", "osc", "bv", "cs", "fa", "jk", "ao", "kks", "fc", "cf", "afc", "sc", "ac", "ssc", "as", "ud", "rc", "rcd", "cd", "ca", "club", "de", "del", "calcio", "sv", "vfb", "vfl", "tsg", "fsv", "1", "1899", "1846", "1848", "1904", "1909", "us", "ogc", "aj", "sl", "fk", "sk", "nk", "bk", "if"]);
const GENERIC = new Set(["olympique", "racing", "club", "sport", "lisboa", "e", "stade", "da", "do", "la", "futbol", "balompie", "praia", "milano", "armenia", "gnk", "rsc", "mh", "kf", "1893", "1907", "1913", "1910", "1901", "05", "04", "09"]);
const words = (s: string) => norm(s).split(" ").filter(w => w && !CLUB.has(w));
/** Clubs whose names differ by language or form on the two sites, checked by hand: Polymarket's → ESPN's. */
const ALIAS: Record<string, string> = {
  "fc bayern munchen": "Bayern Munich", "olympique lyonnais": "Lyon", "stade brestois 29": "Brest", "1 fc koln": "FC Cologne",
  "rcd espanyol de barcelona": "Espanyol", "deportivo alaves": "Alavés", "rayo vallecano de madrid": "Rayo Vallecano",
  "rc strasbourg alsace": "Strasbourg", "hamburger sv": "Hamburg SV", "vitoria sc": "Vitória de Guimarães", "lille osc": "Lille",
};
function espnMatch(name: string, espn: EspnTeam[], soccer: boolean): EspnTeam | undefined {
  const one = (l: EspnTeam[]) => (l.length === 1 ? l[0] : undefined);
  const alias = ALIAS[norm(name)];
  if (alias) return one(espn.filter(x => norm(x.displayName) === norm(alias)));
  const full = one(espn.filter(x => norm(x.displayName) === norm(name)));
  if (full) return full;
  const nick = one(espn.filter(x => x.name && norm(x.name) === norm(name)));
  if (nick || !soccer) return nick;
  const ours = words(name), key = ours.join(" ");
  const same = one(espn.filter(x => words(x.displayName).join(" ") === key));
  if (same) return same;
  // A shorter name inside ours, only when what's left over is generic ("Olympique de Marseille" ⊇ "Marseille"), never
  // another word ("Dynama-Brest" is not "Brest").
  const sub = espn.filter(x => { const w = words(x.displayName); return w.length > 0 && w.some(t => t.length >= 4) && w.every(t => ours.includes(t)) && ours.filter(t => !w.includes(t)).every(t => GENERIC.has(t)); });
  return one(sub);
}

type Normalized = { ok: true; img256: Buffer; img128: Buffer; dark: boolean; note?: string } | { ok: false; why: string };

/** Transparent background, trimmed, the same optical size, centred on visual weight. */
export async function normalizeLogo(src: Buffer): Promise<Normalized> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try { meta = await sharp(src).metadata(); } catch { return { ok: false, why: "unreadable image" }; }
  const svg = meta.format === "svg";
  if (!svg && Math.min(meta.width ?? 0, meta.height ?? 0) < MIN_SOURCE) return { ok: false, why: `source ${meta.width}×${meta.height}, under ${MIN_SOURCE}px` };
  const { data, info } = await sharp(src, svg ? { density: 600 } : {}).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: !svg }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, px = (x: number, y: number) => (y * W + x) * 4;
  let note: string | undefined;
  // A flat, opaque background (all four corners the same colour): key it out from the edges inward.
  const corners = [px(1, 1), px(W - 2, 1), px(1, H - 2), px(W - 2, H - 2)];
  const close = (i: number, j: number, t: number) => Math.abs(data[i]! - data[j]!) + Math.abs(data[i + 1]! - data[j + 1]!) + Math.abs(data[i + 2]! - data[j + 2]!) <= t;
  if (corners.every(c => data[c + 3]! > 245) && corners.every(c => close(c, corners[0]!, 30))) {
    const bg = corners[0]!, seen = new Uint8Array(W * H), stack: number[] = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const p = stack.pop()!;
      if (seen[p]) continue;
      seen[p] = 1;
      if (!close(p * 4, bg, 48)) continue;
      data[p * 4 + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1); if (x < W - 1) stack.push(p + 1); if (y > 0) stack.push(p - W); if (y < H - 1) stack.push(p + W);
    }
    note = "background keyed out";
  }
  // Bounding box, inked area and centre of weight.
  let x0 = W, y0 = H, x1 = -1, y1 = -1, area = 0, cx = 0, cy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = data[px(x, y) + 3]!;
    if (a > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (a > 128) { area++; cx += x; cy += y; }
  }
  if (x1 < 0 || area < 500) return { ok: false, why: "blank image" };
  // Still a solid rectangle (a logo on a background we couldn't take out): not a mark we can show on black.
  if (!note && area > 0.94 * (x1 - x0 + 1) * (y1 - y0 + 1)) return { ok: false, why: "logo on an opaque background" };
  cx /= area; cy /= area;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const s = Math.min(TARGET / Math.sqrt(area), MAXDIM / Math.max(bw, bh));
  // The largest file served is 256px for this 512 box: a source pixel is stretched s/2 times. More than 1.2x is blurry.
  if (!svg && s / 2 > 1.2) return { ok: false, why: `would be upscaled ${(s / 2).toFixed(1)}x (blurry)` };
  const tw = Math.max(1, Math.round(bw * s)), th = Math.max(1, Math.round(bh * s));
  const cropped = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).extract({ left: x0, top: y0, width: bw, height: bh }).resize(tw, th).png().toBuffer();
  // Centre on half the box centre, half the centre of weight; never off the canvas.
  const fx = ((x0 + bw / 2) + cx) / 2 - x0, fy = ((y0 + bh / 2) + cy) / 2 - y0;
  const left = Math.round(Math.min(Math.max(BOX / 2 - fx * s, 16), BOX - 16 - tw)), top = Math.round(Math.min(Math.max(BOX / 2 - fy * s, 16), BOX - 16 - th));
  const canvas = await sharp({ create: { width: BOX, height: BOX, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cropped, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
  // Dark: the mark's outer edge is dark, so it would vanish on black.
  const { data: c } = await sharp(canvas).raw().toBuffer({ resolveWithObject: true });
  let lum = 0, n = 0, inked = 0, seen = 0;
  const A = (x: number, y: number) => c[(y * BOX + x) * 4 + 3]!;
  for (let y = 2; y < BOX - 2; y++) for (let x = 2; x < BOX - 2; x++) {
    if (A(x, y) <= 128) continue;
    { const i = (y * BOX + x) * 4; inked++; if (Math.max(c[i]!, c[i + 1]!, c[i + 2]!) > 90) seen++; } // a saturated red reads on black too
    if (A(x - 2, y) > 128 && A(x + 2, y) > 128 && A(x, y - 2) > 128 && A(x, y + 2) > 128) continue;
    const i = (y * BOX + x) * 4, l = (0.2126 * c[i]! + 0.7152 * c[i + 1]! + 0.0722 * c[i + 2]!) / 255;
    lum += l; n++;
  }
  // Dark only when the outline is dark AND most of the mark is too: a thin black outline round a colourful logo is fine.
  const dark = n > 0 && lum / n < 0.24 && seen / Math.max(1, inked) < 0.55;
  const img256 = await sharp(canvas).resize(256, 256).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toBuffer();
  const img128 = await sharp(canvas).resize(128, 128).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toBuffer();
  return { ok: true, img256, img128, dark, note };
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { for (let t = q.shift(); t !== undefined; t = q.shift()) await fn(t); }));
}

async function main() {
  const only = process.argv[2];
  const prev = existsSync(REG) ? (JSON.parse(readFileSync(REG, "utf8")) as { leagues: Record<string, { label: string; teams: RegTeam[] }> }) : { leagues: {} };
  const leagues: Record<string, { label: string; teams: RegTeam[] }> = { ...prev.leagues };
  for (const [league, cfg] of Object.entries(LEAGUES)) {
    if (only && only !== league) continue;
    let teams = await gammaTeams(league);
    if (cfg.college) {
      const active = await activeAbbrs(league, cfg.college), had = new Set((prev.leagues[league]?.teams ?? []).map(t => t.abbr));
      teams = teams.filter(t => active.has(t.abbreviation!.toLowerCase()) || had.has(t.abbreviation!.toLowerCase()));
    }
    // One entry per abbreviation (Polymarket lists a few twice); the one with a logo first.
    const byAbbr = new Map<string, GammaTeam>();
    for (const t of teams) { const a = t.abbreviation!.toLowerCase(); if (!byAbbr.has(a) || (!byAbbr.get(a)!.logo && t.logo)) byAbbr.set(a, t); }
    // Every ESPN league listed (a promoted or relegated club is in the second division's list; a Champions League club
    // in its own country's), one team per name.
    const espn: EspnTeam[] = [];
    for (const path of (cfg.espn ?? "").split(",").filter(Boolean)) for (const t of await espnTeams(path)) if (!espn.some(x => x.displayName === t.displayName)) espn.push(t);
    mkdirSync(join(OUT, league), { recursive: true });
    const out: RegTeam[] = [];
    let ok = 0;
    await pool([...byAbbr], 6, async ([abbr, t]) => {
      const e = espnMatch(t.name!, espn, Boolean(cfg.soccer));
      const tries: Array<{ source: "polymarket" | "espn"; url: string }> = [];
      if (t.logo) tries.push({ source: "polymarket", url: t.logo });
      const el = e ? espnLogo(e) : null;
      if (el) tries.push({ source: "espn", url: el });
      const short = e?.shortDisplayName ?? t.name!.replace(/\b(FC|CF|AFC|SC|AC|SSC|UD|RC|CD|CA)\b\.?/g, "").replace(/\s+/g, " ").trim();
      const entry: RegTeam = { abbr, name: t.name!.trim(), short, color: hex(e?.color ?? t.color), logo: null, dark: false, source: null, sourceUrl: null };
      const why: string[] = [];
      for (const s of tries) {
        const buf = await bytes(s.url);
        if (!buf) { why.push(`${s.source}: download failed`); continue; }
        const n = await normalizeLogo(buf);
        if (!n.ok) { why.push(`${s.source}: ${n.why}`); continue; }
        writeFileSync(join(OUT, league, `${abbr}-256.webp`), n.img256);
        writeFileSync(join(OUT, league, `${abbr}-128.webp`), n.img128);
        Object.assign(entry, { logo: `/teams/${league}/${abbr}`, dark: n.dark, source: s.source, sourceUrl: s.url, note: n.note, ...(s.source === "espn" ? { espn: e!.displayName } : {}) });
        ok++;
        break;
      }
      if (!entry.logo) entry.note = why.join("; ") || "no logo listed";
      out.push(entry);
    });
    // The same image for different teams is a placeholder (Polymarket uses one for teams without a logo): none of them
    // gets it.
    const byHash = new Map<string, RegTeam[]>();
    for (const t of out) if (t.logo) { const h = createHash("sha1").update(readFileSync(join(OUT, league, `${t.abbr}-128.webp`))).digest("hex"); byHash.set(h, [...(byHash.get(h) ?? []), t]); }
    for (const same of byHash.values()) {
      if (new Set(same.map(t => t.name)).size < 2) continue;
      for (const t of same) {
        for (const s of [128, 256]) rmSync(join(OUT, league, `${t.abbr}-${s}.webp`), { force: true });
        Object.assign(t, { logo: null, dark: false, source: null, sourceUrl: null, espn: undefined, note: `placeholder image shared by ${same.length} teams` });
      }
    }
    out.sort((a, b) => a.abbr.localeCompare(b.abbr));
    leagues[league] = { label: cfg.label, teams: out };
    console.log(`${league}: ${out.length} teams, ${ok} logos, ${out.length - ok} monograms`);
  }
  // A Champions League club with no logo of its own takes its domestic league's (the same club, by name).
  if (leagues.ucl) {
    const home = Object.entries(leagues).filter(([l]) => l !== "ucl" && LEAGUES[l]?.soccer).flatMap(([l, v]) => v.teams.filter(t => t.logo).map(t => ({ l, t })));
    for (const t of leagues.ucl.teams) {
      if (t.logo) continue;
      const hit = home.filter(h => words(h.t.name).join(" ") === words(t.name).join(" "));
      if (hit.length !== 1) continue;
      const { l, t: d } = hit[0]!;
      for (const s of [128, 256]) writeFileSync(join(OUT, "ucl", `${t.abbr}-${s}.webp`), readFileSync(join(OUT, l, `${d.abbr}-${s}.webp`)));
      Object.assign(t, { logo: `/teams/ucl/${t.abbr}`, dark: d.dark, source: d.source, sourceUrl: d.sourceUrl, espn: d.espn, note: `the ${LEAGUES[l]!.label} logo` });
    }
  }
  writeFileSync(REG, JSON.stringify({ leagues }, null, 1) + "\n");
}

if (process.argv[1]?.endsWith("teams-sync.ts")) main().catch(e => { console.error(e); process.exit(1); });
