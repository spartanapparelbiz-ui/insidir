/* The design system, taken from the homepage (app/brand.css .b-root, components/brand/*): every app page uses these
 * and nothing else. test/system.test.ts fails when a page's inline style or the system's CSS uses a colour, font size or
 * radius outside them. Colours are the homepage tokens (as CSS variables, or their literal values); type sizes are the
 * homepage's scale (headlines in --u via <Lines size>, UI text in px); radii are the pill, the panel, the small corner
 * and the circle. */

export const COLOR_VARS = ["--ink", "--ink-muted", "--ink-3", "--ink-4", "--page", "--surface-1", "--surface-2", "--surface-3", "--surface-4", "--panel", "--white-btn", "--btn-ink", "--glass-fill", "--glass-line", "--focus", "--up", "--down", "--dim",
  "--gold", "--gold-2", "--steel", "--yes", "--no", "--dem", "--rep", "--violet",
  "--t-page", "--t-panel", "--t-head", "--t-line", "--t-row", "--t-text", "--t-muted", "--t-blue", "--t-blue-text", "--t-blue-tint", "--t-cta", "--t-cta-ink", "--t-cta-hover", "--t-up", "--t-down", "--t-on-blue", "--t-navy"] as const;

/** The literal values behind the tokens (lower case): the terminal palette (app/tokens.css). */
export const COLORS = ["#030407", "#0a0c12", "#0f121a", "#1b2030", "#12151e", "#071b53", "#0c1a2c", "#f3f7ff", "#8a94a8", "#6cc4fe", "#e3fb99", "#eefdc0", "#19d27a", "#ff4d6a",
  "transparent", "currentcolor", "inherit"] as const;

/** UI text in px; headlines are set with <Lines size> in --u (40–89). */
export const FONT_SIZES_PX = [11, 12, 12.5, 13, 14, 15, 16, 17, 20, 22, 28, 44] as const;
export const HEADLINE_SIZES = [40, 44, 48, 52, 56, 60, 64, 72, 89] as const;

/** The terminal is square: 0–2px (--r, --t-r), and the circle for status dots. */
export const RADII = ["var(--r)", "var(--t-r)", "2px", "50%", "0"] as const;
