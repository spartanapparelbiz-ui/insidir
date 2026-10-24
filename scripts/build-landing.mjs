/* Writes web/index.html: the landing page's static fallback, from the same renderer as the live page (src/landing.mjs)
 * but without live data. The engine serves the live, server-rendered page at /; this file answers only when the
 * database cannot be reached, and in the website-only preview (npm run web). Run after changing src/landing.mjs:
 *   node scripts/build-landing.mjs */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderLanding } from "../src/landing.mjs";
const out = fileURLToPath(new URL("../web/index.html", import.meta.url));
// The stylesheets are linked rather than inlined (they are cached with the rest of the site), and the fallback loads the
// app runtime like every other page.
const html = renderLanding(null, { origin: "https://insidir.com", variant: "a" }).replace(/<style>[\s\S]*?<\/style>/, `<link rel="stylesheet" href="/assets/css/ui.css?v=3">
<link rel="stylesheet" href="/assets/css/site.css?v=1">
<script defer src="/assets/vendor/motion-12.23.12.js"></script>
<script defer src="/assets/js/icons.js?v=1"></script>
<script defer src="/assets/js/ui.js?v=4"></script>`);
writeFileSync(out, html);
console.log("wrote web/index.html");
