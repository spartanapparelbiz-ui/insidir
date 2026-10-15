// The site's self-hosted typefaces (SIL OFL), copied from web/assets/fonts by tools/prepare-assets.mjs.
// JetBrains Mono is Insidir's one typeface; Source Serif 4 (also shipped with the site) sets the
// newspaper headlines, at its display optical size.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+2020,U+20A0-20AB,U+2113,U+2C60-2C7F,U+A720-A7FF";

export const fontsReady = Promise.all([
  loadFont({ family: "JetBrains Mono", url: staticFile("fonts/JetBrainsMono-normal-latin.woff2"), weight: "100 800", unicodeRange: LATIN, format: "woff2" }),
  loadFont({ family: "JetBrains Mono", url: staticFile("fonts/JetBrainsMono-normal-latin-ext.woff2"), weight: "100 800", unicodeRange: LATIN_EXT, format: "woff2" }),
  loadFont({ family: "JetBrains Mono Symbols", url: staticFile("fonts/JetBrainsMono-symbols.woff2"), weight: "100 800", format: "woff2" }),
  loadFont({ family: "Source Serif 4", url: staticFile("fonts/SourceSerif4-normal-latin.woff2"), weight: "200 900", unicodeRange: LATIN, format: "woff2" }),
  loadFont({ family: "Source Serif 4", url: staticFile("fonts/SourceSerif4-normal-latin-ext.woff2"), weight: "200 900", unicodeRange: LATIN_EXT, format: "woff2" })
]);
