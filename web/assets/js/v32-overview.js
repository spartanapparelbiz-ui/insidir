/* Dashboard overview strip: four tiles that say what is waiting before the modules below. Each tile reads one
   existing route and shows only what that route returned:
     Briefing  GET /v1/me/intelligence/briefing?peek=1  stories marked New (peek keeps the Briefing's own New baseline)
     Alerts    GET /v1/me/notifications?limit=1          unread count, and whether this browser has push on
     Watching  the same briefing response                companies saved and people followed
     Data      GET /v1/status                            when the last import finished, and the newest filing date
   A route that fails leaves its tile as a plain link with "Not available right now", never a made-up number. */
(() => {
  "use strict";
  const root = document.getElementById("rd-desk");
  if (!root) return;
  const tile = key => {
    const el = root.querySelector(`[data-desk="${key}"]`);
    return {
      set(value, sub, state) {
        if (!el) return;
        el.querySelector("[data-v]").textContent = value;
        el.querySelector("[data-s]").textContent = sub;
        el.classList.remove("is-loading");
        if (state) el.dataset.state = state; else delete el.dataset.state;
      }
    };
  };
  const get = path => fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))));
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  const ago = iso => {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 36) return h + " h ago";
    return Math.round(h / 24) + " days ago";
  };
  const day = iso => {
    const d = new Date(String(iso).length === 10 ? iso + "T12:00:00Z" : iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  const unavailable = key => tile(key).set("—", "Not available right now", "off");

  const briefing = get("/v1/me/intelligence/briefing?peek=1").then(b => {
    const stories = Array.isArray(b.stories) ? b.stories : [];
    const fresh = stories.filter(s => s.isNew).length;
    const t = Number(b.subjects?.tickers) || 0, p = Number(b.subjects?.people) || 0;
    if (b.needsSetup || (!t && !p)) tile("briefing").set("Set up", "Save a company or follow a person to start it", "setup");
    else if (fresh) tile("briefing").set(String(fresh), plural(fresh, "new item", "new items") + " since your last visit", "new");
    else tile("briefing").set(String(stories.length), stories.length ? plural(stories.length, "item", "items") + " · nothing new since your last visit" : "Nothing filed this week for what you follow");
    tile("watch").set(String(t + p), (t || p) ? plural(t, "company", "companies") + " · " + plural(p, "person", "people") : "Nothing saved yet", (t || p) ? null : "setup");
  }).catch(() => { unavailable("briefing"); unavailable("watch"); });

  const alerts = get("/v1/me/notifications?limit=1").then(async n => {
    const unread = Number(n.unread) || 0;
    let push = "In the app";
    try {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg && (await reg.pushManager?.getSubscription())) push = "Push on in this browser";
    } catch {}
    tile("alerts").set(String(unread), (unread ? plural(unread, "unread alert", "unread alerts") : "No unread alerts") + " · " + push, unread ? "new" : null);
  }).catch(() => unavailable("alerts"));

  const data = get("/v1/status").then(s => {
    const run = s.lastIngest || null;
    const when = run ? (run.status === "running" ? null : run.finished_at || run.started_at) : s.lastIngestAt || null;
    const newest = day(s.latestFilingPublishedAt || s.latestFilingDate || "");
    if (run && run.status === "running") tile("data").set("Importing", "A check for new SEC filings is running" + (newest ? " · newest " + newest : ""), "live");
    else if (when && ago(when)) {
      const stale = Date.now() - Date.parse(when) > 36 * 3600000;
      tile("data").set(ago(when), "Last import" + (newest ? " · newest filing " + newest : ""), stale ? "stale" : "live");
    } else tile("data").set("—", "No import recorded yet", "off");
  }).catch(() => unavailable("data"));

  Promise.allSettled([briefing, alerts, data]).then(() => root.removeAttribute("aria-busy"));
})();
