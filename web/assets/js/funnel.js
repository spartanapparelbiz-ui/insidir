/* Insidir first-party funnel measurement (src/funnel.mjs has the full rules).
   Sends a few named events to insidir.com's own /v1/events and nowhere else: the page you are on, which trial button
   you pressed, a product example you opened. A random visitor id is kept in this browser's localStorage; nothing
   identifies you, and no search text, research question or ticker is ever sent. Browsers with Global Privacy
   Control or Do Not Track send nothing at all.
   Markup: data-cta="<where>" on a trial button, data-demo="<which>" on a product example, data-funnel-view="pricing"
   on the pricing section. Experiments are assigned before first paint by a short inline script that sets
   data-exp-<name> on <html>; this reports the exposure. */
(() => {
  "use strict";
  const optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";
  const KEY = "insidir:vid";
  let visitor;
  function id() {
    if (visitor !== undefined) return visitor;
    visitor = null;
    try {
      let v = localStorage.getItem(KEY);
      if (!/^[a-f0-9]{32}$/.test(v || "")) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        v = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(KEY, v);
      }
      visitor = v;
    } catch (e) { visitor = null; }
    return visitor;
  }
  function referrer() {
    try { const r = document.referrer && new URL(document.referrer); return r && r.host !== location.host ? r.origin + "/" : undefined; } catch (e) { return undefined; }
  }
  /* Fire and forget: a beacon survives the page being left (a trial button navigates away). */
  function send(event, extra) {
    if (optedOut) return;
    const v = id();
    if (!v) return;
    const body = JSON.stringify(Object.assign({ event, visitor: v, path: location.pathname, referrer: referrer() }, extra || {}));
    try { if (navigator.sendBeacon && navigator.sendBeacon("/v1/events", new Blob([body], { type: "application/json" }))) return; } catch (e) { /* fall through */ }
    try { fetch("/v1/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {}); } catch (e) { /* never break the page */ }
  }

  // Pages, by path.
  const path = location.pathname.replace(/\.html$/, "").replace(/\/$/, "/index");
  const page = path === "/index" || path === "/" ? "landing" : path.slice(1);
  // Only an allowlisted channel name is recorded; never a raw query or stock symbol.
  const campaign = (new URLSearchParams(location.search).get("utm_source") || "").toLowerCase();
  const socialSource = ["tiktok", "instagram", "facebook"].includes(campaign) ? campaign : null;
  if (page === "landing" || page === "check") send("landing_viewed", socialSource ? { label: socialSource } : undefined);
  // A public stock page (/NVDA): counted without the symbol.
  if (document.body && document.body.hasAttribute("data-funnel-stock")) send("ticker_viewed", { path: "/stock" });
  if (page === "pricing") send("pricing_viewed");
  if (page === "signup") send("signup_started");
  if (page === "subscribe" && /[?&]checkout=cancel\b/.test(location.search)) send("checkout_return_canceled");
  if (page === "company") send("research_opened");
  if (page === "intelligence") send("intelligence_opened");

  // Experiments assigned in <head> (data-exp-<name>="<arm>").
  for (const attr of document.documentElement.getAttributeNames()) {
    const m = /^data-exp-([a-z0-9_-]{1,24})$/.exec(attr), arm = document.documentElement.getAttribute(attr);
    if (m && /^[a-z0-9_-]{1,24}$/.test(arm || "")) send("experiment_exposed", { variant: m[1] + ":" + arm });
  }

  // Clicks on trial buttons and product examples (one listener for the page).
  document.addEventListener("click", e => {
    const el = e.target instanceof Element ? e.target.closest("[data-cta],[data-demo]") : null;
    if (!el) return;
    if (el.hasAttribute("data-cta")) send("cta_clicked", { label: el.getAttribute("data-cta") });
    else send("demo_opened", { label: el.getAttribute("data-demo") });
  }, { capture: true, passive: true });

  // The pricing section, once it is half on screen.
  const pricing = document.querySelector("[data-funnel-view='pricing']");
  if (pricing && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      if (entries.some(x => x.isIntersecting)) { send("pricing_viewed"); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(pricing);
  }

  window.InsidirFunnel = Object.freeze({ send, visitor: () => (optedOut ? null : id()), optedOut });
})();