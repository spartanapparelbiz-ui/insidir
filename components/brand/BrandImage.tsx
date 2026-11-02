/* A brand photo through next/image (AVIF or WebP at the width the screen needs), with the grade that makes the set one
 * look (app/brand.css .b-photo: 25% black plus a warm tint). Only the hero passes `priority` (preloaded, high fetch
 * priority); everything else lazy-loads. `zoom` scales it slowly as it scrolls past (components/brand/motion.tsx). */
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Photo } from "@/lib/brand/images";
import { ScrollZoom } from "./motion";

export function BrandImage({ photo, sizes, priority = false, zoom = false, className = "", style, children, as: Tag = "div", fade = false, alt, ...rest }: {
  photo: Photo; sizes: string; priority?: boolean; zoom?: boolean | "hero"; className?: string; style?: CSSProperties; children?: ReactNode;
  as?: "div" | "section" | "a" | "header"; fade?: boolean; alt?: string; href?: string; "data-testid"?: string; id?: string; "aria-label"?: string;
}) {
  const img = (
    <Image src={photo.src} alt={alt ?? photo.alt} fill sizes={sizes} priority={priority} fetchPriority={priority ? "high" : undefined}
      quality={priority ? 62 : 68} style={{ objectFit: "cover" }} />
  );
  const Comp = Tag as "div";
  return (
    <Comp className={`b-photo${fade ? " b-fade-b" : ""} ${className}`} style={{ backgroundColor: photo.tone, ...style }} {...rest}>
      {zoom ? <ScrollZoom hero={zoom === "hero"}>{img}</ScrollZoom> : <div className="b-photo__zoom">{img}</div>}
      <span className="b-photo__tint" aria-hidden="true" />
      {children}
    </Comp>
  );
}
