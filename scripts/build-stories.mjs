/* Renders Insidir's public research stories and creator pages into /web from src/stories.mjs:
 *
 *   web/stories.html                 the research hub (free, no account)
 *   web/stories/<slug>.html          one historical filing explained, with copy-link and share controls
 *   web/creator-kit.html             six short-form video concepts, link builder, disclosures
 *   web/creators.html                the creator program (terms unchanged; see CREATORS.md)
 *   web/partner-*.html               private partnership briefs (noindex), each pointing to its public edition
 *
 *   node scripts/build-stories.mjs           write the pages
 *   node scripts/build-stories.mjs --check   exit 1 if a committed page differs from what this script renders
 *
 * On the public site's design system: ui.css + site.css (the landing page's look) + stories-ui.css, with the landing
 * page's own nav and footer (src/site-ui.mjs). Geist only, two text colours, figures in the text colour. The pages are
 * static so they load without the database, can be cached and read with scripts off; the share controls
 * (assets/js/public-share.js) only add to them. Every number on a page comes from src/stories.mjs, and every figure
 * links to the SEC document it is quoted from. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { STORIES, CREATOR_CONCEPTS, PRODUCT_CLIPS, storyPath, storyBySlug, wordCount, readSeconds } from "../src/stories.mjs";
import { escapeHtml as esc, day } from "../src/public-pages.mjs";
import { uiLogo, WORDMARK } from "../src/site-ui.mjs";

export const ORIGIN = "https://insidir.com";
export const PUBLISHED = "2026-10-18";
/* The creator kit's product clips (/assets/video). They were recorded in the earlier app design; set false to take
 * them, and every line that points to them, off the kit until they are re-recorded. */
export const SHOW_CLIPS = true;
const web = fileURLToPath(new URL("../web/", import.meta.url));
const arrow = '<span aria-hidden="true">→</span>', out = '<span aria-hidden="true">↗</span>', newTab = '<span class="sr-only"> (opens in a new tab)</span>';
const ext = (url, label, cls = "") => `<a${cls ? ` class="${cls}"` : ""} href="${esc(url)}" rel="noopener" target="_blank">${label} ${out}${newTab}</a>`;
const cardImage = slug => `/assets/img/stories/${slug}.png`;
const tickerOf = s => s.tickers[0].replace("-", ".");
const primaryOf = s => s.sources.find(x => x.primary);
const isClip = line => /^Product clip:/.test(line);

/* The landing page's nav and footer (src/site-ui.mjs uiNav/uiFooter: same classes, same wordmark), with links to real
 * pages instead of the landing page's own sections, which a page other than the landing page must not link to. */
const nav = current => `<header class="snav" data-ds-nav><div class="snav__in">
<a class="wordmark" href="/" aria-label="Insidir home">${WORDMARK}</a>
<nav class="snav__links" aria-label="Main">${[["/insider-trading", "Insider trades today"], ["/stories.html", "Research stories"], ["/pricing.html", "Pricing"]].map(([h, l]) => `<a href="${h}"${h === current ? ' aria-current="true"' : ""}>${l}</a>`).join("")}</nav>
<div class="snav__end"><a class="btn btn--ghost" href="/signin.html">Log in</a><a class="btn btn--secondary" href="/signup.html" data-cta="nav">Start for $1</a></div>
</div></header>`;
const footer = () => `<footer class="sfoot"><div class="swrap sfoot__in">
<div class="sfoot__brand"><a class="wordmark" href="/" aria-label="Insidir home">${WORDMARK}</a><p class="t-label muted">© 2026 Aethric LLC. Research, not investment advice. Not affiliated with the SEC.</p></div>
<nav aria-label="Product"><h2 class="t-label muted">Product</h2><a href="/insider-trading">Insider trades today</a><a href="/platform.html">Platform</a><a href="/pricing.html">Pricing</a><a href="/stories.html">Research stories</a><a href="/data.html">Data sources</a></nav>
<nav aria-label="Company"><h2 class="t-label muted">Company</h2><a href="/company-info.html">About</a><a href="/creators.html">Creators</a><a href="/creator-kit.html">Creator kit</a><a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a><a href="/disclosures.html">Disclosures</a><a href="/subscription-policy.html">Subscription policy</a></nav>
<nav aria-label="Account"><h2 class="t-label muted">Account</h2><a href="/signin.html">Log in</a><a href="/signup.html">Start for $1</a><a href="mailto:hello@aethric.llc">hello@aethric.llc</a></nav>
</div></footer>`;

function shell({ title, description, path, body, current = "", noindex = false, ogType = "website", image = cardImage("stories"), imageAlt = "Insidir research stories", jsonLd = null }) {
  const url = ORIGIN + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex,nofollow">\n' : ""}<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#0c0c0b"><meta name="color-scheme" content="dark">
<meta property="og:site_name" content="Insidir">
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
<link rel="icon" href="/assets/icons/favicon.svg?v=2" type="image/svg+xml"><link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon.png?v=3"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/ui.css?v=2">
<link rel="stylesheet" href="/assets/css/site.css?v=1">
<link rel="stylesheet" href="/assets/css/stories-ui.css?v=1">
<script defer src="/assets/js/ds.js?v=2"></script>
<script defer src="/assets/js/referral.js?v=1"></script>
<script defer src="/assets/js/public-share.js?v=1"></script>
<script defer src="/assets/js/funnel.js"></script>
<script defer src="/assets/js/posthog.js?v=1"></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n` : ""}</head>
<body class="ui site st">
<a class="skip" href="#main">Skip to content</a>
${nav(current)}
<main id="main">
${body}
</main>
${footer()}
</body>
</html>
`;
}

/* ---------- pieces ---------- */
const crumbs = items => `<nav class="stcrumbs t-label" aria-label="Breadcrumb"><ol>${items.map(([label, href]) => `<li>${href ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join("")}</ol></nav>`;
// "First sentence. Second sentence." -> the second in the muted colour.
const splitTitle = title => { const m = /^(.+?[.?!])\s+(.+)$/.exec(title); return m ? `${esc(m[1])} <span class="muted">${esc(m[2])}</span>` : esc(title); };

const hero = ({ trail, kicker, h1, lede, long = false, extra = "" }) => `<section class="swrap sthero" aria-labelledby="st-title">
 ${crumbs(trail)}
 <p class="t-label muted sthero__kicker">${kicker}</p>
 <h1 class="t-display sthero__h1${long ? " sthero__h1--long" : ""}" id="st-title">${h1}</h1>
 <p class="sthero__lede">${lede}</p>
 ${extra}
</section>`;

const head = (id, h, p) => `<header class="ssec__head"><h2 class="t-title" id="${id}">${h}</h2>${p ? `<p class="ssec__p">${p}</p>` : ""}</header>`;
const block = (id, h, p, inner, attrs = "") => `<section class="swrap stsec"${attrs} aria-labelledby="${id}">
 ${head(id, h, p)}
 ${inner}
</section>`;

function shareBar({ label = "Share this research", title, source = "", description = true }) {
  return `<div class="st-share" data-share-scope role="group" aria-label="${esc(label)}">
 <p class="t-label muted">${esc(label)}</p>
 <div class="stbtns">
  <button type="button" class="btn btn--secondary" data-share-copy>Copy link</button>
  <button type="button" class="btn btn--secondary" data-share-native data-title="${esc(title)}" hidden>Share…</button>
  ${description ? `<button type="button" class="btn btn--secondary" data-share-description data-title="${esc(title)}"${source ? ` data-source="${esc(source)}"` : ""}>Copy for a video description</button>` : ""}
 </div>
 <p class="t-label st-status" data-share-status role="status" aria-live="polite"></p>
 <input class="input st-fallback" data-share-fallback type="text" readonly aria-label="Link to copy" hidden>
</div>`;
}

const storyCard = (s, { image = false } = {}) => `<li><a class="card card--hover stcard${image ? " stcard--img" : ""}" href="${storyPath(s)}">
 ${image ? `<img class="stcard__img" src="${cardImage(s.slug)}" width="1200" height="630" alt="" loading="lazy" decoding="async">` : ""}<span class="stcard__top">${uiLogo(tickerOf(s), 32)}<span class="t-label muted">${esc(s.kind)} · ${esc(tickerOf(s))}</span></span>
 <span class="t-section">${esc(s.title)}</span>
 <span class="t-label muted">${esc(s.description)}</span>
 <span class="t-label muted stcard__foot"><span>${esc(s.form)} · filed ${esc(day(s.filed))}</span><span class="stcard__go">Read ${arrow}</span></span>
</a></li>`;
const linkCard = ({ href, kind, title, text, foot, go }) => `<li><a class="card card--hover stcard" href="${href}">
 <span class="t-label muted">${kind}</span>
 <span class="t-section">${title}</span>
 <span class="t-label muted">${text}</span>
 <span class="t-label muted stcard__foot"><span>${foot}</span><span class="stcard__go">${go} ${arrow}</span></span>
</a></li>`;

// Every figure is quoted from (or calculated on) the primary filing, so each value opens that filing.
const figureList = (figures, url) => `<dl class="stfigs" aria-label="Figures from the filing">${figures.map(f => `<div class="card stfig"><dt class="t-label muted">${esc(f.label)}</dt><dd class="t-title stfig__v"><a href="${esc(url)}" rel="noopener" target="_blank" title="Open the SEC filing">${esc(f.value)}${newTab}</a></dd><dd class="t-label muted">${esc(f.note)}</dd><dd class="t-micro muted">${f.calc ? "Calculated by Insidir" : "As filed"}</dd></div>`).join("")}</dl>`;

function filedTable(t, s) {
  const n = v => v === 0 ? "—" : (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US");
  return `<div class="card st-table-wrap" role="region" aria-label="${esc(t.caption)}" tabindex="0"><table class="table st-table"><caption class="t-label muted">${esc(t.caption)}</caption>
<thead><tr><th scope="col">Line</th><th scope="col" class="r">2025</th><th scope="col" class="r">2024</th></tr></thead>
<tbody>${t.rows.map(([k, a, b]) => `<tr><th scope="row">${esc(k)}</th><td class="r">${n(a)}</td><td class="r">${n(b)}</td></tr>`).join("")}</tbody>
<tfoot><tr><th scope="row">${esc(t.total[0])}</th><td class="r">${n(t.total[1])}</td><td class="r">${n(t.total[2])}</td></tr></tfoot></table>
<p class="t-label muted st-table__src">From ${esc(s.company)}'s ${esc(s.form)}, filed ${esc(day(s.filed))}. ${ext(primaryOf(s).url, "Open the filing", "slink muted")}</p></div>`;
}

const section = (sec, extra = "") => `<section class="stsec-a" aria-labelledby="${esc(sec.id)}"><h2 class="t-section" id="${esc(sec.id)}">${esc(sec.heading)}</h2>${(sec.paras || []).map(p => {
  const q = /^(.*?)“([^”]{60,})”(.*)$/.exec(p);
  return q && sec.quoteBlock ? `<p>${esc(q[1].trim())}</p><blockquote class="card st-quote"><p>“${esc(q[2])}”</p></blockquote>${q[3].trim() ? `<p>${esc(q[3].trim())}</p>` : ""}` : `<p>${esc(p)}</p>`;
}).join("")}${sec.list ? `<ul class="stlist">${sec.list.map(li => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}${extra}</section>`;

// The plan card, as on the landing page's pricing section.
const upsell = subject => block("st-upsell-h", esc(subject), "One plan with everything in it, and you can cancel online in two clicks.", `<div class="card sprice">
  <p class="t-label muted">Insidir Pro</p>
  <p class="t-hero big"><span class="u">$</span>39<span class="u"> / month</span></p>
  <p class="muted">$1 for your first 7 days.</p>
  <ul class="sprice__list"><li>Every insider trade in plain English</li><li>Alerts minutes after a filing</li><li>Track record for every insider</li><li>Unlimited watchlist and follows</li><li>Every number linked to the SEC filing</li></ul>
  <a class="btn btn--primary btn--lg" href="/signup.html" data-cta="page">Start for $1</a>
  <p class="t-label muted">$1 today, then $39 a month after 7 days. Cancel in 2 clicks.</p>
 </div>`, ' data-st-upsell');

const notes = (id, h, html) => `<section class="swrap stnotes" aria-labelledby="${id}"><h2 class="t-section" id="${id}">${h}</h2><p class="t-label muted">${html}</p></section>`;
const steps = items => `<ol class="show">${items.map(([h, p], i) => `<li class="card show__step"><p class="t-label muted">${i + 1}</p><h3 class="t-section">${h}</h3><p class="muted">${p}</p></li>`).join("")}</ol>`;

/* ---------- a story ---------- */
function storyPage(s) {
  const primary = primaryOf(s), path = storyPath(s);
  const others = STORIES.filter(x => x !== s);
  const sections = s.sections.map((sec, i) => ({ ...sec, id: "s-" + (i + 1), quoteBlock: s.slug.startsWith("berkshire") && i === 1 }));
  const body = `${hero({
    trail: [["Insidir", "/"], ["Research stories", "/stories.html"], [tickerOf(s), null]],
    kicker: `${esc(s.kind)} · ${esc(s.form)} · Historical filing`, h1: splitTitle(s.title), lede: esc(s.lede), long: true,
    extra: `<ul class="stmeta t-label muted"><li>${esc(s.company)}</li><li>Filed ${esc(day(s.filed))}</li><li>${esc(s.period)}</li><li>Explained ${esc(day(PUBLISHED))}</li></ul>
 ${figureList(s.figures, primary.url)}
 <div class="stbtns stactions">${ext(primary.url, "Read the original filing", "btn btn--primary")}<a class="btn btn--secondary" href="/insider-trading">Today's insider trades ${arrow}</a></div>
 ${shareBar({ title: s.title, source: primary.url })}`
  })}
<div class="swrap stbody">
 <article class="starticle">
  ${sections.map((sec, i) => section(sec, i === 0 && s.table ? filedTable(s.table, s) : "")).join("\n  ")}
  <section class="stsec-a" aria-labelledby="s-questions"><h2 class="t-section" id="s-questions">Questions to ask of any filing like this</h2><ol class="stlist stlist--num">${s.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ol></section>
  <section class="stsec-a" aria-labelledby="s-insidir"><h2 class="t-section" id="s-insidir">Keep researching</h2><p>${esc(s.inInsidir)}</p><p>Free, with no account: <a class="slink" href="/insider-trading">today's insider purchases and sales</a>, read from the Form 4 filings, and <a class="slink" href="/stories.html">the other research stories</a>.</p></section>
 </article>
 <aside class="staside" aria-label="Sources and notes">
  <div class="card stbox"><h2 class="t-section">Sources</h2><ul class="stlinks">${s.sources.map(x => `<li>${ext(x.url, esc(x.label), "slink")}</li>`).join("")}</ul></div>
  <div class="card stbox"><h2 class="t-section">Read this as</h2><p class="muted">A historical filing, explained: what one public SEC document reports. Not news, not a forecast and not a recommendation to buy or sell anything. Figures are as filed; anything Insidir calculated says so.</p></div>
  <div class="card stbox"><h2 class="t-section">For creators</h2><p class="muted">Two short-video scripts built on this filing, with hooks, what to record and disclosure lines.</p><a class="btn btn--secondary" href="/creator-kit.html?page=${encodeURIComponent(path)}#concepts">Open the creator kit ${arrow}</a></div>
 </aside>
</div>
${upsell("Read every filing like this one.")}
${block("st-more", "More research stories", "Each one starts from the original SEC document.", `<ul class="stcards">${others.map(s => storyCard(s)).join("")}</ul>
 ${shareBar({ label: "Share this story", title: s.title, source: primary.url })}`)}
${notes("st-about", "About this story", `Written by Insidir from the public filing linked above (${esc(s.form)}, filed with the SEC on ${esc(day(s.filed))}) and explained on ${esc(day(PUBLISHED))}. It describes a past filing and is not updated as new filings arrive. Every figure is quoted from the filing or labelled as Insidir's arithmetic on filed figures. SEC filings are public records, available to anyone on EDGAR. Insidir is research software, not a broker or an investment adviser, and nothing here is investment advice. Spotted an error? Write to <a class="slink" href="mailto:hello@aethric.llc?subject=${encodeURIComponent("Correction: " + s.short)}">hello@aethric.llc</a>.`)}`;
  return shell({
    title: `${s.title} — Insidir`, description: s.description, path, body, current: "/stories.html", ogType: "article",
    image: cardImage(s.slug), imageAlt: `${s.company}: ${s.short}`,
    jsonLd: {
      "@context": "https://schema.org", "@type": "Article", headline: s.title, description: s.description,
      url: ORIGIN + path, mainEntityOfPage: ORIGIN + path, image: ORIGIN + cardImage(s.slug),
      datePublished: PUBLISHED, dateModified: PUBLISHED,
      author: { "@type": "Organization", name: "Insidir", url: ORIGIN + "/" }, publisher: { "@type": "Organization", name: "Insidir", url: ORIGIN + "/" },
      about: { "@type": "Corporation", name: s.company, tickerSymbol: tickerOf(s) },
      isBasedOn: primary.url, citation: s.sources.map(x => x.url), isAccessibleForFree: true
    }
  });
}

/* ---------- the hub ---------- */
function hubPage() {
  const body = `${hero({
    trail: [["Insidir", "/"], ["Research stories", null]], kicker: "Free research, no account needed", h1: `Public filings, <span class="muted">explained.</span>`,
    lede: "Free to read, no account needed. Each story takes one historical SEC filing, shows what it reports with the original document one click away, and says plainly what it does not tell you. Not news, not predictions, not advice.",
    extra: shareBar({ label: "Share these stories", title: "Insidir research stories: public filings, explained", description: false })
  })}
${block("st-latest", "Stories", `${STORIES.length} historical filings: a Form 4 and two annual reports.`, `<ul class="stcards">${STORIES.map(s => storyCard(s, { image: true })).join("")}</ul>`)}
${block("st-how", "How each story is built", "The same three rules as the rest of Insidir.", steps([
    ["The original filing first", "Every story opens the document on sec.gov: the Form 4, the 10-K, the page the numbers come from."],
    ["Every figure sourced", "Numbers are quoted as filed. Where Insidir adds or divides, the page says so next to the number."],
    ["What it doesn't tell you", "A filing records what happened. Each story lists what it cannot show: motives, the future, the rest of the picture."]]))}
${block("st-next", "Keep researching", "Free and public, or the full product.", `<ul class="stcards">
 ${linkCard({ href: "/insider-trading", kind: "Free · updated through the day", title: "Today's insider trades", text: "The latest open-market purchases and sales from SEC Form 4 filings, with every filing linked.", foot: "Public records", go: "Browse" })}
 ${linkCard({ href: "/creator-kit.html", kind: "For finance creators", title: "The creator kit", text: SHOW_CLIPS ? "Six short-video scripts built on these filings, real product clips and the disclosures paid partners need." : "Six short-video scripts built on these filings, a link builder and the disclosures paid partners need.", foot: SHOW_CLIPS ? "Scripts and footage" : "Scripts and disclosures", go: "Open" })}
 ${linkCard({ href: "/platform.html", kind: "The product", title: "Everything Insidir does", text: "Company reports, filings, Form 4 insider activity and the people behind them, each linked to its source.", foot: "Platform", go: "See it" })}
</ul>`)}
${upsell("Research any company the same way.")}
${notes("st-about", "About these stories", "Research stories explain past public filings; they are dated, and they are not updated as new filings arrive. SEC filings are public records, not secret or nonpublic information. An insider purchase or a strong year does not predict a price. Insidir is research software, not a broker or an investment adviser, and nothing here is investment advice.")}`;
  return shell({ title: "Research stories: public SEC filings, explained — Insidir", description: "Free research on public companies from their SEC filings: an insider purchase read line by line, Newmont's 2025 annual report and Berkshire Hathaway's earnings, each with the original document.", path: "/stories.html", body, current: "/stories.html",
    jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Insidir research stories", url: ORIGIN + "/stories.html",
      hasPart: STORIES.map(s => ({ "@type": "Article", headline: s.title, url: ORIGIN + storyPath(s) })) } });
}

/* ---------- the creator kit ---------- */
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
  const fallback = label => `<p class="t-label st-status" data-share-status role="status" aria-live="polite"></p><input class="input st-fallback" data-share-fallback type="text" readonly aria-label="${label}" hidden>`;
  const concepts = CREATOR_CONCEPTS.map((c, i) => {
    const story = c.story ? storyBySlug(c.story) : null;
    const stories = story ? [story] : STORIES;
    const n = String(i + 1).padStart(2, "0");
    return `<li class="st-concept" id="concept-${i + 1}">
 <div class="st-concept__main">
  <p class="t-label muted">Concept ${n} · ${story ? esc(story.kind) + " · " + esc(tickerOf(story)) : "All three filings"}</p>
  <h3 class="t-section">${esc(c.title)}</h3>
  <p class="t-label muted st-concept__tag">Hook · the first 1–3 seconds</p>
  <p class="st-hook" id="hook-${c.id}">${esc(c.hook)}</p>
  <p class="t-label muted st-concept__tag">Script · about ${readSeconds(c.script)} seconds, ${wordCount(c.script)} words</p>
  <p class="st-script" id="script-${c.id}">${esc(c.script)}</p>
  <div class="st-actions" data-share-scope>
   <div class="stbtns">
    <button type="button" class="btn btn--primary" data-copy-target="script-${c.id}" data-copied="Script copied.">Copy script</button>
    <button type="button" class="btn btn--secondary" data-copy-target="hook-${c.id}" data-copied="Hook copied.">Copy hook</button>
    ${story ? `<button type="button" class="btn btn--secondary" data-copy-value="${ORIGIN}${storyPath(story)}" data-copied="Research link copied.">Copy research link</button>` : ""}
   </div>
   ${fallback("Text to copy")}
  </div>
 </div>
 <div class="st-concept__side">
  <div><h4 class="t-label muted">On screen</h4><ul class="stlist">${c.record.filter(r => SHOW_CLIPS || !isClip(r)).map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
  <div><h4 class="t-label muted">Original filing${stories.length > 1 ? "s" : ""}</h4><ul class="stlinks">${stories.map(s => `<li>${ext(primaryOf(s).url, esc(s.company + ", " + s.form), "slink")}</li>`).join("")}</ul></div>
  <div><h4 class="t-label muted">Research page${stories.length > 1 ? "s" : ""}</h4><ul class="stlinks">${stories.map(s => `<li><a class="slink" href="${storyPath(s)}">${esc(s.short)}</a></li>`).join("")}</ul></div>
 </div>
</li>`;
  }).join("\n");
  const clips = PRODUCT_CLIPS.map(c => `<li><figure class="card st-clip">
 <video controls muted playsinline preload="none" poster="/assets/video/${c.id}.jpg" width="1280" height="800" aria-label="Product clip: ${esc(c.title)}"><source src="/assets/video/${c.id}.mp4" type="video/mp4"><source src="/assets/video/${c.id}.webm" type="video/webm"></video>
 <figcaption><b>${esc(c.title)}</b><span class="muted">${esc(c.text)}</span><span class="t-label muted"><a class="slink muted" href="/assets/video/${c.id}.mp4" download>Download MP4</a> · <a class="slink muted" href="/assets/video/${c.id}.webm" download>WebM</a> · 1280×800, silent</span></figcaption>
</figure></li>`).join("\n");
  const body = `${hero({
    trail: [["Insidir", "/"], ["Creators", "/creators.html"], ["Creator kit", null]], kicker: "For finance creators", h1: `Short videos, <span class="muted">built on public filings.</span>`,
    lede: "Six ready concepts for TikTok, Reels and Shorts, each built on a real SEC document: a hook for the first seconds, a 15–30 second script, what to put on screen, the filing and a research page your viewers can open. Tell the research story; the product is the tool you used to find it.",
    extra: `<div class="stbtns stactions"><a class="btn btn--primary" href="#concepts">See the six concepts ${arrow}</a><a class="btn btn--secondary" href="/creators.html">The creator program ${arrow}</a></div>`
  })}
${block("ck-how", "How it works", "Free to use. Paid partners also need an approved referral code and a disclosure.", steps([
    ["Pick a filing", `Start from a concept below or a <a class="slink" href="/stories.html">research story</a>. Open the original document and check the numbers yourself.`],
    ["Record the real thing", SHOW_CLIPS ? "The filing on sec.gov, the public research page and the product clips below. Never mock up a dashboard or type numbers onto footage." : "The filing on sec.gov and the public research page. Never mock up a dashboard or type numbers onto footage."],
    ["Link the research", "Put the research page in your description, so viewers can read the filing too. Partners add their approved code."]]))}
${block("ck-concepts", "Six concepts", "Read them in your own words. Every figure is in the linked filing.", `<ol class="st-concepts">
${concepts}
 </ol>`, ' id="concepts"')}
${SHOW_CLIPS ? block("ck-footage", "Product footage", "Recorded in the real product on real SEC Form 4 data: no mock-ups, no sample accounts. Use them as B-roll; don't edit numbers onto them.", `<ul class="st-clips">
${clips}
 </ul>`) : ""}
${block("ck-links", "Your tracked link", "For approved partners. Anyone can share the plain research links.", `<div class="stpanel">
  <form class="card stbox st-builder" data-link-builder data-origin="${ORIGIN}" data-share-scope novalidate>
   <div class="st-field"><label class="t-label muted" for="lb-page">Page</label><select class="input" id="lb-page" data-lb-page>${linkPages.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select></div>
   <div class="st-field"><label class="t-label muted" for="lb-code">Your referral code</label><input class="input" id="lb-code" data-lb-code type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="41" placeholder="the code Insidir gave you" aria-describedby="lb-help"><small class="t-label muted" id="lb-help" data-lb-help>Use the code Insidir confirmed when your partnership was approved.</small></div>
   <div class="st-field"><label class="t-label muted" for="lb-output">Link</label><output class="st-output" id="lb-output" data-lb-output for="lb-page lb-code" aria-live="polite">Enter your approved code to build your link.</output></div>
   <div class="st-actions"><div class="stbtns"><button type="button" class="btn btn--primary" data-lb-copy disabled>Copy my link</button></div>${fallback("Link to copy")}</div>
  </form>
  <div class="card stbox">
   <h3 class="t-section">How attribution works</h3>
   <ul class="stlist">
    <li>A link only credits a code Insidir has approved for you. Codes that are unknown or pending are ignored: the visitor can still sign up, and nobody is credited.</li>
    <li>Any page above works: the visitor's browser remembers the code for 30 days, and it is attached to the account when they register.</li>
    <li>Insidir records registrations made through an approved code and the first full-price payment that follows. It does not track views, clicks or shares.</li>
    <li>Terms and the commission are on the <a class="slink" href="/creators.html">creator program</a> page. Not a partner yet? <a class="slink" href="mailto:hello@aethric.llc?subject=Insidir%20creator%20partnership">Apply by email</a>.</li>
   </ul>
  </div>
 </div>`)}
${block("ck-disclose", "Disclosures", "Required for paid partners. Copy a line, then say it in your own words.", `<div class="stpanel">
  <div class="card stbox" data-share-scope>
   <h3 class="t-section">Lines you can use</h3>
   <ul class="st-lines">${DISCLOSURE_LINES.map(([label, text], i) => `<li><div><p class="t-micro muted">${esc(label)}</p><p id="disclosure-${i + 1}">${esc(text)}</p></div><button type="button" class="btn btn--secondary" data-copy-target="disclosure-${i + 1}" data-copied="Disclosure copied." aria-label="Copy: ${esc(label)}">Copy</button></li>`).join("")}</ul>
   ${fallback("Text to copy")}
  </div>
  <div class="card stbox">
   <h3 class="t-section">What the rules ask</h3>
   <ul class="stlist">
    <li>Disclose a paid relationship in the video itself, before or as you mention Insidir, and in the caption. A line in your bio alone is not enough.</li>
    <li>Turn on your platform's paid-partnership label (TikTok, Instagram and YouTube each have one) as well.</li>
    <li>Disclose a commission, free access or any other benefit, even when no fee is paid.</li>
    <li>If a presenter or voice is AI-generated, say so on screen.</li>
   </ul>
   <p class="t-label muted">These follow the US Federal Trade Commission's Endorsement Guides. Your platform's rules and your local law may ask for more.</p>
  </div>
 </div>`)}
${block("ck-rules", "Keep it honest", "What makes these videos trustworthy, and what Insidir will not partner on.", `<ul class="strules">${[
    ["No calls to buy or sell.", "Explain what a filing says. Don't tell viewers what to do with their money, and don't predict prices."],
    ["Say it's historical.", "Name the filing and its date. These are past documents, not breaking news."],
    ["Public, not secret.", "Form 4s and annual reports are public SEC records. Never call them leaked, hidden or insider tips."],
    ["An insider purchase is not a promise.", "Prices can fall after insiders buy. Say what the filing proves, and what it doesn't."],
    ["Real screens only.", SHOW_CLIPS ? "Show the filing, the public pages and the product clips. No invented dashboards, accounts, returns or numbers." : "Show the filing and the public pages. No invented dashboards, accounts, returns or numbers."],
    ["No made-up testimonials.", "Speak as yourself. Don't present a paid partnership as an independent review or a customer story."]
  ].map(([h, p]) => `<li class="card stbox"><h3 class="t-section">${esc(h)}</h3><p class="muted">${esc(p)}</p></li>`).join("")}</ul>`)}
${notes("st-about", "About this kit", `The concepts are based on the public filings linked beside each one; the figures were checked against those documents on ${esc(day(PUBLISHED))}. Insidir is research software, not a broker or an investment adviser, and the kit is not investment advice. Questions: <a class="slink" href="mailto:hello@aethric.llc?subject=Creator%20kit">hello@aethric.llc</a>.`)}`;
  return shell({ title: "Creator kit: short videos built on public SEC filings — Insidir", description: SHOW_CLIPS ? "Six short-form video concepts for finance creators, built on real SEC filings: hooks, 15–30 second scripts, real product footage, research links and the disclosures paid partners need." : "Six short-form video concepts for finance creators, built on real SEC filings: hooks, 15–30 second scripts, research links and the disclosures paid partners need.", path: "/creator-kit.html", body, image: cardImage("creator-kit"), imageAlt: "Insidir creator kit" });
}

/* ---------- the creator program ---------- */
function creatorsPage() {
  const apply = "mailto:hello@aethric.llc?subject=Insidir%20creator%20partnership&amp;body=Hi%20Insidir%2C%0A%0AMy%20creator%20handle%20and%20platform%3A%20%0AMy%20content%20or%20channel%20link%3A%20%0AMy%20audience%20and%20location%3A%20%0AOne%20research%20story%20I%27d%20like%20to%20cover%3A%20%0A";
  const stat = (h, big, p) => `<li class="card show__step"><h3 class="t-section">${h}</h3><p class="t-hero big">${big}</p><p class="muted">${p}</p></li>`;
  const body = `${hero({
    trail: [["Insidir", "/"], ["Creators", null]], kicker: "Creator partnerships", h1: `Follow the filing. <span class="muted">Tell the story.</span>`,
    lede: "We’re looking for thoughtful finance creators who make investing and public-company research easier to understand. Use real SEC filings and reported insider transactions to make content your audience can learn from.",
    extra: `<div class="stbtns stactions"><a class="btn btn--primary" href="${apply}">Apply to partner ${arrow}</a><a class="btn btn--secondary" href="/creator-kit.html">Open the creator kit ${arrow}</a></div>`
  })}
${block("cr-overview", "Partnership overview", "No upfront fee and no required purchase.", `<ol class="show">
  ${stat("Compensation", `<span class="u">$</span>10`, "One-time commission for each new qualifying Insidir subscriber referred to a full-price paid plan. No upfront creator fee or required purchase.")}
  ${stat("Referral window", "30 days", "Approved partners receive a unique link. Eligible new registrations can be attributed within the tracking window, subject to the referral terms.")}
  ${stat("What we provide", "Real data.", "Product walkthroughs, public filing links and research-story ideas. You control your content and may decline to promote after the demo.")}
 </ol>`)}
<div class="swrap stbody">
 <article class="starticle">
  <section class="stsec-a" aria-labelledby="cr-brief"><h2 class="t-section" id="cr-brief">Lead with a story, not an ad.</h2>
   <p>Walk through an interesting public Form 4 disclosure. Show readers how you verify a transaction, distinguish purchases from compensation grants, and open the original SEC source document.</p>
   <p>Insidir is a research tool, not a broker or investment adviser. Never imply that a public filing predicts price movement.</p>
   <p>The <a class="slink" href="/creator-kit.html">creator kit</a> has six ready concepts with hooks, scripts${SHOW_CLIPS ? ", real product footage" : ""} and disclosure lines, and the <a class="slink" href="/stories.html">research stories</a> are public pages your viewers can open.</p>
  </section>
  <section class="stsec-a" aria-labelledby="cr-details"><h2 class="t-section" id="cr-details">Program details</h2><ul class="stlist">
   <li>Open to creators, newsletters and educators covering stocks, company analysis and retail investing.</li>
   <li>Tell us your main channel, audience and one example of your work. We will review the fit and arrange a walkthrough.</li>
   <li>Tracked commission candidates require a qualifying verified Stripe payment for Insidir’s paid plan. Free signups and unpaid or refunded orders do not qualify.</li>
   <li>Commissions are reviewed after a 30-day eligibility period and paid manually after confirmation. Payout details are agreed with each partner.</li>
   <li>Clearly disclose your commercial relationship with Insidir in any promotional content, consistent with applicable platform and advertising rules.</li>
  </ul></section>
 </article>
 <aside class="staside" aria-label="Get in touch">
  <div class="card stbox"><h2 class="t-section">Apply</h2><p class="muted">Email your channel, audience and one research story you'd like to cover.</p><a class="btn btn--primary" href="mailto:hello@aethric.llc?subject=Insidir%20creator%20partnership">Contact Insidir ${arrow}</a></div>
  <div class="card stbox"><h2 class="t-section">Start with</h2><ul class="stlinks">${STORIES.map(s => `<li><a class="slink" href="${storyPath(s)}">${esc(s.short)}</a></li>`).join("")}</ul></div>
 </aside>
</div>
${notes("st-about", "The fine print", "Public pricing (a 7-day trial for $1, then $39 a month) is unchanged by the program. Referral codes never grant paid access. No fake endorsements or testimonials: partners disclose material relationships and complimentary access. Public research, not investment advice.")}`;
  return shell({ title: "Creators — Insidir Finance", description: "Insidir creator partnerships. Share better stock research and earn $10 for each eligible new paid subscriber you refer. No upfront promotion commitment.", path: "/creators.html", body, image: cardImage("creator-kit"), imageAlt: "Insidir creator partnerships" });
}

/* ---------- the private partner briefs ---------- */
function partnerPage(s) {
  const p = s.partner, primary = primaryOf(s);
  const body = `${hero({
    trail: [["Insidir", "/"], ["Creators", "/creators.html"], ["Research concept " + p.concept, null]],
    kicker: `Partnerships · Research concept ${esc(p.concept)} · ${esc(tickerOf(s))}`, h1: esc(p.title), lede: esc(p.sub), long: true,
    extra: `<ul class="stmeta t-label muted"><li>${esc(p.preparedFor)}</li><li>Historical filing example</li></ul>
 ${figureList(s.figures.slice(0, 3), primary.url)}
 <div class="stbtns stactions">${ext(primary.url, "View primary SEC document", "btn btn--primary")}<a class="btn btn--secondary" href="${storyPath(s)}">Public edition of this story ${arrow}</a></div>`
  })}
<div class="swrap stbody">
 <article class="starticle">
  <section class="stsec-a" aria-labelledby="pa-hook"><h2 class="t-section" id="pa-hook">Proposed video hook</h2><blockquote class="card st-quote"><p>${esc(p.hook)}</p></blockquote><p>The <a class="slink" href="/creator-kit.html">creator kit</a> has full 15–30 second scripts for this filing${SHOW_CLIPS ? ", real product footage" : ""} and disclosure lines.</p></section>
  <section class="stsec-a" aria-labelledby="pa-q"><h2 class="t-section" id="pa-q">Questions for the audience</h2><ol class="stlist stlist--num">${p.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ol></section>
 </article>
 <aside class="staside" aria-label="Next steps">
  <div class="card stbox"><h2 class="t-section">Shareable research page</h2><p class="muted">Free to read, no account needed: the version of this story your audience can open.</p><a class="btn btn--secondary" href="${storyPath(s)}">${esc(s.short)} ${arrow}</a></div>
  <div class="card stbox"><h2 class="t-section">Partnership</h2><p class="muted">Interested in exploring a tailored creator partnership? <a class="slink" href="mailto:hello@aethric.llc?subject=Insidir%20research%20partnership">Email the founder</a> or visit <a class="slink" href="/creators.html">the creator program</a>.</p></div>
 </aside>
</div>
${notes("st-about", "Scope", "This is a source-backed editorial concept prepared independently by Insidir—not a functional product screen, a live dashboard, an endorsement, or an agreement with any named creator. Figures reflect the specified historical SEC filings; update before presenting current market research. Educational material only; not investment advice. Any paid partnership requires clear disclosure.")}`;
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
