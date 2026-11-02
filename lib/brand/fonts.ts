/* The brand's four typefaces, self-hosted by next/font (downloaded at build, served from this site: no third-party
 * request at run time). Instrument Serif for headlines, Instrument Sans for body and UI, JetBrains Mono for labels and
 * nav, Outfit 700 for the wordmark. The serif and sans preload (the hero's headline and copy are the first paint);
 * mono and the wordmark don't. */
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono, Outfit } from "next/font/google";

export const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--b-serif", display: "swap" });
export const sans = Instrument_Sans({ subsets: ["latin"], variable: "--b-sans", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--b-mono", display: "swap", preload: false });
export const wordmark = Outfit({ subsets: ["latin"], weight: "700", variable: "--b-word", display: "swap", preload: false });

export const brandFontClasses = [serif.variable, sans.variable, mono.variable, wordmark.variable].join(" ");
