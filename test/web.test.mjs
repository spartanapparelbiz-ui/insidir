import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { serveStatic } from "../src/web.mjs";

async function withServer(fn) {
  const server = createServer((req, res) => {
    serveStatic(req, res).then(done => { if (!done) { res.writeHead(404); res.end("none"); } });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}
const raw = (base, path) => new Promise((resolve, reject) => {
  // fetch() normalises "..", so send the raw request line to exercise traversal handling
  import("node:http").then(({ request }) => {
    const u = new URL(base);
    const req = request({ host: u.hostname, port: u.port, path, method: "GET" }, res => {
      let body = ""; res.on("data", c => body += c); res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject); req.end();
  });
});

test("website root serves the landing page with security headers", async () => {
  await withServer(async base => {
    const res = await fetch(base + "/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(await res.text(), /insidir\./);
  });
});

test("assets get correct types and long-lived caching for fonts and images", async () => {
  await withServer(async base => {
    const css = await fetch(base + "/assets/css/base.css");
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);
    const font = await fetch(base + "/assets/fonts/Inter-normal-latin.woff2");
    assert.equal(font.headers.get("content-type"), "font/woff2");
    assert.match(font.headers.get("cache-control"), /max-age=604800/);
  });
});

test("extensionless page paths resolve and unknown pages fall back to 404.html", async () => {
  await withServer(async base => {
    assert.equal((await fetch(base + "/pricing")).status, 200);
    const missing = await fetch(base + "/no-such-page");
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get("content-type"), /text\/html/);
    const missingAsset = await fetch(base + "/assets/nope.js");
    assert.equal(missingAsset.status, 404);
    assert.equal(await missingAsset.text(), "none");
  });
});

test("new users land in research before choosing an optional portfolio", async () => {
  await withServer(async base => {
    const auth=await (await fetch(base+"/assets/js/auth.js")).text();
    assert.match(auth, /const RESEARCH_DESK = "research.html"/);
    assert.match(auth, /location.assign\(RESEARCH_DESK\)/);
    const signup=await (await fetch(base+"/signup.html")).text();
    assert.match(signup,/No credit card or brokerage connection required/);
    const desk=await (await fetch(base+"/research.html")).text();
    assert.match(desk,/No portfolio or brokerage connection needed/);
    assert.match(desk,/href="portfolio.html"/);
  });
});

test("production dashboard uses readable evidence components without fake market data", async () => {
  await withServer(async base => {
    const res=await fetch(base+"/dashboard.html");
    assert.equal(res.status,200);
    const html=await res.text();
    assert.match(html,/data-greeting/);
    assert.match(html,/assets\/css\/v3-app.css/);
    assert.match(html,/assets\/js\/v3-dashboard.js/);
    assert.match(html,/id="v3-trades"/);
    assert.match(html,/id="v3-filings"/);
    assert.doesNotMatch(html,/Jan 8, 2024|Markets open|S&P 500|sample data/i);
    const script=await fetch(base+"/assets/js/v3-dashboard.js");
    assert.equal(script.status,200);
    const js=await script.text();
    assert.match(js,/\/v1\/transactions\?limit=60/);
    assert.match(js,/\/v1\/filings\?limit=15/);
  });
});
test("sign-in and public landing use the same working identity",async()=>{
 await withServer(async base=>{
  for(const path of ["/signup.html","/signin.html"]){
    const html=await(await fetch(base+path)).text();
    assert.match(html,/data-auth-form/);
    assert.match(html,/v6-auth\.css/);
    assert.match(html,/v6-auth-story/);
    assert.doesNotMatch(html,/Continue with Google|data-auth-toast=/);
  }
  const homepage=await(await fetch(base+"/index.html")).text();
  assert.match(homepage,/v6-marketing\.css/);
  assert.match(homepage,/assets\/js\/v6-site\.js/);
  const site=await(await fetch(base+"/assets/js/v6-site.js")).text();
  assert.match(site,/v6-menu-button/);
  assert.match(site,/\/v1\/filings\?limit=6/);
 });
});

test("new public site and top-navigation app offer live product routes",async()=>{
 await withServer(async base=>{
  const paths=["/index.html","/dashboard.html","/research.html","/explore.html","/company.html","/filings.html","/watchlist.html","/portfolio.html","/alerts.html","/pricing.html","/billing.html","/terms.html","/privacy.html","/account.html","/company-info.html"];
  for(const p of paths)assert.equal((await fetch(base+p)).status,200,p);
  const home=await(await fetch(base+"/index.html")).text();
  assert.match(home,/See what the/);
  assert.match(home,/id="v6-live-records"/);
  assert.doesNotMatch(home,/is3-window|fake dashboard|01 \/ DISCOVER|02 \/ VERIFY/);
  const dash=await(await fetch(base+"/dashboard.html")).text();
  assert.match(dash,/v6-app\.css/);
  assert.match(dash,/id="v3-trades"/);
  assert.match(dash,/id="v3-filings"/);
  const nav=await(await fetch(base+"/assets/js/app.js")).text();
  assert.match(nav,/app-nav/);
  assert.match(nav,/app-mobile-nav/);
  const collections=await(await fetch(base+"/assets/js/v2-collections.js")).text();
  assert.match(collections,/\/v1\/companies/);
  assert.match(collections,/\/v1\/filings/);
  assert.match(collections,/\/v1\/me\/watchlist/);
 });
});
test("real research data and original document icons remain available",async()=>{
 await withServer(async base=>{
  const icons=await fetch(base+"/assets/icons/interface.svg");
  assert.equal(icons.status,200);
  assert.match(icons.headers.get("content-type"),/image\/svg\+xml/);
  const sprite=await icons.text();
  for(const id of ["file-text","file-check","activity","search","bookmark","chart-columns"])assert.match(sprite,new RegExp('id="'+id+'"'));
  const home=await(await fetch(base+"/")).text();
  assert.match(home,/v6-marketing\.css/);
  assert.doesNotMatch(home,/v4-explorer\.js|v4-presentation\.css|is3-window/);
  const script=await(await fetch(base+"/assets/js/v6-site.js")).text();
  assert.match(script,/\/v1\/filings\?limit=6/);
  const dash=await(await fetch(base+"/dashboard.html")).text();
  assert.match(dash,/v4-dashboard\.js/);
  assert.match(dash,/id="v4-inspector-body"/);
  assert.match(dash,/id="v4-activity-chart"/);
  const derived=await(await fetch(base+"/assets/js/v4-dashboard.js")).text();
  assert.match(derived,/insidir:filings-loaded/);
  assert.match(derived,/insidir:transactions-loaded/);
  assert.doesNotMatch(derived,/Math\.random|mockPrice|fakeReturn/);
  for(const p of ["/research.html","/company.html","/filings.html"])assert.match(await(await fetch(base+p)).text(),/v6-app\.css/);
 });
});
test("real logos and carefully matched free-license portraits are available without synthetic faces",async()=>{
  await withServer(async base=>{
    for(const page of ["/dashboard.html","/company.html","/explore.html","/filings.html","/watchlist.html","/research.html"]){
      const res=await fetch(base+page);
      assert.equal(res.status,200,page);
      const html=await res.text();
      assert.match(html,/assets\/js\/entity-media\.js/,page);
      assert.match(html,/assets\/css\/entity-media\.css/,page);
    }
    const identity=await(await fetch(base+"/assets/js/entity-media.js")).text();
    assert.match(identity,/Apple_logo_black\.svg/);
    assert.match(identity,/Nvidia_Logo\.svg/);
    assert.match(identity,/Jensen_Huang_/);
    assert.match(identity,/Tim_Cook_/);
    assert.match(identity,/upload\.wikimedia\.org/);
    assert.match(identity,/Wikimedia Commons/);
    assert.doesNotMatch(identity,/ui-avatars|pravatar|randomuser\.me|picsum|Math\.random|simpleicons\.org|s2\/favicons|w\/api\.php/);
    assert.match(identity,/Satya_Nadella_/);
    assert.match(identity,/Elon_Musk_close-up_/);
    assert.match(identity,/naturalWidth>0/);
    const explorer=await(await fetch(base+"/assets/js/v4-explorer.js")).text();
    assert.match(explorer,/InsidirMedia\?\.portrait/);
    assert.match(explorer,/brand\.logo\(t,"lg"\)/);
    const research=await(await fetch(base+"/assets/js/research.js")).text();
    assert.match(research,/InsidirMedia\?\.portrait/);
    const company=await(await fetch(base+"/assets/js/v2-company.js")).text();
    assert.match(company,/identity\?\.portrait/);
    const csp=(await fetch(base+"/")).headers.get("content-security-policy");
    assert.match(csp,/img-src[^;]*https:\/\/upload\.wikimedia\.org/);
    assert.match(csp,/img-src[^;]*https:\/\/thumb\.wikimedia\.org/);
    assert.match(csp,/connect-src 'self';/);
    assert.doesNotMatch(csp,/img-src[^;]*\*/);
    const privacy=await(await fetch(base+"/privacy.html")).text();
    assert.match(privacy,/Public logos and portraits/);
  });
});

test("V6 product identity uses full-width top navigation and removes legacy green sidebar",async()=>{
 await withServer(async base=>{
  const home=await(await fetch(base+"/index.html")).text();
  assert.match(home,/v6-marketing\.css/);
  assert.match(home,/id="v6-live-records"/);
  assert.match(home,/Aethric LLC/);
  assert.doesNotMatch(home,/is3-window|v5-hero-live|v4-explorer\.js/);
  const dash=await(await fetch(base+"/dashboard.html")).text();
  assert.match(dash,/v6-app\.css/);
  assert.match(dash,/class="app-body v2-app v3-app v6-app/);
  const appCSS=await(await fetch(base+"/assets/css/v6-app.css")).text();
  assert.match(appCSS,/position:sticky!important/);
  assert.match(appCSS,/flex-direction:row!important/);
  assert.match(appCSS,/\.app-mobile-nav\.is-open/);
  assert.doesNotMatch(appCSS,/fixed\s+sidebar/);
  for(const p of ["/research.html","/company.html","/explore.html","/filings.html","/watchlist.html","/portfolio.html","/alerts.html","/billing.html","/account.html"]){
   const html=await(await fetch(base+p)).text();
   assert.match(html,/v6-app\.css/,p);
   assert.match(html,/v6-app/,p);
  }
  for(const p of ["/terms.html","/privacy.html","/pricing.html","/company-info.html"])assert.match(await(await fetch(base+p)).text(),/v6-static\.css/);
 });
});
test("V7 long editorial site and shared application styling are served",async()=>{await withServer(async base=>{
 const home=await(await fetch(base+"/")).text();
 assert.match(home,/assets\/css\/v7-system.css\?v=1/);
 assert.match(home,/The market is loud/);
 assert.match(home,/v7-product-art/);
 assert.match(home,/v7-positioning/);
 assert.doesNotMatch(home,/v6-orbit|v6-graphic__core/);
 const pages=["dashboard.html","research.html","company.html","explore.html","filings.html","filing.html","watchlist.html","portfolio.html","alerts.html","billing.html","account.html","signin.html","signup.html","pricing.html","terms.html","privacy.html","company-info.html"];
 for(const page of pages){const r=await fetch(base+"/"+page);assert.equal(r.status,200,page);const html=await r.text();assert.match(html,/v7-unified.css\?v=1/,page);}
 for(const asset of ["v7-system.css","v7-unified.css"]){assert.equal((await fetch(base+"/assets/css/"+asset)).status,200);}
});});

test("research desk is served without replacing the site's brand", async () => {
  await withServer(async base => {
    const res = await fetch(base + "/research.html");
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /Source-backed|source-backed|official insider filings/i);
    assert.match(page, /assets\/css\/base.css/);
    assert.match(page, /research-review-form/);
    const js = await fetch(base + "/assets/js/research.js");
    assert.equal(js.status, 200);
  });
});

test("read-only portfolio page loads without placing orders", async () => {
  await withServer(async base => {
    const result=await fetch(base+"/portfolio.html");
    assert.equal(result.status,200);
    const content=await result.text();
    assert.match(content,/Connect a brokerage later/);
    assert.match(content,/assets\/css\/base.css/);
    assert.match(content,/id="portfolio-disconnect"/);
    assert.doesNotMatch(content,/placeOrder|trade-if-available/);
    assert.equal((await fetch(base+"/assets/js/portfolio.js")).status,200);
  });
});
test("manual portfolio entry is visible without a brokerage connection", async () => {
  await withServer(async base => {
    const res=await fetch(base+"/portfolio.html");
    assert.equal(res.status,200);
    const html=await res.text();
    assert.match(html,/Add your holdings/);
    assert.match(html,/id="manual-form"/);
    assert.match(html,/assets\/js\/manual-holdings.js/);
    assert.match(html,/no brokerage connection/i);
    const script=await fetch(base+"/assets/js/manual-holdings.js");
    assert.equal(script.status,200);
  });
});
test("V6 marketing, legal and account pages are real and source-aware",async()=>{
 await withServer(async base=>{
  const home=await(await fetch(base+"/")).text();
  assert.match(home,/See what the/);
  assert.match(home,/id="v6-live-records"/);
  assert.match(home,/Aethric LLC/);
  assert.doesNotMatch(home,/markets open|live stock price|% gain|fake returns/i);
  const pricing=await(await fetch(base+"/pricing.html")).text();
  assert.match(pricing,/\$39/);
  assert.match(pricing,/PLANNED/);
  for(const p of ["/terms.html","/privacy.html"])assert.match(await(await fetch(base+p)).text(),/Aethric LLC/);
  const account=await(await fetch(base+"/account.html")).text();
  assert.match(account,/id="account-delete"/);
  const app=await(await fetch(base+"/assets/js/app.js")).text();
  assert.match(app,/account.html/);
  for(const x of ["v6-marketing.css","v6-app.css","v6-auth.css","v6-static.css"])assert.equal((await fetch(base+"/assets/css/"+x)).status,200,x);
  assert.equal((await fetch(base+"/assets/js/v6-site.js")).status,200);
 });
});
test("path traversal outside the web root is refused", async () => {
  await withServer(async base => {
    for (const p of ["/../package.json", "/%2e%2e/package.json", "/..%2fpackage.json", "/assets/../../src/config.mjs", "/%00index.html"]) {
      const r = await raw(base, p);
      assert.notEqual(r.status, 200, p);
      assert.doesNotMatch(r.body, /insidir-engine|DATABASE_URL/, p);
    }
  });
});

test("text assets are compressed when the client accepts it", async () => {
  await withServer(async base => {
    const { request } = await import("node:http");
    const u = new URL(base);
    const get = enc => new Promise((resolve, reject) => {
      const req = request({ host: u.hostname, port: u.port, path: "/assets/css/base.css", headers: enc ? { "accept-encoding": enc } : {} }, res => {
        const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => resolve({ headers: res.headers, size: Buffer.concat(chunks).length }));
      });
      req.on("error", reject); req.end();
    });
    const plain = await get(null), br = await get("gzip, deflate, br"), gz = await get("gzip");
    assert.equal(plain.headers["content-encoding"], undefined);
    assert.equal(br.headers["content-encoding"], "br");
    assert.equal(gz.headers["content-encoding"], "gzip");
    assert.ok(br.size < plain.size / 2 && gz.size < plain.size / 2);
    assert.match(br.headers.vary, /Accept-Encoding/);
    const img = await fetch(base + "/assets/img/hero.jpg", { headers: { "accept-encoding": "br" } });
    assert.equal(img.headers.get("content-encoding"), null);
  });
});
