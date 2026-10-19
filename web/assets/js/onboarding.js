/* A new member's first steps on the overview (dashboard.html #rd-start): follow or save something, see its records,
   open the briefing, ask Intelligence a question. Optional and never blocking: "Skip for now" hides it for good, and
   it is only shown to an account that has just subscribed (billing.js sets localStorage "insidir:onboard" to "new").
   Steps are ticked from what the page already loaded (InsidirDesk, v3-dashboard.js), from a follow or save made here,
   and from the Intelligence page (intelligence.js sets "insidir:onboard:briefing" and ":investigate"). */
(() => {
  "use strict";
  const panel = document.getElementById("rd-start");
  if (!panel || panel.hidden) return;
  const KEY = "insidir:onboard";
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const status = panel.querySelector("[data-start-status]");
  const track = label => window.InsidirFunnel && window.InsidirFunnel.send("onboarding_step", { label });
  const state = { follow: false, briefing: store.get(KEY + ":briefing") === "1", investigate: store.get(KEY + ":investigate") === "1" };

  function paint() {
    const done = { follow: state.follow, records: state.follow, briefing: state.briefing, investigate: state.investigate };
    for (const li of panel.querySelectorAll("[data-step]")) {
      const ok = !!done[li.dataset.step];
      li.classList.toggle("is-done", ok);
      li.setAttribute("aria-label", (ok ? "Done: " : "To do: ") + li.querySelector("b").textContent);
    }
    const left = Object.values(done).filter(x => !x).length;
    status.textContent = left ? left + " of 4 left. Everything here stays available from the navigation." : "You're set up. This panel won't show again.";
    if (!left) store.set(KEY, "done");
  }

  // What the overview already knows: anyone followed, anything saved.
  const D = window.InsidirDesk;
  if (D && D.watch) D.watch(["updates", "watchlist"], r => {
    const following = r.updates && r.updates.ok ? Number(r.updates.value.following || (r.updates.value.people || []).length) : 0;
    const saved = r.watchlist && r.watchlist.ok ? (r.watchlist.value || []).length : 0;
    if (following + saved > 0) state.follow = true;
    paint();
  });
  paint();

  // A follow or a save made on this page: confirmed with the engine a moment later (the click alone is not proof).
  let checking = 0;
  document.addEventListener("click", e => {
    if (state.follow || !(e.target instanceof Element) || !e.target.closest("button[data-follow],button[data-save]")) return;
    clearTimeout(checking);
    checking = setTimeout(async () => {
      try {
        const [p, w] = await Promise.all(["/v1/me/people", "/v1/me/watchlist"].map(u => fetch(u, { credentials: "same-origin", headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : { items: [] })));
        if ((p.items || []).length + (w.items || []).length > 0) { state.follow = true; track("follow"); paint(); }
      } catch (err) { /* the step stays open; nothing else depends on it */ }
    }, 900);
  });

  panel.addEventListener("click", e => {
    const link = e.target instanceof Element ? e.target.closest("[data-onboard]") : null;
    if (link) track(link.dataset.onboard);
  });
  panel.querySelector("[data-start-skip]").addEventListener("click", () => {
    store.set(KEY, "skipped");
    track("dismiss");
    panel.hidden = true;
    const h = document.getElementById("rd-heading");
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  });
})();
