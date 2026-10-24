/* PostHog product analytics (web/assets/js/posthog.js): when it loads at all, what it is configured to send, and that
 * the privacy policy and the pages that must never load it stay in step with it. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, readdir } from "node:fs/promises";

const WEB = new URL("../web/", import.meta.url);
const PRIVATE_PAGES = ["signin", "forgot-password", "start", "account", "account-deleted", "billing", "portfolio", "ops", "admin-costs", "admin-funnel"];

/* Runs the script in a bare browser stand-in, with a project token filled in so the gates themselves are what is tested. */
async function run({ href = "https://insidir.com/dashboard.html", gpc = false, dnt = null } = {}) {
  const source = (await readFile(new URL("assets/js/posthog.js", WEB), "utf8")).replace(/const TOKEN = "[^"]*";/, 'const TOKEN = "phc_test";');
  const appended = [];
  const window = { doNotTrack: null };
  const context = {
    window, URL, location: new URL(href),
    navigator: { globalPrivacyControl: gpc, doNotTrack: dnt },
    document: { readyState: "complete", createElement: tag => ({ tag }), head: { appendChild: el => appended.push(el) } }
  };
  vm.runInNewContext(source, context);
  return { appended, posthog: window.posthog };
}

test("PostHog loads on public and product pages with replay, surveys and typed text off", async () => {
  const { appended, posthog } = await run();
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, "https://us-assets.i.posthog.com/static/array.js");
  const [token, options] = posthog._i[0];
  assert.equal(token, "phc_test");
  assert.equal(options.api_host, "https://us.i.posthog.com");
  assert.equal(options.persistence, "localStorage", "no analytics cookie");
  assert.equal(options.disable_session_recording, true);
  assert.equal(options.disable_surveys, true);
  assert.equal(options.mask_all_text, true);
  assert.equal(options.mask_all_element_attributes, true);
  assert.equal(options.respect_dnt, true);
});

test("PostHog stays off for privacy signals, private pages and local development", async () => {
  assert.equal((await run({ gpc: true })).appended.length, 0, "Global Privacy Control");
  assert.equal((await run({ dnt: "1" })).appended.length, 0, "Do Not Track");
  for (const page of PRIVATE_PAGES) assert.equal((await run({ href: "https://insidir.com/" + page + ".html" })).appended.length, 0, page);
  assert.equal((await run({ href: "http://localhost:8080/dashboard.html" })).appended.length, 0, "localhost");
});

test("PostHog events keep page paths only: no query string, fragment or other site's path", async () => {
  const { posthog } = await run();
  const send = posthog._i[0][1].before_send;
  const event = send({
    event: "$pageview",
    properties: {
      $current_url: "https://insidir.com/research.html?q=did+anyone+buy+AAPL#answer",
      $referrer: "https://news.example.com/article/123?utm=x",
      $elements_chain: 'a:href="/company.html?ticker=AAPL"nth-child="1"'
    },
    $set_once: { $initial_current_url: "https://insidir.com/company.html?ticker=NVDA" }
  });
  assert.equal(event.properties.$current_url, "https://insidir.com/research.html");
  assert.equal(event.properties.$referrer, "https://news.example.com/");
  assert.doesNotMatch(event.properties.$elements_chain, /AAPL/);
  assert.equal(event.$set_once.$initial_current_url, "https://insidir.com/company.html");
  const direct = send({ event: "$pageview", properties: { $referrer: "$direct", $current_url: "https://insidir.com/" } });
  assert.equal(direct.properties.$referrer, "$direct", "PostHog's direct-visit marker is not an address");
});

test("private pages never include the PostHog script; the privacy policy names PostHog", async () => {
  const pages = (await readdir(WEB)).filter(f => f.endsWith(".html"));
  for (const page of pages) {
    const html = await readFile(new URL(page, WEB), "utf8");
    const tagged = html.includes("/assets/js/posthog.js");
    if (PRIVATE_PAGES.includes(page.replace(/\.html$/, ""))) assert.equal(tagged, false, page + " must not load analytics");
    else assert.equal(tagged, true, page + " loads analytics");
  }
  const privacy = await readFile(new URL("privacy.html", WEB), "utf8");
  assert.match(privacy, /PostHog/);
  assert.doesNotMatch(privacy, /nothing is sent to an analytics company/);
  assert.doesNotMatch(privacy, /does not use third-party advertising or analytics cookies/);
});
