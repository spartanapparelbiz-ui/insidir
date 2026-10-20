/* Insidir V32: the intelligence system on the landing page (Monitor → Process → Interpret → Notify).
   It reads nothing from the network: the records and outputs are in the HTML, and without this script (or with
   reduced motion) the system is shown at rest with every stage lit. With it, the section steps through the four
   stages, holding on Notify, only while it is on screen and the tab is visible. */
(() => {
  "use strict";
  const root = document.querySelector("[data-system]");
  if (!root) return;
  const reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const HOLD = [1900, 2100, 2100, 4200]; // ms on each stage; Notify holds longest
  let stage = 0, timer = 0, onScreen = false;

  function step() {
    clearTimeout(timer);
    if (reduced.matches || !onScreen || document.hidden) return;
    stage = stage % 4 + 1;
    root.setAttribute("data-stage", String(stage));
    timer = setTimeout(step, HOLD[stage - 1]);
  }
  function start() {
    if (reduced.matches) { root.classList.remove("sx-live"); root.removeAttribute("data-stage"); return; }
    root.classList.add("sx-live");
    if (!timer) { stage = 0; step(); }
  }
  function pause() { clearTimeout(timer); timer = 0; }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      onScreen = entries.some(e => e.isIntersecting);
      onScreen ? start() : pause();
    }, { threshold: 0.3 }).observe(root);
  }
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : onScreen && start()));
  if (reduced.addEventListener) reduced.addEventListener("change", () => (reduced.matches ? (pause(), start()) : onScreen && start()));
})();
