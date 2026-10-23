import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderLanding, clusterBuys, receiptReturns, landingData, handleLanding, clearLandingCache, H1, LIVE_SQL, RECEIPT_LINES_SQL, COUNTERS_SQL, RECEIPT_RULE } from "../src/landing.mjs";
import { WEEK_BUYS_SQL } from "../src/newsletter.mjs";
import { TRADES_SQL } from "../src/ticker-page.mjs";
import { COMPETITORS } from "../src/landing-competitors.mjs";

/* The landing page (src/landing.mjs): eight sections, one action, real filings only. Fixtures are fictional. */
const row = (i, extra = {}) => ({ id: "r" + i, accession: "a" + i, issuer_cik: "0000000099", ticker: "EXMP", owner_cik: "00000000" + (40 + i), owner_name: "DOE JANE",
  transaction_date: "2026-10-1" + i, transaction_code: "P", category: "reported_purchase", derivative: false, shares: "10000", price_per_share: "24.00",
  estimated_value: String(1_200_000 + i), source_url: `https://www.sec.gov/Archives/edgar/data/99/x${i}/form4.xml`, issuer_name: "EXAMPLE CORP",
  published_at: new Date(Date.now() - (i + 1) * 14 * 60_000).toISOString(), rule_10b5_1: false, is_director: true, ...extra });
const DATA = { live: [row(0), row(1, { transaction_code: "S", ticker: "SMPL" })].map(r => ({ ...r, role: "director" })), counters: { filings_today: 1284, trades_month: 18906 },
  buys: [row(0), row(2), row(3)].map(r => ({ ...r, role: "director" })), testimonials: [], phone: null, today: "2026-10-23",
  receipts: [{ ticker: "EXMP", insiders: 2, total: 3_100_000, start: "2026-06-01", filing: "https://www.sec.gov/x", d30: { r: 0.041 }, d90: { r: -0.023 } },
    { ticker: "SMPL", insiders: 3, total: 1_500_000, start: "2026-10-01", filing: null, d30: { pending: true, on: "2026-10-31" }, d90: { pending: true, on: "2026-12-30" } }] };

test("eight sections in order, one headline + one sentence each, one action, real filings only", () => {
  const html = renderLanding(DATA, { origin: "https://insidir.example", variant: "a", now: Date.now() });
  const sections = [...html.matchAll(/<section class="(?:v2-hero|ds-section[^"]*)"[^>]*aria-labelledby="([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(sections, ["hero-h", "live-h", "how-h", "rc-h", "cmp-h", "pr-h", "faq-h", "end-h"]);
  assert.match(html, /<h1 class="ds-h1" id="hero-h">See when CEOs buy and sell their own stock\.<\/h1>/);
  assert.match(html, /Insiders have to report every trade to the SEC\. Insidir reads every filing and tells you what it means in plain English, minutes after it posts\./);
  assert.match(html, /placeholder="Type a stock: NVDA, TSLA, PEP"/);
  assert.match(html, />See insiders<\/button>/);
  assert.match(html, /\$1 for 7 days\. Cancel online anytime\./);
  assert.doesNotMatch(html, /Explore Insidir|View the platform|Financial intelligence/, "the two vague buttons and the abstract headline are gone");
  // Every section after the hero: exactly one h2 and one sentence.
  for (const id of sections.slice(1)) {
    const part = html.slice(html.indexOf(`aria-labelledby="${id}"`), html.indexOf("</section>", html.indexOf(`aria-labelledby="${id}"`)));
    assert.equal((part.match(/<h2 /g) || []).length, 1, id);
    assert.equal((part.match(/<p class="ds-body">/g) || []).length, 1, id);
  }
  // The live strip and the week's buys are rows from the import, each linked to its stock page or filing.
  assert.match(html, /<a class="v2-live__item" href="\/EXMP"><b class="ds-num">EXMP<\/b><span>Director bought <span class="ds-num ds-buy">\$1\.2M<\/span><\/span><time class="ds-num" datetime="[^"]+">14 min ago<\/time><\/a>/);
  assert.match(html, /Director sold <span class="ds-num ds-sell">/);
  assert.match(html, /data-ds-count="1284">1,284</);
  assert.equal((html.match(/<article class="ds-card ds-trade">/g) || []).length, 3);
  assert.match(html, /See a real filing ↗/);
  // Receipts: the fixed rule, the ones that went down too, pending results labelled as pending.
  assert.ok(html.includes(RECEIPT_RULE));
  assert.match(html, /ds-sell">−2\.3%/);
  assert.match(html, /<span class="v2-long">On Oct 31, 2026<\/span><span class="v2-short">Pending<\/span>/);
  // Comparison: only verified competitors; the unverified anchor line is not shown.
  assert.ok(!COMPETITORS.others.some(c => c.verified), "nobody verified yet");
  assert.doesNotMatch(html, /Unusual Whales|OpenInsider|\$50\/mo/);
  assert.match(html, /As of Oct 23, 2026/);
  // Pricing stays $39 (decided Oct 23, 2026): no founding tier, no seat counter, no annual toggle.
  assert.match(html, /\$1 for 7 days\. Then \$39 a month\./);
  assert.match(html, /\$1 today\. We email you before you're charged\. Cancel in 2 clicks\./);
  assert.doesNotMatch(html, /\$29|founding|seats left|\$290|2 months free/i);
  // Proof is real or absent: no testimonials until a real one is published; no counters, timers or viewers invented.
  assert.doesNotMatch(html, /v2-quote|people viewing|countdown|not live data/i);
  assert.match(html, /<b>Nicholas<\/b>, founder/);
  assert.match(html, /Research, not investment advice\./);
  assert.match(html, /Not affiliated with the SEC\./);
  assert.match(html, /data-v2-sticky/, "the sticky Start for $1 bar on phones");
  assert.match(html, /data-v2-mail data-where="receipts"/, "the free weekly email after the receipts");
  assert.match(html, /<body class="ds v2" data-exp-h1="a">/);
  assert.match(renderLanding(DATA, { origin: "x", variant: "b" }), new RegExp(H1.b.replace(/\./g, "\\.")));
});

test("receipts: one fixed rule (2+ insiders, over $1M, within 10 days, last 6 months), every match kept", () => {
  const l = (who, d, v, t = "EXMP", cik = "99") => ({ ticker: t, issuer_cik: cik, owner_cik: who, owner_name: who, accession: who + d, transaction_date: d, estimated_value: v, source_url: "https://www.sec.gov/" + who });
  const out = clusterBuys([
    l("1", "2026-09-01", 700_000), l("2", "2026-09-08", 400_000),            // EXMP: two insiders, $1.1M within 10 days → counts
    l("1", "2026-09-20", 5_000_000),                                           // one insider alone → no
    l("3", "2026-08-01", 600_000, "SMPL", "98"), l("4", "2026-08-15", 600_000, "SMPL", "98"),   // 14 days apart → two clusters of one → no
    l("5", "2026-07-01", 300_000, "DEMO", "97"), l("6", "2026-07-02", 300_000, "DEMO", "97"),   // two insiders but $600K → no
    l("7", "2026-01-01", 9_000_000, "OLD", "96"), l("8", "2026-01-02", 9_000_000, "OLD", "96")  // older than 6 months → no
  ], { today: "2026-10-23" });
  assert.deepEqual(out.map(c => [c.ticker, c.insiders, c.total, c.start]), [["EXMP", 2, 1_100_000, "2026-09-01"]]);
  const series = [["2026-09-01", 10], ["2026-10-01", 9], ["2026-10-02", 9.5]];
  const r = receiptReturns(out[0], series, "2026-10-23");
  assert.deepEqual(r.d30, { r: -0.1 }, "a loss is shown, not hidden");
  assert.equal(r.d90.pending, true);
});

test("routing: / is server-rendered with an A/B headline cookie; /index.html redirects; /v1/live feeds the strip", async () => {
  clearLandingCache();
  const answers = { [LIVE_SQL]: { rows: [row(0)] }, [COUNTERS_SQL]: { rows: [{ filings_today: 12, trades_month: 340 }] }, [WEEK_BUYS_SQL]: { rows: [row(0)] }, [RECEIPT_LINES_SQL]: { rows: [] }, [TRADES_SQL]: { rows: [row(0)] } };
  const query = async sql => answers[sql] || { rows: [] };
  const res = () => { const r = { status: 0, headers: {}, body: "" }; r.writeHead = (s, h = {}) => { r.status = s; Object.assign(r.headers, h); }; r.end = b => { r.body = b ? String(b) : ""; }; r.getHeader = () => undefined; return r; };
  const go = async (path, cookie = "") => { const r = res(); const done = await handleLanding({ method: "GET", headers: { cookie } }, r, new URL(path, "http://x"), { query, secure: false }); return { done, ...r }; };
  const first = await go("/");
  assert.equal(first.status, 200);
  assert.match(first.headers["Set-Cookie"], /^insidir_h1=[ab]; Path=\/; Max-Age=7776000; SameSite=Lax$/);
  const b = await go("/", "insidir_h1=b");
  assert.equal(b.headers["Set-Cookie"], undefined, "an assigned visitor keeps their arm");
  assert.match(b.body, /data-exp-h1="b"/);
  assert.match(b.body, /No company had two or more insiders buy over \$1M within 10 days in the last 6 months\./, "an empty rule says so, in words");
  assert.deepEqual([(await go("/index.html")).status, (await go("/index.html")).headers.Location], [301, "/"]);
  const live = await go("/v1/live");
  assert.equal(JSON.parse(live.body).items[0].id, "r0");
  const down = res();
  assert.equal(await handleLanding({ method: "GET", headers: {} }, down, new URL("/", "http://x"), { query: async () => { throw new Error("db down"); } }).then(x => (clearLandingCache(), x)), true, "a cached page still serves");
});

test("the static fallback (web/index.html) is the same design without live data", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.match(html, /See when CEOs buy and sell their own stock\./);
  assert.match(html, /assets\/css\/ds\.css/);
  assert.doesNotMatch(html, /v2-live__item|ds-trade"/, "no live rows baked into a static file");
});
