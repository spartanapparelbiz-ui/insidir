/* A category's photo as art: next/image at quality 90 (AVIF/WebP at the width the slot needs), cropped to the photo's
 * subject (lib/brand/images.ts pos), an overlay no darker than 12%, a 14px radius with a 1px inner light border, and the
 * category's name on a small glass chip. Without a photo of its own it is a gradient of the category's ambient colour,
 * never another category's picture. Safe in server and client components. */
import Image from "next/image";
import type { CSSProperties } from "react";
import { category as categoryInfo, categoryPhoto, type CategorySlug } from "@/lib/brand/categories";
import { PHOTOS } from "@/lib/brand/images";

export function ambientOf(slug: CategorySlug): string { return categoryPhoto(slug).ambient; }

export function CategoryArt({ slug, sizes, label = true, className = "", priority = false }: {
  slug: CategorySlug; sizes: string; label?: boolean; className?: string; priority?: boolean;
}) {
  // Its own photo, or (until one lands: elections, football, weather, space, world, culture, hockey) a gradient in the
  // ambient colour of its nearest photo, never that photo itself.
  const own = slug in PHOTOS;
  const photo = categoryPhoto(slug), name = categoryInfo(slug).name;
  const style = { "--amb": photo.ambient } as CSSProperties;
  return (
    <span className={`b-art ${own ? "" : "b-art--tone"} ${className}`} style={style} data-cat={slug}>
      {own ? <Image src={photo.src} alt="" fill sizes={sizes} quality={90} priority={priority} style={{ objectFit: "cover", objectPosition: photo.pos }} /> : null}
      {label ? <span className="b-art__chip">{name}</span> : null}
    </span>
  );
}
