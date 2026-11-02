/* The brand's one typeface: Plus Jakarta Sans (SIL OFL), self-hosted by next/font (downloaded at build, served from
 * this site). Weights 300 (subtitles), 400, 500 (headlines and UI), 600, 800 (the wordmark). Numbers use tabular
 * figures (font-variant-numeric). display: block, so the headline reveal never plays against invisible text. */
import { Plus_Jakarta_Sans } from "next/font/google";

export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600", "800"], variable: "--b-font", display: "block" });

export const brandFontClasses = jakarta.variable;
