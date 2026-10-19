/* Shared drawing for Insidir Intelligence (window.InsidirViz): vector only, grayscale only, from the data given.
   connect(overlay, host, links)  thin orthogonal "drafting" lines from points (dots, nodes) to rows or nodes
   strip(events, opts)            a time axis with one tick per real event; the selected tick is ringed
   treemap(items, w, h)           squarified treemap rectangles for allocation weights (sum of values = area)
   bars(values, opts)             small bar strip (e.g. filings per month)
   Nothing here invents a point: an empty input draws an empty frame. */
(() => {
  "use strict";
  if (window.InsidirViz) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const r1 = n => Math.round(n * 10) / 10;

  /* links: [{ from: Element, to: Element, side: "left"|"right", key, active, exit, lane, gx }]. Lines leave the point
     horizontally (or, with exit "up"/"down", vertically by `lane` px first, to clear neighbouring points), turn once
     at gx (default: part-way across the gutter), and meet the target at its near edge. */
  function connect(overlay, host, links) {
    if (!overlay || !host) return;
    const box = host.getBoundingClientRect();
    overlay.setAttribute("viewBox", "0 0 " + r1(box.width) + " " + r1(box.height));
    overlay.setAttribute("width", r1(box.width)); overlay.setAttribute("height", r1(box.height));
    const parts = [];
    for (const l of links) {
      if (!l.from || !l.to || !l.from.getBoundingClientRect || !l.to.getBoundingClientRect) continue;
      const a = l.from.getBoundingClientRect(), b = l.to.getBoundingClientRect();
      if (!a.width || !b.width) continue;
      const left = l.side === "left", cx = a.left + a.width / 2 - box.left, cy = a.top + a.height / 2 - box.top;
      const bx = (left ? b.right + 10 : b.left - 10) - box.left, by = b.top + Math.min(b.height / 2, 22) - box.top;
      const edge = left ? a.left - box.left : a.right - box.left;
      const gx = r1(Number.isFinite(l.gx) ? l.gx : edge + (bx - edge) * 0.42);
      let d, len;
      if (l.exit === "up" || l.exit === "down") {
        const ey = (l.exit === "up" ? a.top : a.bottom) - box.top, ly = ey + (l.exit === "up" ? -1 : 1) * (l.lane || 12);
        d = "M" + r1(cx) + " " + r1(ey) + " V" + r1(ly) + " H" + gx + " V" + r1(by) + " H" + r1(bx);
        len = Math.abs(ly - ey) + Math.abs(cx - gx) + Math.abs(ly - by) + Math.abs(gx - bx);
      } else {
        d = "M" + r1(edge) + " " + r1(cy) + " H" + gx + " V" + r1(by) + " H" + r1(bx);
        len = Math.abs(edge - gx) + Math.abs(cy - by) + Math.abs(gx - bx);
      }
      parts.push('<path class="iv-link' + (l.active ? " is-active" : "") + '" data-link="' + esc(l.key) + '" d="' + d + '" pathLength="1" style="--len:' + r1(len) + '"/>' +
        '<circle class="iv-end' + (l.active ? " is-active" : "") + '" data-link="' + esc(l.key) + '" cx="' + r1(bx) + '" cy="' + r1(by) + '" r="2.2"/>');
    }
    overlay.innerHTML = parts.join("");
  }

  /* events: [{ id, t (ms), strong (bool) }]; opts: { from, to, selected, width, height, labels } */
  function strip(events, { from, to, selected = null, width = 1000, height = 46, ticks = 6, label = "Timeline of the events listed below" } = {}) {
    const span = Math.max(1, to - from), x = t => 8 + (width - 16) * (t - from) / span;
    let axis = '<line class="iv-axis" x1="8" x2="' + (width - 8) + '" y1="' + (height - 14) + '" y2="' + (height - 14) + '"/>';
    for (let i = 0; i <= ticks; i++) {
      const t = from + span * i / ticks, xx = r1(x(t));
      const d = new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      axis += '<line class="iv-grid" x1="' + xx + '" x2="' + xx + '" y1="4" y2="' + (height - 14) + '"/><text class="iv-label" x="' + xx + '" y="' + (height - 2) + '" text-anchor="' + (i === 0 ? "start" : i === ticks ? "end" : "middle") + '">' + esc(d) + "</text>";
    }
    const marks = events.filter(e => e.t >= from && e.t <= to).map(e => {
      const xx = r1(x(e.t)), sel = e.id === selected;
      return '<g class="iv-tick' + (e.strong ? " is-strong" : "") + (sel ? " is-selected" : "") + '" data-event="' + esc(e.id) + '"><line x1="' + xx + '" x2="' + xx + '" y1="' + (e.strong ? 6 : 14) + '" y2="' + (height - 14) + '"/>' +
        (sel ? '<circle cx="' + xx + '" cy="' + (e.strong ? 6 : 14) + '" r="4.5"/>' : "") + "</g>";
    }).join("");
    return '<svg class="iv-strip" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + esc(label) + '">' + axis + marks + "</svg>";
  }

  /* Squarified treemap (Bruls, Huizing, van Wijk). items: [{ key, value, ... }] with value > 0. Returns
     [{ item, x, y, w, h }] covering w × h exactly. */
  function treemap(items, W, H) {
    const list = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
    const total = list.reduce((s, i) => s + i.value, 0);
    if (!total) return [];
    const scale = W * H / total, out = [];
    let x = 0, y = 0, w = W, h = H, row = [], i = 0;
    const worst = (r, side) => { const s = r.reduce((a, b) => a + b.area, 0), mx = Math.max(...r.map(e => e.area)), mn = Math.min(...r.map(e => e.area)); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
    const lay = r => {
      const s = r.reduce((a, b) => a + b.area, 0);
      if (w >= h) { const cw = s / h; let yy = y; for (const e of r) { const eh = e.area / cw; out.push({ item: e.item, x, y: yy, w: cw, h: eh }); yy += eh; } x += cw; w -= cw; }
      else { const ch = s / w; let xx = x; for (const e of r) { const ew = e.area / ch; out.push({ item: e.item, x: xx, y, w: ew, h: ch }); xx += ew; } y += ch; h -= ch; }
    };
    const nodes = list.map(item => ({ item, area: item.value * scale }));
    while (i < nodes.length) {
      const side = Math.min(w, h), next = nodes[i];
      if (!row.length || worst(row.concat(next), side) <= worst(row, side)) { row.push(next); i++; }
      else { lay(row); row = []; }
    }
    if (row.length) lay(row);
    return out;
  }

  function bars(values, { width = 360, height = 56, labels = [], label = "Bar chart" } = {}) {
    const max = Math.max(1, ...values), bw = (width - 2) / Math.max(1, values.length);
    const rects = values.map((v, i) => {
      const bh = v ? Math.max(2, (height - 16) * v / max) : 0;
      return '<g class="iv-bar"><title>' + esc((labels[i] || "") + ": " + v) + '</title><rect x="' + r1(1 + i * bw + 1) + '" y="' + r1(height - 14 - bh) + '" width="' + r1(Math.max(1, bw - 3)) + '" height="' + r1(bh) + '"/></g>';
    }).join("");
    const first = labels[0] ? '<text class="iv-label" x="1" y="' + (height - 2) + '">' + esc(labels[0]) + "</text>" : "";
    const last = labels.length > 1 ? '<text class="iv-label" x="' + (width - 1) + '" y="' + (height - 2) + '" text-anchor="end">' + esc(labels.at(-1)) + "</text>" : "";
    return '<svg class="iv-bars" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + esc(label) + '"><line class="iv-axis" x1="0" x2="' + width + '" y1="' + (height - 14) + '" y2="' + (height - 14) + '"/>' + rects + first + last + "</svg>";
  }

  window.InsidirViz = Object.freeze({ connect, strip, treemap, bars });
})();
