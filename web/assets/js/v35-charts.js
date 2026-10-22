/* Insidir V35 landing charts: the readout on the price chart (index.html, "Real records. Charted.").
   The chart itself is static SVG written by scripts/build-demo-chart.mjs; next to it sits the points it was drawn from
   (script.px-price__data: seconds after the first point, close). Moving the pointer over the plot, or the left and
   right arrow keys while it has focus, shows a crosshair on the nearest trading day and a tooltip with its date, close
   and change since the first day. Nothing else on the page moves; with no script the chart is still complete. */
(() => {
  "use strict";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const date = ms => { const d = new Date(ms); return MON[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear(); };
  function mount(plot) {
    const svg = plot.querySelector("svg"), raw = plot.querySelector("script.px-price__data"), tip = plot.querySelector(".px-tip");
    if (!svg || !raw || !tip) return;
    let f;
    try { f = JSON.parse(raw.textContent); } catch { return; }
    const pts = f.points, first = pts[0][1], pw = f.w - f.l - f.r, ph = f.h - f.t - f.b, span = (f.t1 - f.t0) / 1000;
    const X = s => f.l + s / span * pw, Y = v => f.t + (1 - (v - f.y0) / (f.y1 - f.y0)) * ph;
    const cross = svg.querySelector(".px-cross"), cx = svg.querySelector(".px-cross-x"), cy = svg.querySelector(".px-cross-y"), dot = svg.querySelector(".px-cross-dot");
    let at = -1;
    const show = i => {
      at = Math.max(0, Math.min(pts.length - 1, i));
      const [s, v] = pts[at], x = X(s), y = Y(v), ch = v - first, pct = ch / first * 100;
      cx.setAttribute("x1", x); cx.setAttribute("x2", x); cy.setAttribute("y1", y); cy.setAttribute("y2", y);
      dot.setAttribute("cx", x); dot.setAttribute("cy", y); cross.removeAttribute("hidden");
      const sign = ch >= 0 ? "▲ +" : "▼ −";
      tip.innerHTML = `<span>${date(f.t0 + s * 1000)}</span><b>$${v.toFixed(2)}</b><em class="${ch >= 0 ? "px-up" : "px-down"}">${sign}$${Math.abs(ch).toFixed(2)} (${Math.abs(pct).toFixed(1)}%) on the year</em>`;
      tip.hidden = false;
      // The tooltip sits beside the crosshair, flipped to the left in the right half so it never leaves the plot.
      const box = svg.getBoundingClientRect(), host = plot.getBoundingClientRect(), k = box.width / f.w;
      const px = box.left - host.left + x * k, py = box.top - host.top + y * k;
      tip.classList.toggle("is-left", x > f.w / 2);
      tip.style.left = px + "px"; tip.style.top = Math.max(8, Math.min(host.height - 72, py - 36)) + "px";
    };
    const hide = () => { cross.setAttribute("hidden", ""); tip.hidden = true; };
    const nearest = clientX => {
      const box = svg.getBoundingClientRect(), s = ((clientX - box.left) / box.width * f.w - f.l) / pw * span;
      let lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] < s) lo = m; else hi = m; }
      return s - pts[lo][0] < pts[hi][0] - s ? lo : hi;
    };
    plot.addEventListener("pointermove", e => show(nearest(e.clientX)));
    plot.addEventListener("pointerleave", () => { if (document.activeElement !== plot) hide(); });
    plot.addEventListener("focus", () => show(at < 0 ? pts.length - 1 : at));
    plot.addEventListener("blur", hide);
    plot.addEventListener("keydown", e => {
      const step = e.shiftKey ? 20 : 1;
      if (e.key === "ArrowLeft") show((at < 0 ? pts.length - 1 : at) - step);
      else if (e.key === "ArrowRight") show((at < 0 ? pts.length - 1 : at) + step);
      else if (e.key === "Home") show(0);
      else if (e.key === "End") show(pts.length - 1);
      else if (e.key === "Escape") hide();
      else return;
      e.preventDefault();
    });
  }
  const run = () => document.querySelectorAll(".px-plot").forEach(mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true }); else run();
})();
