/* Renders Insidir's public research stories and creator pages into /web from src/stories.mjs:
 *
 *   web/stories.html                 the research hub (free, no account)
 *   web/stories/<slug>.html          one historical filing explained, with copy-link and share controls
 *   web/creator-kit.html             six short-form video concepts, real product clips, link builder, disclosures
 *   web/creators.html                the creator program (terms unchanged; see CREATORS.md)
 *   web/partner-*.html               private partnership briefs (noindex), each pointing to its public edition
 *
 *   node scripts/build-stories.mjs           write the pages
 *   node scripts/build-stories.mjs --check   exit 1 if a committed page differs from what this script renders
 *
 * The pages are static so they load without the database, can be cached and read with scripts off; the share
 * controls (assets/js/public-share.js) only add to them. Every number on a page comes from src/stories.mjs. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { STORIES, CREATOR_CONCEPTS, PRODUCT_CLIPS, storyPath, storyBySlug, wordCount, readSeconds } from "../src/stories.mjs";
import { escapeHtml as esc, upsell, day } from "../src/public-pages.mjs";

export const ORIGIN = "https://insidir.com";
export const PUBLISHED = "2026-10-18";
const web = fileURLToPath(new URL("../web/", import.meta.url));
const arrow = '<span class="v13-arrow" aria-hidden="true">→</span>', out = '<span class="v13-arrow" aria-hidden="true">↗</span>';
const ext = (url, label, cls = "") => `<a${cls ? ` class="${cls}"` : ""} href="${esc(url)}" rel="noopener" target="_blank">${label} ${out}</a>`;
const cardImage = slug => `/assets/img/stories/${slug}.png`;

// The public navigation (as on every static page): three primary links; the mobile menu adds the secondary pages.
const NAV_ITEMS = [["/platform.html", "Platform"], ["/insidir-intelligence.html", "Intelligence"], ["/pricing.html", "Pricing"]];
const NAV_MORE = [["/insider-trading", "Insider filings"], ["/stories.html", "Research stories"], ["/why-insidir.html", "Why Insidir"], ["/data.html", "Data &amp; sources"]];
const nav = (current, items = NAV_ITEMS) => items.map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ""}>${label}</a>`).join("");

function shell({ title, description, path, body, current = "", noindex = false, ogType = "website", image = cardImage("stories"), imageAlt = "Insidir research stories", jsonLd = null, scripts = [] }) {
  const url = ORIGIN + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0c0c0b">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex,nofollow">\n' : ""}<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="insidir.">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ORIGIN + image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ORIGIN + image)}">
<link rel="icon" href="/assets/icons/favicon.svg?v=2" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/JetBrainsMono-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/v3-static.css">
<link rel="stylesheet" href="/assets/css/v6-static.css?v=1">
<link rel="stylesheet" href="/assets/css/v7-unified.css?v=1">
<link rel="stylesheet" href="/assets/css/v9-interior.css?v=1">
<link rel="stylesheet" href="/assets/css/v13-halftone.css?v=10">
<link rel="stylesheet" href="/assets/css/v13-static.css?v=9">
<link rel="stylesheet" href="/assets/css/v14-public.css?v=1">
<link rel="stylesheet" href="/assets/css/v26-stories.css?v=1">
<script defer src="/assets/js/v6-site.js?v=2"></script>
<script defer src="/assets/js/v13-halftone.js?v=8"></script><script defer src="/assets/js/v13-motion.js?v=5"></script>
<script defer src="/assets/js/referral.js?v=1"></script>
<script defer src="/assets/js/public-share.js?v=1"></script>
<link rel="stylesheet" href="/assets/css/v29-system.css">
<link rel="stylesheet" href="/assets/css/v35-precision.css">
${scripts.join("\n")}${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n` : ""}</head>
<body class="v3-static v6-static v13 v14-public v26-stories">
<a class="skip-link" href="#Content">Skip to content</a>
<header class="v6-nav v9-nav">
 <div class="mk-shell v6-nav__inner">
  <a class="v6-logo" href="/" aria-label="Insidir home">insidir<span class="v13-dot" aria-hidden="true">.</span></a>
  <nav class="v6-nav__links" aria-label="Main navigation">${nav(current)}</nav>
  <div class="v6-nav__actions">
   <a class="v6-signin" href="/signin.html">Log in</a>
   <a class="v9-btn v9-btn--ink v9-btn--small" href="/signup.html" data-cta="nav">Start for $1</a>
   <button id="v6-menu-button" class="v6-menu-btn" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="v6-menu"><span></span><span></span></button>
  </div>
 </div>
 <nav id="v6-menu" class="v6-mobile" aria-label="Mobile navigation" hidden>${nav(current, [...NAV_ITEMS, ...NAV_MORE])}<a href="/signin.html">Log in</a><a href="/signup.html" data-cta="menu">Start for $1</a></nav>
</header>
<main id="Content">
${body}
</main>
<footer class="v13-footer v13-footer--plain" aria-label="Site footer">
<div class="hwf-top">
<div class="hwf-brand"><strong>Insidir</strong><span>©2026 · Aethric LLC · Research, not advice</span></div>
<nav class="hwf-col" aria-label="Public records"><h3>Public records</h3><ul><li><a href="/insider-trading">Latest insider filings</a></li><li><a href="/stories.html">Research stories</a></li><li><a href="/data.html">Data &amp; sources</a></li><li><a href="/platform.html">Platform</a></li><li><a href="/why-insidir.html">Why Insidir</a></li></ul></nav>
<nav class="hwf-col" aria-label="Account"><h3>Account</h3><ul><li><a href="/signin.html">Log in</a></li><li><a href="/signup.html">Start for $1</a></li><li><a href="/pricing.html">Pricing</a></li></ul></nav>
<nav class="hwf-col" aria-label="Company"><h3>Company</h3><ul><li><a href="/company-info.html">About</a></li><li><a href="/creators.html">Creators</a></li><li><a href="/creator-kit.html">Creator kit</a></li><li><a href="/terms.html">Terms</a></li><li><a href="/privacy.html">Privacy</a></li><li><a href="/disclosures.html">Disclosures</a></li><li><a href="mailto:hello@aethric.llc">hello@aethric.llc</a></li></ul></nav>
</div>
<div class="hwf-rule"><span class="hwf-note"><span>Public SEC records</span> <span>Historical examples</span> <span>Not investment advice</span></span><button type="button" class="hwf-up">Back to top ↑</button></div>
</footer>
</body>
</html>
`;
}

const crumbs = items => `<nav class="pp-crumbs" aria-label="Breadcrumb"><ol>${items.map(([label, href]) => `<li>${href ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join("")}</ol></nav>`;
// "First sentence. Second sentence." -> the second in the hero's faint ink.
const splitTitle = title => { const m = /^(.+?[.?!])\s+(.+)$/.exec(title); return m ? `${esc(m[1])} <span>${esc(m[2])}</span>` : esc(title); };

function shareBar({ label = "Share this research", title, source = "", description = true }) {
  return `<div class="st-share" data-share-scope role="group" aria-label="${esc(label)}">
 <p class="st-share__label">${esc(label)}</p>
 <button type="button" class="st-btn" data-share-copy>Copy link</button>
 <button type="button" class="st-btn" data-share-native data-title="${esc(title)}" hidden>Share…</button>
 ${description ? `<button type="button" class="st-btn" data-share-description data-title="${esc(title)}"${source ? ` data-source="${esc(source)}"` : ""}>Copy for a video description</button>` : ""}
 <p class="st-status" data-share-status role="status" aria-live="polite"></p>
 <input class="st-fallback" data-share-fallback type="text" readonly aria-label="Link to copy" hidden>
</div>`;
}

const storyCard = (s, { image = true } = {}) => `<li><a class="st-card" href="${storyPath(s)}">
 ${image ? `<img src="${cardImage(s.slug)}" width="1200" height="630" alt="" loading="lazy" decoding="async">` : ""}
 <span class="st-card__kind">${esc(s.kind)} · ${esc(s.tickers[0].replace("-", "."))}</span>
 <span class="st-card__title">${esc(s.title)}</span>
 <span class="st-card__text">${esc(s.description)}</span>
 <span class="st-card__foot"><span>${esc(s.form)} · filed ${esc(day(s.filed))}</span><span>Read ${arrow}</span></span>
</a></li>`;

const figureList = s => `<dl class="st-figures" aria-label="Figures from the filing">${s.figures.map(f => `<div class="st-figure"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd><p>${esc(f.note)}</p><p>${f.calc ? "Calculated by Insidir" : "As filed"}</p></div>`).join("")}</dl>`;

function filedTable(t) {
  const n = v => v === 0 ? "—" : (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US");
  return `<div class="st-table-wrap" role="region" aria-label="${esc(t.caption)}" tabindex="0"><table class="st-table"><caption>${esc(t.caption)}</caption>
<thead><tr><th scope="col">Line</th><th scope="col" class="st-num">2025</th><th scope="col" class="st-num">2024</th></tr></thead>
<tbody>${t.rows.map(([k, a, b]) => `<tr><th scope="row">${esc(k)}</th><td class="st-num">${n(a)}</td><td class="st-num">${n(b)}</td></tr>`).join("")}</tbody>
<tfoot><tr><th scope="row">${esc(t.total[0])}</th><td class="st-num">${n(t.total[1])}</td><td class="st-num">${n(t.total[2])}</td></tr></tfoot></table></div>`;
}

const section = (sec, extra = "") => `<section aria-labelledby="${esc(sec.id)}"><h2 id="${esc(sec.id)}">${esc(sec.heading)}</h2>${(sec.paras || []).map(p => {
  const q = /^(.*?)“([^”]{60,})”(.*)$/.exec(p);
  return q && sec.quoteBlock ? `<p>${esc(q[1].trim())}</p><blockquote class="st-quote">“${esc(q[2])}”</blockquote>${q[3].trim() ? `<p>${esc(q[3].trim())}</p>` : ""}` : `<p>${esc(p)}</p>`;
}).join("")}${sec.list ? `<ul>${sec.list.map(li => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}${extra}</section>`;

function storyPage(s) {
  const primary = s.sources.find(x => x.primary);
  const path = storyPath(s);
  const others = STORIES.filter(x => x !== s);
  const sections = s.sections.map((sec, i) => ({ ...sec, id: "s-" + (i + 1), quoteBlock: s.slug.startsWith("berkshire") && i === 1 }));
  const body = `<section class="pp-hero mk-shell" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Research stories", "/stories.html"], [s.tickers[0].replace("-", "."), null]])}
 <p class="pp-label">${esc(s.kind)} · ${esc(s.form)} · Historical filing</p>
 <h1 id="pp-title">${splitTitle(s.title)}</h1>
 <p class="pp-lede">${esc(s.lede)}</p>
 <ul class="st-meta"><li>${esc(s.company)}</li><li>Filed ${esc(day(s.filed))}</li><li>${esc(s.period)}</li><li>Explained ${esc(day(PUBLISHED))}</li></ul>
 ${figureList(s)}
 <p class="pp-actions">${ext(primary.url, "Read the original filing", "v9-btn v9-btn--ink")}<a class="v9-btn v12-outline-button" href="/insider-trading">Today's insider trades ${arrow}</a></p>
 ${shareBar({ title: s.title, source: primary.url })}
</section>
<div class="mk-shell st-body">
 <article class="st-article">
  ${sections.map((sec, i) => section(sec, i === 0 && s.table ? filedTable(s.table) : "")).join("\n  ")}
  <section aria-labelledby="s-questions"><h2 id="s-questions">Questions to ask of any filing like this</h2><ol>${s.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ol></section>
  <section aria-labelledby="s-insidir"><h2 id="s-insidir">Keep researching</h2><p>${esc(s.inInsidir)}</p><p>Free, with no account: <a href="/insider-trading">today's insider purchases and sales</a>, read from the Form 4 filings, and <a href="/stories.html">the other research stories</a>.</p></section>
 </article>
 <aside class="st-aside" aria-label="Sources and notes">
  <div><h2>Sources</h2><ul>${s.sources.map(x => `<li>${ext(x.url, esc(x.label))}</li>`).join("")}</ul></div>
  <div><h2>Read this as</h2><p>A historical filing, explained: what one public SEC document reports. Not news, not a forecast and not a recommendation to buy or sell anything. Figures are as filed; anything Insidir calculated says so.</p></div>
  <div><h2>For creators</h2><p>Two short-video scripts built on this filing, with hooks, what to record and disclosure lines.</p><a class="st-btn" href="/creator-kit.html?page=${encodeURIComponent(path)}#concepts">Open the creator kit ${arrow}</a></div>
 </aside>
</div>
<div class="mk-shell">${upsell("Read every filing like this one.")}</div>
<section class="pp-section mk-shell" aria-labelledby="pp-more">
 <div class="pp-head"><h2 id="pp-more">More research stories</h2><p>Each one starts from the original SEC document.</p></div>
 <ul class="st-cards">${others.map(o => storyCard(o, { image: false })).join("")}</ul>
 ${shareBar({ label: "Share this story", title: s.title, source: primary.url })}
</section>
<section class="pp-section pp-notes mk-shell" aria-labelledby="pp-about">
 <h2 id="pp-about">About this story</h2>
 <p>Written by Insidir from the public filing linked above (${esc(s.form)}, filed with the SEC on ${esc(day(s.filed))}) and explained on ${esc(day(PUBLISHED))}. It describes a past filing and is not updated as new filings arrive. Every figure is quoted from the filing or labelled as Insidir's arithmetic on filed figures. SEC filings are public records, available to anyone on EDGAR. Insidir is research software, not a broker or an investment adviser, and nothing here is investment advice. Spotted an error? Write to <a href="mailto:hello@aethric.llc?subject=${encodeURIComponent("Correction: " + s.short)}">hello@aethric.llc</a>.</p>
</section>`;
  return shell({
    title: `${s.title} — Insidir`, description: s.description, path, body, current: "/stories.html", ogType: "article",
    image: cardImage(s.slug), imageAlt: `${s.company}: ${s.short}`,
    jsonLd: {
      "@context": "https://schema.org", "@type": "Article", headline: s.title, description: s.description,
      url: ORIGIN + path, mainEntityOfPage: ORIGIN + path, image: ORIGIN + cardImage(s.slug),
      datePublished: PUBLISHED, dateModified: PUBLISHED,
      author: { "@type": "Organization", name: "Insidir", url: ORIGIN + "/" }, publisher: { "@type": "Organization", name: "Insidir", url: ORIGIN + "/" },
      about: { "@type": "Corporation", name: s.company, tickerSymbol: s.tickers[0].replace("-", ".") },
      isBasedOn: primary.url, citation: s.sources.map(x => x.url), isAccessibleForFree: true
    }
  });
}

function hubPage() {
  const body = `<section class="pp-hero mk-shell st-hub" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Research stories", null]])}
 <p class="pp-label">Free research · no account needed</p>
 <h1 id="pp-title">Public filings, <span>explained.</span></h1>
 <p class="pp-lede">Free to read, no account needed. Each story takes one historical SEC filing, shows what it reports with the original document one click away, and says plainly what it does not tell you. Not news, not predictions, not advice.</p>
 ${shareBar({ label: "Share these stories", title: "Insidir research stories: public filings, explained", description: false })}
</section>
<section class="pp-section mk-shell" aria-labelledby="st-latest">
 <div class="pp-head"><h2 id="st-latest">Stories</h2><p>${STORIES.length} historical filings: a Form 4 and two annual reports.</p></div>
 <ul class="st-cards">${STORIES.map(s => storyCard(s)).join("")}</ul>
</section>
<section class="pp-section mk-shell" aria-labelledby="st-how">
 <div class="pp-head"><h2 id="st-how">How each story is built</h2><p>The same three rules as the rest of Insidir.</p></div>
 <ol class="st-steps">
  <li><h3>The original filing first</h3><p>Every story opens the document on sec.gov: the Form 4, the 10-K, the page the numbers come from.</p></li>
  <li><h3>Every figure sourced</h3><p>Numbers are quoted as filed. Where Insidir adds or divides, the page says so next to the number.</p></li>
  <li><h3>What it doesn't tell you</h3><p>A filing records what happened. Each story lists what it cannot show: motives, the future, the rest of the picture.</p></li>
 </ol>
</section>
<section class="pp-section mk-shell" aria-labelledby="st-next">
 <div class="pp-head"><h2 id="st-next">Keep researching</h2><p>Free and public, or the full product.</p></div>
 <ul class="st-cards">
  <li><a class="st-card" href="/insider-trading"><span class="st-card__kind">Free · updated through the day</span><span class="st-card__title">Today's insider trades</span><span class="st-card__text">The latest open-market purchases and sales from SEC Form 4 filings, with every filing linked.</span><span class="st-card__foot"><span>Public records</span><span>Browse ${arrow}</span></span></a></li>
  <li><a class="st-card" href="/creator-kit.html"><span class="st-card__kind">For finance creators</span><span class="st-card__title">The creator kit</span><span class="st-card__text">Six short-video scripts built on these filings, real product clips and the disclosures paid partners need.</span><span class="st-card__foot"><span>Scripts and footage</span><span>Open ${arrow}</span></span></a></li>
  <li><a class="st-card" href="/platform.html"><span class="st-card__kind">The product</span><span class="st-card__title">Everything Insidir does</span><span class="st-card__text">Company reports, filings, Form 4 insider activity and the people behind them, each linked to its source.</span><span class="st-card__foot"><span>Platform</span><span>See it ${arrow}</span></span></a></li>
 </ul>
</section>
<div class="mk-shell">${upsell("Research any company the same way.")}</div>
<section class="pp-section pp-notes mk-shell" aria-labelledby="pp-about">
 <h2 id="pp-about">About these stories</h2>
 <p>Research stories explain past public filings; they are dated, and they are not updated as new filings arrive. SEC filings are public records, not secret or nonpublic information. An insider purchase or a strong year does not predict a price. Insidir is research software, not a broker or an investment adviser, and nothing here is investment advice.</p>
</section>`;
  return shell({ title: "Research stories: public SEC filings, explained — Insidir", description: "Free research on public companies from their SEC filings: an insider purchase read line by line, Newmont's 2025 annual report and Berkshire Hathaway's earnings, each with the original document.", path: "/stories.html", body, current: "/stories.html",
    jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Insidir research stories", url: ORIGIN + "/stories.html",
      hasPart: STORIES.map(s => ({ "@type": "Article", headline: s.title, url: ORIGIN + storyPath(s) })) } });
}

const DISCLOSURE_LINES = [
  ["Caption, first line", "#ad Paid partnership with Insidir."],
  ["Said out loud, before the pitch", "Quick note: Insidir is sponsoring this, and I earn a commission if you subscribe through my link."],
  ["Link in description or bio", "Insidir pays me a one-time $10 commission if you subscribe through this link. It doesn't change your price."],
  ["Not advice", "This is a historical public filing, explained. It isn't investment advice, and it isn't a prediction."],
  ["If Insidir gave you access", "Insidir gave me free access to its product."],
  ["If the presenter is AI-generated", "The presenter in this video is AI-generated."]
];

function creatorKitPage() {
  const linkPages = [["/stories.html", "Research stories (the hub)"], ...STORIES.map(s => [storyPath(s), "Story: " + s.short]), ["/", "Insidir home page"], ["/insider-trading", "Today's insider trades"], ["/signup.html", "Sign-up page (the link the program issues)"]];
  const concepts = CREATOR_CONCEPTS.map((c, i) => {
    const story = c.story ? storyBySlug(c.story) : null;
    const stories = story ? [story] : STORIES;
    const n = String(i + 1).padStart(2, "0");
    return `<li class="st-concept" id="concept-${i + 1}">
 <span class="st-concept__num" aria-hidden="true">${n}</span>
 <div>
  <p class="st-concept__tag">${story ? esc(story.kind) + " · " + esc(story.tickers[0].replace("-", ".")) : "All three filings"}</p>
  <h3>${esc(c.title)}</h3>
  <p class="st-concept__tag">Hook · the first 1–3 seconds</p>
  <p class="st-hook" id="hook-${c.id}">${esc(c.hook)}</p>
  <p class="st-concept__tag">Script · about ${readSeconds(c.script)} seconds, ${wordCount(c.script)} words</p>
  <p class="st-script" id="script-${c.id}">${esc(c.script)}</p>
  <div class="st-actions" data-share-scope>
   <button type="button" class="st-btn st-btn--ink" data-copy-target="script-${c.id}" data-copied="Script copied.">Copy script</button>
   <button type="button" class="st-btn" data-copy-target="hook-${c.id}" data-copied="Hook copied.">Copy hook</button>
   ${story ? `<button type="button" class="st-btn" data-copy-value="${ORIGIN}${storyPath(story)}" data-copied="Research link copied.">Copy research link</button>` : ""}
   <p class="st-status" data-share-status role="status" aria-live="polite"></p>
   <input class="st-fallback" data-share-fallback type="text" readonly aria-label="Text to copy" hidden>
  </div>
 </div>
 <div class="st-concept__side">
  <div><p class="st-concept__tag">On screen</p><ul>${c.record.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
  <div><p class="st-concept__tag">Original filing${stories.length > 1 ? "s" : ""}</p><ul>${stories.map(s => `<li>${ext(s.sources.find(x => x.primary).url, esc(s.company + ", " + s.form), "st-link")}</li>`).join("")}</ul></div>
  <div><p class="st-concept__tag">Research page${stories.length > 1 ? "s" : ""}</p><ul>${stories.map(s => `<li><a class="st-link" href="${storyPath(s)}">${esc(s.short)}</a></li>`).join("")}</ul></div>
 </div>
</li>`;
  }).join("\n");
  const clips = PRODUCT_CLIPS.map(c => `<li><figure class="st-clip">
 <video controls muted playsinline preload="none" poster="/assets/video/${c.id}.jpg" width="1280" height="800" aria-label="Product clip: ${esc(c.title)}"><source src="/assets/video/${c.id}.mp4" type="video/mp4"><source src="/assets/video/${c.id}.webm" type="video/webm"></video>
 <figcaption><b>${esc(c.title)}</b><span>${esc(c.text)}</span><span><a class="st-link" href="/assets/video/${c.id}.mp4" download>Download MP4</a> · <a class="st-link" href="/assets/video/${c.id}.webm" download>WebM</a> · 1280×800, silent</span></figcaption>
</figure></li>`).join("\n");
  const body = `<section class="pp-hero mk-shell" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Creators", "/creators.html"], ["Creator kit", null]])}
 <p class="pp-label">For finance creators</p>
 <h1 id="pp-title">Short videos, <span>built on public filings.</span></h1>
 <p class="pp-lede">Six ready concepts for TikTok, Reels and Shorts, each built on a real SEC document: a hook for the first seconds, a 15–30 second script, what to put on screen, the filing and a research page your viewers can open. Tell the research story; the product is the tool you used to find it.</p>
 <p class="pp-actions"><a class="v9-btn v9-btn--ink" href="#concepts">See the six concepts ${arrow}</a><a class="v9-btn v12-outline-button" href="/creators.html">The creator program ${arrow}</a></p>
</section>
<section class="pp-section mk-shell" aria-labelledby="ck-how">
 <div class="pp-head"><h2 id="ck-how">How it works</h2><p>Free to use. Paid partners also need an approved referral code and a disclosure.</p></div>
 <ol class="st-steps">
  <li><h3>Pick a filing</h3><p>Start from a concept below or a <a class="st-link" href="/stories.html">research story</a>. Open the original document and check the numbers yourself.</p></li>
  <li><h3>Record the real thing</h3><p>The filing on sec.gov, the public research page and the product clips below. Never mock up a dashboard or type numbers onto footage.</p></li>
  <li><h3>Link the research</h3><p>Put the research page in your description, so viewers can read the filing too. Partners add their approved code.</p></li>
 </ol>
</section>
<section class="pp-section mk-shell" id="concepts" aria-labelledby="ck-concepts">
 <div class="pp-head"><h2 id="ck-concepts">Six concepts</h2><p>Read them in your own words. Every figure is in the linked filing.</p></div>
 <ol class="st-concepts">
${concepts}
 </ol>
</section>
<section class="pp-section mk-shell" aria-labelledby="ck-footage">
 <div class="pp-head"><h2 id="ck-footage">Product footage</h2><p>Recorded in the real product on real SEC Form 4 data: no mock-ups, no sample accounts. Use them as B-roll; don't edit numbers onto them.</p></div>
 <ul class="st-clips">
${clips}
 </ul>
</section>
<section class="pp-section mk-shell" aria-labelledby="ck-links">
 <div class="pp-head"><h2 id="ck-links">Your tracked link</h2><p>For approved partners. Anyone can share the plain research links.</p></div>
 <div class="st-panel">
  <form class="st-builder" data-link-builder data-origin="${ORIGIN}" data-share-scope novalidate>
   <div class="st-field"><label for="lb-page">Page</label><select id="lb-page" data-lb-page>${linkPages.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select></div>
   <div class="st-field"><label for="lb-code">Your referral code</label><input id="lb-code" data-lb-code type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="41" placeholder="the code Insidir gave you" aria-describedby="lb-help"><small id="lb-help" data-lb-help>Use the code Insidir confirmed when your partnership was approved.</small></div>
   <div class="st-field"><label for="lb-output">Link</label><output id="lb-output" data-lb-output for="lb-page lb-code" aria-live="polite">Enter your approved code to build your link.</output></div>
   <div class="st-actions"><button type="button" class="st-btn st-btn--ink" data-lb-copy disabled>Copy my link</button><p class="st-status" data-share-status role="status" aria-live="polite"></p><input class="st-fallback" data-share-fallback type="text" readonly aria-label="Link to copy" hidden></div>
  </form>
  <div>
   <h3>How attribution works</h3>
   <ul>
    <li>A link only credits a code Insidir has approved for you. Codes that are unknown or pending are ignored: the visitor can still sign up, and nobody is credited.</li>
    <li>Any page above works: the visitor's browser remembers the code for 30 days, and it is attached to the account when they register.</li>
    <li>Insidir records registrations made through an approved code and the first full-price payment that follows. It does not track views, clicks or shares.</li>
    <li>Terms and the commission are on the <a class="st-link" href="/creators.html">creator program</a> page. Not a partner yet? <a class="st-link" href="mailto:hello@aethric.llc?subject=Insidir%20creator%20partnership">Apply by email</a>.</li>
   </ul>
  </div>
 </div>
</section>
<section class="pp-section mk-shell" aria-labelledby="ck-disclose">
 <div class="pp-head"><h2 id="ck-disclose">Disclosures</h2><p>Required for paid partners. Copy a line, then say it in your own words.</p></div>
 <div class="st-panel">
  <div data-share-scope>
   <h3>Lines you can use</h3>
   <ul class="st-lines">${DISCLOSURE_LINES.map(([label, text], i) => `<li><span><small class="st-concept__tag">${esc(label)}</small><br><code id="disclosure-${i + 1}">${esc(text)}</code></span><button type="button" class="st-btn" data-copy-target="disclosure-${i + 1}" data-copied="Disclosure copied.">Copy</button></li>`).join("")}</ul>
   <p class="st-status" data-share-status role="status" aria-live="polite"></p>
   <input class="st-fallback" data-share-fallback type="text" readonly aria-label="Text to copy" hidden>
  </div>
  <div>
   <h3>What the rules ask</h3>
   <ul>
    <li>Disclose a paid relationship in the video itself, before or as you mention Insidir, and in the caption. A line in your bio alone is not enough.</li>
    <li>Turn on your platform's paid-partnership label (TikTok, Instagram and YouTube each have one) as well.</li>
    <li>Disclose a commission, free access or any other benefit, even when no fee is paid.</li>
    <li>If a presenter or voice is AI-generated, say so on screen.</li>
   </ul>
   <p>These follow the US Federal Trade Commission's Endorsement Guides. Your platform's rules and your local law may ask for more.</p>
  </div>
 </div>
</section>
<section class="pp-section mk-shell" aria-labelledby="ck-rules">
 <div class="pp-head"><h2 id="ck-rules">Keep it honest</h2><p>What makes these videos trustworthy, and what Insidir will not partner on.</p></div>
 <ul class="st-rules">
  <li><b>No calls to buy or sell.</b>Explain what a filing says. Don't tell viewers what to do with their money, and don't predict prices.</li>
  <li><b>Say it's historical.</b>Name the filing and its date. These are past documents, not breaking news.</li>
  <li><b>Public, not secret.</b>Form 4s and annual reports are public SEC records. Never call them leaked, hidden or insider tips.</li>
  <li><b>An insider purchase is not a promise.</b>Prices can fall after insiders buy. Say what the filing proves, and what it doesn't.</li>
  <li><b>Real screens only.</b>Show the filing, the public pages and the product clips. No invented dashboards, accounts, returns or numbers.</li>
  <li><b>No made-up testimonials.</b>Speak as yourself. Don't present a paid partnership as an independent review or a customer story.</li>
 </ul>
</section>
<section class="pp-section pp-notes mk-shell" aria-labelledby="pp-about">
 <h2 id="pp-about">About this kit</h2>
 <p>The concepts are based on the public filings linked beside each one; the figures were checked against those documents on ${esc(day(PUBLISHED))}. Insidir is research software, not a broker or an investment adviser, and the kit is not investment advice. Questions: <a href="mailto:hello@aethric.llc?subject=Creator%20kit">hello@aethric.llc</a>.</p>
</section>`;
  return shell({ title: "Creator kit: short videos built on public SEC filings — Insidir", description: "Six short-form video concepts for finance creators, built on real SEC filings: hooks, 15–30 second scripts, real product footage, research links and the disclosures paid partners need.", path: "/creator-kit.html", body, image: cardImage("creator-kit"), imageAlt: "Insidir creator kit" });
}

function creatorsPage() {
  const body = `<section class="pp-hero mk-shell" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Creators", null]])}
 <p class="pp-label">Creator partnerships</p>
 <h1 id="pp-title">Follow the filing. <span>Tell the story.</span></h1>
 <p class="pp-lede">We’re looking for thoughtful finance creators who make investing and public-company research easier to understand. Use real SEC filings and reported insider transactions to make content your audience can learn from.</p>
 <p class="pp-actions"><a class="v9-btn v9-btn--ink" href="mailto:hello@aethric.llc?subject=Insidir%20creator%20partnership&amp;body=Hi%20Insidir%2C%0A%0AMy%20creator%20handle%20and%20platform%3A%20%0AMy%20content%20or%20channel%20link%3A%20%0AMy%20audience%20and%20location%3A%20%0AOne%20research%20story%20I%27d%20like%20to%20cover%3A%20%0A">Apply to partner ${arrow}</a><a class="v9-btn v12-outline-button" href="/creator-kit.html">Open the creator kit ${arrow}</a></p>
</section>
<section class="pp-section mk-shell" aria-labelledby="cr-overview">
 <div class="pp-head"><h2 id="cr-overview">Partnership overview</h2><p>No upfront fee and no required purchase.</p></div>
 <ol class="st-steps">
  <li><h3>Compensation</h3><span class="st-big">$10</span><p>One-time commission for each new qualifying Insidir subscriber referred to a full-price paid plan. No upfront creator fee or required purchase.</p></li>
  <li><h3>Referral window</h3><span class="st-big">30 days</span><p>Approved partners receive a unique link. Eligible new registrations can be attributed within the tracking window, subject to the referral terms.</p></li>
  <li><h3>What we provide</h3><span class="st-big">Real data.</span><p>Product walkthroughs, public filing links and research-story ideas. You control your content and may decline to promote after the demo.</p></li>
 </ol>
</section>
<div class="mk-shell st-body">
 <article class="st-article">
  <section aria-labelledby="cr-brief"><h2 id="cr-brief">Lead with a story, not an ad.</h2>
   <p>Walk through an interesting public Form 4 disclosure. Show readers how you verify a transaction, distinguish purchases from compensation grants, and open the original SEC source document.</p>
   <p>Insidir is a research tool, not a broker or investment adviser. Never imply that a public filing predicts price movement.</p>
   <p>The <a href="/creator-kit.html">creator kit</a> has six ready concepts with hooks, scripts, real product footage and disclosure lines, and the <a href="/stories.html">research stories</a> are public pages your viewers can open.</p>
  </section>
  <section aria-labelledby="cr-details"><h2 id="cr-details">Program details</h2><ul>
   <li>Open to creators, newsletters and educators covering stocks, company analysis and retail investing.</li>
   <li>Tell us your main channel, audience and one example of your work. We will review the fit and arrange a walkthrough.</li>
   <li>Tracked commission candidates require a qualifying verified Stripe payment for Insidir’s paid plan. Free signups and unpaid or refunded orders do not qualify.</li>
   <li>Commissions are reviewed after a 30-day eligibility period and paid manually after confirmation. Payout details are agreed with each partner.</li>
   <li>Clearly disclose your commercial relationship with Insidir in any promotional content, consistent with applicable platform and advertising rules.</li>
  </ul></section>
 </article>
 <aside class="st-aside" aria-label="Get in touch">
  <div><h2>Apply</h2><p>Email your channel, audience and one research story you'd like to cover.</p><a class="v9-btn v9-btn--ink st-wide" href="mailto:hello@aethric.llc?subject=Insidir%20creator%20partnership">Contact Insidir ${arrow}</a></div>
  <div><h2>Start with</h2><ul>${STORIES.map(s => `<li><a href="${storyPath(s)}">${esc(s.short)}</a></li>`).join("")}</ul></div>
 </aside>
</div>
<section class="pp-section pp-notes mk-shell" aria-labelledby="pp-about">
 <h2 id="pp-about">The fine print</h2>
 <p>Public pricing (a 3-day trial for $1, then $39 a month) is unchanged by the program. Referral codes never grant paid access. No fake endorsements or testimonials: partners disclose material relationships and complimentary access. Public research, not investment advice.</p>
</section>`;
  return shell({ title: "Creators — Insidir Finance", description: "Insidir creator partnerships. Share better stock research and earn $10 for each eligible new paid subscriber you refer. No upfront promotion commitment.", path: "/creators.html", body, image: cardImage("creator-kit"), imageAlt: "Insidir creator partnerships" });
}

function partnerPage(s) {
  const p = s.partner, primary = s.sources.find(x => x.primary);
  const body = `<section class="pp-hero mk-shell" aria-labelledby="pp-title">
 ${crumbs([["Insidir", "/"], ["Creators", "/creators.html"], ["Research concept " + p.concept, null]])}
 <p class="pp-label">Partnerships / Research concept ${esc(p.concept)} · ${esc(s.tickers[0].replace("-", "."))}</p>
 <h1 id="pp-title">${esc(p.title)}</h1>
 <p class="pp-lede">${esc(p.sub)}</p>
 <ul class="st-meta"><li>${esc(p.preparedFor)}</li><li>Historical filing example</li></ul>
 ${figureList({ figures: s.figures.slice(0, 3) })}
 <p class="pp-actions">${ext(primary.url, "View primary SEC document", "v9-btn v9-btn--ink")}<a class="v9-btn v12-outline-button" href="${storyPath(s)}">Public edition of this story ${arrow}</a></p>
</section>
<div class="mk-shell st-body">
 <article class="st-article">
  <section aria-labelledby="pa-hook"><h2 id="pa-hook">Proposed video hook</h2><blockquote class="st-quote">${esc(p.hook)}</blockquote><p>The <a href="/creator-kit.html">creator kit</a> has full 15–30 second scripts for this filing, real product footage and disclosure lines.</p></section>
  <section aria-labelledby="pa-q"><h2 id="pa-q">Questions for the audience</h2><ol>${p.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ol></section>
 </article>
 <aside class="st-aside" aria-label="Next steps">
  <div><h2>Shareable research page</h2><p>Free to read, no account needed: the version of this story your audience can open.</p><a class="st-btn" href="${storyPath(s)}">${esc(s.short)} ${arrow}</a></div>
  <div><h2>Partnership</h2><p>Interested in exploring a tailored creator partnership? <a href="mailto:hello@aethric.llc?subject=Insidir%20research%20partnership">Email the founder</a> or visit <a href="/creators.html">the creator program</a>.</p></div>
 </aside>
</div>
<section class="pp-section pp-notes mk-shell" aria-labelledby="pp-about">
 <h2 id="pp-about">Scope</h2>
 <p>This is a source-backed editorial concept prepared independently by Insidir—not a functional product screen, a live dashboard, an endorsement, or an agreement with any named creator. Figures reflect the specified historical SEC filings; update before presenting current market research. Educational material only; not investment advice. Any paid partnership requires clear disclosure.</p>
</section>`;
  return shell({ title: `${p.title} · Insidir research concept`, description: p.sub, path: "/" + p.page, body, noindex: true, image: cardImage(s.slug), imageAlt: s.company });
}

export function renderAll() {
  const files = { "stories.html": hubPage(), "creator-kit.html": creatorKitPage(), "creators.html": creatorsPage() };
  for (const s of STORIES) { files["stories/" + s.slug + ".html"] = storyPage(s); files[s.partner.page] = partnerPage(s); }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const files = renderAll();
  let stale = 0;
  await mkdir(new URL("stories/", "file://" + web), { recursive: true });
  for (const [name, html] of Object.entries(files)) {
    const target = web + name;
    if (check) {
      const current = await readFile(target, "utf8").catch(() => "");
      if (current !== html) { stale++; console.log("stale  " + name); }
    } else { await writeFile(target, html); console.log("wrote  web/" + name); }
  }
  if (check) { console.log(stale ? `${stale} page(s) out of date: run node scripts/build-stories.mjs` : "Every story page is current."); process.exit(stale ? 1 : 0); }
}
