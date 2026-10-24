import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tickerFromPath } from "../src/ticker-page.mjs";

const page = name => readFile(new URL("../web/" + name, import.meta.url), "utf8");

test("social stock entry is public, accessible, and gives verifiable value before signup", async () => {
  const html = await page("check.html");
  assert.equal(tickerFromPath("/check"), null, "a social entry page is not a company ticker");
  assert.ok(html.includes('<link rel="canonical" href="https://insidir.com/check">'));
  assert.ok(html.includes('action="/search" method="get"'), "stock lookup works without JS");
  assert.ok(html.includes('data-ds-search'), "the existing stock search enhancement is reused");
  assert.ok(html.includes('name="t"'), "query parameter matches GET /search?t=");
  assert.ok(html.includes('id="check-q"'), "the input has an accessible label");
  for (const symbol of ["NVDA", "AAPL", "TSLA"]) {
    assert.ok(html.includes('href="/' + symbol + '"'), "popular stock " + symbol + " opens its real source page");
  }
  assert.ok(html.includes("No login or card needed"));
  assert.ok(html.includes("direct links to SEC filings"), "source documents shown");
  assert.match(html, /research, not investment advice/i);
  assert.ok(!html.includes('data-funnel-stock'), "the entry isn't falsely counted as a viewed stock");
});

test("social funnel measures consented entry traffic without storing stock names or free text", async () => {
  const [funnel, search, check] = await Promise.all([
    page("assets/js/funnel.js"), page("assets/js/ds.js"), page("assets/js/check.js")
  ]);
  assert.ok(funnel.includes('page === "check"'), "check visits share the main funnel entry metric");
  assert.ok(funnel.includes('label: socialSource'), "a restricted traffic source is measurable");
  assert.ok(funnel.includes("globalPrivacyControl"));
  assert.ok(funnel.includes("doNotTrack"));
  assert.ok(search.includes('"check-q":"social"'), "stock lookup source is measurable without recording a ticker");
  for (const name of ["tiktok", "instagram", "facebook"]) {
    assert.ok(check.includes('"' + name + '"'), name + " gets a whitelist label");
  }
  assert.ok(check.includes("^[A-Z][A-Z0-9.-]{0,9}$"), "invalid prefill symbols are rejected");
  assert.ok(!funnel.includes("ticker: t"), "ticker must not be sent to the first-party funnel");
});

test("social page is responsive and uses the existing design system", async () => {
  const [html, css] = await Promise.all([page("check.html"), page("assets/css/check.css")]);
  assert.ok(html.includes('/assets/css/ds.css'));
  assert.ok(html.includes('/assets/css/site-v2.css'));
  assert.ok(html.includes('/assets/css/check.css'));
  assert.ok(css.includes("@media(max-width:420px)"), "the search action fits narrow phones");
  assert.ok(css.includes(".check-search .ds-btn{width:100%}"));
});
