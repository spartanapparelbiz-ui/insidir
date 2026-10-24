import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { tickerFromPath, tickerData, renderTickerPage, handleTickerRoute, ogImage, TRADES_SQL, LATEST_ANY_SQL, ENTITY_SQL, FREE_TRADES } from "../src/ticker-page.mjs";
import { sentence, money, day } from "../src/site-v2.mjs";
import { classifyPage } from "../src/paywall.mjs";

/* Public stock pages at /<TICKER> (src/ticker-page.mjs), against an injected query answered by exact SQL. */
function fakeQuery(answers = {}) {
  const fn = async (sql, params) => { fn.statements.push({ sql, params }); const a = answers[sql]; return typeof a === "function" ? a(params) : a || { rows: [] }; };
  fn.statements = [];
  return fn;
}
function fakeRes() {
  const res = { status: 0, headers: {}, body: Buffer.alloc(0) };
  res.writeHead = (status, headers = {}) => { res.status = status; for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v; };
  res.end = body => { res.body = body ? Buffer.from(body) : Buffer.alloc(0); };
  return res;
}
const line = (i, extra = {}) => ({ id: "x:" + i, accession: "000999999926" + String(i).padStart(6, "0"), issuer_cik: "0000099999", ticker: "EXMP", owner_cik: "0009876543",
  owner_name: "DOE JANE", transaction_date: new Date(Date.UTC(2026, 9, 20 - i)), transaction_code: "P", category: "reported_purchase", derivative: false,
  shares: "10000", price_per_share: "24.00", estimated_value: String(240000 + i * 1000), source_url: `https://www.sec.gov/Archives/edgar/data/99999/x${i}/form4.xml`,
  issuer_name: "EXAMPLE CORP", published_at: new Date(Date.UTC(2026, 9, 21 - i, 21)), rule_10b5_1: false, is_amendment: false,
  is_director: true, is_officer: false, officer_title: null, is_ten_percent_owner: false, ...extra });

test("which paths are stock pages: symbols only, never one of the site's own pages", () => {
  assert.equal(tickerFromPath("/NVDA"), "NVDA");
  assert.equal(tickerFromPath("/nvda/"), "NVDA");
  assert.equal(tickerFromPath("/BRK.B"), "BRK-B");
  for (const p of ["/", "/pricing", "/data", "/terms", "/start", "/design", "/search", "/admin", "/TOOLONG", "/A1", "/v1", "/NVDA/x", "/dashboard"]) assert.equal(tickerFromPath(p), null, p);
  assert.equal(classifyPage("/NVDA"), "public", "no login");
});

test("the page: the last 3 trades in plain English with their filings, the rest locked, the stock's own share image", async () => {
  const rows = Array.from({ length: 7 }, (_, i) => line(i, i === 1 ? { transaction_code: "S", category: "reported_sale", rule_10b5_1: true, owner_name: "ROE RICH", is_director: false, is_officer: true, officer_title: "Chief Financial Officer" }
    : i === 2 ? { owner_name: "<SCRIPT>X</SCRIPT>" } : {}));
  const query = fakeQuery({ [TRADES_SQL]: { rows }, [ENTITY_SQL]: { rows: [{ cik: "0000099999", name: "EXAMPLE CORP" }] } });
  const d = await tickerData(query, "EXMP");
  assert.deepEqual(d.counts, { trades: 7, buys: 6, sells: 1 });
  const html = renderTickerPage(d, { origin: "https://insidir.example" });
  assert.match(html, /<title>EXMP insider trading: who&#39;s buying and selling \| Insidir<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/insidir\.example\/EXMP">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/insidir\.example\/og\/EXMP\.png">/);
  assert.match(html, /<h1 class="t-hero stk-h1">Example insiders: who's buying and selling\.<\/h1>/);
  assert.match(html, /Jane Doe, a director, bought \$240K of EXMP stock on Oct 20, 2026\./);
  assert.match(html, /Rich Roe, the CFO, sold \$241K of EXMP stock on Oct 19, 2026, under a plan set up in advance\./);
  assert.ok(!/<script>x/i.test(html), "names are escaped");
  assert.equal((html.match(/class="card stk-trade"/g) || []).length, FREE_TRADES, "exactly three free trades");
  assert.equal((html.match(/See the SEC filing/g) || []).length, FREE_TRADES, "each linked to its filing");
  assert.ok(!html.includes("x5/form4.xml") && !html.includes("x6/form4.xml"), "locked trades are not in the page, not even blurred");
  assert.match(html, /4 more insider trades at EXMP in the last 12 months\./);
  assert.match(html, /href="\/signup.html" data-cta="ticker-unlock">Start for \$1<\/a>/);
  assert.match(html, /Research, not investment advice\./);
  assert.match(html, /<body class="ui site"/, "the new design (ui.css + site.css)");
  assert.doesNotMatch(html, /ds-h1|v2-tk|ds\.css|site-v2\.css/, "nothing from the old design");
  assert.doesNotMatch(html, /data-v2-mail|newsletter/, "no email sign-up: Insidir sends no email");
  assert.match(html, /"@type":"Corporation","name":"Example","tickerSymbol":"EXMP"/);

  const png = await ogImage(d);
  const meta = await sharp(png).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["png", 1200, 630]);
});

test("a stock with no open-market trades says so plainly and shows its latest other filings", async () => {
  const query = fakeQuery({ [LATEST_ANY_SQL]: { rows: [line(0, { transaction_code: "A", category: "other", estimated_value: null })] }, [ENTITY_SQL]: { rows: [{ cik: "1", name: "QUIET CO" }] } });
  const d = await tickerData(query, "QUIE");
  const html = renderTickerPage(d, { origin: "https://insidir.example" });
  assert.match(html, /No insider at Example has bought or sold QUIE stock on the open market in the last 12 months, so there is nothing to show here yet\./);
  assert.match(html, /Try a popular one<\/span><a class="chip" href="\/NVDA">NVDA<\/a><a class="chip" href="\/TSLA">TSLA<\/a><a class="chip" href="\/AAPL">AAPL<\/a>/, "never a dead end");
  assert.doesNotMatch(html, /Form 4, such as/, "no jargon in the explanation");
  assert.match(html, /Get the next QUIE insider trade the minute it's filed\./);
  assert.equal(await tickerData(fakeQuery(), "NOPE"), null, "an unknown symbol has no page");
});

test("routing: canonical upper case, /search, the old URLs, unknown symbols fall through", async () => {
  const query = fakeQuery({ [TRADES_SQL]: params => ({ rows: params[0] === "EXMP" ? [line(0)] : [] }) });
  const go = async path => { const res = fakeRes(); const done = await handleTickerRoute({ method: "GET", headers: {} }, res, new URL(path, "http://x"), { query }); return { done, ...res }; };
  assert.deepEqual([(await go("/exmp")).status, (await go("/exmp")).headers.location], [301, "/EXMP"]);
  const page = await go("/EXMP");
  assert.equal(page.status, 200);
  assert.match(page.headers["cache-control"], /^public, max-age=300/);
  assert.deepEqual([(await go("/search?t=%24exmp")).headers.location], ["/EXMP"]);
  assert.deepEqual([(await go("/search?t=%3Cx%3E")).headers.location], ["/"]);
  assert.deepEqual([(await go("/insider-trading/exmp")).headers.location], ["/EXMP"]);
  const unknown = await go("/ZZZZ");
  assert.equal(unknown.status, 404, "unknown: a 404 that still helps");
  assert.match(String(unknown.body), /We couldn't find a stock called ZZZZ\./);
  assert.match(String(unknown.body), /href="\/NVDA">NVDA</);
  assert.match(String(unknown.body), /<meta name="robots" content="noindex">/);
  assert.equal((await go("/pricing")).done, false);
  const og = await go("/og/EXMP.png");
  assert.equal(og.headers["content-type"], "image/png");
});

test("formats: one money, one date, sentences for every kind", () => {
  assert.deepEqual([money(1234567), money(840000), money(950), money(2.4e9), money(null)], ["$1.2M", "$840K", "$950", "$2.4B", null]);
  assert.equal(day("2026-10-16"), "Oct 16, 2026");
  assert.equal(sentence({ owner_name: "SMITH ANN", transaction_code: "P", shares: 5000, ticker: "ABC", transaction_date: "2026-01-02" }), "Ann Smith bought 5,000 shares of ABC stock on Jan 2, 2026.");
});
