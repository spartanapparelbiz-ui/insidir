/* The site's type (app/tokens.css): IBM Plex Sans Condensed (600) for headlines, IBM Plex Sans for text and
 * tabular numbers, IBM Plex Mono only for wallet addresses and code-like values. Both SIL OFL (app/fonts/OFL-IBM-Plex.txt), self-hosted from app/fonts
 * so the build never fetches from Google. Plus Jakarta Sans (the brand's earlier face) stays loaded as a fallback for
 * anything not yet on the terminal. Numbers use tabular figures (font-variant-numeric). */
import localFont from "next/font/local";

export const jakarta = localFont({ src: "../../app/fonts/plus-jakarta-sans-latin.woff2", weight: "200 800", variable: "--b-font-jakarta", display: "block" });
export const plexMono = localFont({
  src: [
    { path: "../../app/fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../app/fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../app/fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono", display: "swap",
});
export const plexCond = localFont({
  src: [
    { path: "../../app/fonts/ibm-plex-sans-condensed-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../app/fonts/ibm-plex-sans-condensed-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-cond", display: "swap",
});

export const plexSans = localFont({
  src: [
    { path: "../../app/fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../app/fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../app/fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans", display: "swap",
});

export const brandFontClasses = `${jakarta.variable} ${plexMono.variable} ${plexCond.variable} ${plexSans.variable}`;
