/* Insidir V32 landing: the instrument (the dotted i in the hero) and the intelligence system (Monitor → Process →
   Interpret → Notify). Neither reads anything from the network: every layer, record and output is in the HTML.
   Without this script, or with reduced motion, both are shown at rest: the instrument on its first layer, the
   system with every stage lit. With it, each steps through its parts only while on screen and the tab is visible,
   and any click, key or focus hands control to the visitor for good. */
(() => {
  "use strict";
  const reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const watch = (el, onChange) => {
    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver(entries => onChange(entries.some(e => e.isIntersecting)), { threshold: 0.3 }).observe(el);
  };

  /* ---------- the instrument: one dot per layer ---------- */
  const inst = document.querySelector("[data-instrument]");
  if (inst) {
    const dots = [...inst.querySelectorAll("[data-layer]")];
    const panels = new Map([...inst.querySelectorAll("[data-layer-panel]")].map(p => [p.dataset.layerPanel, p]));
    // The order the cycle follows: records in at the serif, through the stem, out at the base, up to the briefing.
    const order = ["disclosures", "insiders", "relationships", "holdings", "watchlist", "briefings", "investigations", "notifications", "sources"];
    let current = "disclosures", timer = 0, visible = false, handed = false;
    const show = key => {
      current = key;
      for (const d of dots) {
        const on = d.dataset.layer === key;
        d.setAttribute("aria-pressed", on ? "true" : "false");
        d.classList.toggle("is-pass", !on && order.indexOf(d.dataset.layer) < order.indexOf(key));
      }
      for (const [k, p] of panels) p.hidden = k !== key;
    };
    const tick = () => {
      clearTimeout(timer);
      if (handed || reduced.matches || !visible || document.hidden) return;
      show(order[(order.indexOf(current) + 1) % order.length]);
      timer = setTimeout(tick, 2600);
    };
    const take = () => { handed = true; clearTimeout(timer); };
    for (const d of dots) {
      d.addEventListener("click", () => { take(); show(d.dataset.layer); });
      d.addEventListener("focus", take);
      d.addEventListener("mouseenter", () => { take(); show(d.dataset.layer); });
    }
    watch(inst, on => { visible = on; clearTimeout(timer); if (on) timer = setTimeout(tick, 2600); });
    document.addEventListener("visibilitychange", () => { clearTimeout(timer); if (!document.hidden && visible) timer = setTimeout(tick, 2600); });
    show(current);
  }

  /* ---------- the system: Monitor → Process → Interpret → Notify ---------- */
  const root = document.querySelector("[data-system]");
  if (root) {
    const HOLD = [1900, 2100, 2100, 4200]; // ms on each stage; Notify holds longest
    let stage = 0, timer = 0, onScreen = false, handed = false;
    const set = n => { stage = n; root.setAttribute("data-stage", String(n)); };
    const step = () => {
      clearTimeout(timer);
      if (handed || reduced.matches || !onScreen || document.hidden) return;
      set(stage % 4 + 1);
      timer = setTimeout(step, HOLD[stage - 1]);
    };
    const start = () => {
      if (reduced.matches && !handed) { root.classList.remove("sx-live"); root.removeAttribute("data-stage"); return; }
      root.classList.add("sx-live");
      if (!handed && !timer) { stage = 0; step(); }
    };
    const pause = () => { clearTimeout(timer); timer = 0; };
    for (const b of root.querySelectorAll("[data-stage-go]")) {
      b.addEventListener("click", () => { handed = true; pause(); root.classList.add("sx-live"); set(Number(b.dataset.stageGo)); });
    }
    watch(root, on => { onScreen = on; on ? start() : pause(); });
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : onScreen && start()));
    if (reduced.addEventListener) reduced.addEventListener("change", () => { pause(); if (onScreen) start(); });
  }
})();
