/* Settings validation, shared by POST /api/settings and POST /api/onboarding. Pure.
 *
 * Only the known fields are read; anything else (a "bankroll", say) is ignored and reported back, never stored.
 * Venues are always cut to the user's region: US users can only keep Kalshi and Polymarket US. ROI fields arrive
 * as percentages ("1.5" = 1.5%) and are stored as fractions. */
import type { UserSettings } from "@/lib/db/schema";
import { REGION_VENUES } from "@/lib/region";
import type { Region, Venue } from "@/lib/types";
import { VENUES } from "@/lib/types";

/** Categories a user can filter on (the normalised categories in lib/exchanges/categories.ts, minus combos). */
export const CATEGORIES = ["politics", "sports", "crypto", "economics", "finance", "culture", "weather", "tech", "geopolitics", "mentions", "other"] as const;
export const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  politics: "Politics", sports: "Sports", crypto: "Crypto", economics: "Economics", finance: "Finance", culture: "Culture",
  weather: "Weather", tech: "Tech", geopolitics: "Geopolitics", mentions: "Mentions", other: "Other",
};
/** Highest ROI filter accepted, percent. */
export const MAX_ROI_PCT = 100;
/** Highest size filter accepted, dollars. */
export const MAX_SIZE_USD = 10_000_000;

const KNOWN = new Set(["region", "venues", "minRoiPct", "minSizeUsd", "categories", "showYellow", "showRed", "alertPush", "alertEmail", "emailDigest", "soundOnGreen", "alertMinRoiPct",
  "form", "action", "next", "skipped"]);

export type SettingsInput = Record<string, unknown>;

export interface SettingsResult {
  settings: UserSettings;
  region: Region | null;
  errors: string[];
  /** Fields that were sent but are not settings (never stored). */
  ignored: string[];
}

/** FormData → plain object; repeated keys (checkbox groups) become arrays. */
export function formToInput(form: FormData): SettingsInput {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string") continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]).filter((x): x is string => typeof x === "string");

function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "on" || v === "true" || v === "1" || v === 1) return true;
  if (v === "false" || v === "0" || v === "off" || v === 0) return false;
  return null;
}

function number(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[$,%\s]/g, "")) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Applies the input to the current settings.
 *  `complete` = the input is a whole settings form: an unticked checkbox (absent) means false / none. Otherwise
 *  absent fields keep their current value (JSON partial updates, onboarding). */
export function parseSettings(input: SettingsInput, current: UserSettings, currentRegion: Region | null, complete = false): SettingsResult {
  const errors: string[] = [];
  const ignored = Object.keys(input).filter(k => !KNOWN.has(k));
  // Rebuilt field by field so nothing but the known settings is ever written back.
  const s: UserSettings = {
    minRoi: current.minRoi, minSizeUsd: current.minSizeUsd, categories: [...current.categories], venues: [...current.venues],
    showYellow: current.showYellow, showRed: current.showRed, alertPush: current.alertPush, alertEmail: current.alertEmail,
    emailDigest: current.emailDigest, alertMinRoi: current.alertMinRoi, soundOnGreen: current.soundOnGreen ?? false,
  };
  const has = (k: string): boolean => input[k] !== undefined;

  let region = currentRegion;
  if (has("region")) {
    if (input.region === "us" || input.region === "non_us") region = input.region;
    else errors.push("Region must be US or Outside the US.");
  }
  const regionVenues = REGION_VENUES[region ?? "us"];

  if (has("venues") || complete) {
    const chosen = list(input.venues).filter((v): v is Venue => (VENUES as readonly string[]).includes(v));
    const allowed = chosen.filter(v => regionVenues.includes(v));
    if (!allowed.length) { errors.push("Pick at least one venue."); s.venues = s.venues.filter(v => regionVenues.includes(v)); }
    else s.venues = allowed;
  } else {
    s.venues = s.venues.filter(v => regionVenues.includes(v));
  }

  if (has("categories") || complete) {
    s.categories = [...new Set(list(input.categories).filter(c => (CATEGORIES as readonly string[]).includes(c)))];
  }

  if (has("minRoiPct")) {
    const v = number(input.minRoiPct, 0, MAX_ROI_PCT);
    if (v === null) errors.push(`Min ROI must be between 0 and ${MAX_ROI_PCT}%.`); else s.minRoi = v / 100;
  }
  if (has("alertMinRoiPct")) {
    const v = number(input.alertMinRoiPct, 0, MAX_ROI_PCT);
    if (v === null) errors.push(`Alert min ROI must be between 0 and ${MAX_ROI_PCT}%.`); else s.alertMinRoi = v / 100;
  }
  if (has("minSizeUsd")) {
    const v = number(input.minSizeUsd, 0, MAX_SIZE_USD);
    if (v === null) errors.push("Min size must be a dollar amount of 0 or more."); else s.minSizeUsd = v;
  }

  for (const k of ["showYellow", "showRed", "alertPush", "alertEmail", "emailDigest", "soundOnGreen"] as const) {
    if (has(k)) {
      const b = bool(input[k]);
      if (b === null) errors.push(`${k} must be on or off.`); else s[k] = b;
    } else if (complete) s[k] = false;
  }
  return { settings: s, region, errors, ignored };
}
