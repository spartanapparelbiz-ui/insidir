/* The design system: the homepage's own pieces, shared by every screen (lib/system/tokens.ts holds the scale).
 *   Stage        a full-viewport black stage with its dusk scenery (components/brand/Stage.tsx)
 *   Lines        the masked line rise headline (the homepage's HeroLine behaviour)
 *   Insight      a computed sentence as the stage's headline ("Millionaires are 74% on Ken Paxton in Texas Senate.")
 *   Pill         the white pill (primary), the ghost and panel pills
 *   Panel        the homepage's panel (glass fill, hairline, --r radius)
 *   Face         a verified headshot, else initials; Party disc
 *   StageMotion, ScrollFx, BrandNav, BrandFoot, Refresh
 * Screens compose these; they add no colours, sizes or radii of their own. */
import type { ReactNode } from "react";
import { Lines } from "@/components/brand/Bits";
import { headlineLines } from "@/lib/market/headline";

export { Stage } from "@/components/brand/Stage";
export { Arrow, Lines, Pill } from "@/components/brand/Bits";
export { StageMotion } from "@/components/brand/StageMotion";
export { BrandFoot, BrandNav } from "@/components/brand/Nav";
export { ScrollFx } from "@/components/brand/landing/ScrollFx";
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

/** A candidate's face (self-hosted, face-cropped; skeleton while loading, initials if none or it fails). Never a wallet. */
export { Face } from "./Face";

/** A party: a thin ring in the party's colour with its letter inside. */
export function Party({ party, size = "s" }: { party: "D" | "R" | "I" | null; size?: "s" | "l" }) {
  return party ? <span className={`b-party b-party--${party.toLowerCase()}${size === "l" ? " b-party--l" : ""}`} role="img" aria-label={party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent"}>{party}</span> : null;
}
