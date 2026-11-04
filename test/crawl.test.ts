/* The nightly crawl's pure parts (qa/crawl.ts): route shapes, sampling, and the text a reader must never see. */
import { describe, expect, it } from "vitest";
import { routeOf, sample, textFindings } from "../qa/crawl";

describe("the crawl", () => {
  it("collapses dynamic routes and samples each", () => {
    expect(routeOf("/")).toBe("/");
    expect(routeOf("/pricing")).toBe("/pricing");
    expect(routeOf("/market/heat-vs-lakers-1a2b")).toBe("/market/*");
    expect(sample(["/", "/market/a", "/market/b", "/market/c", "/pricing", "/market/d"], 2)).toEqual(["/", "/market/a", "/market/b", "/pricing"]);
  });
  it("finds raw dates and None, and leaves ordinary words alone", () => {
    expect(textFindings("Updated 2026-11-04T18:00:00Z")).toEqual(['raw ISO date "2026-11-04T18:00:00Z"']);
    expect(textFindings("Side: None")).toEqual(['"None" in the text']);
    expect(textFindings("Price: NaN¢ and undefined")).toEqual(['"undefined" in the text', '"NaN" in the text']);
    expect(textFindings("Nonetheless, null-safe pricing on Nov 4, 2026")).toEqual([]);
  });
});
