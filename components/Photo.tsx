/* A picture slot (lib/photos.ts says which page gets which): the slot's subject drawn in thin white line on deep colour
 * (components/SubjectArt), never a stock photo unrelated to the page. Decorative: always aria-hidden. When licensed
 * subject photos are available (scripts/hero-photos.sh, PHOTOS in lib/photos.ts), they replace the drawing here. */
import { SubjectArt } from "@/components/SubjectArt";
import { SLOT_SUBJECT } from "@/lib/photos";

export type PhotoN = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

/** A photo slot. Until subject photos can be fetched (scripts/hero-photos.sh), each slot shows its subject drawn in line
 *  (components/SubjectArt) on deep colour instead of a stock photo that has nothing to do with the page. */
export function Photo({ n, className, par = false }: {
  n: PhotoN; className?: string; eager?: boolean; wideOnly?: boolean; par?: boolean; band?: boolean; sizes?: string; onLoad?: () => void;
}) {
  return (
    <span className={`artpanel${className ? ` ${className}` : ""}`} data-par={par ? "" : undefined} data-slot={n}>
      <SubjectArt subject={SLOT_SUBJECT[n]} />
    </span>
  );
}
