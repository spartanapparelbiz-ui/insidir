// Builds public/logos from published npm packages (fetched with `npm pack` into a temp folder, never installed):
//   leagues/<id>.svg|webp   NBA, NFL, MLB, NHL (team-logo packages), Premier League, La Liga, Serie A, Bundesliga,
//                           Ligue 1, Champions League, UFC, college football (sports-assets), FIFA, F1 and the esports
//                           titles (simple-icons, CC0)
//   teams/<league>/<ABBR>.svg  every NBA, NFL, MLB and NHL team (nba-team-logos, nfl-team-logos, react-mlb-logos,
//                           nhl-team-logos). Those ship as compiled React components; their createElement calls are
//                           read as text and written out as plain SVG. No package code is ever run.
//   brands/<slug>.svg       companies and coins named in markets (simple-icons, in the brand's colour)
//   stocks/<TICKER>.webp    US-listed companies by ticker (us-stock-logos)
//   manifest.json           what exists, for lib/logos.ts
// The logos are the trademarks of their leagues, teams and companies, shown only to say which one a position is about.
// Run: node scripts/logos.mjs   (needs the npm registry; rerun to refresh)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = "public/logos";
const tmp = mkdtempSync(join(tmpdir(), "insidir-logos-"));
const pack = (name) => {
  const dir = join(tmp, name.replace(/[@/]/g, "_"));
  mkdirSync(dir, { recursive: true });
  const file = execFileSync("npm", ["pack", name, "--silent"], { cwd: dir, encoding: "utf8" }).trim().split("\n").pop();
  execFileSync("tar", ["xzf", file], { cwd: dir });
  return join(dir, "package");
};

const PKG = {
  sports: "sports-assets@0.9.0", stocks: "us-stock-logos@1.0.0", simple: "simple-icons@16.36.0",
  nba: "nba-team-logos@3.8.0", nfl: "nfl-team-logos@1.5.0", mlb: "react-mlb-logos@1.1.2", nhl: "nhl-team-logos@1.2.0",
};
const dirs = Object.fromEntries(Object.entries(PKG).map(([k, v]) => [k, pack(v)]));
/* ---------- a reader for compiled createElement trees (text in, SVG out) ---------- */
const ATTR = { className: "class", fillRule: "fill-rule", clipRule: "clip-rule", strokeWidth: "stroke-width", strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin", strokeMiterlimit: "stroke-miterlimit", fillOpacity: "fill-opacity", strokeOpacity: "stroke-opacity", stopColor: "stop-color",
  stopOpacity: "stop-opacity", xlinkHref: "xlink:href", xmlSpace: "xml:space", gradientUnits: "gradientUnits", gradientTransform: "gradientTransform", preserveAspectRatio: "preserveAspectRatio" };
function readTree(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const ws = () => { while (/\s/.test(code[i])) i++; };
  const str = () => { const q = code[i++]; let out = ""; while (code[i] !== q) { if (code[i] === "\\") { out += code[i + 1]; i += 2; } else out += code[i++]; } i++; return out; };
  const ident = () => { const m = /^[A-Za-z_$][\w$]*/.exec(code.slice(i)); if (!m) throw new Error(`ident at ${i}`); i += m[0].length; return m[0]; };
  const value = () => {
    ws();
    if (code[i] === '"' || code[i] === "'") return str();
    const m = /^-?[\d.]+(e-?\d+)?/.exec(code.slice(i)); if (m) { i += m[0].length; return m[0]; }
    if (code.startsWith("true", i)) { i += 4; return "true"; } if (code.startsWith("false", i)) { i += 5; return "false"; }
    if (code[i] === "{") return obj();
    // A variable (width: size): not data, left out.
    if (/[A-Za-z_$]/.test(code[i])) { ident(); while (code[i] === ".") { i++; ident(); } return undefined; }
    throw new Error(`value at ${i}: ${code.slice(i, i + 30)}`);
  };
  const obj = () => {
    const o = {}; i++; ws();
    while (code[i] !== "}") { ws(); const k = code[i] === '"' || code[i] === "'" ? str() : ident(); ws(); i++; /* : */ o[k] = value(); ws(); if (code[i] === ",") i++; ws(); }
    i++; return o;
  };
  const props = () => {
    ws();
    if (code.startsWith("null", i)) { i += 4; return {}; }
    if (code[i] === "{") return obj();
    // __assign({...}, props) / _extends({...}, props) / Object.assign({}, {...}, props)
    ident(); while (code[i] === ".") { i++; ident(); } ws(); i++; /* ( */ let o = {};
    for (;;) { ws(); if (code[i] === "{") Object.assign(o, obj()); else if (code[i] === ")") { i++; break; } else if (code[i] === ",") i++; else ident(); }
    return o;
  };
  const el = () => {
    // <anything>.createElement( or <anything>["default"].createElement(
    const at = code.indexOf("createElement(", i); if (at < 0) return null; i = at + "createElement(".length; ws();
    const tag = str(); ws(); i++; /* , */ const p = props(); const kids = [];
    for (;;) {
      ws();
      if (code[i] === ",") { i++; continue; }
      if (code[i] === ")") { i++; break; }
      if (code[i] === '"' || code[i] === "'") { kids.push({ text: str() }); continue; }
      const k = el(); if (!k) break; kids.push(k);
    }
    return { tag, p, kids };
  };
  return el();
}
const esc = v => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const toSvg = (n) => {
  if (n.text !== undefined) return esc(n.text);
  const p = { ...n.p }; if (n.tag === "svg") { delete p.width; delete p.height; delete p.size; p.xmlns ??= "http://www.w3.org/2000/svg"; p.width = 128; p.height = 128; }
  if (p.style && typeof p.style === "object") p.style = Object.entries(p.style).filter(([, v]) => v !== undefined).map(([k, v]) => `${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}:${v}`).join(";");
  const attrs = Object.entries(p).filter(([k, v]) => v !== undefined && typeof v !== "object" && !/^(inkscape|sodipodi):/.test(k)).map(([k, v]) => ` ${ATTR[k] ?? k}="${esc(v)}"`).join("");
  return `<${n.tag}${attrs}>${n.kids.map(toSvg).join("")}</${n.tag}>`;
};
const svgFromComponent = (file) => { const t = readTree(readFileSync(file, "utf8")); return t && t.tag === "svg" ? toSvg(t) : null; };

rmSync(OUT, { recursive: true, force: true });
for (const d of ["leagues", "brands", "stocks", "teams/nba", "teams/nfl", "teams/mlb", "teams/nhl"]) mkdirSync(join(OUT, d), { recursive: true });
const manifest = { leagues: {}, teams: { nba: [], nfl: [], mlb: [], nhl: [] }, brands: {}, stocks: [] };

// Teams (and the four leagues' own marks), one component file each.
const TEAM_DIR = { nba: "dist/logos", nfl: "dist/logos", mlb: "dist/Icons", nhl: "dist/logos" };
for (const league of ["nba", "nfl", "mlb", "nhl"]) {
  const dir = join(dirs[league], TEAM_DIR[league]);
  for (const f of readdirSync(dir).filter(f => f.endsWith(".js"))) {
    const abbr = f.replace(/\.js$/, "").toUpperCase();
    let svg = null;
    try { svg = svgFromComponent(join(dir, f)); } catch (e) { console.warn(`skip ${league}/${f}: ${e.message}`); }
    if (!svg || !/<(path|polygon|circle|rect|ellipse)\b/.test(svg)) continue;
    if (abbr === league.toUpperCase()) { writeFileSync(join(OUT, "leagues", `${league}.svg`), svg); manifest.leagues[league] = `${league}.svg`; continue; }
    writeFileSync(join(OUT, "teams", league, `${abbr}.svg`), svg);
    manifest.teams[league].push(abbr);
  }
}

// Leagues from sports-assets (512px webp).
const SA = { epl: "league-logos/soccer/epl.webp", laliga: "league-logos/soccer/laliga.webp", seriea: "league-logos/soccer/seriea.webp",
  bundesliga: "league-logos/soccer/bundesliga.webp", ligue1: "league-logos/soccer/ligue1.webp", ucl: "sport-icons/ucl.webp", ufc: "sport-icons/ufc.webp",
  cfb: "sport-icons/cfb.webp" };
for (const [id, p] of Object.entries(SA)) if (existsSync(join(dirs.sports, p))) { cpSync(join(dirs.sports, p), join(OUT, "leagues", `${id}.webp`)); manifest.leagues[id] = `${id}.webp`; }

// simple-icons: leagues it has, esports titles, and brands, each in its own colour.
const icons = JSON.parse(readFileSync(join(dirs.simple, "data/simple-icons.json"), "utf8"));
const list = Array.isArray(icons) ? icons : icons.icons;
const slugOf = (t) => t.toLowerCase().replace(/\+/g, "plus").replace(/^\./, "dot-").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const simple = (slug) => {
  const meta = list.find(i => (i.slug ?? slugOf(i.title)) === slug);
  const f = join(dirs.simple, "icons", `${slug}.svg`);
  if (!meta || !existsSync(f)) return null;
  return readFileSync(f, "utf8").replace("<svg ", `<svg fill="#${meta.hex}" `);
};
const SIMPLE_LEAGUES = { fifa: "fifa", f1: "f1", dota2: "dota2", counterstrike: "counterstrike", leagueoflegends: "leagueoflegends", valorant: "valorant" };
for (const [id, slug] of Object.entries(SIMPLE_LEAGUES)) { const s = simple(slug); if (s) { writeFileSync(join(OUT, "leagues", `${id}.svg`), s); manifest.leagues[id] = `${id}.svg`; } }
const BRANDS = ["bitcoin", "ethereum", "solana", "dogecoin", "ripple", "nvidia", "apple", "tesla", "google", "meta", "spacex", "netflix", "intel", "amd",
  "visa", "x", "tiktok", "youtube", "spotify", "uber", "airbnb", "paypal", "coinbase", "binance", "samsung", "sony", "nintendo", "playstation", "openai", "anthropic",
  "amazon", "microsoft", "ibm", "oracle", "salesforce", "adobe", "shopify", "disney", "warnerbros", "hbo", "nike", "adidas", "boeing", "ford", "toyota", "bmw"];
for (const b of BRANDS) { const s = simple(b); if (s) { writeFileSync(join(OUT, "brands", `${b}.svg`), s); manifest.brands[b] = `${b}.svg`; } }

// Stocks by ticker.
const webp = join(dirs.stocks, "dist/webp");
for (const f of readdirSync(webp)) if (/^[A-Z0-9.-]+\.webp$/.test(f)) { cpSync(join(webp, f), join(OUT, "stocks", f)); manifest.stocks.push(f.replace(/\.webp$/, "")); }

for (const k of Object.keys(manifest.teams)) manifest.teams[k].sort();
manifest.stocks.sort();
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest) + "\n");
rmSync(tmp, { recursive: true, force: true });
console.log(`leagues ${Object.keys(manifest.leagues).length}, teams ${Object.values(manifest.teams).map(t => t.length).join("/")}, brands ${Object.keys(manifest.brands).length}, stocks ${manifest.stocks.length}`);
