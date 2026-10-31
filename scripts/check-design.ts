/* The design-system check: the source keeps to one system, and every page the site serves shows it.
 *   Source (always): no class from a retired design (LEGACY) in app/ or components/; colours only in app/tokens.css;
 *     one typeface on the web (no serif outside the link-preview images); no "guaranteed".
 *   Pages (with CHECK_BASE, a running site): every route in scripts/routes.ts has the footer (company line, what
 *     Insidir isn't, the problem-gambling line); every data page (DATA_PAGES) stamps its figures with "as of" and a
 *     source; no retired class in the HTML.
 *   npx tsx scripts/check-design.ts                       (source only)
 *   CHECK_BASE=http://localhost:3100 npx tsx scripts/check-design.ts
 * Exit code 1 on any failure. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { COMPANY, DATA_COMPANY, GAMBLER } from "../lib/copy";
import { DATA_PAGES, entityRoutes, PUBLIC } from "./routes";

/** Classes of retired designs: the phone fan, the forest 404, the old onboarding, the dark hero, the film grain. */
export const LEGACY = ["lphone", "phones__", "trail__", "first__", "hero2__", "grain", "cine__"] as const;
const HEX = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i;

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) files(p, out); }
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
}

const fail: string[] = [];
for (const f of [...files("app"), ...files("components")]) {
  if (/opengraph-image|app\/admin|app\/dev\//.test(f)) continue;
  const src = readFileSync(f, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const c of LEGACY) if (new RegExp(`["'\\s.]${c}`).test(code)) fail.push(`${f}: retired class ${c}`);
  if (f.endsWith(".tsx") && /fontFamily:\s*["']Serif/.test(code)) fail.push(`${f}: serif typeface`);
  if (/\bguaranteed\b/i.test(code)) fail.push(`${f}: "guaranteed"`);
  if (f.endsWith(".css") && f !== join("app", "tokens.css")) {
    for (const [i, line] of code.split("\n").entries()) if (HEX.test(line) && !/var\(--/.test(line) && !/^\s*--/.test(line)) fail.push(`${f}:${i + 1}: colour outside tokens.css`);
  }
}

async function pages(BASE: string) {
  const routes = [...PUBLIC, ...(await entityRoutes(BASE))];
  for (const p of routes) {
    const r = await fetch(new URL(p, BASE)).catch(() => null);
    if (!r || r.status !== 200) { fail.push(`${p}: ${r?.status ?? "no answer"}`); continue; }
    const html = (await r.text()).replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, "&");
    for (const [what, text] of [["company line", `${COMPANY.name} · ${COMPANY.place} · ${COMPANY.email}`], ["what Insidir isn't", DATA_COMPANY], ["problem gambling", GAMBLER]] as const) {
      if (!html.includes(text)) fail.push(`${p}: footer missing ${what}`);
    }
    for (const c of LEGACY) if (new RegExp(`class="[^"]*\\b${c}`).test(html)) fail.push(`${p}: retired class ${c} in the page`);
    if ((DATA_PAGES as readonly string[]).includes(p)) {
      if (!/data-asof=/.test(html) && !/As of /.test(html)) fail.push(`${p}: figures without an "as of" time`);
      if (!/Source:|Sources:|source of record|links its source/i.test(html)) fail.push(`${p}: figures without a source`);
    }
    console.log(`checked ${p}`);
  }
}

void (async () => {
  if (process.env.CHECK_BASE) await pages(process.env.CHECK_BASE); else console.log("(pages skipped: set CHECK_BASE to a running site)");
  if (fail.length) { console.error(`\n${fail.length} problems:\n${fail.join("\n")}`); process.exit(1); }
  console.log("\nDesign check passed.");
})();
