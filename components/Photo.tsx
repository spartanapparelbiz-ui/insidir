/* One of the fifteen photos in public/hero (scripts/hero-photos.sh makes them, all in one dark, muted-colour grade): a
 * 2:3 crop that keeps the person in frame on phones, 16:9 on wider screens, up to 4K, AVIF first and WebP as the fallback. Photos
 * are atmosphere only: always decorative (empty alt), never behind numbers or forms, and no page shows the same photo
 * twice in view (lib/photos.ts says which page gets which). */
export type PhotoN = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

/** Who took each photo (Unsplash), for the credits in the footer. */
export const PHOTO_CREDITS: ReadonlyArray<{ n: PhotoN; name: string; user: string }> = [
  { n: 2, name: "Jeremy Bishop", user: "jeremybishop" },
  { n: 3, name: "Tom Brunberg", user: "tombrunberg" },
  { n: 4, name: "Tino Rischawy", user: "tinorischawy" },
  { n: 5, name: "Carter Moorse", user: "mentalmoorse" },
  { n: 6, name: "Hanna Lazar", user: "potokvarte" },
  { n: 7, name: "Kamil Pietrzak", user: "kamilpphotos" },
  { n: 8, name: "Bro Takes Photos", user: "brotakesphotos" },
  { n: 9, name: "Marek Piwnicki", user: "marekpiwnicki" },
  { n: 10, name: "Alban Rozes", user: "h3reux" },
  { n: 11, name: "Tino Rischawy", user: "tinorischawy" },
  { n: 12, name: "Andhika Soreng", user: "dhika88" },
  { n: 13, name: "Katherina Lipatnikova", user: "kate_lipa" },
  { n: 14, name: "Alexander", user: "crankeli" },
  { n: 15, name: "Vincentiu Solomon", user: "vincentiu" },
  { n: 16, name: "Rohit Dey", user: "rohit16dey" },
];

/** Each photographer once, in photo order (one took two of the photos), for the footer. */
export const PHOTOGRAPHERS = PHOTO_CREDITS.filter((c, i) => PHOTO_CREDITS.findIndex(o => o.user === c.user) === i);

/** Where the mobile crop switches to the wide one. */
export const PHOTO_WIDE = "(min-width: 900px)";

/** The sizes each crop is made in (scripts/hero-photos.sh), largest first: the browser picks the smallest one that is
 *  still sharp on this screen, so a 4K display gets the 3840px photo and a phone never downloads it. */
const W = { d: [3840, 2560, 1920, 1280], m: [1720, 1080], b: [3840, 1920], bm: [1680, 1120] } as const;
type Crop = keyof typeof W;
const set = (n: PhotoN, c: Crop, ext: string) => W[c].map(w => `/hero/${n}-${c}-${w}.${ext} ${w}w`).join(", ");
/** The smallest file of a crop, for browsers that ignore srcset. */
export const photoSrc = (n: PhotoN, c: Crop, ext = "webp") => `/hero/${n}-${c}-${W[c][W[c].length - 1]}.${ext}`;
/** The srcset and sizes for preloading a photo (components/home/Hero.tsx). */
export const photoSet = (n: PhotoN, c: Crop, ext = "avif") => set(n, c, ext);
/** How wide a full-bleed phone photo really is: a 2:3 photo covering a tall phone screen is ~1.5 screens wide. */
export const PHONE_SIZES = "150vw";

export function Photo({ n, className, eager = false, wideOnly = false, band = false, par = false, sizes = "100vw", onLoad }: {
  n: PhotoN; className?: string; eager?: boolean; wideOnly?: boolean;
  /** Drifts at 0.85x scroll speed with a gentle zoom (app/v2.css [data-par], components/motion/Motion.tsx). */
  par?: boolean;
  /** A header band's strip (4:1 wide, 2.8:1 on phones) instead of a whole photo. */
  band?: boolean;
  /** How wide the photo shows (the img sizes attribute); full width unless it sits in something smaller. */
  sizes?: string;
  onLoad?: () => void;
}) {
  const [wide, narrow]: [Crop, Crop | null] = band ? ["b", "bm"] : ["d", wideOnly ? null : "m"];
  const narrowSizes = band ? "100vw" : PHONE_SIZES;
  return (
    <picture className={className} data-par={par ? "" : undefined}>
      <source media={narrow ? PHOTO_WIDE : undefined} type="image/avif" srcSet={set(n, wide, "avif")} sizes={sizes} />
      {narrow ? <source type="image/avif" srcSet={set(n, narrow, "avif")} sizes={narrowSizes} /> : null}
      <source media={narrow ? PHOTO_WIDE : undefined} type="image/webp" srcSet={set(n, wide, "webp")} sizes={sizes} />
      {narrow ? <source type="image/webp" srcSet={set(n, narrow, "webp")} sizes={narrowSizes} /> : null}
      <img src={photoSrc(n, narrow ?? wide)} alt="" decoding="async" loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined} onLoad={onLoad} />
    </picture>
  );
}
