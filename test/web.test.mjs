import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { serveStatic } from "../src/web.mjs";
import { readFile, readdir } from "node:fs/promises";
import { runInNewContext } from "node:vm";

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
   assert.match(home,/data-v2-hero/);
   assert.match(dash,/data-people/);
   assert.match(dash,/data-feed/);
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
    const app=await (await fetch(base+"/assets/js/ui.js")).text();
    assert.match(app,/402/);
    assert.match(app,/subscribe\.html/);
    assert.match(app,/signin\.html\?next=/);
    const subscribe=await fetch(base+"/subscribe.html");
    assert.equal(subscribe.status,200);
    const sub=await subscribe.text();
    assert.match(sub,/\$39/);
    assert.match(sub,/assets\/js\/subscribe-app\.js/);
    assert.match(await (await fetch(base+"/assets/js/subscribe-app.js")).text(),/\/v1\/billing\/checkout/, "the subscribe step starts Stripe checkout");
    const pricing=await (await fetch(base+"/pricing.html")).text();
    assert.match(pricing,/\$39/);
    assert.doesNotMatch(pricing,/\$0\b|free plan|PLANNED|Create a free account/i, "no free tier and no 'planned' Pro");
    const home=await (await fetch(base+"/")).text();
    assert.doesNotMatch(home,/\$0\b|for free|free account|Start free/i, "the landing page must not offer free access");
    const deleted=await fetch(base+"/account-deleted.html");
    assert.equal(deleted.status,200);
    assert.match(await (await fetch(base+"/assets/js/account-app.js")).text(),/account-deleted\.html/);
  });
});

test("production dashboard uses readable evidence components without fake market data", async () => {
  await withServer(async base => {
    const res=await fetch(base+"/dashboard.html");
    assert.equal(res.status,200);
    const html=await res.text();
    // Today on the rebuilt app (ui.css): the hero, the watchlist strip, the feed, people, notes and the market totals.
    assert.match(html,/assets\/js\/today\.js/);
    for(const hook of ["data-hero","data-strip","data-feed","data-people","data-notes","data-market","data-status"])assert.match(html,new RegExp(hook),hook);
    assert.doesNotMatch(html,/Jan 8, 2024|Markets open|S&P 500|sample data/i);
    const js=await(await fetch(base+"/assets/js/today.js")).text();
    for(const route of ["/v1/me/today","/v1/feed","/v1/chart","/v1/me/people/updates","/v1/me/research-decisions","/v1/status"])assert.ok(js.includes(route),route);
    assert.doesNotMatch(js,/Math\.random|mockPrice|fakeReturn/);
  });
});

test("sign-in and public landing use the same working identity",async()=>{
 await withServer(async base=>{
  for(const path of ["/signup.html","/signin.html"]){
    const html=await(await fetch(base+path)).text();
    assert.match(html,/data-auth-form/);
    // Log in and sign up are on the rebuilt design system, like the app they open.
    assert.match(html,/<body class="ui auth-body--/);
    assert.match(html,/\/assets\/css\/auth-ui\.css/);
    assert.match(html,/<svg class="wordmark-svg"|<svg viewBox="70 -793 4531 803"/);
    assert.doesNotMatch(html,/v13-halftone|JetBrainsMono/);
    assert.doesNotMatch(html,/Continue with Google|data-auth-toast=/);
  }
  const homepage=await(await fetch(base+"/index.html")).text();
  // The landing page is on the same design system (ui.css + site.css), with its own sticky navigation.
   assert.match(homepage,/assets\/css\/ui\.css/);
   assert.match(homepage,/assets\/css\/site\.css/);
   assert.match(homepage,/<header class="snav" data-ds-nav>/);
   assert.doesNotMatch(homepage,/v13-halftone|JetBrainsMono|assets\/css\/ds\.css/);
 });
});

test("every navigation button has its own page and nothing sends visitors back to the landing page",async()=>{
 await withServer(async base=>{
  const paths=["/index.html","/platform.html","/why-insidir.html","/data.html","/pricing.html","/company-info.html","/subscribe.html","/account-deleted.html","/dashboard.html","/research.html","/explore.html","/company.html","/filings.html","/watchlist.html","/portfolio.html","/alerts.html","/billing.html","/terms.html","/privacy.html","/account.html"];
  for(const p of paths)assert.equal((await fetch(base+p)).status,200,p);
  const home=await(await fetch(base+"/index.html")).text();
  // The landing is one page: its navigation (How it works, Pricing, FAQ) moves within it; the footer reaches the rest.
   const nav=home.match(/<nav class="snav__links"[\s\S]*?<\/nav>/)?.[0]||"";
   for(const [label,href] of [["How it works","#how"],["Pricing","#pricing"],["FAQ","#faq"]])assert.ok(nav.includes('href="'+href+'"')&&nav.includes(">"+label+"<"),"landing navigation: "+label);
   for(const id of ["how","pricing","faq"])assert.match(home,new RegExp('id="'+id+'"'),"the landing page has #"+id);
   const footer=home.match(/<footer[\s\S]*?<\/footer>/)?.[0]||"";
   for(const page of ["/data.html","/insider-trading","/stories.html","/terms.html","/privacy.html"])assert.ok(footer.includes('href="'+page+'"'),"the landing footer reaches "+page);
  const fs=await import("node:fs/promises");
  for(const file of (await fs.readdir(new URL("../web/",import.meta.url))).filter(f=>f.endsWith(".html"))){
    const html=await fs.readFile(new URL("../web/"+file,import.meta.url),"utf8");
    // The shared public navigation and footer (uiNav, uiFooter) reach the landing page's own sections, which exist;
    // nothing else points into the landing page.
    for(const m of html.matchAll(/href="(?:\/|index\.html)#([a-z-]+)"/g))assert.ok(["how","pricing","faq"].includes(m[1]),file+" links to a landing anchor that does not exist: #"+m[1]);
    if(file==="index.html")assert.match(html,/href="\/signup.html"[^>]*>Start for \$1</,"the landing page's one action starts the trial");
    for(const m of html.matchAll(/href="([a-z0-9-]+\.html)(?:[?#][^"]*)?"/g)){
      const r=await fetch(base+"/"+m[1]);assert.equal(r.status,200,file+" links to a missing page "+m[1]);
    }
  }
  // The app's own navigation is the ui.js shell: a sidebar and the phone tab bar, every entry a real page.
  const ui=await(await fetch(base+"/assets/js/ui.js")).text();
  const navList=ui.match(/const NAV=\[([\s\S]*?)\];/)?.[1]||"";
  const hrefs=[...navList.matchAll(/"(\/[a-z-]+\.html)"/g)].map(m=>m[1]);
  assert.ok(hrefs.length>=6,"the shell lists its pages");
  for(const h of hrefs)assert.equal((await fetch(base+h)).status,200,"the shell links to "+h);
  assert.match(ui,/class="side"/); assert.match(ui,/const TABS=/);
  for(const [page,js,routes] of [["watchlist","watchlist-app.js",["/v1/me/watchlist"]],["filings","filings-app.js",["/v1/filings"]],["explore","explore-app.js",["/v1/companies","/v1/company/directory"]]]){
    const html=await(await fetch(base+"/"+page+".html")).text();
    assert.match(html,/data-ui-shell/,page); assert.match(html,new RegExp("assets/js/"+js.replace(".","\\.")),page);
    const src=await(await fetch(base+"/assets/js/"+js)).text();
    for(const r of routes)assert.ok(src.includes(r),js+" asks "+r);
  }
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
  const chart=await(await fetch(base+"/assets/js/chart.js")).text();
  assert.doesNotMatch(chart,/Math\.random|mockPrice|fakeReturn/,"the chart draws what it is given");
  // The filings list is on the rebuilt app and opens each filing inside Insidir.
  const filings=await(await fetch(base+"/filings.html")).text();
  assert.match(filings,/<body class="ui\b/); assert.match(filings,/data-ui-shell/); assert.match(filings,/Research, not investment advice/);
  assert.doesNotMatch(filings,/v13-halftone/);
  assert.match(await(await fetch(base+"/assets/js/filings-app.js")).text(),/filing\.html\?accession=|filingHref/);
 });
});

test("real logos and real, credited photos come from the engine's media pipeline, never synthetic faces",async()=>{
  await withServer(async base=>{
    // Every app page asks GET /v1/media through ui.js (UI.logo, UI.face); the old per-page identity script is gone.
    for(const page of ["/explore.html","/filings.html","/watchlist.html","/people.html","/person.html"]){
      const res=await fetch(base+page);
      assert.equal(res.status,200,page);
      const html=await res.text();
      assert.match(html,/assets\/js\/ui\.js/,page);
      assert.doesNotMatch(html,/assets\/(js|css)\/entity-media\./,page+" does not load the old identity script");
    }
    const ui=await(await fetch(base+"/assets/js/ui.js")).text();
    assert.match(ui,/\/v1\/media\?/);
    assert.match(ui,/function face\(/); assert.match(ui,/data-ui-credits/);
    assert.doesNotMatch(ui,/ui-avatars|pravatar|randomuser\.me|picsum|Math\.random|simpleicons\.org|s2\/favicons|w\/api\.php/);
    for(const js of ["watchlist-app.js","filings-app.js","person-app.js","people-app.js"])assert.match(await(await fetch(base+"/assets/js/"+js)).text(),/UI\.(face|logo)\(|\bface\(|\blogo\(/,js+" shows real logos or photos");
    const csp=(await fetch(base+"/")).headers.get("content-security-policy");
    assert.match(csp,/img-src[^;]*https:\/\/upload\.wikimedia\.org/);
    assert.match(csp,/img-src[^;]*https:\/\/thumb\.wikimedia\.org/);
    assert.match(csp,/connect-src 'self' https:\/\/us\.i\.posthog\.com https:\/\/us-assets\.i\.posthog\.com;/);
    assert.match(csp,/script-src 'self' 'unsafe-inline' https:\/\/us-assets\.i\.posthog\.com;/);
    assert.doesNotMatch(csp,/img-src[^;]*\*/);
    const privacy=await(await fetch(base+"/privacy.html")).text();
    assert.match(privacy,/Public logos and portraits/);
  });
});

test("one product identity: the app pages share the ui.js shell, the public pages share uiNav and uiFooter",async()=>{
 await withServer(async base=>{
  const home=await(await fetch(base+"/index.html")).text();
  assert.match(home,/Aethric LLC/);
  assert.doesNotMatch(home,/is3-window|v5-hero-live|v4-explorer\.js/);
  for(const p of ["/explore.html","/filings.html","/watchlist.html","/billing.html","/account.html","/people.html","/person.html","/alerts.html","/dashboard.html"]){
   const html=await(await fetch(base+p)).text();
   assert.match(html,/<body class="ui\b/,p); assert.match(html,/assets\/css\/ui\.css/,p);
   assert.doesNotMatch(html,/v6-app\.css|v13-halftone\.css|class="app-nav/,p+" carries no old navigation");
  }
  for(const p of ["/terms.html","/privacy.html","/pricing.html","/company-info.html","/platform.html","/why-insidir.html","/data.html","/subscription-policy.html","/disclosures.html","/insidir-intelligence.html"]){
   const html=await(await fetch(base+p)).text();
   assert.match(html,/<body class="ui site"/,p); assert.match(html,/assets\/css\/site\.css/,p);
   assert.match(html,/<header class="snav" data-ds-nav>/,p); assert.match(html,/<footer class="sfoot">/,p);
   assert.doesNotMatch(html,/v13-static\.css|v13-halftone/,p);
  }
 });
});

test("the landing page shows real filings, not a product dashboard, and links only to public pages",async()=>{await withServer(async base=>{
 const home=await(await fetch(base+"/")).text();
 assert.match(home,/<h1 class="t-display shero__h1" id="hero-h">They have to tell on themselves\. We tell you first\.<\/h1>/);
 assert.match(home,/data-v2-hero/);
 assert.doesNotMatch(home,/not live data|Illustrative|example data/i,"no labels for made-up data: there is none");
 for(const marker of ["v12-terminal","v12-demo-","data-v12-ticker","v6-live-records","v12-graph","v12-mini-bars","v12-report-aside"])assert.ok(!home.includes(marker),"landing must not ship the dashboard preview: "+marker);
 const main=home.split(/<footer/)[0];
 for(const gated of ["dashboard.html","research.html","explore.html","company.html","filings.html","filing.html","watchlist.html","portfolio.html","alerts.html","people.html","person.html"])assert.ok(!main.includes('href="'+gated)&&!main.includes('href="/'+gated),"landing content must not link into the paid product: "+gated);
 for(const src of [...home.matchAll(/<script[^>]*src="([^"?]+)/g)].map(m=>m[1])){
   const js=await(await fetch(base+(src.startsWith("/")?"":"/")+src)).text();
   assert.doesNotMatch(js,/fetch\(\s*["'`]\/v1\/(filings|transactions|intelligence|market|company|search|insiders)/,src+" must not pull product data onto the public landing page");
 }
 const pages=["dashboard.html","research.html","explore.html","filings.html","filing.html","people.html","person.html","watchlist.html","portfolio.html","alerts.html","billing.html","account.html","signin.html","signup.html","pricing.html","terms.html","privacy.html","company-info.html","platform.html","why-insidir.html","data.html","subscribe.html"];
 for(const page of pages){const r=await fetch(base+"/"+page);assert.equal(r.status,200,page);const h=await r.text();if(/http-equiv="refresh"/.test(h))continue;assert.match(h,/<body class="ui\b/,page+" is on the new design");}
});});

test("the old research desk address opens the stock page (or Today) instead", async () => {
  await withServer(async base => {
    const res = await fetch(base + "/research.html");
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /location\.replace\(/);
    assert.match(page, /\/company\.html\?ticker=/);
    assert.match(page, /http-equiv="refresh" content="0; url=\/dashboard\.html"/);
    assert.match(page, /Research, not investment advice/);
  });
});

test("read-only portfolio page loads without placing orders", async () => {
  await withServer(async base => {
    const result=await fetch(base+"/portfolio.html");
    assert.equal(result.status,200);
    const content=await result.text();
    assert.match(content,/data-ui-shell data-page="portfolio"/);
    assert.match(content,/assets\/js\/portfolio-app\.js/);
    assert.match(content,/Optional read-only view through SnapTrade/);
    assert.match(content,/data-pf-disconnect/);
    assert.match(content,/Research, not investment advice/);
    assert.doesNotMatch(content,/placeOrder|trade-if-available/);
    const js=await(await fetch(base+"/assets/js/portfolio-app.js")).text();
    for(const r of ["/v1/me/brokerage/status","/v1/me/brokerage/portfolio","/v1/me/brokerage/connect"])assert.ok(js.includes(r),r);
    assert.doesNotMatch(js,/placeOrder|\/orders?\b|trade-if-available/,"read-only: nothing places an order");
  });
});
test("manual portfolio entry is visible without a brokerage connection", async () => {
  await withServer(async base => {
    const res=await fetch(base+"/portfolio.html");
    assert.equal(res.status,200);
    const html=await res.text();
    assert.match(html,/Your holdings/);
    assert.match(html,/data-pf-form/); assert.match(html,/id="pf-ticker"/); assert.match(html,/id="pf-qty"/);
    const js=await(await fetch(base+"/assets/js/portfolio-app.js")).text();
    assert.match(js,/\/v1\/me\/manual-holdings/);
  });
});
test("marketing, legal and account pages are real and source-aware",async()=>{
 await withServer(async base=>{
  const home=await(await fetch(base+"/")).text();
  assert.match(home,/They have to tell on themselves\. We tell you first\./);
   assert.match(home,/Aethric LLC/);
  assert.doesNotMatch(home,/markets open|live stock price|% gain|fake returns/i);
  const pricing=await(await fetch(base+"/pricing.html")).text();
  assert.match(pricing,/\$39/);
  for(const p of ["/terms.html","/privacy.html"])assert.match(await(await fetch(base+p)).text(),/Aethric LLC/);
  const terms=await(await fetch(base+"/terms.html")).text();
  assert.doesNotMatch(terms,/Pro plan is proposed|free research features/i,"terms must describe the paid subscription that now gates access");
  const account=await(await fetch(base+"/account.html")).text();
  assert.match(account,/id="account-delete"/);
  const ui=await(await fetch(base+"/assets/js/ui.js")).text();
  assert.match(ui,/"\/account\.html"/,"the shell reaches Settings");
  for(const x of ["ui.css","site.css","site-pages.css"])assert.equal((await fetch(base+"/assets/css/"+x)).status,200,x);
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

test("the SEC people directory lists insiders and the ones you follow", async()=>{
 await withServer(async base=>{
 const people=await(await fetch(base+"/people.html")).text();
 assert.match(people,/data-ui-shell data-page="people"/);
 assert.match(people,/assets\/js\/people-app\.js/);
 assert.match(people,/data-ui-credits/,"photos are credited");
 const peopleJS=await(await fetch(base+"/assets/js/people-app.js")).text();
 assert.match(peopleJS,/\/v1\/me\/people/);
 assert.match(peopleJS,/\/v1\/insiders/);
 assert.match(peopleJS,/UI\.face\(|\bface\(/);
 });
});

test("the ticker page (company.html) is on the rebuilt app: price hero, full-width chart, quiet tabs, no embedded prices",async()=>{
 await withServer(async base=>{
  const html=await(await fetch(base+"/company.html?ticker=MSFT")).text();
  assert.match(html,/<body class="ui">/);
  assert.match(html,/data-ui-shell data-page="company"/);
  assert.match(html,/\/assets\/css\/ticker\.css/);
  assert.match(html,/\/assets\/js\/ticker\.js/);
  assert.match(html,/Research, not investment advice\./);
  assert.doesNotMatch(html,/Dot size follows the amount<\/span>/,"the legend stays a few words");
  assert.doesNotMatch(html,/\$\d{2,}\.\d{2}|\$\d+(\.\d+)?[TBM]\b/,"No hard-coded prices or valuations in the page");
  const code=await(await fetch(base+"/assets/js/ticker.js")).text();
  for(const route of ["/v1/chart?ticker=","/v1/me/watchlist"])assert.ok(code.includes(route),route);
  assert.match(code,/\/insiders/);assert.match(code,/\/funds/);
  assert.doesNotMatch(code,/Math\.random|mockPrice|syntheticPrice|__tkChart/);
 });
});

test("landing page is fully responsive markup: viewport meta, no fixed-width layout and reduced-motion support",async()=>{
 await withServer(async base=>{
  const html=await(await fetch(base+"/")).text();
  assert.match(html,/<meta name="viewport" content="width=device-width,\s*initial-scale=1(,viewport-fit=cover)?">/);
  assert.match(html,/site\.css/);
  const css=(await(await fetch(base+"/assets/css/site.css")).text())+(await(await fetch(base+"/assets/css/ui.css")).text());
  assert.match(css,/@media \(max-width:/);
  assert.match(css,/prefers-reduced-motion/);
  assert.doesNotMatch(html,/fake customer reviews|fake dashboard|[+]1\.73%|market cap \$3\.33T/i);
 });
});

test("one identity on every page: Geist only, the SVG wordmark, the night paper, no halftone", async () => {
  await withServer(async base => {
    const home = await (await fetch(base + "/index.html")).text();
    assert.match(home, /<a class="wordmark" href="\/" aria-label="Insidir home"><svg aria-hidden="true" xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="70 -793 4531 803">/, "the wordmark is the SVG logo (web/assets/brand/insidir-wordmark.svg)");
    const ui = await (await fetch(base + "/assets/js/ui.js")).text();
    assert.match(ui, /const WORDMARK=`<svg viewBox="70 -793 4531 803" aria-hidden="true"/, "the app shell draws the same SVG wordmark");
    const pages = ["signin.html", "signup.html", "dashboard.html", "explore.html", "filings.html", "filing.html", "watchlist.html", "alerts.html", "people.html", "account.html", "billing.html", "company.html", "pricing.html", "company-info.html", "terms.html", "privacy.html", "404.html", "platform.html", "why-insidir.html", "data.html", "subscribe.html", "account-deleted.html", "person.html", "welcome.html", "stories.html", "disclosures.html"];
    for (const page of pages) {
      const res = await fetch(base + "/" + page);
      assert.equal(res.status, 200, page);
      const html = await res.text();
      assert.match(html, /<body class="ui\b/, page + " is on the new design");
      assert.match(html, /assets\/css\/ui\.css/, page);
      assert.match(html, /<meta name="theme-color" content="#0c0c0b">/, page + " theme colour is the night paper");
      assert.doesNotMatch(html, /v13-halftone|data-halftone-(hero|footer)|JetBrains|GeistMono|Geist Mono/, page + " carries no halftone and no second font");
      assert.doesNotMatch(html, /insidir<span class="(v13-dot|v12-logo-dot)"/, page + " has no text logo left");
      if (/data-ui-shell/.test(html)) continue; // the shell (ui.js) draws the wordmark
      if (/<body class="ui site\b/.test(html)) assert.match(html, /<svg[^>]* viewBox="70 -793 4531 803"/, page + " logo is the SVG wordmark");
    }
    const favicon = await (await fetch(base + "/assets/icons/favicon.svg")).text();
    // The dotted "i" mark: ink background, warm-white dots (#f0eee8 since the vector refinement of the mark), never orange.
    assert.match(favicon, /#0c0c0b/); assert.doesNotMatch(favicon, /#e9762b/i); assert.match(favicon, /#(e9e4da|f0eee8)/i);
    // The halftone engine is still served to the server-rendered paywall pages: it fetches nothing.
    const engine = await (await fetch(base + "/assets/js/v13-halftone.js")).text();
    assert.doesNotMatch(engine, /fonts\.googleapis|https?:\/\//, "the engine fetches nothing");
  });
});

test("nothing on the site glows orange: no halos, no orange gradients, no glowing dots, an ink-only wordmark",async()=>{
  const web=new URL("../web/",import.meta.url),cssDir=new URL("assets/css/",web);
  const warm=/var\(--hf-warm\)|#e9762b|rgba?\(\s*233\s*,\s*118\s*,\s*43/i;
  const sheets=(await readdir(cssDir)).filter(f=>f.endsWith(".css"));
  assert.ok(sheets.includes("ui.css")&&sheets.includes("site.css"),"every sheet is checked, the new design's included");
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

test("charts use green for purchases and rises, coral for sales and falls; the product chrome carries no orange",async()=>{
  const css=new URL("../web/assets/css/",import.meta.url);
  const ui=await readFile(new URL("ui.css",css),"utf8");
  assert.match(ui,/--up:#3dd68c;/,"green for buys and rises"); assert.match(ui,/--down:#ff6b5e;/,"coral for sells and falls");
  assert.match(ui,/\.up\{[^}]*color:var\(--up\)/); assert.match(ui,/\.down\{[^}]*color:var\(--down\)/);
  assert.doesNotMatch(ui,/#e9762b|hf-warm/i,"no orange in the app's stylesheet");
  const theme=await readFile(new URL("v13-halftone.css",css),"utf8");
  assert.match(theme,/--hf-up:#2f996a!important;--hf-down:#f94144!important;/,"the old theme still served to paywall pages keeps its direction tokens");
  // The SEC's meaning of every Form 4 code lives in form4-words.js (window.InsidirForm4.CODES), which the insider's page
  // loads: load the real script and read the object it exports.
  const jsDir=new URL("../web/assets/js/",import.meta.url);
  const sandbox={window:{}};
  runInNewContext(await readFile(new URL("form4-words.js",jsDir),"utf8"),sandbox,{filename:"form4-words.js"});
  const F=sandbox.window.InsidirForm4;
  assert.ok(F&&F.CODES&&Object.isFrozen(F.CODES),"form4-words.js exports a frozen CODES table");
  for(const c of "PSVADFIMCEHOXGLWZJKU")assert.ok(typeof F.CODES[c]==="string"&&F.CODES[c].length>3,"code "+c+" has its SEC meaning in form4-words.js");
  const sec={P:/^Open market or private purchase/,S:/^Open market or private sale/,A:/^Grant, award or other acquisition/,D:/^Disposition to the issuer/,
    F:/^Payment of exercise price or tax liability by delivering or withholding securities/,M:/^Exercise or conversion of .*derivative security/,
    X:/^Exercise of an in-the-money or at-the-money derivative security/,G:/^Bona fide gift$/,J:/^Other acquisition or disposition/};
  for(const [c,re] of Object.entries(sec))assert.match(F.CODES[c],re,"code "+c+" reads in the SEC's own words");
  assert.equal(F.codeMeaning("P"),F.CODES.P,"codeMeaning reads CODES");
  assert.equal(F.codeMeaning("Q"),"","an unknown code has no invented meaning");
  // The insider's page takes its wording from form4-words.js and keeps no second copy of the SEC meanings.
  const html=await readFile(new URL("../web/person.html",import.meta.url),"utf8");
  assert.ok(html.indexOf("assets/js/form4-words.js")>0&&html.indexOf("assets/js/form4-words.js")<html.indexOf("assets/js/person-app.js"),"form4-words.js loads before person-app.js");
  const js=await readFile(new URL("person-app.js",jsDir),"utf8");
  assert.match(js,/window\.InsidirForm4/,"person-app.js reads window.InsidirForm4");
  assert.doesNotMatch(js,/const CODES\s*=/,"person-app.js keeps no copy of the SEC meanings");
});

test("every person and company on the product pages gets a real logo or photo from one /v1/media batch",async()=>{
  const web=new URL("../web/",import.meta.url),js=new URL("assets/js/",web);
  // Every app page that names a person or a company loads ui.js (UI.logo, UI.face), never the old identity helper.
  for(const page of ["people","person","explore","filings","watchlist","dashboard","company","filing","alerts"]){
    const html=await readFile(new URL(page+".html",web),"utf8");
    assert.match(html,/<script defer src="\/assets\/js\/ui\.js(\?v=[^"]+)?"><\/script>/,page+" loads ui.js");
    assert.doesNotMatch(html,/entity-media\.(js|css)/,page+" does not load entity-media");
  }
  // Pages that show photos carry the credits footnote ui.js fills.
  for(const page of ["people","person","watchlist","filings","dashboard","company"])assert.match(await readFile(new URL(page+".html",web),"utf8"),/data-ui-credits/,page+" has a credits footnote");
  const ui=await readFile(new URL("ui.js",js),"utf8");
  assert.match(ui,/fetch\("\/v1\/media\?"\+q/,"one batch request to the engine's media endpoint");
  assert.match(ui,/"tickers="\+list\.join\(","\)/); assert.match(ui,/"people="\+people\.map\(encodeURIComponent\)/);
  assert.match(ui,/const MEDIA=\/\^\\\/v1\\\/media\\\/\[a-f0-9\]\{64\}/,"only content-addressed images on this origin are loaded from an answer");
  assert.doesNotMatch(ui,/\/v1\/company\/logo|ui-avatars|pravatar|randomuser\.me|picsum|dicebear|robohash|gravatar|clearbit|logo\.dev|simpleicons\.org|s2\/favicons|favicon\.ico|Math\.random/,"no per-tile logo requests, avatar generators or favicon services");
  assert.match(ui,/sessionStorage/,"answers are reused across pages");
  assert.match(ui,/function face\(name,\{cik,ticker,issuerCik,size=24\}=\{\}\)\{[\s\S]*?aria-hidden="true"/,"faces beside names are hidden from assistive technology");
  assert.match(ui,/"\[data-ui-credits\]"/,"credits go to the page's footnote, never a link round a picture");
  // Call sites identify people by SEC owner CIK.
  const sites={"today.js":/face\(p\.owner_name,\{cik:p\.owner_cik/,"ticker.js":/face\(x\.owner,\{cik:x\.ownerCik/,"watchlist-app.js":/face\(m\.owner,\{cik:m\.ownerCik/,
    "people-app.js":/face\(raw,\{cik:id/,"person-app.js":/face\(name,\{cik:personCik/,"filings-app.js":/face\(/};
  for(const [file,rule] of Object.entries(sites))assert.match(await readFile(new URL(file,js),"utf8"),rule,file);
});

test("faces fill their box, fade in place over the initials, and the credits never move the page",async()=>{
  const css=await readFile(new URL("../web/assets/css/ui.css",import.meta.url),"utf8");
  assert.match(css,/\.face\{position:relative;overflow:hidden\}/);
  assert.match(css,/\.face img\{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity var\(--med\)\}/,"the photo fills the tile and fades in; it never grows");
  assert.match(css,/\.face\.has-img img\{opacity:1\}/); assert.match(css,/\.face\.has-img \.face__mono\{opacity:0\}/,"initials stay until the photo lands");
  const ui=await readFile(new URL("../web/assets/js/ui.js",import.meta.url),"utf8");
  assert.match(ui,/insidir:faces:v1/,"answers for faces are kept for the visit");
  assert.match(ui,/<span class="face__mono">/,"initials are always drawn first");
  // The browser check measures the picture's own box, so a half-size tile cannot pass it again.
  const check=await readFile(new URL("../scripts/media-check.mjs",import.meta.url),"utf8");
  assert.match(check,/a photo fills its tile/);
  assert.match(check,/no tile or heading moves when pictures and credits l/);
});

test("the insider's page is a gated product page built only from GET /v1/people/<cik>",async()=>{
  await withServer(async base=>{
    const res=await fetch(base+"/person.html?cik=1214156");
    assert.equal(res.status,200);
    const html=await res.text();
    assert.match(html,/<body class="ui\b/);
    assert.match(html,/data-ui-shell data-page="people"/,"the app shell, on People");
    const order=s=>html.indexOf('src="/assets/js/'+s);
    for(const s of ["ui.js","form4-words.js","person-app.js"])assert.ok(order(s)>0,"person.html loads "+s);
    assert.ok(order("form4-words.js")<order("person-app.js"),"form4-words.js loads before person-app.js");
    assert.match(html,/data-ui-credits/);
    assert.match(html,/Research, not investment advice/);
    const js=await(await fetch(base+"/assets/js/person-app.js")).text();
    for(const route of ["/v1/people/","/v1/me/people"])assert.ok(js.includes(route),"person-app.js asks "+route);
    assert.match(js,/window\.InsidirForm4/,"figures and wording come from form4-words.js");
    assert.match(js,/\bface\(name,\{cik:personCik,size:96\}\)/,"the page photo is a real photo through UI.face, or initials");
    assert.doesNotMatch(js,/Math\.random|ui-avatars|pravatar|dicebear|robohash|gravatar/,"nothing generated");
    // Gated like the rest of the product: the client gate and the sign-in / subscribe return paths know the page.
    assert.match(await(await fetch(base+"/assets/js/auth.js")).text(),/person: "the insider's page"/,"sign-in returns the reader to the page");
    assert.match(await(await fetch(base+"/assets/js/subscribe-app.js")).text(),/PAGES = \[[^\]]*"person"/,"subscribing returns the reader to the page");
  });
});

test("every person name links to their own page (person.html?cik=<owner CIK>) when the CIK is known",async()=>{
  const js=new URL("../web/assets/js/",import.meta.url),read=f=>readFile(new URL(f,js),"utf8");
  for(const file of ["people-app.js","person-app.js","filing-app.js","today.js","ticker.js","ui.js"])assert.ok((await read(file)).includes("person.html?cik="),file+" links people to person.html?cik=");
  // The links drop the CIK's leading zeros; the insider's page accepts the CIK either way.
  assert.match(await read("filing-app.js"),/"person\.html\?cik="\+c\.replace\(\/\^0\+\/,""\)/);
  assert.match(await read("person-app.js"),/"\/person\.html\?cik="\+bare\(cik\)/);
  assert.match(await read("person-app.js"),/with or without leading zeros/);
});

test("faces carry the owner CIK and the company (ticker or issuer CIK), so the photo is matched to the right person",async()=>{
  const js=new URL("../web/assets/js/",import.meta.url),read=f=>readFile(new URL(f,js),"utf8");
  const ui=await read("ui.js");
  assert.match(ui,/key=c\?\(TICK\.test\(T\)\?c\+":"\+T:ic\?c\+":cik:"\+ic:c\):""/,"the ask is owner CIK with the ticker, or the issuer CIK when there is no ticker");
  assert.match(await read("people-app.js"),/face\(raw,\{cik:id,ticker:t,issuerCik:p\.issuer_cik\}\)/,"the directory passes both");
  assert.match(await read("today.js"),/face\(p\.owner_name,\{cik:p\.owner_cik,ticker:p\.ticker/);
});

test("asset versions: src, href and srcset name the same versioned URL; fonts stay unversioned to match their stylesheets", async () => {
  const { fingerprintHtml } = await import("../src/web.mjs");
  const out = await fingerprintHtml('<link rel="preload" as="image" href="assets/img/product/company-report.webp"><link rel="preload" href="assets/fonts/Inter-normal-latin.woff2" as="font">' +
    '<source srcset="assets/img/product/company-report.webp" type="image/webp"><img srcset="assets/img/hero.jpg 1200w, https://example.com/x.jpg 2x" src="assets/img/hero.jpg">');
  const preload = /href="(assets\/img\/product\/company-report\.webp\?v=[0-9a-f]{10})"/.exec(out);
  assert.ok(preload, "image preload is versioned");
  assert.ok(out.includes('<source srcset="' + preload[1] + '" type="image/webp">'), "the <source> asks for the same URL as the preload");
  assert.match(out, /srcset="assets\/img\/hero\.jpg\?v=[0-9a-f]{10} 1200w, https:\/\/example\.com\/x\.jpg 2x"/);
  assert.match(out, /href="assets\/fonts\/Inter-normal-latin\.woff2" as="font"/);
});

test("the rebuilt app (ui.css): real logos and real, credited photos or initials; prices only from stored closes; one shell", async () => {
  const web = new URL("../web/", import.meta.url), js = new URL("assets/js/", web);
  const ui = await readFile(new URL("ui.js", js), "utf8"), chart = await readFile(new URL("chart.js", js), "utf8");
  assert.match(ui, /"tickers="\+list\.join/, "logos come from the engine's batch endpoint");
  assert.match(ui, /"people="\+people\.map/, "photos of insiders come from the same batch");
  assert.match(ui, /MEDIA=\/\^\\\/v1\\\/media\\\/\[a-f0-9\]\{64\}/, "only content-addressed images on this origin");
  assert.doesNotMatch(ui + chart, /ui-avatars|pravatar|randomuser\.me|picsum|dicebear|robohash|gravatar|clearbit|logo\.dev|s2\/favicons|Math\.random/, "no generated pictures");
  assert.match(ui, /const monogram=/, "insiders without a photo get initials");
  assert.match(ui, /function face\(/); assert.match(ui, /data-ui-credits/, "every photo is credited");
  assert.match(ui, /"\/signin\.html\?next="/, "401 sends to sign in");
  assert.match(ui, /"\/subscribe\.html\?next="/, "402 sends to subscribe");
  for (const page of ["dashboard.html", "design.html", "company.html", "alerts.html", "watchlist.html", "filings.html", "explore.html", "people.html", "person.html", "account.html", "billing.html"]) {
    const html = await readFile(new URL(page, web), "utf8");
    assert.match(html, /<body class="ui">/, page);
    assert.match(html, /\/assets\/css\/ui\.css/, page);
    assert.match(html, /<meta name="theme-color" content="#0c0c0b">/, page);
    assert.match(html, /Research, not investment advice\./, page);
    for (const src of html.matchAll(/<script[^>]*src="([^"]+)"/g)) assert.ok(src[1].startsWith("/assets/"), page + " loads scripts from this origin only: " + src[1]);
  }
  assert.match(await readFile(new URL("dashboard.html", web), "utf8"), /data-ui-shell data-page="dashboard"/);
  assert.match(await readFile(new URL("dashboard.html", web), "utf8"), /Charts by <a href="https:\/\/www\.tradingview\.com\/"/, "TradingView attribution (Apache 2.0 notice)");
});

