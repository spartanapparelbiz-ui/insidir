/* One of the six black-and-white photos in public/hero (scripts/hero-photos.sh makes them): a 2:3 crop that keeps the
 * person in frame on phones, 16:9 on wider screens, AVIF first and WebP as the fallback. Photos are atmosphere only:
 * always decorative (empty alt), never behind numbers or forms. */
export type PhotoN = 1 | 2 | 3 | 4 | 5 | 6;

/** Who took each photo (Unsplash), for the credits in the footer. */
export const PHOTO_CREDITS: ReadonlyArray<{ n: PhotoN; name: string; user: string }> = [
  { n: 1, name: "Joshua Harvey", user: "josharvey" },
  { n: 2, name: "Jeremy Bishop", user: "jeremybishop" },
  { n: 3, name: "Tom Brunberg", user: "tombrunberg" },
  { n: 4, name: "Tino Rischawy", user: "tinorischawy" },
  { n: 5, name: "Carter Moorse", user: "mentalmoorse" },
  { n: 6, name: "Hanna Lazar", user: "potokvarte" },
];

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
