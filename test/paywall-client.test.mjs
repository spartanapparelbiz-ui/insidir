/* The paywall in the browser: auth.js chooses where a person lands after logging in or creating
   an account, and app.js sends any product request answered 401 or 402 to the right page. Both
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

/* ---------- app.js: 401 → signin.html?next=, 402 → subscribe.html?next= ---------- */
async function appGate(pathname, search, url, status) {
  const { ctx, assigned } = sandbox(pathname, search, async () => reply(status, { error: "x" }));
  ctx.document = { readyState: "complete", querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, fonts: null };
  vm.createContext(ctx);
  vm.runInContext(await source("app.js"), ctx);
  const res = await ctx.fetch(url);
  assert.equal(res.status, status, "the response still reaches the page script");
  return assigned;
}

test("app.js sends a lapsed subscription to subscribe.html and an ended session to sign in, with next=", async () => {
  assert.deepEqual(await appGate("/company.html", "?ticker=AAPL", "/v1/intelligence?ticker=AAPL", 402), ["subscribe.html?next=company.html%3Fticker%3DAAPL"]);
  assert.deepEqual(await appGate("/dashboard", "", "/v1/transactions?limit=8", 402), ["subscribe.html?next=dashboard.html"]);
  assert.deepEqual(await appGate("/watchlist.html", "", "/v1/me/watchlist", 401), ["signin.html?next=watchlist.html"]);
  assert.deepEqual(await appGate("/research.html", "?ticker=MSFT", ORIGIN + "/v1/me", 401), ["signin.html?next=research.html%3Fticker%3DMSFT"]);
  assert.deepEqual(await appGate("/billing.html", "", "/v1/me", 401), ["signin.html?next=billing.html"], "account pages still need a session");
});

test("app.js leaves open routes, other origins and account pages' 402s alone", async () => {
  assert.deepEqual(await appGate("/billing.html", "", "/v1/search?q=AAP", 402), [], "billing exists to fix the subscription");
  assert.deepEqual(await appGate("/account.html", "", "/v1/me/watchlist", 402), []);
  assert.deepEqual(await appGate("/dashboard.html", "", "/v1/billing/status", 401), [], "billing routes are open");
  assert.deepEqual(await appGate("/dashboard.html", "", "/v1/auth/logout", 401), [], "auth routes are open");
  assert.deepEqual(await appGate("/dashboard.html", "", "https://example.com/v1/filings", 402), [], "other origins are not ours to gate");
  assert.deepEqual(await appGate("/dashboard.html", "", "/v1/filings?limit=5", 404), [], "the database-free preview answers 404 and stays put");
  assert.deepEqual(await appGate("/", "", "/v1/filings", 402), [], "public pages never redirect");
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
