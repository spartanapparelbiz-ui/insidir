/* Insidir Connections, Changes, Evidence and Autopilot on the company, person and SEC filer pages, plus the
   "What would you like to follow?" step of onboarding. Everything shown comes from the engine:
     GET /v1/entities/<cik>/connections?asOf=&limit=   relationships from Form 4 records (src/connections.mjs)
     GET /v1/entities/<cik>/changes?days=               changes detected by rules (src/changes.mjs)
     GET /v1/me/follows, POST /v1/me/follows/settings   follow modes and pause (src/api.mjs)
     GET /v1/ai/status, GET /v1/ai/explain?accession=   an explanation of a validated Form 4, only when AI is on
   Monochrome; no model decides anything shown here. */
(() => {
  "use strict";
  const E = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const api = async (path, opts = {}) => {
    const r = await fetch(path, { credentials: "same-origin", ...opts, headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
    let d = null; try { d = await r.json(); } catch (_) { /* empty */ }
    if (!r.ok) throw Object.assign(new Error((d && d.error) || "Request failed (" + r.status + ")"), { status: r.status });
    return d;
  };
  const cik10 = v => { const s = String(v ?? "").replace(/^0+/, ""); return /^\d{1,10}$/.test(s) ? s.padStart(10, "0") : null; };
  const narrow = () => matchMedia("(max-width: 700px)").matches;
  const day = v => v ? String(v).slice(0, 10) : "—";

  /* ---------- Evidence ---------- */
  function fmtValue(v, units) {
    if (v == null || v === "") return null;
    if (typeof v === "number") {
      if (units === "USD") return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
      return v.toLocaleString("en-US", { maximumFractionDigits: 4 }) + (units ? " " + units : "");
    }
    return String(v);
  }
  function evidenceHTML(list) {
    const items = (list || []).filter(Boolean);
    if (!items.length) return '<p class="ip-muted">No source record is attached to this item.</p>';
    return '<p class="ip-muted">Verify the facts before making financial decisions: each record below opens the SEC filing it came from.</p><ol class="ip-ev">' + items.map(e => {
      const rows = [["Source", e.source], ["Record", e.title], ["Entity", e.entity ? (e.entity.name || "") + (e.entity.cik ? " · CIK " + e.entity.cik : "") : null],
        ["Filed", e.filedOn], ["Period", e.period ? (e.period.start && e.period.start !== e.period.end ? e.period.start + " to " : "") + (e.period.end || "") + (e.period.type ? " (" + e.period.type + ")" : "") : null],
        ["Field", e.field], ["Value", fmtValue(e.value, e.units)], ["Method", e.methodology]].filter(r => r[1]);
      return `<li><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${E(v)}</dd></div>`).join("")}</dl><a class="ip-ev__link" href="${E(e.url)}" target="_blank" rel="noopener noreferrer">Open on SEC.gov <span aria-hidden="true">↗</span></a></li>`;
    }).join("") + "</ol>";
  }

  /* ---------- Changes ---------- */
  // "Original Form 4", "Original 8-K", "Original 13F": the first linked record, named by its form.
  const sourceLabel = e => { const m = /Form\s+([0-9A-Z][0-9A-Z/-]*)/i.exec(String(e.source || "") + " " + String(e.title || "")); return m ? "Original " + (/^\d/.test(m[1]) ? "Form " + m[1] : m[1]) : "Original filing"; };
  const KIND = { form4: "Form 4", form4_amendment: "Amendment", role_change: "Role change", first_seen: "First filing", financial_fact: "Financials", sec_filing: "SEC filing", holdings_13f: "13F holdings" };
  let aiStatus = null;
  const aiOn = () => aiStatus || (aiStatus = api("/v1/ai/status").then(d => !!d.configured).catch(() => false));
  async function mountChanges(host, cik) {
    if (!host || host.dataset.ipMounted === cik) return;
    host.dataset.ipMounted = cik;
    host.innerHTML = `<div class="ip-bar"><div class="ip-filters" role="group" aria-label="Kinds of change"></div>
      <label class="ip-field">Window <select data-days><option value="30">30 days</option><option value="90" selected>90 days</option><option value="180">180 days</option><option value="365">1 year</option></select></label></div>
      <div class="ip-list" aria-live="polite"><p class="ip-muted">Loading changes…</p></div><ul class="ip-gaps"></ul>`;
    const list = host.querySelector(".ip-list"), filters = host.querySelector(".ip-filters"), gaps = host.querySelector(".ip-gaps");
    let data = null, hide = new Set();
    const paint = async () => {
      const explain = await aiOn();
      const items = data.items.filter(i => !hide.has(i.kind));
      if (!items.length) { list.innerHTML = '<p class="ip-muted">No changes in this window in the records Insidir holds.</p>'; return; }
      let last = "";
      list.innerHTML = items.map((it, n) => {
        const head = it.date !== last ? `<h3 class="ip-day">${E(it.date)}</h3>` : ""; last = it.date; it.evidence = it.evidence || [];
        // Progressive disclosure: the plain headline and sentence first; the filing's own terms and the evidence on request.
        const src = it.evidence.find(e => e && e.url);
        return head + `<article class="ip-change"><p class="ip-kind">${E(KIND[it.kind] || it.kind)}</p><h4>${E(it.headline || it.title)}</h4><p>${E(it.summary || it.detail)}</p>
          <div class="ip-actions">${src ? `<a class="ip-btn ip-btn--link" href="${E(src.url)}" target="_blank" rel="noopener noreferrer">${E(sourceLabel(src))} <span aria-hidden="true">↗</span></a>` : ""}<button type="button" class="ip-btn" aria-expanded="false" aria-controls="ip-ev-${cik}-${n}" data-ev="${n}">Filing detail and evidence (${it.evidence.length})</button>
          ${explain && it.explainable && it.accession ? `<button type="button" class="ip-btn" data-explain="${E(it.accession)}">Explain this filing</button>` : ""}</div>
          <div class="ip-explain" hidden></div><div class="ip-evbox" id="ip-ev-${cik}-${n}" hidden>${it.headline ? `<div class="ip-record"><p class="ip-label">As filed</p><p><b>${E(it.title)}</b></p>${it.detail ? `<p>${E(it.detail)}</p>` : ""}${Array.isArray(it.footnotes) && it.footnotes.length ? `<p class="ip-label">Footnotes</p><ol class="ip-notes">${it.footnotes.map(f => `<li><b>${E(f.id)}</b> ${E(f.text)}</li>`).join("")}</ol>` : ""}</div>` : ""}${evidenceHTML(it.evidence)}</div></article>`;
      }).join("");
      list.querySelectorAll("[data-ev]").forEach(b => b.addEventListener("click", () => {
        const box = document.getElementById(b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") !== "true";
        b.setAttribute("aria-expanded", String(open)); box.hidden = !open;
      }));
      list.querySelectorAll("[data-explain]").forEach(b => b.addEventListener("click", async () => {
        const out = b.closest(".ip-change").querySelector(".ip-explain");
        out.hidden = false; out.textContent = "Writing a summary from this filing…"; b.disabled = true;
        try { const d = await api("/v1/ai/explain?accession=" + encodeURIComponent(b.dataset.explain)); out.innerHTML = `<p>${E(d.explanation)}</p><p class="ip-muted">Automated summary from this filing only, checked against it. Read the filing before relying on it.</p>`; }
        catch (e) { out.textContent = e.message; } finally { b.disabled = false; }
      }));
    };
    const load = async days => {
      list.innerHTML = '<p class="ip-muted">Loading changes…</p>';
      try { const d = await api("/v1/entities/" + cik + "/changes?days=" + days); data = { items: Array.isArray(d && d.items) ? d.items : [], counts: (d && d.counts) || {}, gaps: (d && d.gaps) || [], method: (d && d.method) || "" }; }
      catch (e) { list.innerHTML = `<p class="ip-muted">${E(e.status === 404 ? "Insidir has no imported SEC records for this filer yet." : e.message)}</p>`; return; }
      filters.innerHTML = Object.entries(data.counts).map(([k, n]) => `<button type="button" class="ip-chip" aria-pressed="${!hide.has(k)}" data-kind="${E(k)}">${E(KIND[k] || k)} <b>${n}</b></button>`).join("");
      filters.querySelectorAll("[data-kind]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.kind; hide.has(k) ? hide.delete(k) : hide.add(k); b.setAttribute("aria-pressed", String(!hide.has(k))); paint(); }));
      gaps.innerHTML = data.gaps.map(g => `<li>${E(g)}</li>`).join("") + (data.method ? `<li>${E(data.method)}</li>` : "");
      paint();
    };
    host.querySelector("[data-days]").addEventListener("change", e => load(e.target.value));
    load(90);
  }

  /* ---------- Latest developments (company Overview): the newest changes, headline and sentence only ---------- */
  const longDay = v => { const d = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—"; };
  async function mountRecent(section, cik, limit = 4) {
    const list = section && section.querySelector("ol");
    if (!list || section.dataset.ipMounted === cik) return;
    section.dataset.ipMounted = cik;
    let items;
    try { const d = await api("/v1/entities/" + cik + "/changes?days=90"); items = Array.isArray(d && d.items) ? d.items : []; }
    catch (e) { if (e.status === 404) return; items = null; }
    section.hidden = false;
    if (!items) { list.innerHTML = '<li class="ip-muted">Recent developments could not be loaded just now.</li>'; return; }
    if (!items.length) { list.innerHTML = '<li class="ip-muted">No new developments in the last 90 days in the records Insidir holds.</li>'; return; }
    list.innerHTML = items.slice(0, limit).map(it => {
      const src = (it.evidence || []).find(e => e && e.url);
      return `<li><time datetime="${E(it.date)}">${E(longDay(it.date))}</time><div><b>${E(it.headline || it.title)}</b><span>${E(it.summary || it.detail)}</span></div>${src ? `<a href="${E(src.url)}" target="_blank" rel="noopener noreferrer" aria-label="${E(sourceLabel(src))} for: ${E(it.headline || it.title)}">${E(sourceLabel(src))} <span aria-hidden="true">↗</span></a>` : "<span></span>"}</li>`;
    }).join("");
  }

  /* ---------- Connections ---------- */
  const SHAPE = { company: "square", organization: "diamond", person: "circle" };
  function mountConnections(host, cik) {
    if (!host || host.dataset.ipMounted === cik) return;
    host.dataset.ipMounted = cik;
    host.innerHTML = `<div class="ip-bar"><div class="ip-filters" role="group" aria-label="Show">
        <button type="button" class="ip-chip" aria-pressed="true" data-edge="reports_at">Reporting roles</button>
        <button type="button" class="ip-chip" aria-pressed="true" data-edge="filed_jointly">Joint filings</button>
        <button type="button" class="ip-chip" aria-pressed="true" data-node="person">People</button>
        <button type="button" class="ip-chip" aria-pressed="true" data-node="organization">Organizations</button>
        <button type="button" class="ip-chip" aria-pressed="true" data-node="company">Companies</button></div>
      <div class="ip-tools"><label class="ip-field">As of <input type="date" data-asof></label>
        <div class="ip-seg" role="group" aria-label="View"><button type="button" class="ip-btn" data-view="map" aria-pressed="true">Map</button><button type="button" class="ip-btn" data-view="list" aria-pressed="false">List</button></div></div></div>
      <div class="ip-graph"><div class="ip-canvas"><svg class="ip-svg" role="group" aria-label="Relationship map" viewBox="-400 -300 800 600"><g class="ip-zoom"><g class="ip-edges"></g><g class="ip-nodes"></g></g></svg>
        <div class="ip-zoombar"><button type="button" class="ip-btn" data-zoom="1" aria-label="Zoom in">+</button><button type="button" class="ip-btn" data-zoom="-1" aria-label="Zoom out">−</button><button type="button" class="ip-btn" data-zoom="0">Reset</button></div>
        <p class="ip-legend"><span class="ip-key ip-key--company"></span>Company <span class="ip-key ip-key--person"></span>Person <span class="ip-key ip-key--organization"></span>Organization <span class="ip-key ip-key--line"></span>Reporting role <span class="ip-key ip-key--dash"></span>Joint filing</p></div>
        <aside class="ip-detail" aria-live="polite"><p class="ip-muted">Select a node to see the filings behind it.</p></aside></div>
      <div class="ip-table" hidden></div><ul class="ip-gaps"></ul>`;
    const svg = host.querySelector(".ip-svg"), zoomG = host.querySelector(".ip-zoom"), edgesG = host.querySelector(".ip-edges"), nodesG = host.querySelector(".ip-nodes");
    const detail = host.querySelector(".ip-detail"), table = host.querySelector(".ip-table"), canvas = host.querySelector(".ip-graph"), gaps = host.querySelector(".ip-gaps");
    const nodes = new Map(), edges = new Map(), pos = new Map(), expanded = new Set();
    const showEdge = new Set(["reports_at", "filed_jointly"]), showNode = new Set(["person", "organization", "company"]);
    let view = { k: 1, x: 0, y: 0 }, selected = null, asOf = "";
    const applyView = () => zoomG.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
    const edgeKey = e => e.type + ":" + [e.from, e.to].sort().join("-");
    function place(parent, ids) {
      const p = pos.get(parent) || { x: 0, y: 0 };
      const fresh = ids.filter(id => !pos.has(id));
      if (!pos.size || parent === null) return;
      const isRoot = p.x === 0 && p.y === 0;
      const base = isRoot ? 0 : Math.atan2(p.y, p.x), spread = isRoot ? Math.PI * 2 : Math.min(Math.PI * 1.2, 0.35 * fresh.length + 0.4);
      const r = isRoot ? Math.max(170, fresh.length * 11) : 130;
      fresh.forEach((id, i) => {
        const a = isRoot ? (i / fresh.length) * Math.PI * 2 - Math.PI / 2 : base - spread / 2 + (fresh.length === 1 ? spread / 2 : (i / (fresh.length - 1)) * spread);
        pos.set(id, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
      });
    }
    const visible = n => showNode.has(n.kind) || n.role === "subject";
    // The view box around every placed node and its label (labels run up to ~200 units sideways), kept at 4:3.
    let box = { x: -400, y: -300, w: 800, h: 600 };
    function fit() {
      const ps = [...pos.values()]; if (!ps.length) return;
      let x0 = Math.min(...ps.map(p => p.x)) - 210, x1 = Math.max(...ps.map(p => p.x)) + 210, y0 = Math.min(...ps.map(p => p.y)) - 50, y1 = Math.max(...ps.map(p => p.y)) + 50;
      // Never closer than 1:1, so a map of two nodes is not drawn at poster size.
      if (x1 - x0 < 800) { const d = (800 - (x1 - x0)) / 2; x0 -= d; x1 += d; }
      if (y1 - y0 < 600) { const d = (600 - (y1 - y0)) / 2; y0 -= d; y1 += d; }
      let w = x1 - x0, h = y1 - y0;
      if (w / h > 4 / 3) { const d = w * 3 / 4 - h; y0 -= d / 2; h += d; } else { const d = h * 4 / 3 - w; x0 -= d / 2; w += d; }
      box = { x: x0, y: y0, w, h }; svg.setAttribute("viewBox", `${x0} ${y0} ${w} ${h}`);
    }
    function draw() {
      const vis = e => showEdge.has(e.type) && nodes.has(e.from) && nodes.has(e.to) && visible(nodes.get(e.from)) && visible(nodes.get(e.to));
      edgesG.innerHTML = [...edges.values()].filter(vis).map(e => {
        const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return "";
        const on = selected && (e.from === selected || e.to === selected);
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="ip-edge ip-edge--${e.type}${on ? " is-on" : ""}"/>`;
      }).join("");
      nodesG.innerHTML = [...nodes.values()].filter(visible).map(n => {
        const p = pos.get(n.id); if (!p) return "";
        const s = n.role === "subject" ? 13 : 8, shape = SHAPE[n.kind] || "circle";
        const mark = shape === "square" ? `<rect x="${-s}" y="${-s}" width="${s * 2}" height="${s * 2}" rx="2"/>` : shape === "diamond" ? `<path d="M0 ${-s - 2}L${s + 2} 0L0 ${s + 2}L${-s - 2} 0Z"/>` : `<circle r="${s}"/>`;
        const label = n.name.length > 26 ? n.name.slice(0, 25) + "…" : n.name;
        // Labels sit outside the ring, on the side the node faces, so neighbours never write over each other.
        const a = Math.atan2(p.y, p.x), c = Math.cos(a), sn = Math.sin(a), side = n.role === "subject" ? 0 : c > 0.1 ? 1 : c < -0.1 ? -1 : 0;
        const tx = side * (s + 7), ty = side ? 4 : n.role === "subject" || sn > 0 ? s + 15 : -s - 8;
        // One clickable area over the mark and its label (about 6.7 units per character at 11px).
        const lw = label.length * 6.7, hx0 = side > 0 ? -s - 3 : side < 0 ? -s - 7 - lw : Math.min(-s - 3, -lw / 2), hx1 = side > 0 ? s + 7 + lw : side < 0 ? s + 3 : Math.max(s + 3, lw / 2);
        const hy0 = side ? -s - 3 : Math.min(-s - 3, ty - 11), hy1 = side ? s + 3 : Math.max(s + 3, ty + 4);
        const hit = `<rect class="ip-hit" x="${hx0}" y="${hy0}" width="${hx1 - hx0}" height="${hy1 - hy0}"/>`;
        return `<g class="ip-node ip-node--${n.kind}${n.id === selected ? " is-on" : ""}${n.role === "subject" ? " is-subject" : ""}" transform="translate(${p.x} ${p.y})" tabindex="0" role="button" data-id="${n.id}" aria-label="${E(n.name)}, ${n.kind}">${hit}${mark}<text x="${tx}" y="${ty}" text-anchor="${side > 0 ? "start" : side < 0 ? "end" : "middle"}">${E(label)}</text></g>`;
      }).join("");
      nodesG.querySelectorAll(".ip-node").forEach(g => {
        g.addEventListener("click", () => select(g.dataset.id));
        g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(g.dataset.id); } });
      });
      table.innerHTML = `<table class="ip-tbl"><thead><tr><th>From</th><th>Connection</th><th>To</th><th>Filings</th><th>First</th><th>Latest</th><th>Evidence</th></tr></thead><tbody>${[...edges.values()].filter(vis).map(e => {
        const a = nodes.get(e.from), b = nodes.get(e.to);
        return `<tr><td><a href="${E(a.url)}">${E(a.name)}</a></td><td>${E(e.type === "reports_at" ? e.role || "Reporting owner" : "Filed jointly")}</td><td><a href="${E(b.url)}">${E(b.name)}</a></td><td>${e.filings}</td><td>${E(e.firstFiledOn)}</td><td>${E(e.lastFiledOn)}</td><td>${e.evidence.map(x => `<a href="${E(x.url)}" target="_blank" rel="noopener noreferrer">${E(day(x.filedOn))} ↗</a>`).join(" ")}</td></tr>`;
      }).join("")}</tbody></table>`;
    }
    function select(id) {
      selected = id; const n = nodes.get(id); draw();
      const mine = [...edges.values()].filter(e => e.from === id || e.to === id);
      detail.innerHTML = `<p class="ip-kind">${E(n.kind)}</p><h4><a href="${E(n.url)}">${E(n.name)}</a></h4>
        ${n.role !== "subject" && !expanded.has(id) ? `<button type="button" class="ip-btn" data-expand>Show their connections</button>` : ""}
        <ul class="ip-rel">${mine.map(e => { const other = nodes.get(e.from === id ? e.to : e.from);
          return `<li><b>${E(e.type === "reports_at" ? e.role || "Reporting owner" : "Filed jointly")}</b> · ${E(other?.name)}<br><span class="ip-muted">${e.filings} filing${e.filings === 1 ? "" : "s"}, ${E(e.firstFiledOn)}${e.lastFiledOn !== e.firstFiledOn ? " to " + E(e.lastFiledOn) : ""}</span>${evidenceHTML(e.evidence)}</li>`; }).join("")}</ul>`;
      const b = detail.querySelector("[data-expand]");
      if (b) b.addEventListener("click", () => { b.disabled = true; b.textContent = "Loading…"; load(id, id); });
    }
    async function load(target, parent) {
      try {
        const r = await api("/v1/entities/" + target + "/connections?limit=40" + (asOf ? "&asOf=" + asOf : ""));
        if (!r || !r.subject || !r.subject.id) throw Object.assign(new Error("No relationships are available for this filer."), { status: 404 });
        const d = { ...r, nodes: Array.isArray(r.nodes) ? r.nodes : [r.subject], edges: (Array.isArray(r.edges) ? r.edges : []).map(e => ({ ...e, evidence: e.evidence || [] })), gaps: r.gaps || [] };
        if (!d.nodes.some(n => n.id === d.subject.id)) d.nodes.push(d.subject);
        if (parent === null) { pos.set(d.subject.id, { x: 0, y: 0 }); }
        for (const n of d.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
        if (parent === null) nodes.get(d.subject.id).role = "subject";
        for (const e of d.edges) edges.set(edgeKey(e), e);
        place(parent === null ? d.subject.id : parent, d.nodes.map(n => n.id).filter(id => id !== (parent || d.subject.id)));
        expanded.add(target);
        if (parent === null) gaps.innerHTML = d.gaps.map(g => `<li>${E(g)}</li>`).join("") + (d.method ? `<li>${E(d.method)}</li>` : "");
        fit(); draw(); if (parent) select(parent);
      } catch (e) { detail.innerHTML = `<p class="ip-muted">${E(e.status === 404 ? "No Form 4 relationships are in Insidir's imported filings for this filer." : e.message)}</p>`; }
    }
    // Zoom and pan: wheel, drag, and the buttons; the SVG keeps its own coordinates.
    const zoomBy = f => { view.k = Math.min(4, Math.max(0.35, view.k * f)); applyView(); };
    host.querySelectorAll("[data-zoom]").forEach(b => b.addEventListener("click", () => { const z = +b.dataset.zoom; if (!z) view = { k: 1, x: 0, y: 0 }, applyView(); else zoomBy(z > 0 ? 1.25 : 0.8); }));
    svg.addEventListener("wheel", e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 0.9); }, { passive: false });
    let drag = null;
    svg.addEventListener("pointerdown", e => { if (e.target.closest(".ip-node")) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", e => { if (!drag) return; const r = svg.getBoundingClientRect(), s = box.w / r.width; view.x = drag.vx + (e.clientX - drag.x) * s; view.y = drag.vy + (e.clientY - drag.y) * s; applyView(); });
    svg.addEventListener("pointerup", () => { drag = null; });
    host.querySelectorAll("[data-edge]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.edge; showEdge.has(k) ? showEdge.delete(k) : showEdge.add(k); b.setAttribute("aria-pressed", String(showEdge.has(k))); draw(); }));
    host.querySelectorAll("[data-node]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.node; showNode.has(k) ? showNode.delete(k) : showNode.add(k); b.setAttribute("aria-pressed", String(showNode.has(k))); draw(); }));
    const setView = v => { host.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === v))); canvas.hidden = v === "list"; table.hidden = v !== "list"; };
    host.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    host.querySelector("[data-asof]").addEventListener("change", e => { asOf = e.target.value; nodes.clear(); edges.clear(); pos.clear(); expanded.clear(); selected = null; load(cik, null); });
    if (narrow()) setView("list");
    load(cik, null);
  }

  /* ---------- Autopilot: one follow, its alert mode and pause ---------- */
  const MODES = [["important", "Important updates"], ["all", "All filing updates"], ["daily", "Daily"], ["weekly", "Weekly"], ["off", "Off"]];
  async function mountFollowSettings(host, kind, id) {
    if (!host) return;
    let f;
    try { f = (((await api("/v1/me/follows")) || {}).items || []).find(x => x.kind === kind && (kind === "company" ? x.ticker === id : cik10(x.cik) === cik10(id))); } catch (_) { host.hidden = true; return; }
    if (!f) { host.hidden = true; host.innerHTML = ""; return; }
    host.hidden = false;
    host.innerHTML = `<label class="ip-field">Autopilot <select data-mode>${MODES.map(([v, l]) => `<option value="${v}"${v === f.mode ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button type="button" class="ip-btn" data-pause aria-pressed="${f.paused}">${f.paused ? "Resume" : "Pause"}</button><span class="ip-muted" data-saved role="status"></span>
      <p class="ip-muted ip-follow__why">Autopilot keeps you informed about developments affecting this ${kind === "company" ? "company" : "person"}: Important updates are purchases, clustered purchases, sales of $1,000,000 or more as filed, and company disclosures.</p>`;
    const saved = host.querySelector("[data-saved]");
    const save = async change => {
      try { const r = await api("/v1/me/follows/settings", { method: "POST", body: JSON.stringify({ kind, id, ...change }) }); f.mode = r.mode; f.paused = r.paused; saved.textContent = r.paused ? "Paused" : "Saved"; host.querySelector("[data-pause]").textContent = r.paused ? "Resume" : "Pause"; host.querySelector("[data-pause]").setAttribute("aria-pressed", String(r.paused)); }
      catch (e) { saved.textContent = e.message; }
    };
    host.querySelector("[data-mode]").addEventListener("change", e => save({ mode: e.target.value }));
    host.querySelector("[data-pause]").addEventListener("click", () => save({ paused: !f.paused }));
  }
  const confirmFollow = (host, name) => { if (host) { host.textContent = "Following " + name + ". Updates will appear in your briefing."; } };

  /* ---------- Onboarding: what would you like to follow? ---------- */
  function mountOnboardingSearch(panel) {
    const step = panel.querySelector('[data-step="follow"] div');
    if (!step || step.querySelector(".ip-onboard")) return;
    step.insertAdjacentHTML("beforeend", `<form class="ip-onboard" role="search"><label class="sr-only" for="ip-onboard-q">Company or person</label>
      <input id="ip-onboard-q" type="search" placeholder="A company or a person, e.g. NVIDIA" autocomplete="off"><button type="submit" class="ip-btn">Search</button></form>
      <ul class="ip-onboard__hits"></ul><p class="ip-muted" data-onboard-status role="status"></p>`);
    const form = step.querySelector(".ip-onboard"), hits = step.querySelector(".ip-onboard__hits"), status = step.querySelector("[data-onboard-status]");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const q = form.querySelector("input").value.trim(); if (!q) return;
      hits.innerHTML = ""; status.textContent = "Searching SEC filers…";
      try {
        const d = await api("/v1/entities/search?limit=6&q=" + encodeURIComponent(q));
        const items = (d.items || []).filter(i => (i.kind === "company" && i.tickers && i.tickers[0]) || i.kind === "person" || i.kind === "organization");
        status.textContent = items.length ? "" : "No SEC filer matched. Try a ticker or the name as filed.";
        hits.innerHTML = items.map((i, n) => `<li><span>${E(i.name)}${i.tickers && i.tickers[0] ? " · " + E(i.tickers[0]) : ""} <span class="ip-muted">${E(i.kind)}</span></span><button type="button" class="ip-btn" data-hit="${n}">Follow</button></li>`).join("");
        hits.querySelectorAll("[data-hit]").forEach(b => b.addEventListener("click", async () => {
          const i = items[+b.dataset.hit]; b.disabled = true;
          try {
            if (i.kind === "company") await api("/v1/me/watchlist", { method: "POST", body: JSON.stringify({ ticker: i.tickers[0], mode: "important" }) });
            else await api("/v1/me/people", { method: "POST", body: JSON.stringify({ owner_cik: i.cik, mode: "important" }) });
            b.textContent = "Following"; confirmFollow(status, i.name);
            document.dispatchEvent(new CustomEvent("insidir:followed", { detail: { kind: i.kind === "company" ? "company" : "person", id: i.kind === "company" ? i.tickers[0] : i.cik, name: i.name } }));
          } catch (err) { b.disabled = false; status.textContent = err.status === 401 ? "Sign in to follow." : err.message; }
        }));
      } catch (err) { status.textContent = err.message; }
    });
  }

  /* ---------- page wiring ---------- */
  function sections(anchor, cik, where = "beforeend") {
    if (!anchor || document.getElementById("ip-changes")) return;
    anchor.insertAdjacentHTML(where, `<section class="ip-section" aria-labelledby="ip-changes-h"><p class="ip-eyebrow">Insidir Changes</p><h2 id="ip-changes-h">What changed.</h2>
      <p class="ip-lede">Important shifts in ownership, insider activity and disclosures, detected by rules from structured SEC records, newest first. Open any item to verify its evidence.</p><div id="ip-changes"></div></section>
      <section class="ip-section" aria-labelledby="ip-connections-h"><p class="ip-eyebrow">Insidir Connections</p><h2 id="ip-connections-h">Who is connected.</h2>
      <p class="ip-lede">Relationships between companies, executives and institutional investors that may deserve further research, from Form 4 records. Select a node for its filings; expand to load its own connections.</p><div id="ip-connections"></div></section>`);
    mountChanges(document.getElementById("ip-changes"), cik);
    mountConnections(document.getElementById("ip-connections"), cik);
  }
  function init() {
    const params = new URLSearchParams(location.search);
    // Company page (v12-company.js announces its CIK and each tab it shows).
    if (document.getElementById("cx-tabs")) {
      let cik = null, tab = location.hash.slice(1) || null, ticker = null, name = null;
      const mount = () => { if (!cik) return; if (tab === "changes") mountChanges(document.getElementById("cx-changes-host"), cik); if (tab === "connections") mountConnections(document.getElementById("cx-connections-host"), cik); };
      document.addEventListener("insidir:company", e => { cik = cik10(e.detail.cik); ticker = e.detail.ticker; name = e.detail.name; mount(); if (cik) mountRecent(document.getElementById("cx-recent"), cik); if (ticker) mountFollowSettings(document.getElementById("cx-follow-settings"), "company", ticker); });
      document.addEventListener("insidir:tab", e => { tab = e.detail.id; mount(); });
      document.addEventListener("insidir:followed", e => { if (e.detail.kind === "company") { confirmFollow(document.getElementById("cx-follow-note"), name || e.detail.id); mountFollowSettings(document.getElementById("cx-follow-settings"), "company", e.detail.id); } });
      document.addEventListener("insidir:unfollowed", () => { const s = document.getElementById("cx-follow-settings"); if (s) { s.hidden = true; s.innerHTML = ""; } const n = document.getElementById("cx-follow-note"); if (n) n.textContent = ""; });
    }
    // Person page.
    if (document.body.classList.contains("pf-page")) {
      const asked = cik10(params.get("cik"));
      // Only for a file that loaded (person.js announces it), so a CIK with no record asks for nothing more.
      if (asked) document.addEventListener("insidir:person", e => {
        const cik = cik10(e.detail && e.detail.cik) || asked;
        sections(document.getElementById("pf-file"), cik);
        const actions = document.getElementById("pf-actions");
        if (actions && !document.getElementById("pf-follow-settings")) actions.insertAdjacentHTML("afterend", '<div class="ip-follow" id="pf-follow-settings" hidden></div>');
        mountFollowSettings(document.getElementById("pf-follow-settings"), "person", cik);
        document.addEventListener("insidir:followed", () => mountFollowSettings(document.getElementById("pf-follow-settings"), "person", cik));
        document.addEventListener("insidir:unfollowed", () => mountFollowSettings(document.getElementById("pf-follow-settings"), "person", cik));
      }, { once: true });
    }
    // SEC filer page.
    if (document.body.classList.contains("en-page")) {
      const cik = cik10(params.get("cik"));
      if (cik) sections(document.querySelector(".cl-finish"), cik, "beforebegin");
    }
    const start = document.getElementById("rd-start");
    if (start && !start.hidden) mountOnboardingSearch(start);
  }
  window.InsidirPanels = { evidenceHTML, mountChanges, mountConnections, mountFollowSettings, mountRecent, fmtValue };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
