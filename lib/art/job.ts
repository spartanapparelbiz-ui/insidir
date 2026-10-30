/* The art job (jobs/art.ts runs it on Railway; it needs the internet the site's own sandbox doesn't have). It finds
 * every entity the product names, makes the ones without art (or with art from an older version of this job, or a
 * monogram older than a week, in case a free picture has appeared since), stores each square in the art bucket as
 * AVIF and WebP at every width it has, and records it in terminal.entity_art. Each artwork is made once.
 *
 *   trackers   their Unsplash photo (lib/photos.ts), natural colour
 *   people     insiders (their Wikidata item by CIK, or the executive of their company with their surname) and the
 *              public figures markets name (lib/art/places.ts): Wikidata P18 on Commons, only Public Domain, CC0,
 *              CC BY or CC BY-SA; a duotone in their company's colour (ink for everyone else); else a monogram
 *   companies, funds, leagues   the logo (Wikidata P154 on Commons, else Simple Icons, else the 128px file in
 *              public/logos/stocks for art of 64px or less) in white on the brand colour (P465, else Simple Icons'
 *              hex, else the logo's own colour); full colour on white when white would lose it; else a monogram
 *   teams      public/logos/teams on the team's colour (lib/art/teams.ts), on white where it would vanish; soccer
 *              clubs from Commons when their crest is there
 *   countries  flag-icons, centred on white
 * Server only. */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import manifest from "@/public/logos/manifest.json";
import type { Db } from "@/lib/db";
import { entityArt } from "@/lib/db/schema";
import { PHOTOS, trackerPhoto } from "@/lib/photos";
import { personName } from "@/lib/profiles/name";
import { niceName } from "@/lib/stocks/names";
import { TRACKERS } from "@/lib/trackers";
import { tickerOfName } from "@/lib/logos";
import { companyArtId, countryArtId, figureArtId, fundArtId, INK, initialsOf, insiderArtId, keyOf, leagueArtId, teamArtId, trackerArtId } from "./ids";
import { COUNTRIES, FIGURES } from "./places";
import type { ArtKind, Treatment } from "./ref";
import { contrast, duotone, encodeLadder, flagArt, logoStats, markArt, mix, photoSquare, rasterLogo, teamArt } from "./render";
import { bucket, putObject } from "./s3";
import {
  bytes, commonsFiles, commonsName, flagPage, flagSvg, freeForPeople, iconFor, itemsByEnwiki, repoFile, shareAlike, simpleIconPage,
  simpleIconSvg, simpleIcons, sparql, unsplashSquare, wikiRequests, type CommonsFile,
} from "./sources";
import { CLUBS, TEAM_COLOURS } from "./teams";

/** Bump to remake every artwork (a change to a treatment). */
export const ART_VERSION = 1;
const RETRY_MONOGRAMS_MS = 7 * 86_400_000;

export const LEAGUES: Record<string, { label: string; wiki: string; icon?: string }> = {
  nba: { label: "NBA", wiki: "National_Basketball_Association", icon: "nba" }, nfl: { label: "NFL", wiki: "National_Football_League" },
  mlb: { label: "MLB", wiki: "Major_League_Baseball", icon: "mlb" }, nhl: { label: "NHL", wiki: "National_Hockey_League", icon: "nhl" },
  epl: { label: "Premier League", wiki: "Premier_League", icon: "premierleague" }, laliga: { label: "La Liga", wiki: "La_Liga" },
  seriea: { label: "Serie A", wiki: "Serie_A" }, bundesliga: { label: "Bundesliga", wiki: "Bundesliga" }, ligue1: { label: "Ligue 1", wiki: "Ligue_1" },
  ucl: { label: "Champions League", wiki: "UEFA_Champions_League" }, ufc: { label: "UFC", wiki: "Ultimate_Fighting_Championship", icon: "ufc" },
  cfb: { label: "College football", wiki: "College_football" }, fifa: { label: "FIFA", wiki: "FIFA", icon: "fifa" }, f1: { label: "Formula 1", wiki: "Formula_One", icon: "f1" },
  dota2: { label: "Dota 2", wiki: "Dota_2", icon: "dota2" }, counterstrike: { label: "Counter-Strike", wiki: "Counter-Strike_2", icon: "counterstrike" },
  leagueoflegends: { label: "League of Legends", wiki: "League_of_Legends", icon: "leagueoflegends" }, valorant: { label: "Valorant", wiki: "Valorant", icon: "valorant" },
};

/* ---------- what there is ---------- */
export type Entity =
  | { kind: "tracker"; id: string; label: string; slug: string }
  | { kind: "team"; id: string; label: string; league: "nba" | "nfl" | "mlb" | "nhl"; abbr: string }
  | { kind: "team"; id: string; label: string; league: "soccer"; club: string }
  | { kind: "league"; id: string; label: string; league: string }
  | { kind: "country"; id: string; label: string; iso2: string }
  | { kind: "company"; id: string; label: string; ticker: string | null; cik: string | null; raw: string }
  | { kind: "fund"; id: string; label: string; cik: string }
  | { kind: "person"; id: string; label: string; cik: string; issuerCik: string | null; companyId: string | null }
  | { kind: "person"; id: string; label: string; figure: string; wiki: string };

const rows = async <T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> => ((await db.execute(q)) as unknown as { rows: T[] }).rows;

export async function entities(db: Db): Promise<Entity[]> {
  const out: Entity[] = [];
  for (const t of TRACKERS) out.push({ kind: "tracker", id: trackerArtId(t.slug), label: t.name, slug: t.slug });
  for (const lg of ["nba", "nfl", "mlb", "nhl"] as const) for (const abbr of (manifest.teams as Record<string, string[]>)[lg] ?? [])
    out.push({ kind: "team", id: teamArtId(lg, abbr), label: `${lg.toUpperCase()} ${abbr}`, league: lg, abbr });
  for (const c of CLUBS) out.push({ kind: "team", id: teamArtId("soccer", c.slug), label: c.names[0]!.replace(/\b\w/g, x => x.toUpperCase()), league: "soccer", club: c.slug });
  for (const [id, l] of Object.entries(LEAGUES)) out.push({ kind: "league", id: leagueArtId(id), label: l.label, league: id });
  for (const [iso2, name] of COUNTRIES) out.push({ kind: "country", id: countryArtId(iso2), label: name, iso2 });
  for (const [fig, wiki, name] of FIGURES) out.push({ kind: "person", id: figureArtId(fig), label: name, figure: fig, wiki });

  const insiders = await rows<{ owner_cik: string; owner: string; issuer_cik: string; ticker: string | null; company: string }>(db, sql`
    select distinct on (detail->>'ownerCik') detail->>'ownerCik' as owner_cik, detail->>'ownerName' as owner, detail->>'issuerCik' as issuer_cik,
      nullif(detail->>'ticker', '') as ticker, detail->>'company' as company
    from terminal.moves where source = 'sec' and detail->>'kind' = 'insider' and detail->>'ownerCik' is not null
    order by detail->>'ownerCik', at desc`);
  const companies = new Map<string, Entity>();
  for (const r of insiders) {
    const cid = companyArtId(r.ticker, r.issuer_cik);
    if (!companies.has(cid)) companies.set(cid, { kind: "company", id: cid, label: niceName(r.company), ticker: r.ticker, cik: r.issuer_cik, raw: r.company });
    out.push({ kind: "person", id: insiderArtId(r.owner_cik), label: personName(r.owner), cik: r.owner_cik, issuerCik: r.issuer_cik, companyId: cid });
  }
  const funds = await rows<{ fund_cik: string; fund: string; company: string }>(db, sql`
    select distinct on (detail->>'fundCik', detail->>'company') detail->>'fundCik' as fund_cik, detail->>'fund' as fund, detail->>'company' as company
    from terminal.moves where source = 'sec' and detail->>'kind' = 'fund'`);
  const seenFunds = new Set<string>();
  for (const r of funds) {
    if (!seenFunds.has(r.fund_cik)) { seenFunds.add(r.fund_cik); out.push({ kind: "fund", id: fundArtId(r.fund_cik), label: niceName(r.fund), cik: r.fund_cik }); }
    const t = tickerOfName(r.company);
    if (t && !companies.has(companyArtId(t))) companies.set(companyArtId(t), { kind: "company", id: companyArtId(t), label: niceName(r.company), ticker: t, cik: null, raw: r.company });
  }
  out.push(...companies.values());
  return out;
}

/* ---------- what's made ---------- */
interface Made {
  t: Treatment; colour: string; brand?: string | null; png?: Buffer; n?: number; fx?: number; fy?: number;
  sourceUrl?: string | null; sourcePage?: string | null; license?: string | null; licenseUrl?: string | null; author?: string | null; adapted?: boolean; why?: string | null;
}
const mono = (colour: string, why: string, brand?: string | null): Made => ({ t: "monogram", colour, brand, why });

/** Wikidata facts gathered in batches before anything is drawn. */
interface Facts {
  orgs: Map<string, { qid: string; label: string; logos: string[]; colour: string | null; execs: Array<{ qid: string; label: string; img: string | null; cik: string | null }> }>;
  peopleByCik: Map<string, { qid: string; label: string; img: string | null }>;
  enwiki: Map<string, { qid: string; label: string; claims: Record<string, string[]> }>;
  files: Map<string, CommonsFile>;
}

const pad = (cik: string) => cik.replace(/^0+/, "").padStart(10, "0");
const unpad = (cik: string) => cik.replace(/^0+/, "");
const lit = (s: string) => `"${s.replace(/["\\]/g, "")}"`;
const svgFirst = (names: string[]) => [...names].sort((a, b) => Number(/\.svg$/i.test(b)) - Number(/\.svg$/i.test(a)));

async function gather(todo: Entity[], log: (s: string) => void): Promise<Facts> {
  const facts: Facts = { orgs: new Map(), peopleByCik: new Map(), enwiki: new Map(), files: new Map() };
  const orgCiks = [...new Set(todo.flatMap(e => (e.kind === "company" && e.cik) || e.kind === "fund" ? [(e as { cik: string }).cik] : []))];
  // Companies and funds by CIK (P5531), with their logo, colour and executives.
  for (let i = 0; i < orgCiks.length; i += 80) {
    const batch = orgCiks.slice(i, i + 80);
    const vals = batch.flatMap(c => [lit(pad(c)), lit(unpad(c))]).join(" ");
    try {
      const b = await sparql(`SELECT ?cik ?item ?itemLabel ?logo ?colour ?exec ?execLabel ?execImg ?execCik WHERE {
        VALUES ?cik { ${vals} } ?item wdt:P5531 ?cik .
        OPTIONAL { ?item wdt:P154 ?logo } OPTIONAL { ?item wdt:P465 ?colour }
        OPTIONAL { VALUES ?role { wdt:P169 wdt:P488 wdt:P112 wdt:P1037 } ?item ?role ?exec . OPTIONAL { ?exec wdt:P18 ?execImg } OPTIONAL { ?exec wdt:P5531 ?execCik } }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
      for (const r of b) {
        const cik = unpad(r.cik!.value);
        const o = facts.orgs.get(cik) ?? { qid: r.item!.value.replace(/^.*\//, ""), label: r.itemLabel?.value ?? "", logos: [], colour: null, execs: [] };
        if (r.logo && !o.logos.includes(commonsName(r.logo.value))) o.logos.push(commonsName(r.logo.value));
        if (r.colour) o.colour = `#${r.colour.value.replace(/^#/, "").toUpperCase()}`;
        if (r.exec && !o.execs.some(x => x.qid === r.exec!.value)) o.execs.push({ qid: r.exec.value, label: r.execLabel?.value ?? "", img: r.execImg ? commonsName(r.execImg.value) : null, cik: r.execCik ? unpad(r.execCik.value) : null });
        facts.orgs.set(cik, o);
      }
    } catch (e) { log(`wikidata companies: ${(e as Error).message}`); }
  }
  // Companies without a CIK on Wikidata (or without a CIK here): by ticker on NYSE or Nasdaq.
  const byTicker = [...new Set(todo.flatMap(e => e.kind === "company" && e.ticker && !(e.cik && facts.orgs.has(unpad(e.cik))) ? [e.ticker.toUpperCase()] : []))];
  for (let i = 0; i < byTicker.length; i += 100) {
    try {
      for (const r of await sparql(`SELECT ?ticker ?item ?itemLabel ?logo ?colour WHERE { VALUES ?ticker { ${byTicker.slice(i, i + 100).map(lit).join(" ")} }
        ?item p:P414 ?st . ?st pq:P249 ?ticker ; ps:P414 ?ex . VALUES ?ex { wd:Q13677 wd:Q82059 }
        OPTIONAL { ?item wdt:P154 ?logo } OPTIONAL { ?item wdt:P465 ?colour } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`)) {
        const k = `t:${r.ticker!.value}`;
        const o = facts.orgs.get(k) ?? { qid: r.item!.value.replace(/^.*\//, ""), label: r.itemLabel?.value ?? "", logos: [], colour: null, execs: [] };
        if (r.logo && !o.logos.includes(commonsName(r.logo.value))) o.logos.push(commonsName(r.logo.value));
        if (r.colour) o.colour = `#${r.colour.value.replace(/^#/, "").toUpperCase()}`;
        facts.orgs.set(k, o);
      }
    } catch (e) { log(`wikidata tickers: ${(e as Error).message}`); }
  }
  // Insiders who have their own item, by CIK.
  const personCiks = [...new Set(todo.flatMap(e => (e.kind === "person" && "cik" in e ? [e.cik] : [])))];
  for (let i = 0; i < personCiks.length; i += 100) {
    const vals = personCiks.slice(i, i + 100).flatMap(c => [lit(pad(c)), lit(unpad(c))]).join(" ");
    try {
      for (const r of await sparql(`SELECT ?cik ?item ?itemLabel ?img WHERE { VALUES ?cik { ${vals} } ?item wdt:P5531 ?cik ; wdt:P31 wd:Q5 .
        OPTIONAL { ?item wdt:P18 ?img } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`))
        facts.peopleByCik.set(unpad(r.cik!.value), { qid: r.item!.value, label: r.itemLabel?.value ?? "", img: r.img ? commonsName(r.img.value) : null });
    } catch (e) { log(`wikidata insiders: ${(e as Error).message}`); }
  }
  // Leagues, clubs and public figures by their English Wikipedia article.
  const titles = [...new Set(todo.flatMap(e => e.kind === "league" ? [LEAGUES[e.league]!.wiki] : e.kind === "team" && e.league === "soccer" ? [CLUBS.find(c => c.slug === e.club)!.wiki] : e.kind === "person" && "wiki" in e ? [e.wiki] : []))];
  if (titles.length) try { facts.enwiki = await itemsByEnwiki(titles, ["P18", "P154", "P465"]); } catch (e) { log(`wikidata articles: ${(e as Error).message}`); }
  // Every Commons file any of them could use, described in batches of 50.
  const want = new Set<string>();
  for (const o of facts.orgs.values()) { for (const l of o.logos) want.add(l); for (const x of o.execs) if (x.img) want.add(x.img); }
  for (const p of facts.peopleByCik.values()) if (p.img) want.add(p.img);
  for (const it of facts.enwiki.values()) for (const p of ["P18", "P154"]) for (const f of it.claims[p] ?? []) want.add(f.replace(/_/g, " "));
  if (want.size) try { facts.files = await commonsFiles([...want]); } catch (e) { log(`commons: ${(e as Error).message}`); }
  return facts;
}

/* ---------- making one ---------- */
const surname = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?$/, "").trim().split(/\s+/).pop() ?? "";

async function logoMark(buf: Buffer, colour: string | null, fallbackColour: () => Promise<string>): Promise<Made & { png: Buffer }> {
  const c = colour ?? await fallbackColour();
  const r = await markArt(buf, c);
  return { t: r.t, colour: r.colour, brand: c, png: r.png, n: r.n, adapted: r.t === "mark", why: r.why ?? null };
}
/** A logo's own colour: the mean of its visible pixels that aren't near white. */
async function logoColour(buf: Buffer): Promise<string> {
  const r = await rasterLogo(buf, 256);
  const st = logoStats(r);
  return st.opaque ? st.mean : INK;
}

/** A company's, fund's or league's mark, from the first source that has one. `small` allows the 128px repo file. */
async function orgArt(o: { logos: string[]; colour: string | null } | null, files: Map<string, CommonsFile>, name: string, iconSlug: string | null, smallFile: string | null): Promise<Made> {
  const icon = iconSlug ? (await simpleIcons()).find(i => i.slug === iconSlug) ?? null : await iconFor(name);
  const colour = o?.colour ?? icon?.hex ?? null;
  for (const n of svgFirst(o?.logos ?? [])) {
    const f = files.get(n);
    if (!f) continue;
    try {
      const buf = await bytes(f.url);
      const m = await logoMark(buf, colour, () => logoColour(buf));
      return { ...m, sourceUrl: f.url, sourcePage: f.page, license: f.license || "See source", licenseUrl: f.licenseUrl, author: f.author };
    } catch { /* the next source */ }
  }
  if (icon) {
    const buf = await simpleIconSvg(icon.slug);
    const m = await logoMark(buf, colour ?? icon.hex, async () => icon.hex);
    return { ...m, sourceUrl: `https://cdn.jsdelivr.net/npm/simple-icons@16.36.0/icons/${icon.slug}.svg`, sourcePage: simpleIconPage(icon.slug), license: "CC0 1.0 (Simple Icons)", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", author: "Simple Icons contributors" };
  }
  if (smallFile) {
    const buf = await repoFile(smallFile).catch(() => null);
    if (buf) {
      const m = await logoMark(buf, colour, () => logoColour(buf));
      return { ...m, sourceUrl: smallFile, sourcePage: "https://www.npmjs.com/package/us-stock-logos", license: "MIT (us-stock-logos)", licenseUrl: "https://opensource.org/license/mit", author: "us-stock-logos", why: `only a ${m.n}px logo (Wikidata and Simple Icons have none): shown at 64px or less, a monogram above` };
    }
  }
  return mono(colour ?? INK, o ? "Wikidata has no logo on Commons and Simple Icons has none" : "not on Wikidata (by CIK) and not in Simple Icons", colour);
}

async function personArt(img: string | null, files: Map<string, CommonsFile>, colour: string, nowhere: string): Promise<Made> {
  if (!img) return mono(colour, nowhere);
  const f = files.get(img);
  if (!f) return mono(colour, `Commons has no description of ${img}`);
  if (!freeForPeople(f.license)) return mono(colour, `portrait licence is "${f.license || "unknown"}", not PD, CC0, CC BY or CC BY-SA`);
  const buf = await bytes(f.thumb);
  // The darker end has to read against the pale one: a pale brand colour is deepened toward ink first.
  let dark = colour;
  for (let i = 0; i < 6 && contrast(dark, mix(dark, "#FFFFFF", 0.86)) < 4; i++) dark = mix(dark, INK, 0.25);
  const d = await duotone(buf, dark, 0.5, 1 / 3);
  return { t: "duotone", colour: dark, brand: colour, png: d.png, n: d.n, fx: 0.5, fy: 1 / 3, sourceUrl: f.url, sourcePage: f.page, license: f.license, licenseUrl: f.licenseUrl, author: f.author, adapted: true,
    why: shareAlike(f.license) ? "adapted (duotone); shared under the same licence" : null };
}

async function make(e: Entity, facts: Facts, brandOf: (id: string) => string | null): Promise<Made> {
  switch (e.kind) {
    case "tracker": {
      const name = trackerPhoto(e.slug), p = PHOTOS[name];
      const url = unsplashSquare(p.id, p.fx, p.fy);
      const s = await photoSquare(await bytes(url));
      return { t: "photo", colour: s.colour, png: s.png, n: s.n, fx: p.fx, fy: p.fy, sourceUrl: url, sourcePage: `https://unsplash.com/@${p.user}`, license: "Unsplash License", licenseUrl: "https://unsplash.com/license", author: `@${p.user} on Unsplash` };
    }
    case "team": {
      if (e.league === "soccer") {
        const club = CLUBS.find(c => c.slug === e.club)!;
        const it = facts.enwiki.get(club.wiki);
        for (const n of svgFirst((it?.claims.P154 ?? []).map(x => x.replace(/_/g, " ")))) {
          const f = facts.files.get(n);
          if (!f) continue;
          const r = await teamArt(await bytes(f.url), club.colour);
          return { t: r.t, colour: r.colour, brand: club.colour, png: r.png, n: r.n, sourceUrl: f.url, sourcePage: f.page, license: f.license || "See source", licenseUrl: f.licenseUrl, author: f.author };
        }
        return mono(club.colour, it ? "its crest isn't on Commons (Wikidata P154)" : "no Wikidata item found for its article");
      }
      const colour = TEAM_COLOURS[e.league][e.abbr] ?? INK;
      const path = `/logos/teams/${e.league}/${e.abbr}.svg`;
      const r = await teamArt(await repoFile(path), colour);
      const pkg = { nba: "nba-team-logos", nfl: "nfl-team-logos", mlb: "react-mlb-logos", nhl: "nhl-team-logos" }[e.league];
      return { t: r.t, colour: r.colour, brand: colour, png: r.png, n: r.n, sourceUrl: path, sourcePage: `https://www.npmjs.com/package/${pkg}`, license: `ISC (${pkg})`, author: pkg,
        why: r.t === "team-white" ? `logo vanishes into ${colour} (${Math.round(r.vanish * 100)}% of it or its outline): on white` : null };
    }
    case "league": {
      const l = LEAGUES[e.league]!, it = facts.enwiki.get(l.wiki);
      const colour = it?.claims.P465?.[0] ? `#${it.claims.P465[0]}` : null;
      const file = (manifest.leagues as Record<string, string>)[e.league];
      const m = await orgArt(it ? { logos: (it.claims.P154 ?? []).map(x => x.replace(/_/g, " ")), colour } : null, facts.files, l.label, l.icon ?? null, null);
      if (m.t !== "monogram" || !file) return m;
      // The league file the site already ships (public/logos/leagues): full size when it's a vector.
      const buf = await repoFile(`/logos/leagues/${file}`);
      const lm = await logoMark(buf, colour, () => logoColour(buf));
      return { ...lm, sourceUrl: `/logos/leagues/${file}`, sourcePage: "https://www.npmjs.com/package/sports-assets", license: "MIT (sports-assets)", author: "sports-assets",
        why: `Wikidata and Simple Icons have no mark: the site's own league file${lm.n && lm.n < 2048 ? ` (${lm.n}px)` : ""}` };
    }
    case "country": {
      const f = await flagArt(await flagSvg(e.iso2));
      return { t: "flag", colour: f.colour, png: f.png, n: f.n, sourceUrl: `https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${e.iso2}.svg`, sourcePage: flagPage(e.iso2), license: "MIT (flag-icons)", licenseUrl: "https://github.com/lipis/flag-icons/blob/main/LICENSE", author: "flag-icons contributors" };
    }
    case "company": {
      const o = (e.cik ? facts.orgs.get(unpad(e.cik)) : undefined) ?? (e.ticker ? facts.orgs.get(`t:${e.ticker.toUpperCase()}`) : undefined) ?? null;
      return orgArt(o, facts.files, e.label, null, e.ticker ? `/logos/stocks/${e.ticker.toUpperCase().replace(/\./g, "-")}.webp` : null);
    }
    case "fund": return orgArt(facts.orgs.get(unpad(e.cik)) ?? null, facts.files, e.label, null, null);
    case "person": {
      if ("wiki" in e) {
        const it = facts.enwiki.get(e.wiki);
        return personArt(it?.claims.P18?.[0]?.replace(/_/g, " ") ?? null, facts.files, INK, it ? "Wikidata has no portrait (P18)" : "no Wikidata item found for their article");
      }
      const colour = (e.companyId && brandOf(e.companyId)) || INK;
      const own = facts.peopleByCik.get(unpad(e.cik));
      if (own) return personArt(own.img, facts.files, colour, "their Wikidata item has no portrait (P18)");
      const org = e.issuerCik ? facts.orgs.get(unpad(e.issuerCik)) : undefined;
      const exec = org?.execs.find(x => x.cik === unpad(e.cik)) ?? org?.execs.find(x => surname(x.label) === surname(e.label));
      if (exec) return personArt(exec.img, facts.files, colour, `${exec.label} on Wikidata has no portrait (P18)`);
      return mono(colour, org ? "not among their company's officers on Wikidata" : "no Wikidata item for them or their company");
    }
  }
}

/* ---------- the run ---------- */
export interface ArtRunResult { made: number; failed: number; skipped: number; byTreatment: Record<string, number>; errors: string[] }

export async function artOnce(db: Db, opts: { limit?: number; only?: ArtKind[]; force?: boolean; log?: (s: string) => void } = {}): Promise<ArtRunResult> {
  const log = opts.log ?? ((s: string) => console.log(new Date().toISOString(), s));
  const b = bucket();
  if (!b) throw new Error("art bucket not configured (ART_BUCKET_*)");
  const all = (await entities(db)).filter(e => !opts.only || opts.only.includes(e.kind));
  const have = new Map((await db.select({ id: entityArt.entityId, t: entityArt.treatment, v: entityArt.version, at: entityArt.updatedAt, colour: entityArt.colour, brand: entityArt.brandColour }).from(entityArt)).map(r => [r.id, r]));
  const due = (e: Entity) => { const h = have.get(e.id); return opts.force || !h || h.v < ART_VERSION || (h.t === "monogram" && Date.now() - h.at.getTime() > RETRY_MONOGRAMS_MS); };
  // Companies before people: an executive's duotone takes their company's colour.
  const order: ArtKind[] = ["tracker", "league", "team", "country", "company", "fund", "person"];
  const todo = all.filter(due).sort((a, c) => order.indexOf(a.kind) - order.indexOf(c.kind)).slice(0, opts.limit ?? Infinity);
  log(`art: ${all.length} entities, ${todo.length} to make`);
  const res: ArtRunResult = { made: 0, failed: 0, skipped: all.length - todo.length, byTreatment: {}, errors: [] };
  if (!todo.length) return res;
  const facts = await gather(todo, log);
  log(`art: facts gathered (${facts.orgs.size} companies/funds on Wikidata, ${facts.peopleByCik.size} insiders by CIK, ${facts.enwiki.size} articles, ${facts.files.size} Commons files; ${wikiRequests} Wikimedia requests)`);
  const brands = new Map<string, string>();
  for (const [id, h] of have) brands.set(id, h.brand ?? h.colour);
  for (const e of todo) {
    try {
      const m = await make(e, facts, id => brands.get(id) ?? null);
      let key: string | null = null, sizes: number[] | null = null;
      if (m.png && m.n) {
        const hash = createHash("sha256").update(m.png).digest("hex").slice(0, 10);
        key = `art/${keyOf(e.id)}/${hash}`;
        const files = await encodeLadder(m.png, m.n);
        for (const f of files) await putObject(b, `${key}/${f.w}.${f.fmt}`, f.buf, `image/${f.fmt}`);
        sizes = [...new Set(files.map(f => f.w))].sort((x, y) => y - x);
      }
      const row = {
        entityId: e.id, kind: e.kind, label: e.label, treatment: m.t, colour: m.colour, brandColour: m.brand ?? null, mono: initialsOf(e.label), key, sizes,
        w: m.n ?? 0, h: m.n ?? 0, fx: m.fx ?? 0.5, fy: m.fy ?? 0.5, sourceUrl: m.sourceUrl ?? null, sourcePage: m.sourcePage ?? null, license: m.license ?? null,
        licenseUrl: m.licenseUrl ?? null, author: m.author ?? null, adapted: m.adapted ?? false, why: m.why ?? null, version: ART_VERSION, updatedAt: new Date(),
      };
      await db.insert(entityArt).values(row).onConflictDoUpdate({ target: entityArt.entityId, set: { ...row, createdAt: undefined } });
      brands.set(e.id, m.brand ?? m.colour);
      res.made++; res.byTreatment[m.t] = (res.byTreatment[m.t] ?? 0) + 1;
      log(`art: ${e.id} → ${m.t}${m.n ? ` ${m.n}px` : ""} ${m.colour}${m.why ? ` (${m.why})` : ""}`);
    } catch (err) {
      res.failed++;
      const msg = `${e.id}: ${(err as Error).message}`.slice(0, 300);
      res.errors.push(msg); log(`art: failed ${msg}`);
    }
  }
  return res;
}

