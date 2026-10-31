/* The design-system check: the source keeps to one system, and every page the site serves shows it.
 *   Source (always): no class from a retired design (LEGACY, pband included) in app/ or components/; colours only in app/tokens.css;
 *     one typeface on the web (no serif outside the link-preview images); no "guaranteed".
 *   Pages (with CHECK_BASE, a running site): every route in scripts/routes.ts has the footer (company line, what
 *     Insidir isn't, the problem-gambling line); every data page (DATA_PAGES) stamps its figures with "as of" and a
 *     source; no retired class in the HTML; the page uses the shared motion and every <section> has something in it
 *     that reveals (Reveal / RevealGroup, or a class components/motion/Motion.tsx reveals).
 *   npx tsx scripts/check-design.ts                       (source only)
 *   CHECK_BASE=http://localhost:3100 npx tsx scripts/check-design.ts
 * Exit code 1 on any failure. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { COMPANY, DATA_COMPANY, GAMBLER } from "../lib/copy";
import { DATA_PAGES, entityRoutes, PUBLIC } from "./routes";

/** Classes of retired designs: the phone fan, the forest 404, the old onboarding, the dark hero, the film grain, the
 *  photo header band and the scroll story (both replaced by components/page/Page.tsx). */
export const LEGACY = ["lphone", "phones__", "trail__", "first__", "hero2__", "grain", "cine__", "pband", "story__", "iphone__"] as const;
/** What the shared motion system reveals (components/motion/Reveal.tsx, and the classes Motion.tsx reveals itself). */
export const REVEAL = /\bclass="[^"]*\b(rv|rise|sec3__h|dsec__h|tsec__h|tgroup__h|pghead__main|trow|tfeat|ttile|tcard|move|srow|tile|proof__item|board__row|rec__row|anlz__card|faq2__item|phead|thead|mhead)\b|data-reveal=|data-zoom|data-count/;

/** Sections of a page that nothing in them reveals as it scrolls in. */
export function unrevealed(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
    if (!REVEAL.test(m[1] ?? "") && !REVEAL.test(m[2] ?? "")) out.push((/aria-labelledby="([^"]+)"/.exec(m[1] ?? "")?.[1]) ?? (/class="([^"]+)"/.exec(m[1] ?? "")?.[1]) ?? "a section");
  }
  return out;
}
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
    const main = /<main\b[\s\S]*<\/main>/.exec(html)?.[0] ?? html;
    if (!REVEAL.test(main)) fail.push(`${p}: nothing on the page uses the shared motion (components/motion/Reveal.tsx)`);
    for (const id of unrevealed(main)) fail.push(`${p}: section ${id} isn't wrapped in Reveal`);
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
