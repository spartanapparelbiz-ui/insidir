/* The count-up's frame text (components/motion/Motion.tsx countText): never below 0 or past the real value, in the
 * figure's own format, whatever the clock says. */
import { describe, expect, it } from "vitest";
import { countText } from "@/components/motion/Motion";

describe("countText", () => {
  it("is exactly the final text at the end, and past it", () => {
    for (const f of ["$346M", "+15.9%", "1,627 of 1,627", "$100 on every position: $37,900 in, +$6,012 back."]) {
      expect(countText(f, 1)).toBe(f);
      expect(countText(f, 7)).toBe(f);
    }
  });
  it("starts at 0, keeps the format, and never goes negative (a clock that runs backwards is clamped)", () => {
    expect(countText("+$6,012", 0)).toBe("+$0");
    expect(countText("+15.9%", 0)).toBe("+0.0%");
    expect(countText("1,627 of 1,627", -50)).toBe("0 of 0");
    expect(countText("$346B", -1e6)).toBe("$0B");
    expect(countText("$346B", NaN)).toBe("$346B");
  });
  it("stays between 0 and the real value on the way up", () => {
    for (const k of [0.1, 0.3, 0.5, 0.8, 0.99]) {
      const v = Number(countText("13,108", k).replace(/,/g, ""));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(13108);
    }
  });
});
