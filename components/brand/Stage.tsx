/* A stage: full viewport, black, one background that never animates (the globe clip, a brand still darkened 35%, or
 * nothing), the foreground on top. The globe clip lives at public/brand/globe.mp4 (+ globe-poster.webp); until it is
 * there, a globe stage shows the hero still instead (never a third-party copy). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Photo } from "@/lib/brand/images";
import { PHOTOS } from "@/lib/brand/images";
import { Globe } from "./Globe";

export type StageBg = { kind: "globe"; dark?: number; faint?: boolean; poster?: boolean } | { kind: "photo"; photo: Photo; dark?: number; priority?: boolean } | { kind: "none" };

const GLOBE = "/brand/globe.mp4", POSTER = "/brand/globe-poster.webp";
const has = (p: string) => { try { return existsSync(join(process.cwd(), "public", p)); } catch { return false; } };
export const globeReady = (): boolean => has(GLOBE);

function Bg({ bg }: { bg: StageBg }) {
  if (bg.kind === "none") return null;
  const style = { "--dark": bg.dark ?? 0.35 } as CSSProperties;
  if (bg.kind === "photo") {
    return <div className="b-stage__bg" style={style}><Image src={bg.photo.src} alt="" fill sizes="100vw" priority={bg.priority} fetchPriority={bg.priority ? "high" : undefined} quality={bg.priority ? 60 : 66} /></div>;
  }
  const clip = globeReady(), poster = has(POSTER) ? POSTER : null;
  return (
    <div className={`b-stage__bg${bg.faint ? " b-stage__bg--faint" : ""}`} style={style}>
      {clip && !bg.poster ? <Globe src={GLOBE} poster={poster ?? PHOTOS.hero.src} />
        : <div className="b-globe"><Image src={poster ?? PHOTOS.hero.src} alt="" fill sizes="100vw" priority={!bg.faint} quality={60} /></div>}
    </div>
  );
}

export function Stage({ bg = { kind: "none" }, children, id, className = "", inner = true, label, testid, labelledBy, after, first = false, style }: {
  bg?: StageBg; children: ReactNode; id?: string; className?: string; inner?: boolean; label?: string; testid?: string; labelledBy?: string;
  /** The page's first stage (the landing hero): its entrance plays at first paint (html.hero-in), never on scroll. */
  first?: boolean;
  style?: CSSProperties;
  /** Pinned to the stage itself (the footer at its bottom). */
  after?: ReactNode;
}) {
  return (
    <section className={`b-stage ${className}`} id={id} aria-label={label} aria-labelledby={labelledBy} data-testid={testid} data-first={first ? "" : undefined} style={style}>
      <Bg bg={bg} />
      {inner ? <div className="b-stage__in">{children}</div> : children}
      {after}
    </section>
  );
}
