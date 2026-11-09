/* A stage: full viewport, black, one background that never animates (the globe clip, a brand still darkened 35%, or
 * nothing), the foreground on top. The globe clip lives at public/brand/globe.mp4 (+ globe-poster.webp); until it is
 * there, a globe stage shows the hero still instead (never a third-party copy). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Photo, PhotoFile } from "@/lib/brand/images";
import { PHOTOS } from "@/lib/brand/images";
import { Globe } from "./Globe";
import { BrandPicture } from "./BrandPicture";

export type StageBg = { kind: "globe"; dark?: number; faint?: boolean; poster?: boolean } | { kind: "photo"; photo: Photo; dark?: number; priority?: boolean } | { kind: "none" };

const GLOBE = "/brand/globe.mp4", POSTER = "/brand/globe-poster.webp";
const has = (p: string) => { try { return existsSync(join(process.cwd(), "public", p)); } catch { return false; } };
export const globeReady = (): boolean => has(GLOBE);

/** The still for a stage without its own photo: each stage its own, so a page never repeats one picture down the screen.
 *  Named stages are set by hand so neighbours differ; any other takes one from the set by its name. The landing's hero
 *  keeps the stadium. */
const STILL: Record<string, PhotoFile> = {
  "hero-h": "stadium", "final-h": "street",
  "m-h": "football", "money-h": "diner", "briefing-h": "press", "chart-h": "capitol", "bets-h": "stadium", "rel-h": "street",
  "bb-title": "diner", "pick-h": "capitol",
  "rc-h": "soccer", "rd-h": "basketball", "rl-h": "stadium",
  "week-h": "street", "bill-h": "press",
  "race-k-h": "capitol", "race-b-h": "press", "race-o-h": "world",
  "bet-rel-h": "street", "w-t": "markets",
};
const SET: readonly PhotoFile[] = ["street", "press", "diner", "capitol", "markets", "soccer", "racing", "tech", "basketball", "football", "world", "culture"];
export function stillFor(key: string | undefined): PhotoFile {
  if (key && STILL[key]) return STILL[key]!;
  let h = 0;
  for (const c of key ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SET[h % SET.length]!;
}

function Bg({ bg, name }: { bg: StageBg; name?: string }) {
  if (bg.kind === "none") return null;
  const style = { "--dark": bg.dark ?? 0.35 } as CSSProperties;
  if (bg.kind === "photo") {
    return <div className="b-stage__bg" style={style}><BrandPicture src={bg.photo.src} priority={bg.priority} style={{ objectPosition: bg.photo.pos }} /></div>;
  }
  const clip = globeReady(), poster = has(POSTER) ? POSTER : null, still = PHOTOS[stillFor(name)];
  return (
    <div className={`b-stage__bg${bg.faint ? " b-stage__bg--faint" : ""}`} style={style}>
      {clip && !bg.poster ? <Globe src={GLOBE} poster={poster ?? still.src} />
        : <div className="b-globe">{poster ? <Image src={poster} alt="" fill sizes="max(100vw, 160vh)" priority={!bg.faint} quality={85} /> : <BrandPicture src={still.src} priority={!bg.faint} sizes="max(100vw, 160vh)" style={{ objectPosition: still.pos }} />}</div>}
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
      <Bg bg={bg} name={labelledBy ?? testid ?? id} />
      {inner ? <div className="b-stage__in">{children}</div> : children}
      {after}
    </section>
  );
}
