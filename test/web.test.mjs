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
    assert.match(signup,/No brokerage connection or portfolio setup required/);
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
    assert.match(html,/assets\/css\/brief.css/);
    assert.match(html,/assets\/js\/brief.js/);
    assert.match(html,/id="brief-transactions"/);
    assert.match(html,/id="brief-filings"/);
    assert.doesNotMatch(html,/Jan 8, 2024|Markets open|S&P 500|sample data/i);
    const script=await fetch(base+"/assets/js/brief.js");
    assert.equal(script.status,200);
    const js=await script.text();
    assert.match(js,/\/v1\/transactions\?limit=50/);
    assert.match(js,/\/v1\/filings\?limit=10/);
  });
});
test("sign-in only offers implemented methods, landing retains original visuals",async()=>{
  await withServer(async base => {
    for(const path of ["/signup.html","/signin.html"]){
      const html=await (await fetch(base+path)).text();
      assert.match(html,/data-auth-form/);
      assert.doesNotMatch(html,/Continue with Google|data-auth-toast=/);
    }
    const html=await (await fetch(base+"/index.html")).text();
    assert.match(html,/assets\/img\/hero.jpg/);
    const effect=await (await fetch(base+"/assets/js/v2-landing.js")).text();
    assert.match(effect,/lv-menu-button/);
  });
});

test("V2 site provides working navigation and public research entry points",async()=>{
  await withServer(async base=>{
    const pages=["/","/dashboard.html","/signin.html","/signup.html","/research.html",
      "/company.html","/explore.html","/filings.html","/filing.html","/watchlist.html",
      "/portfolio.html","/alerts.html","/pricing.html","/billing.html","/terms.html","/privacy.html"];
    for(const url of pages){
      const r=await fetch(base+url);
      assert.equal(r.status,200,url);
      assert.match(await r.text(),/insidir[.]/i,url);
    }
    const nav=await(await fetch(base+"/assets/js/app.js")).text();
    for(const p of ["dashboard.html","research.html","explore.html","filings.html","watchlist.html","portfolio.html"])assert.ok(nav.includes(p),p);
    const homepage=await(await fetch(base+"/")).text();
    assert.match(homepage,/v2-landing.css/);
    assert.match(homepage,/assets\/img\/hero.jpg/);
    assert.doesNotMatch(homepage,/Markets open|invented returns|automatic trades now/i);
    const dashboard=await(await fetch(base+"/dashboard.html")).text();
    assert.match(dashboard,/v2-dashboard.css/);
    assert.match(dashboard,/id="brief-transactions"/);
    const company=await(await fetch(base+"/company.html")).text();
    assert.match(company,/v2-company.js/);
    const collections=await(await fetch(base+"/assets/js/v2-collections.js")).text();
    assert.match(collections,/\/v1\/companies/);
    assert.match(collections,/\/v1\/filings/);
    assert.match(collections,/\/v1\/me\/watchlist/);
  });
});

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
