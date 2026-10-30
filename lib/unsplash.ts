/* Unsplash's image CDN (imgix): every photo is cropped and sized there, never stored here. One URL shape for the whole
 * product, so the browser cache and Unsplash's CDN share every size. */

export const UNSPLASH_HOST = "images.unsplash.com";
/** The widths a srcset offers, smallest first. */
export const PHOTO_WIDTHS = [96, 192, 384, 768, 1280, 1920, 2560, 3840] as const;

/** https://images.unsplash.com/photo-<id>?auto=format&fit=crop&crop=focalpoint&fp-x=…&fp-y=…&w=…&h=…&q=80 */
export function url(id: string, { w, h, fx = 0.5, fy = 0.5, q = 80 }: { w: number; h?: number; fx?: number; fy?: number; q?: number }): string {
  const p = new URLSearchParams({ auto: "format", fit: "crop", crop: "focalpoint", "fp-x": String(fx), "fp-y": String(fy), w: String(Math.round(w)) });
  if (h) p.set("h", String(Math.round(h)));
  p.set("q", String(q));
  return `https://${UNSPLASH_HOST}/photo-${id}?${p.toString()}`;
}
