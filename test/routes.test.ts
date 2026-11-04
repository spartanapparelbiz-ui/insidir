/* The routes Insidir keeps, and nothing else: every page under app/ is on the keep list; every retired route is a 301
 * (next.config.ts RETIRED) to a kept page; nothing in the nav, the footer or the sitemap points at a retired route; and
 * the bet checker is gone, as a route and as user-facing copy. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RETIRED } from "../next.config";
import { PAGES } from "@/lib/seo/sitemaps";

const KEEP_MAIN = ["/", "/election", "/board", "/markets", "/markets/[category]", "/market/[slug]", "/race/[slug]", "/wallet/[address]", "/bet/[id]",
  "/wallets", "/copies", "/copies/yours", "/copy/[id]", "/go", "/login", "/settings", "/results"];
const KEEP_TEXT = ["/faq", "/pricing", "/methodology", "/data", "/status", "/security", "/disclosures", "/terms", "/privacy", "/credits", "/changelog", "/about", "/help"];
const KEEP = new Set([...KEEP_MAIN, ...KEEP_TEXT]);
/** Pages that are not on the keep list but never answer 200 to a visitor: admin (signed-in owners only), the dev gallery
 *  (404 in production). */
const ALLOWED_PREFIX = ["/admin", "/dev/"];

function pages(dir: string, route = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p, name.startsWith("(") ? route : `${route}/${name}`));
    else if (name === "page.tsx") out.push(route || "/");
  }
  return out;
}

const RETIRED_PREFIX = ["/check", "/read", "/stocks", "/company", "/insider-trading", "/insiders", "/funds", "/deal", "/whales", "/terminal", "/research",
  "/discover", "/feed", "/gaps", "/splits", "/pnl", "/receipts", "/open", "/p/", "/position", "/trackers", "/sports", "/top", "/start", "/signin",
  "/welcome", "/onboarding", "/library", "/following", "/alerts", "/trader"];
const retired = (href: string) => RETIRED_PREFIX.some(r => href === r || href.startsWith(r.endsWith("/") ? r : `${r}/`) || href.startsWith(`${r}?`));

function files(dir: string, ext = /\.(tsx?|css)$/): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

describe("routes", () => {
  it("every page is on the keep list (admin and the dev gallery aside)", () => {
    const extra = pages("app").filter(r => !KEEP.has(r) && !ALLOWED_PREFIX.some(a => r.startsWith(a)));
    expect(extra).toEqual([]);
  });

  it("every retired route is a 301 to a kept page", () => {
    for (const [source, destination] of RETIRED) {
      expect(retired(source.replace(/\/:.*$/, "")) || source === "/p/:id", source).toBe(true);
      const path = destination.split("?")[0]!.replace(/\/:[a-z]+\*?$/, "/[x]");
      const kept = [...KEEP].some(k => k.replace(/\[[a-z]+\]/, "[x]") === path);
      expect(kept, `${source} → ${destination}`).toBe(true);
    }
    // The old checker and Read links resolve their market (a route handler that answers 301, never a page).
    for (const k of ["app/check/[id]/route.ts", "app/read/[id]/route.ts", "app/read/open/route.ts"]) expect(readFileSync(k, "utf8")).toMatch(/301/);
  });

  it("nothing in the nav, the footer or the sitemap points at a retired route", () => {
    const shells = ["components/brand/Nav.tsx", "components/brand/app/Frame.tsx", "components/brand/app/Shell.tsx"];
    for (const f of shells) {
      const hrefs = [...readFileSync(f, "utf8").matchAll(/href[=:]\s*\{?["'`](\/[^"'`$]*)/g)].map(m => m[1]!);
      expect(hrefs.filter(retired), f).toEqual([]);
    }
    expect(PAGES.filter(retired)).toEqual([]);
  });

  it("no app or component links to a retired route", () => {
    const bad: string[] = [];
    for (const f of [...files("app"), ...files("components"), ...files("lib")]) {
      if (/^app\/(check|read)\//.test(f)) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/(?:href=|href:\s*|redirect\(|assign\(|new URL\()\s*\{?["'`](\/[a-z][^"'`$]*)/g)) if (retired(m[1]!)) bad.push(`${f}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("the bet checker is gone", () => {
  it("no route for it: /check and /read only redirect", () => {
    expect(pages("app").filter(r => /^\/(check|read)\b/.test(r))).toEqual([]);
    for (const api of ["app/api/check", "app/api/read"]) expect(() => statSync(api)).toThrow();
  });

  it("'check' never appears as user-facing copy", () => {
    const bad: string[] = [];
    for (const f of [...files("app", /\.tsx$/), ...files("components", /\.tsx$/), "lib/brand/copy.ts", "lib/copy.ts"]) {
      if (f.startsWith("app/admin") || f.startsWith("app/dev")) continue;
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/\$\{[^}]*\}/g, "");
      // Text between tags, and string literals that read as sentences.
      const text = [...src.matchAll(/>([^<>{}]*\bcheck(?:s|ed|ing)?\b[^<>{}]*)</gi), ...src.matchAll(/["'`]((?=[A-Z])[^"'`]*\b[Cc]heck(?:s|ed|ing)?\b[^"'`]*)["'`]/g)].map(m => m[1]!.trim());
      for (const t of text) bad.push(`${f}: ${t}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("the old product's names are gone", () => {
  /** "Read"/"Reads" as a product name: "Reads", "a Read", "your Read", "Read a market". The verb ("we read
   *  Polymarket") is fine. */
  const READ = /\bReads\b|\b(?:a|the|your|free|one|first|every|another|their|this|unlimited)\s+Read\b|\bRead (?:a|any|every) (?:market|bet)\b/;
  it("'Read' never appears as a product name in user-facing copy", () => {
    const bad: string[] = [];
    for (const f of [...files("app", /\.tsx$/), ...files("components", /\.tsx$/), "lib/brand/copy.ts", "lib/copy.ts", "lib/billing/cancel-reasons.ts"]) {
      if (f.startsWith("app/admin") || f.startsWith("app/dev")) continue;
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      const m = READ.exec(src);
      if (m) bad.push(`${f}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
  it("catches each form, and leaves the verb alone", () => {
    for (const t of ["Unlimited Reads on any market", "your Read", "Read a market"]) expect(READ.test(t), t).toBe(true);
    for (const t of ["We read Polymarket every 15 seconds.", "Read the rules"]) expect(READ.test(t), t).toBe(false);
  });
});
