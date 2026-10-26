/* The Alerts page's settings: quiet hours (incl. overnight windows and time zones), the safety and category choices,
 * and the inline checks the Account page runs as you type. */
import { describe, expect, it } from "vitest";
import { checkRoiPct, checkUsd, parseSettings, ROI_ERROR, SIZE_ERROR, TIME_ERROR } from "@/app/api/settings/validate";
import { inQuietHours, localMinutes, minutesOf, validTimeZone } from "@/lib/alerts/quiet";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";

const at = (h: number, m = 0) => Date.UTC(2026, 9, 26, h, m);

describe("quiet hours", () => {
  it("reads 24-hour times", () => {
    expect(minutesOf("22:00")).toBe(1320);
    expect(minutesOf("7:05")).toBe(425);
    expect(minutesOf("24:00")).toBeNull();
    expect(minutesOf("10pm")).toBeNull();
    expect(minutesOf(null)).toBeNull();
  });
  it("a same-day window", () => {
    expect(inQuietHours(at(13), "12:00", "14:00", "UTC")).toBe(true);
    expect(inQuietHours(at(14), "12:00", "14:00", "UTC")).toBe(false);
    expect(inQuietHours(at(11, 59), "12:00", "14:00", "UTC")).toBe(false);
  });
  it("an overnight window wraps midnight", () => {
    expect(inQuietHours(at(23), "22:00", "07:00", "UTC")).toBe(true);
    expect(inQuietHours(at(3), "22:00", "07:00", "UTC")).toBe(true);
    expect(inQuietHours(at(7), "22:00", "07:00", "UTC")).toBe(false);
    expect(inQuietHours(at(12), "22:00", "07:00", "UTC")).toBe(false);
  });
  it("uses the member's time zone (unknown zones fall back to UTC)", () => {
    // 03:00 UTC = 23:00 the day before in New York (EDT, UTC−4).
    expect(localMinutes(at(3), "America/New_York")).toBe(23 * 60);
    expect(inQuietHours(at(3), "22:00", "07:00", "America/New_York")).toBe(true);
    expect(inQuietHours(at(12), "22:00", "07:00", "Asia/Tokyo")).toBe(false); // 12:00 UTC = 21:00 in Tokyo
    expect(inQuietHours(at(14), "22:00", "07:00", "Asia/Tokyo")).toBe(true); // 14:00 UTC = 23:00 in Tokyo
    expect(validTimeZone("Not/AZone")).toBe(false);
    expect(localMinutes(at(5), "Not/AZone")).toBe(5 * 60);
  });
  it("no window when either end is missing or they're equal", () => {
    expect(inQuietHours(at(3), null, "07:00", "UTC")).toBe(false);
    expect(inQuietHours(at(3), "07:00", "07:00", "UTC")).toBe(false);
  });
});

describe("alert settings validation", () => {
  it("stores the safety choice, alert categories, quiet hours and time zone", () => {
    const r = parseSettings({ alertSafety: "green_yellow", alertCategories: ["sports", "nope"], quietStart: "22:00", quietEnd: "7:00", timeZone: "Europe/London" }, DEFAULT_SETTINGS, "us");
    expect(r.errors).toEqual([]);
    expect(r.settings).toMatchObject({ alertSafety: "green_yellow", alertCategories: ["sports"], quietStart: "22:00", quietEnd: "07:00", timeZone: "Europe/London" });
  });
  it("clears quiet hours with null or an empty value", () => {
    const set = { ...DEFAULT_SETTINGS, quietStart: "22:00", quietEnd: "07:00" };
    expect(parseSettings({ quietStart: null, quietEnd: "" }, set, "us").settings).toMatchObject({ quietStart: null, quietEnd: null });
  });
  it("rejects bad values with words that say how to fix them", () => {
    expect(parseSettings({ quietStart: "late" }, DEFAULT_SETTINGS, "us").errors).toEqual([TIME_ERROR]);
    expect(parseSettings({ alertSafety: "red" }, DEFAULT_SETTINGS, "us").errors).toHaveLength(1);
    expect(parseSettings({ timeZone: "Mars/Base" }, DEFAULT_SETTINGS, "us").errors).toHaveLength(1);
    expect(parseSettings({ minRoiPct: "-1" }, DEFAULT_SETTINGS, "us").errors).toEqual([ROI_ERROR]);
  });
  it("inline checks as you type", () => {
    expect(checkRoiPct("1.5")).toBeNull();
    expect(checkRoiPct("")).toBe(ROI_ERROR);
    expect(checkRoiPct("101")).toBe(ROI_ERROR);
    expect(checkUsd("$250")).toBeNull();
    expect(checkUsd("lots")).toBe(SIZE_ERROR);
  });
});
