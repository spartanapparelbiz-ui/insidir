import { describe, expect, it } from "vitest";
import { candidateOf, raceOf, verifiedHeadshot } from "@/lib/market/art";

describe("headshots: name AND race, or initials", () => {
  const img = "https://polymarket-upload.s3.us-east-2.amazonaws.com/midterms-26-james-talarico-texas-senate-bb6cdef1aa.jpg";
  it("reads the candidate and the race", () => {
    expect(candidateOf("James Talarico (D)")).toEqual({ name: "James Talarico", party: "D" });
    expect(candidateOf("Democratic Party")).toBeNull();
    expect(raceOf("Texas Senate Election Winner")).toEqual(["texas", "senate"]);
    expect(raceOf("New Hampshire Governor Election")).toEqual(["new", "hampshire", "governor"]);
    expect(raceOf("Which party will win the House in 2026?")).toBeNull();
  });
  it("shows a face only when the file names both", () => {
    expect(verifiedHeadshot(img, "James Talarico", "Texas Senate Election Winner")).toBe(true);
    expect(verifiedHeadshot(img, "Ken Paxton", "Texas Senate Election Winner")).toBe(false); // wrong person
    expect(verifiedHeadshot(img, "James Talarico", "Maine Senate Election Winner")).toBe(false); // wrong race
    expect(verifiedHeadshot(img, "James Talarico", "Texas Governor Election Winner")).toBe(false); // wrong office
    expect(verifiedHeadshot("https://x/amy-acton-ohio.png", "Amy Acton", "Ohio Governor Election Winner")).toBe(false);
    expect(verifiedHeadshot(null, "James Talarico", "Texas Senate Election Winner")).toBe(false);
  });
});

