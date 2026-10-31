/* Next.js refuses a page or layout that exports anything but its own fields ("X is not a valid Page export field"),
 * and only at build time. This catches it in the unit tests. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED = new Set(["default", "metadata", "generateMetadata", "dynamic", "revalidate", "runtime", "generateStaticParams", "dynamicParams", "fetchCache",
  "preferredRegion", "maxDuration", "viewport", "generateViewport", "experimental_ppr"]);
const IMAGE = new Set(["default", "alt", "size", "contentType", "runtime", "generateImageMetadata", "dynamic", "revalidate"]);

function pages(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (/^(page|layout|not-found|error|opengraph-image)\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

describe("page files export only Next.js fields", () => {
  it.each(pages("app"))("%s", f => {
    const src = readFileSync(f, "utf8");
    const names = [...src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:const|function|let|class)\s+(\w+)/gm)].map(m => (/^export\s+default/.test(m[0]) ? "default" : m[1]!));
    const ok = /opengraph-image/.test(f) ? IMAGE : ALLOWED;
    expect(names.filter(n => !ok.has(n) && !/^export\s+default/.test(n))).toEqual([]);
  });
});
