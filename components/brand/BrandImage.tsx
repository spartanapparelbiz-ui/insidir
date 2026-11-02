/* A brand photo through next/image (AVIF or WebP at the width the screen needs), with the grade that makes the set one
 * look (app/brand.css .b-photo: 25% black plus a warm tint). The image sits in an inner layer 20% taller than its frame
 * so the scroll engine can move it slower than the frame (data-parallax) and push in while in view. Only the first
 * screen's photo passes `priority` (preloaded, high fetch priority); everything else lazy-loads. */
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Photo } from "@/lib/brand/images";

export function BrandImage({ photo, sizes, priority = false, parallax = true, className = "", style, children, as: Tag = "div", fade = false, alt, quality, ...rest }: {
  photo: Photo; sizes: string; priority?: boolean; parallax?: boolean; className?: string; style?: CSSProperties; children?: ReactNode;
  as?: "div" | "section" | "a" | "header"; fade?: boolean; alt?: string; quality?: number; href?: string; "data-testid"?: string; id?: string; "aria-label"?: string; "aria-labelledby"?: string;
}) {
  const Comp = Tag as "div";
  return (
    <Comp className={`b-photo${fade ? " b-fade-b" : ""}${parallax ? "" : " b-photo--flat"} ${className}`} style={{ backgroundColor: photo.tone, ...style }} {...rest}>
      <div className="b-photo__img" data-parallax={parallax ? "" : undefined}>
        <Image src={photo.src} alt={alt ?? photo.alt} fill sizes={sizes} priority={priority} fetchPriority={priority ? "high" : undefined}
          quality={quality ?? (priority ? 60 : 66)} style={{ objectFit: "cover" }} />
      </div>
      <span className="b-photo__tint" aria-hidden="true" />
      {children}
    </Comp>
  );
}
