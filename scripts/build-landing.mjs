/* Writes web/index.html: the landing page's static fallback, from the same renderer as the live page (src/landing.mjs)
 * but without live data. The engine serves the live, server-rendered page at /; this file answers only when the
 * database cannot be reached, and in the website-only preview (npm run web). Run after changing src/landing.mjs:
 *   node scripts/build-landing.mjs */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderLanding } from "../src/landing.mjs";
const out = fileURLToPath(new URL("../web/index.html", import.meta.url));
writeFileSync(out, renderLanding(null, { origin: "https://insidir.com", variant: "a" }));
console.log("wrote web/index.html");
