/* The brand's one typeface: Plus Jakarta Sans (SIL OFL), the variable font (200–800), self-hosted from app/fonts so
 * the build never fetches from Google (a network hiccup there used to fail the build). Weights in use: 300 (subtitles),
 * 400, 500 (headlines and UI), 600, 800 (the wordmark). Numbers use tabular figures (font-variant-numeric). display:
 * block, so the headline reveal never plays against invisible text. */
import localFont from "next/font/local";

const jakarta = localFont({ src: "../../app/fonts/plus-jakarta-sans-latin.woff2", weight: "200 800", variable: "--b-font", display: "block" });


export const brandFontClasses = jakarta.variable;
