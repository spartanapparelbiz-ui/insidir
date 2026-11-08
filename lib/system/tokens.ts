/* The design system, taken from the homepage (app/brand.css .b-root, components/brand/*): every app page uses these
 * and nothing else. test/system.test.ts fails when a page's inline style or the system's CSS uses a colour, font size or
 * radius outside them. Colours are the homepage tokens (as CSS variables, or their literal values); type sizes are the
 * homepage's scale (headlines in --u via <Lines size>, UI text in px); radii are the pill, the panel, the small corner
 * and the circle. */

export const COLOR_VARS = ["--ink", "--ink-muted", "--ink-3", "--ink-4", "--page", "--surface-1", "--surface-2", "--surface-3", "--surface-4", "--panel", "--white-btn", "--btn-ink", "--glass-fill", "--glass-line", "--focus", "--up", "--down", "--dim",
  "--gold", "--gold-2", "--steel", "--yes", "--no", "--dem", "--rep", "--violet"] as const;

/** The literal values behind the tokens (lower case). */
export const COLORS = ["#ffffff", "#fff", "#000", "#000000", "#ededed", "#181818", "#fdfdfd", "#050505", "#a78bfa", "#3dd68c", "#ff6b6b", "#f5c451", "#c8952c", "#b8c2cf", "#4c8dff", "#ff4d5e",
  "rgba(0, 0, 0, .78)", "rgba(255, 255, 255, .09)", "rgba(237, 237, 237, .62)", "transparent", "currentcolor", "inherit"] as const;

/** UI text in px; headlines are set with <Lines size> in --u (40–89). */
export const FONT_SIZES_PX = [12, 13, 14, 15, 16, 17, 20, 22, 28] as const;
export const HEADLINE_SIZES = [40, 44, 48, 52, 56, 60, 64, 72, 89] as const;

/** The pill, the panel (--r), the small corner, the circle. */
export const RADII = ["999px", "var(--r)", "10px", "50%", "0"] as const;
