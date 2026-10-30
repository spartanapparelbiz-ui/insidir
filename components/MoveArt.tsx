/* A position's artwork in a row (lib/logos.ts moveArt): a game's two team logos, a Form 4's company logo with the insider
 * on its corner, the one logo it's about, or its subject's photo as a square. Always the row's art size (56px on
 * desktop, 48px on phones; app/polish.css .art56). Server and client safe. */
import { FilingLogo, Logo, Matchup } from "@/components/Logo";
import { Photo } from "@/components/Photo";
import type { MoveArt as Art } from "@/lib/logos";

export function MoveArt({ art, className = "art56" }: { art: Art | undefined; className?: string }) {
  if (!art) return null;
  if (art.kind === "matchup") return <Matchup a={art.a} b={art.b} className={className} />;
  if (art.kind === "filing") return <FilingLogo src={art.src} mono={art.mono} className={className} />;
  if (art.kind === "logo") return <Logo src={art.src} className={className} />;
  return <Photo name={art.name} ratio="1:1" sizes="56px" className={`photo--thumb ${className}`} />;
}
