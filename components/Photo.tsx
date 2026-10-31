/* A photo, from Unsplash's image CDN (lib/unsplash.ts): a real <img> with a srcset from 96 to 3840 wide, cropped there to
 * the box's ratio around the photo's focal point, its width and height set so nothing shifts while it loads, and the
 * photo's own colour behind it until it does. Decorative (empty alt): the words next to it carry the meaning. Lazy
 * unless it's the page's first hero (priority: eager, fetchpriority high). Motion (app/motion.css): a hero photo drifts
 * ±6% with scroll; every other photo zooms 1.12 → 1 as it enters. Server and client safe. */
import { SLOT_PHOTO, photoInfo, type PhotoName } from "@/lib/photos";
import { PHOTO_WIDTHS, url } from "@/lib/unsplash";

export type PhotoN = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
export type PhotoRatio = "1:1" | "4:3" | "16:9" | "21:9" | "2:3";

const RATIO: Record<PhotoRatio, number> = { "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9, "21:9": 21 / 9, "2:3": 2 / 3 };

/** The srcset for a photo at a ratio: every width up to 3840, the height following the ratio. */
export function photoSrcSet(name: PhotoName, ratio: PhotoRatio, q = 80): string {
  const p = photoInfo(name), r = RATIO[ratio];
  return PHOTO_WIDTHS.map(w => `${url(p.id, { w, h: w / r, fx: p.fx, fy: p.fy, q })} ${w}w`).join(", ");
}

export function Photo({ name, n, ratio = "4:3", sizes = "100vw", priority = false, className, par = false }: {
  /** Which photo; or `n`, a page slot (lib/photos.ts SLOT_PHOTO). */
  name?: PhotoName; n?: PhotoN;
  ratio?: PhotoRatio;
  /** How wide it shows (the img sizes attribute). */
  sizes?: string;
  /** The page's first hero: loaded eagerly, at high priority, at q=85. */
  priority?: boolean;
  className?: string;
  /** Drifts gently on scroll (app/motion.css [data-par]). */
  par?: boolean;
  /* kept so older call sites type-check; the CDN picks the size */
  eager?: boolean; wideOnly?: boolean; band?: boolean;
}) {
  const photo: PhotoName = name ?? SLOT_PHOTO[n ?? 4];
  const p = photoInfo(photo), r = RATIO[ratio], q = priority ? 85 : 80;
  const W = 1280, H = Math.round(W / r);
  return (
    <span className={`photo${className ? ` ${className}` : ""}`} style={{ backgroundColor: p.color }} data-photo={photo}
      data-par={par || priority ? "" : undefined} data-zoom={par || priority ? undefined : ""}>
      <img src={url(p.id, { w: 768, h: 768 / r, fx: p.fx, fy: p.fy, q })} srcSet={photoSrcSet(photo, ratio, q)} sizes={sizes}
        width={W} height={H} alt="" decoding="async" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} />
    </span>
  );
}
