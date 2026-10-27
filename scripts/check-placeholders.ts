/* Fails the build when production code could show a placeholder, a sample number or fake activity (run by
 * `npm run build` before `next build`, and by test/placeholders.test.ts). Every number on the site comes from a
 * stored source record; this catches the ways that rule usually breaks: lorem ipsum, "sample"/"dummy"/"fake" data,
 * test fixture names, made-up people and round example amounts in user-facing code, and random numbers in the UI.
 * Not scanned: the dev-only gallery (app/dev, off in production) and its fixtures (lib/dev-fixtures.ts).
 *   npx tsx scripts/check-placeholders.ts */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib", "public/sw.js"];
const SKIP = [/^app\/dev\//, /^lib\/dev-fixtures\.ts$/, /^lib\/og-assets\//];

/** What counts as a placeholder, in source after comments are removed. */
export const PLACEHOLDERS: Array<[RegExp, string]> = [
  [/lorem ipsum/i, "lorem ipsum"],
  [/\b(sample|dummy|fake|mock)[ _-]?(data|moves?|trades?|numbers?|users?|traders?|activity|amounts?)\b/i, "sample data"],
  [/\bE2E[ -]?fixture\b/i, "test fixture"],
  [/\b(John|Jane) (Doe|Smith)\b|\bAcme\b/, "made-up name"],
  [/\$1,?234\b|\$12,?345\b|\$123,?456\b|\$999,?999\b/, "example amount"],
  [/\bMath\.random\(\)/, "random number"],
  [/\bTODO\b|\bFIXME\b|\bTBD\b/, "unfinished marker"],
];

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function files(p: string): string[] {
  const abs = join(ROOT, p);
  if (statSync(abs).isFile()) return [p];
  return readdirSync(abs).flatMap(f => files(`${p}/${f}`)).filter(f => /\.(tsx?|js|css)$/.test(f));
}

export function placeholderHits(): string[] {
  const hits: string[] = [];
  for (const f of DIRS.flatMap(files)) {
    const rel = relative(ROOT, join(ROOT, f));
    if (SKIP.some(r => r.test(rel))) continue;
    const src = strip(readFileSync(join(ROOT, f), "utf8"));
    for (const [re, what] of PLACEHOLDERS) {
      const m = src.match(re);
      if (m) hits.push(`${rel}: ${what} ("${m[0]}")`);
    }
  }
  return hits;
}

if (process.argv[1]?.endsWith("check-placeholders.ts")) {
  const hits = placeholderHits();
  if (hits.length) {
    console.error(`Placeholders in production code (no sample numbers or fake activity, ever):\n${hits.map(h => `  ${h}`).join("\n")}`);
    process.exit(1);
  }
  console.log("No placeholders, sample numbers or fake activity in production code.");
}
