/* One of the sixteen photos in public/hero (scripts/hero-photos.sh makes them, all in one dark, muted-colour grade): a
 * 2:3 crop that keeps the person in frame on phones, 16:9 on wider screens, AVIF first and WebP as the fallback. Photos
 * are atmosphere only: always decorative (empty alt), never behind numbers or forms, and no page shows the same photo
 * twice in view (lib/photos.ts says which page gets which). */
export type PhotoN = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

/** Who took each photo (Unsplash), for the credits in the footer. */
export const PHOTO_CREDITS: ReadonlyArray<{ n: PhotoN; name: string; user: string }> = [
  { n: 1, name: "Joshua Harvey", user: "josharvey" },
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

export function Photo({ n, className, eager = false, wideOnly = false, onLoad }: {
  n: PhotoN; className?: string; eager?: boolean; wideOnly?: boolean; onLoad?: () => void;
}) {
  const crop = (c: "d" | "m", ext: string) => `/hero/${n}-${c}.${ext}`;
  return (
    <picture className={className}>
      <source media={wideOnly ? undefined : PHOTO_WIDE} type="image/avif" srcSet={crop("d", "avif")} />
      {wideOnly ? null : <source type="image/avif" srcSet={crop("m", "avif")} />}
      <source media={wideOnly ? undefined : PHOTO_WIDE} type="image/webp" srcSet={crop("d", "webp")} />
      <img src={crop(wideOnly ? "d" : "m", "webp")} alt="" decoding="async" loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined} onLoad={onLoad} />
    </picture>
  );
}
