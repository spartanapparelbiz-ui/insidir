// Insidir V13 "Halftone" identity, as defined in web/assets/css/v13-halftone.css.
// Three colours: night paper, warm ink, and blends of the two. Nothing is orange; nothing glows.
export const C = {
  night: "#0c0c0b",
  ink: "#e9e4da",
  surface: "#151513",
  surface2: "#1b1a18",
  raise: "#222220",
  line: "#2f2f2c",
  line2: "#41403d",
  muted: "#86837d",
  soft: "#b2aea6",
  // Paper scenes print the same palette inverted: ink paper, night type.
  paperLine: "#c9c4ba",
  paperMuted: "#6b6862"
} as const;

export const MONO = '"JetBrains Mono", "JetBrains Mono Symbols", ui-monospace, monospace';
export const SERIF = '"Source Serif 4", "JetBrains Mono Symbols", Georgia, serif';

/** The site's one movement curve: a short ease-out with no overshoot (--hf-spring). */
export const BRAND_EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

/** Tracked uppercase micro-label (--hf-label, --hf-track .18em), scaled for a 1080px-wide frame. */
export const label = (size = 26, color: string = C.muted): React.CSSProperties => ({
  fontFamily: MONO, fontWeight: 500, fontSize: size, letterSpacing: "0.18em", textTransform: "uppercase", color, lineHeight: 1.4
});

/** Photographs are grayscale with a hint of sepia (--hf-photo); assets are graded at preparation time. */
export const PHOTO_FILTER = "grayscale(1) sepia(.12) contrast(1.05)";

/** Social safe area for a 1080x1920 frame: platform UI covers the top and bottom bands. */
export const SAFE = { top: 250, bottom: 1500, side: 72 } as const;
