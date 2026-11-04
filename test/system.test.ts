/* The homepage is the design system (lib/system/tokens.ts). This fails when an app page's inline style, or the
 * system's own CSS (the .s-* section of app/brand.css), uses a colour, font size or radius outside it. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOR_VARS, COLORS, FONT_SIZES_PX, RADII } from "@/lib/system/tokens";

const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ").replace(/0\.(\d)/g, ".$1");
const colorOk = (v: string) => { const x = norm(v); return (COLORS as readonly string[]).includes(x) || /^var\(--[\w-]+\)$/.test(x) && (COLOR_VARS as readonly string[]).some(t => x === `var(${t})`); };

/** Every literal colour, font size and radius in a chunk of CSS declarations ("prop: value"). */
function violations(decls: Array<[string, string]>, where: string): string[] {
  const out: string[] = [];
  for (const [prop, raw] of decls) {
    const v = norm(raw);
    if (/^(color|background|background-color|border-color|fill|stroke)$/.test(prop)) {
      for (const c of v.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/g) ?? []) if (!colorOk(c)) out.push(`${where}: ${prop} ${c}`);
      for (const c of v.match(/var\(--[\w-]+\)/g) ?? []) if (!colorOk(c)) out.push(`${where}: ${prop} ${c}`);
    }
    if (prop === "font-size") { const px = /^(\d+(?:\.\d+)?)px$/.exec(v); if (px && !(FONT_SIZES_PX as readonly number[]).includes(Number(px[1]))) out.push(`${where}: font-size ${v}`); }
    if (prop === "border-radius" && !(RADII as readonly string[]).includes(v)) out.push(`${where}: border-radius ${v}`);
  }
  return out;
}

const kebab = (k: string) => k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

describe("the homepage is the design system", () => {
  it("no app page sets a colour, font size or radius outside it inline", () => {
    // Screens only: image routes (share cards, Open Graph images) draw PNGs at their own sizes.
    const files = [...walk("app"), ...walk("components/system")].filter(f => /\.tsx$/.test(f) && !/(route|opengraph-image|twitter-image|icon|apple-icon)\.tsx$/.test(f));
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/style=\{\{([^}]*)\}\}/g)) {
        const decls: Array<[string, string]> = [];
        for (const d of m[1]!.matchAll(/(\w+)\s*:\s*("[^"]*"|'[^']*'|\d+(?:\.\d+)?)/g)) {
          const val = d[2]!.replace(/^["']|["']$/g, "");
          decls.push([kebab(d[1]!), /^\d/.test(val) && d[1] === "fontSize" ? `${val}px` : val]);
        }
        bad.push(...violations(decls, f));
      }
    }
    expect(bad).toEqual([]);
  });

  it("the system's CSS (.s-*) uses only its tokens", () => {
    const css = readFileSync("app/brand.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    const bad: string[] = [];
    for (const r of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.s-/.test(r[1]!)) continue;
      const decls = [...r[2]!.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map(d => [d[1]!, d[2]!] as [string, string]);
      bad.push(...violations(decls, r[1]!.trim()));
    }
    expect(bad).toEqual([]);
  });

  it("the system is the homepage's own pieces", () => {
    const sys = readFileSync("components/system/index.tsx", "utf8");
    for (const p of ["components/brand/Stage", "components/brand/Bits", "components/brand/StageMotion", "components/brand/landing/ScrollFx", "components/brand/Nav"]) expect(sys).toContain(`@/${p}`);
    expect(readFileSync("app/election/page.tsx", "utf8")).toContain('from "@/components/system"');
  });

  it("no screen keeps the old Desk's one-off styles (dk-*), and the member screens are built from the system", async () => {
    const { globSync } = await import("node:fs");
    const files = [...globSync("app/**/*.tsx"), ...globSync("components/**/*.tsx")];
    const left = files.filter(f => /className="[^"]*\bdk-/.test(readFileSync(f, "utf8")));
    expect(left).toEqual([]);
    expect(readFileSync("app/brand.css", "utf8")).not.toMatch(/\.dk-/);
    for (const page of ["app/board/page.tsx", "app/wallets/page.tsx", "app/market/[slug]/page.tsx", "app/copy/[id]/page.tsx", "app/copies/yours/page.tsx", "app/settings/page.tsx", "app/markets/page.tsx", "app/markets/[category]/page.tsx", "app/election/page.tsx", "app/copies/page.tsx", "components/copies/MyCopies.tsx"]) {
      expect(readFileSync(page, "utf8"), page).toContain('from "@/components/system"');
    }
  });
});
