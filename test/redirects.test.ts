/* Redirects are built on the site's public address (lib/app-url.ts), never on the request's own URL: behind Railway's
 * proxy that is the container's (http://localhost:8080), so a member saving a rule on /autopilot landed on localhost. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("redirects", () => {
  it("no route or middleware redirects to a URL built from the request's own URL", () => {
    const files = [...walk("app").filter(f => /route\.ts$/.test(f)), "middleware.ts"];
    const bad = files.filter(f => /redirect\(\s*new URL\([^)]*\b_?req(uest)?\.url\)/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
