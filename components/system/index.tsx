/* The design system: the homepage's own pieces, shared by every screen (lib/system/tokens.ts holds the scale).
 *   Stage        a full-viewport black stage with its dusk scenery (components/brand/Stage.tsx)
 *   Lines        the masked line rise headline (the homepage's HeroLine behaviour)
 *   Insight      a computed sentence as the stage's headline ("Millionaires are 74% on Ken Paxton in Texas Senate.")
 *   Pill         the white pill (primary), the ghost and panel pills
 *   Panel        the homepage's panel (glass fill, hairline, --r radius)
 *   Face         a verified headshot, else initials; Party disc
 *   StageMotion, ScrollFx, BrandNav, BrandFoot, Refresh
 * Screens compose these; they add no colours, sizes or radii of their own. */
import Image from "next/image";
import type { ReactNode } from "react";
import { Lines } from "@/components/brand/Bits";
import { headlineLines } from "@/lib/market/headline";

export { Stage } from "@/components/brand/Stage";
export { Arrow, Lines, Pill } from "@/components/brand/Bits";
export { StageMotion } from "@/components/brand/StageMotion";
export { ScrollFx } from "@/components/brand/landing/ScrollFx";
export { BrandFoot, BrandNav } from "@/components/brand/Nav";
export { Refresh } from "./Refresh";

export function Panel({ children, className = "", testid, ...data }: { children: ReactNode; className?: string; testid?: string } & { [k: `data-${string}`]: string | undefined }) {
  return <div className={`b-glass b-pad ${className}`} data-testid={testid} {...data}>{children}</div>;
}

/** A computed sentence as masked lines of about 24 characters at word boundaries (lib/market/races.ts headlineLines,
 *  the same wrap the headline writers count with): the homepage sizes a headline so no line ever wraps, so short lines
 *  keep it big on phones, and never a short word alone on the last line. */
export function Insight({ text, fallback, as = "h1", size = 60, testid = "insight", id }: { text: string | null; fallback: readonly string[]; as?: "h1" | "h2"; size?: number; testid?: string; id?: string }) {
  const lines = text ? headlineLines(text) : fallback;
  return <Lines as={as} lines={lines} size={size} testid={testid} id={id} />;
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("");

/** A candidate's face, only when verified (lib/market/art.ts verifiedHeadshot); otherwise their initials. Never a wallet. */
export function Face({ name, image, size = 48 }: { name: string; image: string | null; size?: number }) {
  return image
    ? <span className="s-face" style={{ width: size, height: size }}><Image src={image} alt={name} width={size} height={size} sizes={`${size * 2}px`} quality={85} /></span>
    : <span className="s-face s-face--initials" style={{ width: size, height: size }} aria-label={name}>{initialsOf(name)}</span>;
}

export function Party({ party }: { party: "D" | "R" | "I" | null }) {
  return party ? <span className={`b-party b-party--${party.toLowerCase()}`} aria-hidden="true">{party}</span> : null;
}
