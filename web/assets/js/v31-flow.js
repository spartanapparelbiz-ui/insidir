/* Insidir V31: the follow → investigate workflow on the landing page.
   Seven tabs over seven panels. It reads nothing from the network: every panel's content is in the HTML, so
   without this script all seven steps are simply shown in order. With it, one step shows at a time, the arrow keys,
   Home and End move between steps, and the steps advance by themselves only while the section is on screen, the
   tab is visible and the visitor has not asked for reduced motion. Any click, key or focus inside stops that for
   good; the play button starts it again. */
(() => {
  "use strict";
  const root = document.querySelector("[data-flow]");
  if (!root) return;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(t => document.getElementById(t.getAttribute("aria-controls")));
  if (!tabs.length || panels.some(p => !p)) return;
  const toggle = root.querySelector("[data-flow-toggle]");
  const reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const STEP_MS = 6500;
  let index = Math.max(0, tabs.findIndex(t => t.getAttribute("aria-selected") === "true"));
  let timer = 0, onScreen = false, stopped = reduced.matches;

  root.style.setProperty("--ax-step", STEP_MS + "ms");
  function select(i, { focus = false, user = false } = {}) {
    index = (i + tabs.length) % tabs.length;
    tabs.forEach((t, n) => {
      const on = n === index;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle("is-done", n < index);
      panels[n].hidden = !on;
    });
    if (focus) tabs[index].focus();
    // Keep the selected step in view on the scrolling phone rail without moving the page.
    const rail = tabs[index].closest("ol");
    if (rail && rail.scrollWidth > rail.clientWidth) {
      const li = tabs[index].parentElement;
      rail.scrollTo({ left: li.offsetLeft - (rail.clientWidth - li.offsetWidth) / 2, behavior: reduced.matches ? "auto" : "smooth" });
    }
    if (user) stop();
    else restart();
  }
  function playing() { return !stopped && onScreen && !document.hidden; }
  function restart() {
    clearTimeout(timer);
    root.classList.remove("is-playing");
    if (!playing()) return;
    void root.offsetWidth; // restart the progress hairline from zero
    root.classList.add("is-playing");
    timer = setTimeout(() => select(index + 1), STEP_MS);
  }
  function stop() {
    stopped = true;
    restart();
    if (toggle) { toggle.textContent = "Play the steps"; toggle.setAttribute("aria-pressed", "false"); }
  }
  function play() {
    stopped = false;
    if (toggle) { toggle.textContent = "Pause"; toggle.setAttribute("aria-pressed", "true"); }
    restart();
  }

  tabs.forEach((t, n) => {
    t.addEventListener("click", () => select(n, { user: true }));
    t.addEventListener("keydown", e => {
      const keys = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      select(keys[e.key], { focus: true, user: true });
    });
  });
  panels.forEach(p => p.addEventListener("focusin", () => { if (!stopped) stop(); }));
  if (toggle) {
    toggle.hidden = reduced.matches;
    toggle.addEventListener("click", () => (stopped ? play() : stop()));
    if (!stopped) { toggle.textContent = "Pause"; toggle.setAttribute("aria-pressed", "true"); }
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => { onScreen = entries.some(e => e.isIntersecting); restart(); }, { threshold: 0.35 }).observe(root);
  }
  document.addEventListener("visibilitychange", restart);
  if (reduced.addEventListener) reduced.addEventListener("change", () => { if (reduced.matches) stop(); if (toggle) toggle.hidden = reduced.matches; });

  root.classList.add("is-ready");
  select(index);
})();
