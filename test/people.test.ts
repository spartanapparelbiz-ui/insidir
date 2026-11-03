import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LICENSES_OK, PEOPLE, portraitFor } from "@/lib/brand/people";

describe("portraits: real, correct and licensed, or nothing", () => {
  it("every file in public/people has a people.json entry with a source, author and an allowed license", () => {
    const files = readdirSync("public/people").filter(f => !f.startsWith("."));
    for (const f of files) {
      const p = PEOPLE.find(x => x.file === f);
      expect(p, f).toBeTruthy();
      expect(p!.license, f).toMatch(LICENSES_OK);
      expect(p!.source, f).toMatch(/^https:\/\/(github\.com\/unitedstates\/images|raw\.githubusercontent\.com\/unitedstates\/images|commons\.wikimedia\.org)\//);
      expect(p!.author, f).toBeTruthy();
    }
    for (const p of PEOPLE) expect(files, p.file).toContain(p.file);
  });
  it("matches only on full name and office", () => {
    expect(portraitFor("Will the Democrats win the Texas Senate race in 2026?")).toBeNull();
  });
});
