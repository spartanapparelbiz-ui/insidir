/* Re-reads every SEC source behind the research stories and checks that each quoted passage is in it.
 *
 *   node scripts/verify-stories.mjs           fetch from sec.gov (set SEC_USER_AGENT to "Name contact@example.com")
 *
 * Every figure in src/stories.mjs either carries a verbatim `quote` from its filing or is Insidir's arithmetic
 * (`calc`) on quoted numbers; test/stories.test.mjs checks the arithmetic offline, this script checks the quotes
 * against the documents themselves. It also confirms every source link answers 200. Exit code 1 on any miss. */
import { STORIES, SUPPORTING_QUOTES } from "../src/stories.mjs";

const agent = process.env.SEC_USER_AGENT || "Insidir research verification hello@aethric.llc";
const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "–", mdash: "—" };
export const plainText = html => String(html)
  .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
export const normalize = text => String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, " ").replace(/\s+/g, " ").trim();

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": agent, "Accept-Encoding": "gzip, deflate" } });
    if (res.status === 200) return res.text();
    if (res.status !== 429 && res.status < 500) throw new Error(url + " answered " + res.status);
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(url + " did not answer");
}

let failures = 0;
for (const story of STORIES) {
  const primary = story.sources.find(s => s.primary);
  const text = normalize(plainText(await get(primary.url)));
  const quotes = [...story.figures.filter(f => f.quote).map(f => f.quote), ...(SUPPORTING_QUOTES[story.slug] || [])];
  for (const q of quotes) {
    const ok = text.includes(normalize(q));
    if (!ok) failures++;
    console.log((ok ? "ok    " : "MISSING ") + story.slug + ": " + q.slice(0, 90));
  }
  for (const source of story.sources) {
    try { await get(source.url); console.log("ok    link " + source.url); }
    catch (e) { failures++; console.log("BROKEN link " + source.url + " (" + e.message + ")"); }
    await new Promise(r => setTimeout(r, 250)); // well under the SEC's 10 requests a second
  }
}
console.log(failures ? `${failures} problem(s)` : "Every quote is in its filing and every source link answers.");
process.exit(failures ? 1 : 0);
