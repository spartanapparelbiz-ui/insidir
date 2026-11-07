/* The pre-generated sizes of the brand photos (scripts/brand-images.ts) and their srcsets. Pure, client-safe. */
/** 640 and 960 for cards and tiles; 1920, 2880 and 3840 for full-bleed stages. */
export const BRAND_WIDTHS = [640, 960, 1920, 2880, 3840] as const;

/** "/brand/hero.jpg" → "hero". */
const photoName = (src: string): string => src.replace(/^\/brand\//, "").replace(/\.jpg$/, "");
export const genPath = (src: string, w: number, fmt: "avif" | "webp"): string => `/brand/gen/${photoName(src)}-${w}.${fmt}`;
export const srcSet = (src: string, fmt: "avif" | "webp"): string => BRAND_WIDTHS.map(w => `${genPath(src, w, fmt)} ${w}w`).join(", ");
