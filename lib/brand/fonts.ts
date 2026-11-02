/* The brand's two typefaces, self-hosted from app/fonts by next/font (no third-party request at run time):
 *   Satoshi (Indian Type Foundry, Fontshare, free for commercial use: app/fonts/Satoshi-FFL.txt) for all text,
 *     500 body, 700 and 900 headlines.
 *   Geist Mono (Vercel, SIL OFL: app/fonts/GeistMono-OFL.txt) for every number, price and label.
 * Satoshi preloads (the first screen's words); Geist Mono is variable, one file. */
import localFont from "next/font/local";

export const satoshi = localFont({
  src: [
    { path: "../../app/fonts/satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../../app/fonts/satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "../../app/fonts/satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--b-sans", display: "swap", fallback: ["system-ui", "Helvetica Neue", "Arial", "sans-serif"],
});
export const geistMono = localFont({
  src: "../../app/fonts/geist-mono-variable.woff2", weight: "100 900", variable: "--b-mono", display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const brandFontClasses = [satoshi.variable, geistMono.variable].join(" ");
