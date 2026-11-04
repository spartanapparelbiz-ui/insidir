import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LICENSES_OK, PEOPLE, portraitFor, portraitOf, raceState } from "@/lib/brand/people";

describe("portraits: real, correct and licensed, or nothing", () => {
  it("every portrait on file has its three sizes, a source, an author and an allowed license", () => {
    for (const p of PEOPLE.filter(x => x.file)) {
      for (const s of [96, 192, 512]) expect(existsSync(`public/people/${p.file}-${s}.webp`), `${p.file}-${s}`).toBe(true);
      expect(p.license, p.name).toMatch(LICENSES_OK);
      expect(p.source, p.name).toMatch(/^https:\/\/(github\.com\/unitedstates\/images|commons\.wikimedia\.org\/|polymarket-upload\.s3\.)/);
      expect(p.author, p.name).toBeTruthy();
      // A Polymarket image is used only when its file name carries the candidate's name.
      if (p.kind === "polymarket") expect(p.source!.toLowerCase().replace(/[^a-z]/g, "")).toContain(p.name.toLowerCase().replace(/[^a-z]/g, ""));
    }
  });
  it("a face only for that candidate in that state's race; never by title alone", () => {
    expect(raceState("texas-senate-election-winner")).toBe("TX");
    expect(raceState("florida-governor-winner-2026")).toBe("FL");
    expect(raceState("ca-13-house-election-winner")).toBe("CA");
    const any = PEOPLE.find(p => p.file);
    if (any) {
      expect(portraitOf(any.name, "zz-senate-election-winner")).toBeNull();
      expect(portraitOf("Someone Else", `${any.state.toLowerCase()}-1-house-election-winner`)).toBeNull();
    }
    expect(portraitFor("Will the Democrats win the Texas Senate race in 2026?")).toBeNull();
  });
});
