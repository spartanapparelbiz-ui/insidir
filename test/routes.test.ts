/* Public URLs never name the payment provider: no route folder under app/ contains "whop". */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..", "app");
const dirs = (d: string): string[] => readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).flatMap(e => [join(d, e.name), ...dirs(join(d, e.name))]);

describe("routes", () => {
  it("no URL on the site contains \"whop\"", () => {
    expect(dirs(APP).map(d => relative(APP, d)).filter(p => /whop/i.test(p))).toEqual([]);
  });
  it("the payment webhook lives at /api/billing/webhook", () => {
    expect(dirs(APP).map(d => relative(APP, d))).toContain(join("api", "billing", "webhook"));
  });
});
