"use client";
/* A trader's picture or monogram (lib/moves/avatar.ts): round, 40px on cards and 96px on profiles, the same everywhere.
 * The picture goes through next/image, which only fetches from Polymarket's own image host (next.config.ts), lazily;
 * if it fails to load, the monogram takes its place. Decorative: the name is always next to it. */
import Image from "next/image";
import { useState } from "react";
import { AVATAR_SIZE, type Face } from "@/lib/moves/avatar";

export function Avatar({ face, size = "card", eager = false, className = "" }: { face: Face; size?: keyof typeof AVATAR_SIZE; eager?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const px = AVATAR_SIZE[size];
  const cls = `avatar avatar--${size}${className ? ` ${className}` : ""}`;
  if (!face.src || failed) {
    return <span className={`${cls} avatar--mono${face.mono.length > 2 ? " avatar--long" : ""}`} aria-hidden="true" data-avatar="mono">{face.mono}</span>;
  }
  return (
    <span className={cls} aria-hidden="true" data-avatar="img">
      <Image src={face.src} alt="" width={px} height={px} sizes={`${px}px`} loading={eager ? "eager" : "lazy"} onError={() => setFailed(true)} />
    </span>
  );
}
