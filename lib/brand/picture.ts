/* The pre-generated sizes of the brand photos (scripts/brand-images.ts) and their srcsets. Pure, client-safe. */
export const BRAND_WIDTHS = [1920, 2880, 3840] as const;
/** The widest image anything on the site asks for (next.config.ts deviceSizes ends here too). */
export const MAX_IMAGE_WIDTH = 3840;

/** "/brand/hero.jpg" → "hero". */
export const photoName = (src: string): string => src.replace(/^\/brand\//, "").replace(/\.jpg$/, "");
export const genPath = (src: string, w: number, fmt: "avif" | "webp"): string => `/brand/gen/${photoName(src)}-${w}.${fmt}`;
export const srcSet = (src: string, fmt: "avif" | "webp"): string => BRAND_WIDTHS.map(w => `${genPath(src, w, fmt)} ${w}w`).join(", ");
