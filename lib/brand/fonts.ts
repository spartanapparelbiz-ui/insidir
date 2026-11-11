/* The brand's one typeface: Plus Jakarta Sans (SIL OFL), the variable font (200–800), self-hosted from app/fonts so
 * the build never fetches from Google (a network hiccup there used to fail the build). Weights in use: 300 (subtitles),
 * 400, 500 (headlines and UI), 600, 800 (the wordmark). Numbers use tabular figures (font-variant-numeric). display:
 * block, so the headline reveal never plays against invisible text. */
import localFont from "next/font/local";

// Not preloaded (2026-11-11): the homepage uses Inter; preloading Jakarta there delayed its headline.
export const jakarta = localFont({ src: "../../app/fonts/plus-jakarta-sans-latin.woff2", weight: "200 800", variable: "--b-font", display: "block", preload: false });



/** The homepage (components/brand/landing/Landing.tsx): Inter for words, JetBrains Mono for numbers, wallet addresses
 *  and timestamps. Both SIL OFL, self-hosted from app/fonts. Inter is preloaded (the headline); the mono isn't. */
export const inter = localFont({ src: "../../app/fonts/inter-latin.woff2", weight: "400 700", variable: "--lx-sans", display: "swap" });
export const mono = localFont({ src: "../../app/fonts/jetbrains-mono-latin.woff2", weight: "400 600", variable: "--lx-mono", display: "swap", preload: false });

export const brandFontClasses = `${jakarta.variable} ${inter.variable} ${mono.variable}`;
