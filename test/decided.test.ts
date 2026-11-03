import { describe, expect, it } from "vitest";
import { decidedText, decision } from "@/lib/millionaires/decided";

describe("decided markets: nothing left to copy", () => {
  it("settled, closed, or priced 97¢+ / 3¢-", () => {
    expect(decision({ result: "won", priceNow: 0.5 })).toBe("won");
    expect(decision({ result: "void", priceNow: 0.5 })).toBe("void");
    expect(decision({ priceNow: 0.97 })).toBe("won");
    expect(decision({ priceNow: 0.03 })).toBe("lost");
    expect(decision({ closed: true, priceNow: 0.5 })).toBe("closed");
    expect(decision({ priceNow: 0.96 })).toBeNull();
    expect(decision({ priceNow: 0.04 })).toBeNull();
    expect(decision({ priceNow: null })).toBeNull();
  });
  it("says what happened", () => {
    expect(decidedText("won", "Hawks")).toBe("Decided · Hawks won");
    expect(decidedText("lost", "No")).toBe("Decided · No lost");
    expect(decidedText("closed", "Yes")).toBe("Decided");
  });
});
