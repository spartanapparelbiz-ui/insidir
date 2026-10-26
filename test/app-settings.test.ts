import { describe, expect, it } from "vitest";
import { formToInput, parseSettings } from "@/app/api/settings/validate";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";

describe("settings validation", () => {
  it("strips the international Polymarket site for US users", () => {
    const r = parseSettings({ region: "us", venues: ["kalshi", "polymarket", "polymarket_us"] }, DEFAULT_SETTINGS, null);
    expect(r.errors).toEqual([]);
    expect(r.region).toBe("us");
    expect(r.settings.venues).toEqual(["kalshi", "polymarket_us"]);
  });

  it("errors when no allowed venue is left", () => {
    const r = parseSettings({ region: "us", venues: ["polymarket"] }, DEFAULT_SETTINGS, null);
    expect(r.errors.length).toBe(1);
    expect(r.settings.venues).not.toContain("polymarket");
  });

  it("cuts stored venues to the region even when venues are not sent", () => {
    const r = parseSettings({ minRoiPct: "2" }, DEFAULT_SETTINGS, "us");
    expect(r.settings.venues).toEqual(["kalshi", "polymarket_us"]);
    expect(r.settings.minRoi).toBeCloseTo(0.02, 12);
  });

  it("never accepts a bankroll (or any unknown field)", () => {
    const r = parseSettings({ bankroll: 5000, bankrollUsd: "5000", minSizeUsd: 100 }, { ...DEFAULT_SETTINGS, ...({ bankroll: 1 } as object) }, "non_us");
    expect(r.ignored).toEqual(["bankroll", "bankrollUsd"]);
    expect(Object.keys(r.settings)).not.toContain("bankroll");
    expect(JSON.stringify(r.settings)).not.toMatch(/bankroll/i);
    expect(r.settings.minSizeUsd).toBe(100);
  });

  it("reads a whole form: unticked boxes are false, percentages become fractions", () => {
    const f = new FormData();
    f.set("form", "settings");
    f.set("region", "non_us");
    f.append("venues", "kalshi");
    f.append("venues", "polymarket");
    f.append("categories", "crypto");
    f.append("categories", "sports");
    f.append("categories", "nonsense");
    f.set("minRoiPct", "1.5");
    f.set("minSizeUsd", "$250");
    f.set("alertMinRoiPct", "3");
    f.set("showYellow", "on");
    const r = parseSettings(formToInput(f), { ...DEFAULT_SETTINGS, showRed: true, alertPush: true }, "us", true);
    expect(r.errors).toEqual([]);
    expect(r.settings).toEqual({
      minRoi: 0.015, minSizeUsd: 250, categories: ["crypto", "sports"], venues: ["kalshi", "polymarket"],
      showYellow: true, showRed: false, alertPush: false, alertEmail: false, emailDigest: false, alertMinRoi: 0.03, soundOnGreen: false,
      alertSafety: "green", alertCategories: [], quietStart: null, quietEnd: null, timeZone: null,
    });
  });

  it("rejects out-of-range numbers and keeps the old value", () => {
    const r = parseSettings({ minRoiPct: "-1", minSizeUsd: "lots", region: "mars" }, DEFAULT_SETTINGS, "us");
    expect(r.errors.length).toBe(3);
    expect(r.settings.minRoi).toBe(DEFAULT_SETTINGS.minRoi);
    expect(r.region).toBe("us");
  });
});
