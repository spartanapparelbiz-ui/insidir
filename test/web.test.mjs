import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { serveStatic } from "../src/web.mjs";
import { readFile, readdir } from "node:fs/promises";

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

test("repository photography stays available while pages only show sharp images",async()=>{
 await withServer(async base=>{
   const home=await(await fetch(base+"/")).text();
   const dash=await(await fetch(base+"/dashboard.html")).text();
   assert.match(home,/data-halftone-hero/);
   assert.match(dash,/id="v3-filings"/);
   assert.match(dash,/id="v3-trades"/);
   // Decorative, upscaled photography was blurry: the dashboard and explore pages show none.
   for(const page of ["/dashboard.html","/explore.html"])assert.doesNotMatch(await(await fetch(base+page)).text(),/assets\/img\/[a-z-]+\.jpg/,page+" must not show decorative raster photos");
   for(const name of ["hero.jpg","lens-company.jpg","lens-sec.jpg","lens-insider.jpg","records-left.jpg","informed-left.jpg","informed-right.jpg","dash-skyline.jpg","moves-wallst.jpg"]){
     const r=await fetch(base+"/assets/img/"+name);
     assert.equal(r.status,200,name+" must be present");
     assert.match(r.headers.get("content-type"),/image\/jpeg/,name);
   }
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

test("hard paywall: sign-up leads to subscription, sign-in checks access, product requests handle 401 and 402", async () => {
  await withServer(async base => {
    const auth=await (await fetch(base+"/assets/js/auth.js")).text();
    assert.match(auth, /subscribe\.html/, "new accounts continue to the subscription step");
    assert.match(auth, /\/v1\/me/, "sign-in checks the account's access before choosing a destination");
    assert.doesNotMatch(auth, /const RESEARCH_DESK = "research\.html"/);
    const signup=await (await fetch(base+"/signup.html")).text();
    assert.doesNotMatch(signup,/No credit card/i, "a paid product must not promise no card");
    assert.match(signup,/\$39/);
    const app=await (await fetch(base+"/assets/js/app.js")).text();
    assert.match(app,/402/);
    assert.match(app,/subscribe\.html/);
    assert.match(app,/signin\.html\?next=/);
    const subscribe=await fetch(base+"/subscribe.html");
    assert.equal(subscribe.status,200);
    const sub=await subscribe.text();
    assert.match(sub,/\$39/);
    assert.match(sub,/\/v1\/billing\/checkout|billing\.js|subscribe\.js/);
    const pricing=await (await fetch(base+"/pricing.html")).text();
    assert.match(pricing,/\$39/);
    assert.doesNotMatch(pricing,/\$0\b|free plan|PLANNED|Create a free account/i, "no free tier and no 'planned' Pro");
    const home=await (await fetch(base+"/")).text();
    assert.doesNotMatch(home,/\$0\b|for free|free account|Start free/i, "the landing page must not offer free access");
    const deleted=await fetch(base+"/account-deleted.html");
    assert.equal(deleted.status,200);
    assert.match(await (await fetch(base+"/assets/js/v3-account.js")).text(),/account-deleted\.html/);
  });
});

test("production dashboard uses readable evidence components without fake market data", async () => {
  await withServer(async base => {
    const res=await fetch(base+"/dashboard.html");
    assert.equal(res.status,200);
    const html=await res.text();
    assert.match(html,/data-greeting/);
    assert.match(html,/assets\/js\/v3-dashboard\.js/);
    for(const id of ["v3-trades","v3-filings","v3-watchlist","v3-notes","v3-ticker"])assert.match(html,new RegExp('id="'+id+'"'),id);
    assert.doesNotMatch(html,/Jan 8, 2024|Markets open|S&P 500|sample data/i);
    const js=await(await fetch(base+"/assets/js/v3-dashboard.js")).text();
    assert.match(js,/\/v1\/transactions\?limit=/);
    assert.match(js,/\/v1\/filings\?limit=/);
    assert.match(js,/\/v1\/me\/watchlist/);
    assert.doesNotMatch(js,/Math\.random|mockPrice|fakeReturn/);
  });
});

test("sign-in and public landing use the same working identity",async()=>{
 await withServer(async base=>{
  for(const path of ["/signup.html","/signin.html"]){
    const html=await(await fetch(base+path)).text();
    assert.match(html,/data-auth-form/);
    assert.match(html,/v13-halftone\.css/);
    assert.doesNotMatch(html,/Continue with Google|data-auth-toast=/);
  }
  const homepage=await(await fetch(base+"/index.html")).text();
  assert.match(homepage,/v13-home\.css/);
  assert.match(homepage,/id="v6-menu-button"/);
 });
});

test("every navigation button has its own page and nothing sends visitors back to the landing page",async()=>{
 await withServer(async base=>{
  const paths=["/index.html","/platform.html","/why-insidir.html","/data.html","/pricing.html","/company-info.html","/subscribe.html","/account-deleted.html","/dashboard.html","/research.html","/explore.html","/company.html","/filings.html","/watchlist.html","/portfolio.html","/alerts.html","/billing.html","/terms.html","/privacy.html","/account.html"];
  for(const p of paths)assert.equal((await fetch(base+p)).status,200,p);
  const home=await(await fetch(base+"/index.html")).text();
  const nav=home.match(/<nav class="v6-nav__links"[\s\S]*?<\/nav>/)?.[0]||"";
  for(const page of ["platform.html","why-insidir.html","data.html","pricing.html"])assert.match(nav,new RegExp('href="'+page.replace(".","\\.")+'"'),"landing navigation links to "+page);
  assert.doesNotMatch(nav,/href="#/,"landing navigation buttons open pages, not anchors on the landing page");
  const fs=await import("node:fs/promises");
  for(const file of (await fs.readdir(new URL("../web/",import.meta.url))).filter(f=>f.endsWith(".html"))){
    const html=await fs.readFile(new URL("../web/"+file,import.meta.url),"utf8");
    assert.doesNotMatch(html,/href="(\/|index\.html)#[a-z]/,file+" must not link to an anchor on the landing page");
    if(file==="index.html")assert.doesNotMatch(html.replace(/href="#main"/g,""),/<a [^>]*href="#[a-z]/,"landing buttons open pages, not anchors on the landing page");
    for(const m of html.matchAll(/href="([a-z0-9-]+\.html)(?:[?#][^"]*)?"/g)){
      const r=await fetch(base+"/"+m[1]);assert.equal(r.status,200,file+" links to a missing page "+m[1]);
    }
  }
  const nav2=await(await fetch(base+"/assets/js/app.js")).text();
  assert.match(nav2,/app-nav/);
  assert.match(nav2,/app-mobile-nav/);
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
  assert.doesNotMatch(home,/v4-explorer\.js|v4-presentation\.css|is3-window/);
  const dash=await(await fetch(base+"/dashboard.html")).text();
  assert.match(dash,/v4-dashboard\.js/);
  for(const id of ["rd-kpis","rd-daily-chart","rd-daily-table","rd-companies","rd-largest","v3-trades"])assert.match(dash,new RegExp('id="'+id+'"'),id);
  assert.match(dash,/v13-dashboard\.css/);
  const derived=await(await fetch(base+"/assets/js/v4-dashboard.js")).text();
  assert.match(derived,/insidir:transactions-loaded/);
  assert.doesNotMatch(derived,/Math\.random|mockPrice|fakeReturn/);
  for(const p of ["/research.html","/filings.html"])assert.match(await(await fetch(base+p)).text(),/v13-halftone\.css/);
 });
});

test("real logos and carefully matched free-license portraits are available without synthetic faces",async()=>{
  await withServer(async base=>{
    assert.match(await(await fetch(base+"/company.html")).text(),/assets\/js\/entity-media\.js/,"Company report keeps curated portraits");
    for(const page of ["/dashboard.html","/explore.html","/filings.html","/watchlist.html","/research.html"]){
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
  assert.match(home,/Aethric LLC/);
  assert.doesNotMatch(home,/is3-window|v5-hero-live|v4-explorer\.js/);
  const dash=await(await fetch(base+"/dashboard.html")).text();
  assert.match(dash,/v6-app\.css/);
  assert.match(dash,/class="app-body v2-app v3-app v6-app/);
  const appCSS=await(await fetch(base+"/assets/css/v6-app.css")).text();
  assert.match(appCSS,/position:sticky!important/);
  assert.match(appCSS,/flex-direction:row!important/);
  assert.match(appCSS,/\.app-mobile-nav\.is-open/);
  for(const p of ["/research.html","/explore.html","/filings.html","/watchlist.html","/portfolio.html","/alerts.html","/billing.html","/account.html"]){
   const html=await(await fetch(base+p)).text();
   assert.match(html,/v6-app\.css/,p);
  }
  for(const p of ["/terms.html","/privacy.html","/pricing.html","/company-info.html","/platform.html","/why-insidir.html","/data.html"])assert.match(await(await fetch(base+p)).text(),/v13-static\.css/,p);
 });
});

test("the landing page shows no product dashboard, no live data feed and no links into paid pages",async()=>{await withServer(async base=>{
 const home=await(await fetch(base+"/")).text();
 assert.match(home,/Know what moves/);
 assert.match(home,/data-halftone-hero/);
 for(const marker of ["v12-terminal","v12-demo-","data-v12-ticker","v6-live-records","v12-graph","v12-mini-bars","v12-report-aside"])assert.ok(!home.includes(marker),"landing must not ship the dashboard preview: "+marker);
 const main=home.split(/<footer/)[0];
 for(const gated of ["dashboard.html","research.html","explore.html","company.html","filings.html","filing.html","watchlist.html","portfolio.html","alerts.html","people.html"])assert.ok(!main.includes('href="'+gated),"landing content must not link into the paid product: "+gated);
 for(const src of [...home.matchAll(/<script[^>]*src="([^"?]+)/g)].map(m=>m[1])){
   const js=await(await fetch(base+"/"+src)).text();
   assert.doesNotMatch(js,/fetch\(\s*["'`]\/v1\/(filings|transactions|intelligence|market|company|search|insiders)/,src+" must not pull product data onto the public landing page");
 }
 const pages=["dashboard.html","research.html","explore.html","filings.html","filing.html","watchlist.html","portfolio.html","alerts.html","billing.html","account.html","signin.html","signup.html","pricing.html","terms.html","privacy.html","company-info.html","platform.html","why-insidir.html","data.html","subscribe.html"];
 for(const page of pages){const r=await fetch(base+"/"+page);assert.equal(r.status,200,page);assert.match(await r.text(),/v13-halftone\.css/,page);}
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
  assert.match(home,/Know what moves/);
  assert.match(home,/Aethric LLC/);
  assert.doesNotMatch(home,/markets open|live stock price|% gain|fake returns/i);
  const pricing=await(await fetch(base+"/pricing.html")).text();
  assert.match(pricing,/\$39/);
  for(const p of ["/terms.html","/privacy.html"])assert.match(await(await fetch(base+p)).text(),/Aethric LLC/);
  const terms=await(await fetch(base+"/terms.html")).text();
  assert.doesNotMatch(terms,/Pro plan is proposed|free research features/i,"terms must describe the paid subscription that now gates access");
  const account=await(await fetch(base+"/account.html")).text();
  assert.match(account,/id="account-delete"/);
  const app=await(await fetch(base+"/assets/js/app.js")).text();
  assert.match(app,/account.html/);
  for(const x of ["v6-app.css","v6-auth.css","v6-static.css"])assert.equal((await fetch(base+"/assets/css/"+x)).status,200,x);
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

test("V10 SEC people directory and verified identity assets are available", async()=>{
 await withServer(async base=>{
 const dash=await(await fetch(base+"/dashboard.html")).text();
 const people=await(await fetch(base+"/people.html")).text();
 assert.match(dash,/v10-people\.js/);
 assert.match(people,/v10-people-results/);
 assert.match(people,/v10-followed-results/);
 const peopleJS=await(await fetch(base+"/assets/js/v10-people.js")).text();
 assert.match(peopleJS,/\/v1\/me\/people/);
 assert.match(peopleJS,/\/v1\/insiders/);
 assert.equal((await fetch(base+"/assets/css/v10-editorial.css")).status,200);
 });
});

test("Company report ships the market-terminal design for every ticker without embedded prices",async()=>{
 await withServer(async base=>{
  const html=await(await fetch(base+"/company.html?ticker=MSFT")).text();
  assert.match(html,/v12-company\.css/);
  assert.match(html,/v12-company\.js/);
  assert.match(html,/data-app-header data-active="companies"/);
  for(const id of ["cx-name","cx-logo","cx-price","cx-change","cx-chart","cx-facts","cx-tabs","cx-fin-rows","cx-filing-rows","cx-insider-rows","cx-statements","cx-filings-table","cx-insiders-table","cx-people-sec","cx-announcements","cx-headlines","cx-watch","cx-alert","cx-share"]){
    assert.match(html,new RegExp('id="'+id+'"'),"Expected company report section "+id);
  }
  for(const label of ["Market cap","Enterprise value","P/E ratio","Revenue (TTM)","Net income (TTM)","Employees","Headquarters","Founded","Website"])assert.ok(html.includes(label),"Key fact "+label);
  for(const tab of ["Overview","Financials","SEC filings","Insider activity","People","News"])assert.match(html,new RegExp('role="tab"[^>]*>'+tab+'<'),"Tab "+tab);
  for(const range of ["1D","1W","1M","3M","1Y","5Y"])assert.match(html,new RegExp('data-range="'+range+'"'));
  assert.doesNotMatch(html,/\$\d{2,}\.\d{2}|\$\d+(\.\d+)?[TBM]\b/,"No hard-coded prices or valuations in the page");
  const code=await(await fetch(base+"/assets/js/v12-company.js")).text();
  for(const route of ["/v1/intelligence?ticker=","/v1/market/chart?ticker=","/v1/company/profile?ticker=","/v1/company/insiders?ticker=","/v1/company/news?ticker=","/v1/me/watchlist","/v1/search?q="])assert.ok(code.includes(route),route);
  assert.doesNotMatch(code,/Math\.random|mockPrice|syntheticPrice/);
  const css=await fetch(base+"/assets/css/v12-company.css");
  assert.equal(css.status,200);
  const header=await(await fetch(base+"/assets/js/app.js")).text();
  assert.match(header,/Search tickers, companies, or people/);
  assert.match(header,/\/v1\/search\?q=/);
  assert.match(header,/company\.html\?ticker=/);
 });
});

test("landing page is fully responsive markup: viewport meta, no fixed-width layout and reduced-motion support",async()=>{
 await withServer(async base=>{
  const html=await(await fetch(base+"/")).text();
  assert.match(html,/<meta name="viewport" content="width=device-width,\s*initial-scale=1">/);
  assert.match(html,/v13-home\.css/);
  const css=await(await fetch(base+"/assets/css/v13-home.css")).text();
  assert.match(css,/@media \(max-width:/);
  assert.match(css,/prefers-reduced-motion/);
  assert.doesNotMatch(html,/fake customer reviews|fake dashboard|[+]1\.73%|market cap \$3\.33T/i);
 });
});

test("V13 halftone identity: shared theme on every page, dotted wordmark only in the landing hero", async () => {
  await withServer(async base => {
    const pages = ["index.html", "signin.html", "signup.html", "dashboard.html", "research.html", "explore.html", "filings.html", "filing.html", "watchlist.html", "portfolio.html", "alerts.html", "people.html", "account.html", "billing.html", "company.html", "pricing.html", "company-info.html", "terms.html", "privacy.html", "404.html", "platform.html", "why-insidir.html", "data.html", "subscribe.html", "account-deleted.html"];
    let wordmarks = 0;
    for (const page of pages) {
      const res = await fetch(base + "/" + page);
      assert.equal(res.status, 200, page);
      const html = await res.text();
      assert.match(html, /assets\/css\/v13-halftone\.css/, page + " links the V13 theme");
      assert.match(html, /assets\/js\/v13-halftone\.js/, page + " loads the halftone engine");
      assert.match(html, /<body[^>]*class="[^"]*\bv13\b/, page + " body carries the v13 class");
      assert.match(html, /<meta name="theme-color" content="#0c0c0b">/, page + " theme colour is the night paper");
      assert.match(html, /<footer class="v13-footer v13-footer--plain"[\s\S]*hello@aethric\.llc[\s\S]*Back to top/, page + " ends with the plain tracked footer");
      if (/data-app-header/.test(html)) assert.match(await (await fetch(base + "/assets/js/app.js")).text(), /insidir<span class="v13-dot"/, page + " product header logo uses the dotted wordmark");
      else assert.match(html, /insidir<span class="(v13-dot|v12-logo-dot)"/, page + " logo uses the dotted wordmark");
      wordmarks += (html.match(/data-halftone-(hero|footer)/g) || []).length;
      if (page === "index.html") assert.match(html, /<section class="v9-hero v12-hero v13-hero" data-halftone-hero data-scroll-scatter="\d+" data-wordmark="insidir"/, "landing hero prints the dotted wordmark, which comes apart as it scrolls away");
      else assert.doesNotMatch(html, /data-halftone-(hero|footer)/, page + " must not print the giant wordmark");
    }
    assert.equal(wordmarks, 1, "exactly one dotted wordmark on the whole site");
    const css = await fetch(base + "/assets/css/v13-halftone.css");
    assert.equal(css.status, 200);
    const theme = await css.text();
    assert.match(theme, /@layer insidir-v13\{/);
    assert.match(theme, /--hf-bg:#0c0c0b!important;--hf-ink:#e9e4da!important;--hf-warm:var\(--hf-ink\)!important/);
    assert.match(theme, /font-family:"JetBrains Mono"/);
    for (const family of ["home", "app", "desk", "auth", "static", "company", "notfound"]) assert.equal((await fetch(base + "/assets/css/v13-" + family + ".css")).status, 200, family);
    const mono = await fetch(base + "/assets/fonts/JetBrainsMono-normal-latin.woff2");
    assert.equal(mono.headers.get("content-type"), "font/woff2");
    assert.match(await (await fetch(base + "/assets/fonts/OFL.txt")).text(), /JetBrains Mono: Copyright 2020/);
    const favicon = await (await fetch(base + "/assets/icons/favicon.svg")).text();
    assert.match(favicon, /#0c0c0b/); assert.doesNotMatch(favicon, /#e9762b/i); assert.match(favicon, /#e9e4da/);
    const engine = await (await fetch(base + "/assets/js/v13-halftone.js")).text();
    assert.match(engine, /data-halftone-hero/);
    assert.doesNotMatch(engine, /fonts\.googleapis|https?:\/\//, "the engine fetches nothing");
  });
});

test("nothing on the site glows orange: no halos, no orange gradients, no glowing dots, an ink-only wordmark",async()=>{
  const web=new URL("../web/",import.meta.url),cssDir=new URL("assets/css/",web);
  const warm=/var\(--hf-warm\)|#e9762b|rgba?\(\s*233\s*,\s*118\s*,\s*43/i;
  const sheets=(await readdir(cssDir)).filter(f=>/^v13-.*\.css$/.test(f));
  assert.ok(sheets.length>=9,"every V13 sheet is checked");
  for(const f of sheets){
    const css=await readFile(new URL(f,cssDir),"utf8");
    assert.doesNotMatch(css,/--hf-warm-soft|--hwf-warm/,f+" keeps no warm halo token");
    for(const decl of css.match(/(?:box-shadow|text-shadow|filter|background(?:-image)?|mask(?:-image)?|stop-color)\s*:[^;}]*/g)||[]){
      if(/gradient\(|shadow|filter|stop-color/.test(decl))assert.doesNotMatch(decl,warm,f+" glows orange: "+decl);
    }
  }
  for(const f of(await readdir(web)).filter(f=>f.endsWith(".html"))){
    assert.doesNotMatch(await readFile(new URL(f,web),"utf8"),/class="(?:mk-live|v9-tiny-dot|cx-live-dot)"/,f+" has no glowing dot");
  }
  const company=await readFile(new URL("v13-company.css",cssDir),"utf8");
  assert.match(company,/\.cx-chart svg>path\[fill\^="url\("\]\{fill:none!important\}/,"the price chart draws no gradient glow under its line");
  assert.doesNotMatch(await readFile(new URL("assets/js/v13-halftone.js",web),"utf8"),/warm/i,"the wordmark's dots never warm to orange");
});

test("nothing on the site is orange: no stylesheet, page, script or icon uses the retired accent",async()=>{
  const web=new URL("../web/",import.meta.url),cssDir=new URL("assets/css/",web),jsDir=new URL("assets/js/",web);
  const theme=await readFile(new URL("v13-halftone.css",cssDir),"utf8");
  assert.match(theme,/--hf-warm:var\(--hf-ink\)!important/,"the old accent token is an alias of ink");
  assert.match(theme,/--hf-alert:var\(--hf-down\)!important/,"errors and destructive actions use the red");
  for(const f of(await readdir(cssDir)).filter(f=>/^v13-.*\.css$/.test(f))){
    const css=(await readFile(new URL(f,cssDir),"utf8")).replace(/\/\*[\s\S]*?\*\//g,"");
    assert.doesNotMatch(css,/var\(--hf-warm\)|#e9762b|rgba?\(\s*233\s*,\s*118\s*,\s*43/i,f+" still uses the orange accent");
  }
  for(const f of(await readdir(web)).filter(f=>f.endsWith(".html")))assert.doesNotMatch(await readFile(new URL(f,web),"utf8"),/#e9762b|--hf-warm/i,f+" carries no orange");
  for(const f of(await readdir(jsDir)).filter(f=>/^v1[03]-|^v[34]-dashboard|^v12-company/.test(f)))assert.doesNotMatch(await readFile(new URL(f,jsDir),"utf8"),/#e9762b|--hf-warm|--v10-orange/i,f+" paints no orange");
  assert.doesNotMatch(await readFile(new URL("assets/icons/favicon.svg",web),"utf8"),/#e9762b/i,"the favicon's dot is ink");
});

test("charts use green for purchases and rises, red for sales and falls; the product chrome carries no orange",async()=>{
  const css=new URL("../web/assets/css/",import.meta.url);
  const theme=await readFile(new URL("v13-halftone.css",css),"utf8");
  assert.match(theme,/--hf-up:#2f996a!important;--hf-down:#f94144!important;/,"direction tokens");
  assert.match(theme,/--green:var\(--hf-up\)!important;--green-chart:var\(--hf-up\)!important/);
  assert.match(theme,/--red:var\(--hf-down\)!important;--red-chart:var\(--hf-down\)!important/);
  assert.match(theme,/body\.v13 :is\(\.buy,[^)]*\)\{color:var\(--hf-up\)/);
  assert.match(theme,/body\.v13 :is\(\.sell,[^)]*\)\{color:var\(--hf-down\)/);
  assert.match(theme,/\.app-nav a\[aria-current=page\]::after\{[^}]*background:var\(--hf-ink\)/,"the active tab is ink, not orange");
  const dash=await readFile(new URL("v13-dashboard.css",css),"utf8");
  for(const rule of [/\.rd-day__bar--up\{background:var\(--hf-up\)/,/\.rd-day__bar--down\{background:var\(--hf-down\)/,/\.rd-co__bar--up\{background:var\(--hf-up\)/,/\.rd-co__bar--down\{background:var\(--hf-down\)/])assert.match(dash,rule);
  assert.doesNotMatch(dash,/hf-warm/,"no orange on the overview");
  assert.doesNotMatch(await readFile(new URL("v13-app.css",css),"utf8"),/hf-warm/,"no orange in the app pages' stylesheet");
  const js=await readFile(new URL("../web/assets/js/v3-dashboard.js",import.meta.url),"utf8");
  for(const code of ["P","S","A","M","F","G"])assert.match(js,new RegExp("\\b"+code+':"'),"code "+code+" has its SEC meaning");
});
