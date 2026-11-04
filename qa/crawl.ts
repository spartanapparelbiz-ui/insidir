/* The nightly production crawl (.github/workflows/nightly-crawl.yml). Every route in the sitemap (each dynamic route
 * sampled up to CRAWL_PER_ROUTE pages), plus member pages when CRAWL_COOKIE is set, at 390, 768 and 1440, with zero
 * tolerance for:
 *   console errors, 4xx/5xx responses and links, broken or blurry images, sideways scroll, truncated headings,
 *   raw ISO dates, "None" / "undefined" / "NaN" in the text, WCAG AA contrast failures (axe color-contrast), and keyboard
 *   navigation that loses focus or shows no focus ring
 * and Lighthouse performance ≥ 90 on desktop and ≥ 80 on mobile for the key pages.
 * Writes qa/reports/crawl.json and qa/reports/crawl.md; exit 1 on any failure.
 * Usage: CRAWL_URL=https://insidir.com [CRAWL_COOKIE="insidir_session=…"] npx tsx qa/crawl.ts */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Page } from "playwright";

const BASE = (process.env.CRAWL_URL ?? "https://insidir.com").replace(/\/$/, "");
const COOKIE = process.env.CRAWL_COOKIE ?? "";
const PER_ROUTE = Number(process.env.CRAWL_PER_ROUTE ?? 3);
const WIDTHS = [[390, 844], [768, 1024], [1440, 900]] as const;
const LIGHTHOUSE = ["/", "/go", "/board", "/pricing", "/methodology"];
const MEMBER = ["/", "/autopilot", "/book", "/board", "/wallets", "/settings"];

export interface Finding { path: string; width: number | null; kind: string; detail: string }

/** A path's route shape: dynamic segments collapsed ("/market/x-1" → "/market/*"). Pure. */
export function routeOf(path: string): string {
  const parts = path.split("?")[0]!.split("/").filter(Boolean);
  if (parts.length <= 1) return "/" + parts.join("/");
  return "/" + parts[0] + "/*".repeat(parts.length - 1);
}

/** Up to `per` paths per route shape, in sitemap order. Pure. */
export function sample(paths: readonly string[], per: number): string[] {
  const n = new Map<string, number>(), out: string[] = [];
  for (const p of paths) { const r = routeOf(p); const c = n.get(r) ?? 0; if (c < per) { out.push(p); n.set(r, c + 1); } }
  return out;
}

/** Text problems a reader would see. Pure. */
export function textFindings(text: string): string[] {
  const out: string[] = [];
  const iso = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}[^\s]*)?\b/.exec(text);
  if (iso) out.push(`raw ISO date "${iso[0]}"`);
  for (const w of ["None", "undefined", "NaN", "null"]) { const m = new RegExp(`(^|[^\\w-])${w}([^\\w-]|$)`).exec(text); if (m) out.push(`"${w}" in the text`); }
  return out;
}

async function sitemapPaths(): Promise<string[]> {
  const seen = new Set<string>(), queue = [`${BASE}/sitemap.xml`], paths: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    if (seen.has(u)) continue; seen.add(u);
    const xml = await (await fetch(u)).text().catch(() => "");
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = m[1]!.trim();
      if (/\.xml($|\?)/.test(loc)) queue.push(loc); else { try { paths.push(new URL(loc).pathname); } catch { /* skip */ } }
    }
  }
  return [...new Set(paths)];
}

async function checkPage(page: Page, path: string, width: number): Promise<{ findings: Finding[]; links: string[] }> {
  const f: Finding[] = [], add = (kind: string, detail: string) => f.push({ path, width, kind, detail: detail.slice(0, 240) });
  const onConsole = (m: { type(): string; text(): string }) => { if (m.type() === "error") add("console error", m.text()); };
  const onPageError = (e: Error) => add("page error", e.message);
  const onResponse = (r: { status(): number; url(): string }) => { if (r.status() >= 400 && r.url().startsWith(BASE)) add(`HTTP ${r.status()}`, r.url()); };
  page.on("console", onConsole); page.on("pageerror", onPageError); page.on("response", onResponse);
  try {
    const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45_000 });
    if (!res || res.status() >= 400) add(`HTTP ${res?.status() ?? "none"}`, BASE + path);
    for (let y = 0; y < 12; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(120); }
    await page.waitForTimeout(600);
    const r = await page.evaluate(async () => {
      const de = document.documentElement;
      // Each shown image, once it has loaded or failed (5s at most); its real pixels from the file itself, since a
      // srcset image reports its width scaled to the layout.
      const shown = [...document.images].filter(i => i.getBoundingClientRect().width > 0);
      await Promise.all(shown.map(i => i.complete ? null : new Promise(res => { i.addEventListener("load", res, { once: true }); i.addEventListener("error", res, { once: true }); setTimeout(res, 5000); })));
      const real = (src: string) => new Promise<number>(res => { const p = new Image(); p.onload = () => res(p.naturalWidth); p.onerror = () => res(0); p.src = src; });
      const imgs = await Promise.all(shown.map(async i => {
        const src = i.currentSrc || i.src;
        const ok = i.complete && i.naturalWidth > 0;
        // A cover image is cropped: the file only needs to fill the larger of its box's sides at the image's aspect.
        const box = i.getBoundingClientRect(), fit = getComputedStyle(i).objectFit;
        const nat = ok ? await real(src) : 0, ratio = i.naturalWidth && i.naturalHeight ? i.naturalWidth / i.naturalHeight : 1;
        const need = fit === "cover" ? Math.max(box.width, box.height * ratio) : box.width;
        return { src, ok, nat, shown: need };
      }));
      const trunc = [...document.querySelectorAll("h1, h2, h3")].filter(h => { const s = getComputedStyle(h); return h.scrollWidth > h.clientWidth + 1 && s.overflow !== "visible"; }).map(h => (h.textContent ?? "").trim().slice(0, 80));
      const links = [...document.querySelectorAll("a[href]")].map(a => (a as HTMLAnchorElement).href).filter(h => h.startsWith(location.origin));
      return { sideways: de.scrollWidth - de.clientWidth, imgs, trunc, text: document.body.innerText, links, dpr: devicePixelRatio };
    });
    if (r.sideways > 0) add("sideways scroll", `${r.sideways}px wider than the screen`);
    for (const i of r.imgs) {
      if (!i.ok) add("broken image", i.src);
      // Sharp enough: at least the box's pixels at 2× (3× screens get the 2× file; the eye can't tell), and never upscaled past 1×.
      else if (!i.src.endsWith(".svg") && i.nat < Math.min(i.shown * Math.min(r.dpr, 2), 3840) * 0.9) add("blurry image", `${i.src} is ${i.nat}px wide, needs ${Math.round(i.shown * Math.min(r.dpr, 2))}px`);
    }
    for (const t of r.trunc) add("truncated heading", t);
    for (const t of textFindings(r.text)) add("text", t);
    if (width !== 768) {
      const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      for (const v of axe.violations) for (const n of v.nodes.slice(0, 5)) add("contrast", `${n.target.join(" ")}: ${n.failureSummary ?? v.help}`);
    }
    if (width === 1440) {
      await page.evaluate(() => window.scrollTo(0, 0));
      let last = "", stuck = 0;
      for (let k = 0; k < 25; k++) {
        await page.keyboard.press("Tab");
        const fo = await page.evaluate(() => {
          const e = document.activeElement as HTMLElement | null;
          if (!e || e === document.body) return null;
          const s = getComputedStyle(e), r = e.getBoundingClientRect();
          return { id: `${e.tagName}:${(e.textContent ?? "").trim().slice(0, 30)}:${Math.round(r.top)}`, ring: s.outlineStyle !== "none" && s.outlineWidth !== "0px" || s.boxShadow !== "none", visible: r.width > 0 && r.height > 0 };
        });
        if (!fo) break;
        if (!fo.visible) add("keyboard", `focus went to an invisible element (${fo.id})`);
        else if (!fo.ring) add("keyboard", `no focus ring on ${fo.id}`);
        stuck = fo.id === last ? stuck + 1 : 0; last = fo.id;
        if (stuck >= 3) { add("keyboard", `focus is stuck on ${fo.id}`); break; }
      }
    }
    return { findings: f, links: r.links };
  } catch (e) {
    add("load", e instanceof Error ? e.message : String(e));
    return { findings: f, links: [] };
  } finally {
    page.off("console", onConsole); page.off("pageerror", onPageError); page.off("response", onResponse);
  }
}

function lighthouse(path: string, desktop: boolean): number | null {
  mkdirSync("qa/reports", { recursive: true });
  const out = `qa/reports/lh-${desktop ? "desktop" : "mobile"}-${path.replace(/\W+/g, "_") || "home"}.json`;
  try {
    execFileSync("npx", ["lighthouse", BASE + path, "--chrome-flags=--headless=new --no-sandbox", "--output=json", `--output-path=${out}`, "--only-categories=performance", "--quiet",
      ...(desktop ? ["--preset=desktop"] : [])], { stdio: "ignore", timeout: 180_000 });
    return Number((JSON.parse(readFileSync(out, "utf8")) as { categories: { performance: { score: number } } }).categories.performance.score);
  } catch { return null; }
}

async function main(): Promise<void> {
  const paths = sample(await sitemapPaths(), PER_ROUTE);
  const findings: Finding[] = [], links = new Set<string>();
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  for (const signedIn of COOKIE ? [false, true] : [false]) {
    for (const [w, h] of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 3 : w === 768 ? 2 : 1 });
      await ctx.addCookies([{ name: "insidir_pay_closed", value: "1", url: BASE }, ...(signedIn ? COOKIE.split(";").map(c => { const [k, ...v] = c.trim().split("="); return { name: k!, value: v.join("="), url: BASE }; }) : [])]);
      const page = await ctx.newPage();
      for (const p of signedIn ? MEMBER : paths) {
        const r = await checkPage(page, p, w);
        findings.push(...r.findings.map(x => signedIn ? { ...x, path: `${x.path} (member)` } : x));
        r.links.forEach(l => links.add(l.split("#")[0]!));
      }
      await ctx.close();
    }
  }
  await browser.close();
  // Every internal link found, once.
  for (const l of [...links].slice(0, 1500)) {
    const r = await fetch(l, { redirect: "follow", headers: COOKIE ? {} : {} }).catch(() => null);
    if (!r || r.status >= 400) findings.push({ path: new URL(l).pathname, width: null, kind: `link ${r?.status ?? "failed"}`, detail: l });
  }
  const lh: Array<{ path: string; desktop: number | null; mobile: number | null }> = [];
  for (const p of LIGHTHOUSE) {
    const row = { path: p, desktop: lighthouse(p, true), mobile: lighthouse(p, false) };
    lh.push(row);
    if (row.desktop === null || row.desktop < 0.9) findings.push({ path: p, width: 1440, kind: "lighthouse", detail: `desktop performance ${row.desktop === null ? "didn't run" : Math.round(row.desktop * 100)} (needs 90)` });
    if (row.mobile === null || row.mobile < 0.8) findings.push({ path: p, width: 390, kind: "lighthouse", detail: `mobile performance ${row.mobile === null ? "didn't run" : Math.round(row.mobile * 100)} (needs 80)` });
  }
  mkdirSync("qa/reports", { recursive: true });
  writeFileSync("qa/reports/crawl.json", JSON.stringify({ base: BASE, at: new Date().toISOString(), pages: paths.length, links: links.size, lighthouse: lh, findings }, null, 2));
  const md = [`# Production crawl: ${BASE}`, "", `${paths.length} pages × ${WIDTHS.length} widths${COOKIE ? ` + ${MEMBER.length} member pages` : ""}, ${links.size} links. ${findings.length ? `**${findings.length} findings.**` : "**Clean.**"}`, "",
    "| Lighthouse | Desktop | Mobile |", "| --- | --- | --- |", ...lh.map(x => `| ${x.path} | ${x.desktop === null ? "–" : Math.round(x.desktop * 100)} | ${x.mobile === null ? "–" : Math.round(x.mobile * 100)} |`), "",
    ...(findings.length ? ["| Page | Width | Kind | Detail |", "| --- | --- | --- | --- |", ...findings.map(x => `| ${x.path} | ${x.width ?? ""} | ${x.kind} | ${x.detail.replace(/\|/g, "\\|")} |`)] : [])].join("\n");
  writeFileSync("qa/reports/crawl.md", md + "\n");
  console.log(md);
  process.exit(findings.length ? 1 : 0);
}

if (process.argv[1]?.endsWith("crawl.ts")) void main();
