/* The paywall in the browser: auth.js chooses where a person lands after logging in or creating
   an account, and ui.js's api() sends any product request answered 401 or 402 to the right page. Both
   scripts run here in a bare VM with a minimal fake DOM, so the rules are checked without a browser. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const ORIGIN = "https://insidir.test";
const source = name => readFile(new URL("../web/assets/js/" + name, import.meta.url), "utf8");
const classList = () => { const set = new Set(); return { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), toggle: (c, on) => (on ?? !set.has(c)) ? set.add(c) : set.delete(c), contains: c => set.has(c) }; };
const element = (props = {}) => ({ hidden: false, textContent: "", dataset: {}, classList: classList(), attrs: {}, listeners: {},
  setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
  addEventListener(type, fn) { this.listeners[type] = fn; }, focus() {}, closest() { return null; }, querySelector() { return null; }, ...props });

function sandbox(pathname, search, fetchImpl) {
  const assigned = [];
  const location = { pathname, search, origin: ORIGIN, href: ORIGIN + pathname + search, assign: url => assigned.push(url) };
  const ctx = {
    location, URL, URLSearchParams, console, Object, Promise,
    setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
    navigator: { platform: "Linux", userAgent: "node" },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    requestAnimationFrame: () => 0,
    fetch: fetchImpl
  };
  ctx.window = ctx;
  return { ctx, assigned };
}
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => "application/json" }, json: async () => body });

/* ---------- ui.js api(): 401 → /signin.html?next=, 402 → /subscribe.html?next= ----------
   Every app page asks the engine through InsidirUI.api(); the function runs here on its own, with a fake location. */
async function uiGate(pathname, search, url, status, body = { error: "x" }) {
  const assigned = [];
  const location = { pathname, search, origin: ORIGIN, get href() { return ORIGIN + pathname + search; }, set href(v) { assigned.push(v); } };
  const ui = await source("ui.js");
  const fn = /async function api\(path[\s\S]*?\n\}\n/.exec(ui)?.[0];
  assert.ok(fn, "ui.js defines api()");
  const ctx = { location, Object, Error, JSON, encodeURIComponent, fetch: async () => reply(status, body) };
  vm.createContext(ctx);
  vm.runInContext(fn + "\nglobalThis.api = api;", ctx);
  let error = null, data = null;
  try { data = await ctx.api(url); } catch (e) { error = e; }
  return { assigned, error, data };
}

test("ui.js sends a lapsed subscription to subscribe and an ended session to sign in, with next=", async () => {
  let r = await uiGate("/company.html", "?ticker=AAPL", "/v1/chart?ticker=AAPL", 402);
  assert.deepEqual(r.assigned, ["/subscribe.html?next=company.html%3Fticker%3DAAPL"]); assert.equal(r.error.status, 402, "the page script still sees the refusal");
  r = await uiGate("/watchlist.html", "", "/v1/me/watchlist", 401);
  assert.deepEqual(r.assigned, ["/signin.html?next=watchlist.html"]); assert.equal(r.error.status, 401);
  r = await uiGate("/dashboard.html", "", "/v1/me/today", 402);
  assert.deepEqual(r.assigned, ["/subscribe.html?next=dashboard.html"]);
});

test("ui.js sends a reader of an insider's page back to that page after sign-in or subscribing", async () => {
  assert.deepEqual((await uiGate("/person.html", "?cik=1214156", "/v1/people/1214156?limit=500", 401)).assigned, ["/signin.html?next=person.html%3Fcik%3D1214156"]);
  assert.deepEqual((await uiGate("/person.html", "?cik=1214156", "/v1/people/1214156?limit=500", 402)).assigned, ["/subscribe.html?next=person.html%3Fcik%3D1214156"]);
});

test("ui.js stays put on other answers, and account pages never meet a 402", async () => {
  const ok = await uiGate("/dashboard.html", "", "/v1/me/today", 200, { items: [] });
  assert.deepEqual([ok.assigned, ok.data], [[], { items: [] }]);
  const missing = await uiGate("/dashboard.html", "", "/v1/filings?limit=5", 404, { error: "Not found" });
  assert.deepEqual([missing.assigned, missing.error.status, missing.error.message], [[], 404, "Not found"], "the database-free preview answers 404 and stays put");
  // Account and billing pages call only routes the paywall leaves open to a lapsed member, so ui.js never sends them away.
  const { classifyApi } = await import("../src/paywall.mjs");
  const acct = await source("account-app.js");
  for (const [, path, method] of acct.matchAll(/req\("([^"?]+)[^"]*"(?:,\s*"([A-Z]+)")?/g)) assert.notEqual(classifyApi(path, method || "GET"), "product", path);
  for (const f of ["billing-app.js", "subscribe-app.js"]) assert.doesNotMatch(await source(f), /UI\.api\(/, f + " handles every answer itself");
});

/* ---------- auth.js: where a person lands ---------- */
async function authSubmit({ mode, search = "", me, auth = reply(mode === "register" ? 201 : 200, { user: { email: "a@b.co" } }) }) {
  const calls = [];
  const { ctx, assigned } = sandbox(mode === "register" ? "/signup.html" : "/signin.html", search, async (path, init = {}) => {
    calls.push((init.method || "GET") + " " + path);
    if (path === "/v1/me") return me || reply(401, { error: "Sign in required" });
    return auth;
  });
  const field = element({ querySelector: () => element() });
  const input = value => element({ value, closest: () => field });
  const inputs = { email: input("reader@example.com"), password: input("a-long-enough-password") };
  const label = element({ textContent: "Go" });
  const button = element({ querySelector: () => label });
  const form = element({ dataset: { authForm: mode }, elements: { namedItem: n => inputs[n] || null },
    querySelector: sel => sel.startsWith("button") ? button : sel === ".form-alert" ? element({ offsetWidth: 1 }) : sel === ".field__hint" ? null : element() });
  ctx.document = { body: { classList: classList() }, querySelectorAll: sel => sel === "form[data-auth-form]" ? [form] : [], querySelector: () => null };
  vm.createContext(ctx);
  vm.runInContext(await source("auth.js"), ctx);
  await form.listeners.submit({ preventDefault() {} });
  return { assigned, calls };
}
const active = reply(200, { user: { email: "a@b.co" }, access: { active: true } });
const inactive = reply(200, { user: { email: "a@b.co" }, access: { active: false } });

test("auth.js: new accounts continue to the subscription step, keeping a valid next=", async () => {
  assert.deepEqual((await authSubmit({ mode: "register" })).assigned, ["subscribe.html"]);
  assert.deepEqual((await authSubmit({ mode: "register", search: "?next=%2Fcompany.html%3Fticker%3DNVDA" })).assigned, ["subscribe.html?next=company.html%3Fticker%3DNVDA"]);
});

test("auth.js: logging in checks /v1/me and lands on the dashboard, next= or the paywall", async () => {
  const withAccess = await authSubmit({ mode: "login", me: active });
  assert.deepEqual(withAccess.assigned, ["dashboard.html"]);
  assert.ok(withAccess.calls.includes("GET /v1/me"), "access is checked before choosing a destination");
  assert.deepEqual((await authSubmit({ mode: "login", me: active, search: "?next=%2Fresearch%3Fticker%3DAAPL" })).assigned, ["research.html?ticker=AAPL"]);
  assert.deepEqual((await authSubmit({ mode: "login", me: inactive })).assigned, ["subscribe.html"]);
  assert.deepEqual((await authSubmit({ mode: "login", me: inactive, search: "?next=%2Fwatchlist.html" })).assigned, ["subscribe.html?next=watchlist.html"]);
});

test("auth.js: next= to a personnel file is honoured after logging in, and kept through the paywall", async () => {
  const next = "?next=" + encodeURIComponent("/person.html?cik=1214156");
  assert.deepEqual((await authSubmit({ mode: "login", me: active, search: next })).assigned, ["person.html?cik=1214156"]);
  assert.deepEqual((await authSubmit({ mode: "login", me: active, search: "?next=" + encodeURIComponent("person.html?cik=1214156") })).assigned, ["person.html?cik=1214156"], "the relative form next= carries");
  assert.deepEqual((await authSubmit({ mode: "login", me: inactive, search: next })).assigned, ["subscribe.html?next=person.html%3Fcik%3D1214156"]);
  assert.deepEqual((await authSubmit({ mode: "register", search: next })).assigned, ["subscribe.html?next=person.html%3Fcik%3D1214156"]);
});

test("auth.js: account pages need a login but no subscription, so next= to them skips the paywall", async () => {
  assert.deepEqual((await authSubmit({ mode: "login", me: inactive, search: "?next=%2Fbilling.html" })).assigned, ["billing.html"]);
  assert.deepEqual((await authSubmit({ mode: "login", me: inactive, search: "?next=%2Faccount" })).assigned, ["account.html"]);
  assert.deepEqual((await authSubmit({ mode: "login", me: inactive, search: "?next=%2Fsubscribe.html" })).assigned, ["subscribe.html"]);
  assert.deepEqual((await authSubmit({ mode: "register", search: "?next=%2Fbilling.html" })).assigned, ["subscribe.html"]);
});

test("auth.js: next= only ever names a known page on this site", async () => {
  for (const bad of ["https://evil.example/dashboard.html", "//evil.example/dashboard.html", "/\\evil.example/x", "\\\\evil.example", "javascript:alert(1)", "data:text/html,x", "/admin.html", "/index.html", "/dashboard.html/../../etc", " /dashboard.html", "/dashboard.html\n"]) {
    assert.deepEqual((await authSubmit({ mode: "login", me: active, search: "?next=" + encodeURIComponent(bad) })).assigned, ["dashboard.html"], bad);
    assert.deepEqual((await authSubmit({ mode: "register", search: "?next=" + encodeURIComponent(bad) })).assigned, ["subscribe.html"], bad);
  }
});

test("auth.js: a failed login stays on the page", async () => {
  const failed = await authSubmit({ mode: "login", auth: reply(401, { error: "Invalid email or password" }) });
  assert.deepEqual(failed.assigned, []);
  assert.ok(!failed.calls.includes("GET /v1/me"));
});

/* ---------- subscribe-app.js: the subscription step names where the reader is going and continues there ---------- */
async function subscribePage(search, me) {
  const calls = [];
  const { ctx, assigned } = sandbox("/subscribe.html", search, async (path, init = {}) => { calls.push((init.method || "GET") + " " + path); return path === "/v1/me" ? me : reply(200, {}); });
  const els = new Map();
  const el = sel => { if (!els.has(sel)) els.set(sel, element()); return els.get(sel); };
  ctx.document = { body: { dataset: {}, classList: classList() }, title: "", querySelector: el, querySelectorAll: () => [] };
  ctx.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.createContext(ctx);
  vm.runInContext(await source("subscribe-app.js"), ctx);
  for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
  return { el, calls, assigned, body: ctx.document.body };
}

test("subscribe-app.js: next= to an insider's page is named, and an active member continues to it", async () => {
  const search = "?next=" + encodeURIComponent("person.html?cik=1214156");
  const done = await subscribePage(search, active);
  assert.equal(done.body.dataset.pwState, "active");
  assert.equal(done.el('[data-pw-notice="next"]').textContent, "Subscribe to continue to the insider's page.");
  assert.equal(done.el('[data-pw-notice="next"]').hidden, false);
  assert.equal(done.el("[data-pw-continue]").getAttribute("href"), "person.html?cik=1214156");
  assert.equal(done.el("[data-pw-continue]").textContent, "Continue to the insider's page");
  const ready = await subscribePage(search, reply(200, { user: { email: "a@b.co" }, access: { active: false, billingEnabled: true } }));
  assert.equal(ready.body.dataset.pwState, "ready", "a member without access is offered the plan, with the file still named");
  assert.equal(ready.el('[data-pw-notice="next"]').textContent, "Subscribe to continue to the insider's page.");
  const other = await subscribePage("?next=" + encodeURIComponent("https://evil.example/person.html?cik=1"), active);
  assert.equal(other.el("[data-pw-continue]").getAttribute("href"), "dashboard.html", "only a page on this site is honoured");
});
