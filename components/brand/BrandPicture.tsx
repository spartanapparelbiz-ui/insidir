/* A full-bleed brand photo from its pre-generated files (scripts/brand-images.ts): AVIF, else WebP, at 1920, 2880 or
 * 3840 wide, the browser picking by the screen's width and pixel ratio (a 1440 screen at 2x takes the 2880). Never the
 * on-demand optimizer, never above 3840. Server component. */
import type { CSSProperties } from "react";
import { genPath, srcSet } from "@/lib/brand/picture";

export function BrandPicture({ src, priority = false, sizes = "100vw", style }: { src: string; priority?: boolean; sizes?: string; style?: CSSProperties }) {
  return (
    <picture className="b-pic">
      <source type="image/avif" srcSet={srcSet(src, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(src, "webp")} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-generated sizes, not the optimizer */}
      <img src={genPath(src, 1920, "webp")} alt="" decoding="async" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} style={style} />
    </picture>
  );
}
