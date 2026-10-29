/* No placeholders, sample numbers or fake activity in production code (scripts/check-placeholders.ts, which also runs
 * before every `next build`). */
import { describe, expect, it } from "vitest";
import { placeholderHits, PLACEHOLDERS } from "../scripts/check-placeholders";

describe("no placeholders in production", () => {
  it("finds none in app/, components/, lib/ and the service worker", () => {
    expect(placeholderHits()).toEqual([]);
  });
  it("would catch the usual ones", () => {
    const caught = (s: string) => PLACEHOLDERS.some(([re]) => re.test(s));
    for (const s of ["Lorem ipsum dolor", "sample moves", "fake activity", "E2E fixture: Chiefs", "John Doe put $1,234", "Math.random()", "TODO wire up"]) {
      expect(caught(s), s).toBe(true);
    }
    for (const s of ["Anonymous · Kalshi: $48,000 position on Lakers to win.", "you@example.com", "Real past positions. Not a promise."]) expect(caught(s), s).toBe(false);
  });
});
