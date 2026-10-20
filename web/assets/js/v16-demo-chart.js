/* Insidir platform page: the company-report diagram as a working report.
   The figures are a saved snapshot of a real report (Reddit, Inc., RDDT, at the close on October 16, 2026): delayed
   Yahoo Finance prices for all six ranges and figures from the company's SEC filings, embedded in the page as JSON
   (#mk-demo-data). Nothing is requested, nothing is live and nothing is generated. The range buttons redraw
   the chart and the pointer or the arrow keys read any point off it. The crosshair is drawn inside the chart;
   nothing on the page moves.
   render() also runs in Node (scripts/build-demo-chart.mjs) to write the no-script first paint into platform.html. */
(function (root) {
  "use strict";
  const TZ = "America/New_York";
  const RANGE_WORDS = { "1D": "today", "1W": "past week", "1M": "past month", "3M": "past 3 months", "1Y": "past year", "5Y": "since listing" };
  const INTRADAY = { "1D": true, "1W": true };
  const PAD = { l: 4, r: 54, t: 12, b: 26 };

  const fmt = (opts) => new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: TZ }, opts));
  const F = {
    time: fmt({ hour: "numeric", minute: "2-digit" }),
    day: fmt({ month: "short", day: "numeric" }),
    weekday: fmt({ weekday: "short", day: "numeric" }),
    month: fmt({ month: "short" }),
    monthYear: fmt({ month: "short", year: "numeric" }),
    year: fmt({ year: "numeric" }),
    full: fmt({ month: "short", day: "numeric", year: "numeric" }),
    fullTime: fmt({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  };
  const money = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (v, digits) => (v < 0 ? "−" : "+") + Math.abs(v).toFixed(digits);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function changeText(range, s) {
    const arrow = s.change < 0 ? "▼" : "▲";
    return arrow + " " + signed(s.change, 2) + " (" + signed(s.percent, 2) + "%) " + RANGE_WORDS[range];
  }

  function pointLabel(range, t) {
    return INTRADAY[range] ? F.fullTime.format(t) + " ET" : F.full.format(t);
  }

  // Round-number price ticks spanning [min, max].
  function ticks(min, max, count) {
    const span = max - min || Math.abs(max) || 1;
    const raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  // Up to five time labels, spread over the series (x is by trading index, so nights and weekends take no room).
  function timeLabels(range, pts) {
    const n = pts.length, want = 5, out = [];
    let last = "";
    for (let k = 0; k < want; k++) {
      const i = Math.round((k + 0.5) * (n - 1) / want);
      const t = pts[i][0];
      const label = range === "1D" ? F.time.format(t)
        : range === "1W" ? F.weekday.format(t)
        : range === "1M" || range === "3M" ? F.day.format(t)
        : range === "1Y" ? F.monthYear.format(t)
        : F.year.format(t);
      if (label !== last) out.push({ i, label });
      last = label;
    }
    return out;
  }

  function geometry(pts, w, h) {
    let min = Infinity, max = -Infinity;
    for (const p of pts) { if (p[1] < min) min = p[1]; if (p[1] > max) max = p[1]; }
    const pad = (max - min) * 0.08 || 1;
    const lo = min - pad, hi = max + pad;
    const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
    const x = (i) => PAD.l + (pts.length === 1 ? iw : (i / (pts.length - 1)) * iw);
    const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;
    return { x, y, lo, hi, iw, ih, min, max };
  }

  /** The chart for one range as SVG markup, `w` × `h` CSS pixels. */
  function render(range, s, w, h) {
    const pts = s.points, g = geometry(pts, w, h), dir = s.change < 0 ? "down" : "up";
    const line = pts.map((p, i) => (i ? "L" : "M") + g.x(i).toFixed(1) + " " + g.y(p[1]).toFixed(1)).join("");
    const base = (PAD.t + g.ih).toFixed(1);
    const area = line + "L" + g.x(pts.length - 1).toFixed(1) + " " + base + "L" + g.x(0).toFixed(1) + " " + base + "Z";
    let grid = "";
    for (const v of ticks(g.lo, g.hi, 4)) {
      const yy = g.y(v).toFixed(1);
      grid += '<line class="mk-demo__grid" x1="' + PAD.l + '" x2="' + (w - PAD.r + 6) + '" y1="' + yy + '" y2="' + yy + '"/>' +
        '<text class="mk-demo__ylab" x="' + (w - PAD.r + 12) + '" y="' + yy + '" dy="0.35em">' + (v >= 1000 ? v.toLocaleString("en-US") : v % 1 ? v.toFixed(1) : v) + "</text>";
    }
    let xl = "";
    for (const l of timeLabels(range, pts)) xl += '<text class="mk-demo__xlab" x="' + g.x(l.i).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle">' + esc(l.label) + "</text>";
    let ref = "";
    if (range === "1D" && Number.isFinite(s.previousClose)) {
      const yy = g.y(Math.min(Math.max(s.previousClose, g.lo), g.hi)).toFixed(1);
      ref = '<line class="mk-demo__ref" x1="' + PAD.l + '" x2="' + (w - PAD.r) + '" y1="' + yy + '" y2="' + yy + '"/>';
    }
    const end = pts.length - 1;
    return '<svg class="mk-demo__svg mk-demo__svg--' + dir + '" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="mk-demo-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0eee8" stop-opacity=".14"/><stop offset="1" stop-color="#f0eee8" stop-opacity="0"/></linearGradient></defs>' +
      grid + ref + '<path class="mk-demo__area" d="' + area + '" fill="url(#mk-demo-fill)"/>' +
      '<path class="mk-demo__line" d="' + line + '"/>' +
      '<circle class="mk-demo__end" cx="' + g.x(end).toFixed(1) + '" cy="' + g.y(pts[end][1]).toFixed(1) + '" r="3.5"/>' + xl +
      '<g class="mk-demo__cross" visibility="hidden"><line class="mk-demo__cross-line" x1="0" x2="0" y1="' + PAD.t + '" y2="' + base + '"/><circle class="mk-demo__cross-dot" r="4.5"/></g>' +
      "</svg>";
  }

  function mount(el, data) {
    const plot = el.querySelector("[data-demo-plot]"), tip = el.querySelector("[data-demo-tip]");
    const live = el.querySelector("[data-demo-live]"), changeEl = el.querySelector("[data-demo-change]");
    const buttons = [...el.querySelectorAll("[data-demo-range]")];
    let range = (buttons.find((b) => b.getAttribute("aria-pressed") === "true") || buttons[0]).dataset.demoRange;
    let cursor = -1, size = { w: 0, h: 0 };

    const series = () => data.ranges[range];
    function draw() {
      const w = Math.round(plot.clientWidth), h = Math.round(plot.clientHeight);
      if (!w || !h) return;
      size = { w, h };
      plot.querySelector("svg")?.remove();
      plot.insertAdjacentHTML("afterbegin", render(range, series(), w, h));
      const s = series();
      changeEl.textContent = changeText(range, s);
      changeEl.classList.toggle("is-down", s.change < 0);
      changeEl.classList.toggle("is-up", s.change >= 0);
      if (cursor >= 0) show(Math.min(cursor, s.points.length - 1), false);
    }
    function show(i, announce) {
      const s = series(), p = s.points[i], g = geometry(s.points, size.w, size.h);
      const cross = plot.querySelector(".mk-demo__cross");
      if (!p || !cross) return;
      cursor = i;
      const cx = g.x(i), cy = g.y(p[1]);
      cross.setAttribute("visibility", "visible");
      cross.querySelector("line").setAttribute("x1", cx); cross.querySelector("line").setAttribute("x2", cx);
      cross.querySelector("circle").setAttribute("cx", cx); cross.querySelector("circle").setAttribute("cy", cy);
      tip.innerHTML = "<b>" + money(p[1]) + "</b><span>" + esc(pointLabel(range, p[0])) + "</span>";
      tip.hidden = false;
      // Beside the point: above it, or below when the point is near the top; right of it, or left near the edge.
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = (cx + 14 + tw <= size.w - PAD.r ? cx + 14 : Math.max(0, cx - 14 - tw)) + "px";
      tip.style.top = (cy - 12 - th >= 0 ? cy - 12 - th : Math.min(cy + 12, size.h - th)) + "px";
      if (announce) live.textContent = pointLabel(range, p[0]) + ": " + money(p[1]);
    }
    function hide() {
      cursor = -1;
      plot.querySelector(".mk-demo__cross")?.setAttribute("visibility", "hidden");
      tip.hidden = true;
    }
    function indexAt(clientX) {
      const r = plot.getBoundingClientRect(), n = series().points.length;
      const iw = size.w - PAD.l - PAD.r;
      return Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left - PAD.l) / iw) * (n - 1))));
    }

    plot.addEventListener("pointermove", (e) => show(indexAt(e.clientX), false));
    plot.addEventListener("pointerleave", hide);
    plot.addEventListener("blur", hide);
    plot.addEventListener("keydown", (e) => {
      const n = series().points.length;
      const step = e.shiftKey ? Math.max(1, Math.round(n / 10)) : 1;
      let i = cursor < 0 ? n - 1 : cursor;
      if (e.key === "ArrowLeft") i -= step;
      else if (e.key === "ArrowRight") i += step;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Escape") { hide(); return; }
      else return;
      e.preventDefault();
      show(Math.max(0, Math.min(n - 1, i)), true);
    });
    for (const b of buttons) b.addEventListener("click", () => {
      if (b.dataset.demoRange === range) return;
      range = b.dataset.demoRange;
      for (const o of buttons) o.setAttribute("aria-pressed", String(o === b));
      hide();
      draw();
      live.textContent = range + " chart: " + changeText(range, series());
    });
    if (typeof ResizeObserver === "function") new ResizeObserver(() => draw()).observe(plot);
    else root.addEventListener("resize", draw);
    draw();
  }

  function boot() {
    const src = document.getElementById("mk-demo-data");
    if (!src) return;
    let data;
    try { data = JSON.parse(src.textContent); } catch { return; }
    for (const el of document.querySelectorAll("[data-demo-chart]")) mount(el, data);
  }

  const api = { render, changeText, pointLabel, ticks, timeLabels };
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.InsidirDemoChart = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
