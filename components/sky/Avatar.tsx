"use client";
/* One round image with a designed fallback, so a broken-image icon can never show: if the file fails to load (or there
 * is none), a line icon takes its place (never initials: a person's portrait falls back to the Capitol, a team's logo to
 * the trophy). Logos sit on a raised
 * circle with a 1px line; portraits are cropped to a circle around the face (object-position 50% 20%) with a 2px ring
 * in the party's colour. */
import { useState } from "react";
import type { IconName, Party } from "@/lib/sky/art";
import { LineIcon } from "./Icons";

export function Avatar({ src, name, kind, size = 40, party = null, icon, fallback = "spark" }: {
  src: string | null; name: string; kind: "logo" | "portrait" | "mono" | "icon"; size?: number; party?: Party | null; icon?: IconName;
  /** The line icon shown when there is no image, or it fails to load. */
  fallback?: IconName;
}) {
  const [failed, setFailed] = useState(false);
  const ring = party === "D" ? "sk-av--d" : party === "R" ? "sk-av--r" : "";
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (kind === "icon" && icon) return <span className={`sk-av sk-av--icon ${ring}`} style={style} role="img" aria-label={name}><LineIcon name={icon} size={Math.round(size * 0.5)} /></span>;
  if (!src || failed || kind === "mono") return <span className={`sk-av sk-av--icon ${ring}`} style={style} role="img" aria-label={name}><LineIcon name={kind === "portrait" || party ? "capitol" : fallback} size={Math.round(size * 0.5)} /></span>;
  return (
    <span className={`sk-av ${kind === "portrait" ? "sk-av--portrait" : "sk-av--logo"} ${ring}`} style={style}>
      <img src={src} alt={name} width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
}
