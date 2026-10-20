/* Sourced explanations of one research event (GET/POST /v1/research-events/<id>/explanation), shared by the alerts
   page and the company report. Facts, context and limitations are shown apart; every statement shows the numbered
   sources it cites; the sources list the SEC address and when Insidir retrieved it. Model-written text carries the
   engine's own label. Questions that ask for advice are answered with the engine's refusal. */
(() => {
  "use strict";
  const E = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const when = v => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "unknown"; };
  const safeUrl = u => /^https:\/\/(www\.)?sec\.gov\//.test(String(u || "")) ? u : null;
  async function call(path, body) {
    const res = await fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await res.json(); } catch (_) { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || "The explanation is unavailable right now."), { status: res.status });
    return data;
  }
  const cites = ids => ids && ids.length ? `<span class="re-cite">[${ids.map(E).join(", ")}]</span>` : "";
  function html(x) {
    if (x.refused) return `<h3>Not answered</h3><ul><li>${E(x.reply)}</li></ul>`;
    const parts = [`<h3>What the filing states</h3><ul>${(x.facts || []).map(f => `<li>${E(f.text)}${cites(f.evidence_ids)}</li>`).join("")}</ul>`];
    if ((x.interpretation || []).length) parts.push(`<h3>Context</h3><ul>${x.interpretation.map(f => `<li>${E(f.text)}${cites(f.evidence_ids)}</li>`).join("")}</ul>`);
    parts.push(`<h3>Missing, delayed or uncertain</h3><ul>${(x.limitations || []).map(l => `<li>${E(l)}</li>`).join("")}</ul>`);
    parts.push(`<h3>Sources</h3><ul class="re-sources">${(x.evidence || []).map(e => { const u = safeUrl(e.sourceUrl); return `<li><strong>${E(e.id)}</strong> ${E(e.text)} ${u ? `<a href="${E(u)}" rel="noopener noreferrer" target="_blank">SEC filing</a>` : ""} · retrieved ${E(when(e.retrievedAt))}</li>`; }).join("")}</ul>`);
    parts.push(`<p class="re-label">${E(x.label || "Written by Insidir's rules from the sources above; no AI model was used.")} ${E(x.disclaimer || "")}</p>`);
    if (x.question && x.answeredQuestion === false && x.writer === "rules") parts.push(`<p class="re-label">Your question was not answered by a model (${E(x.ai || "unavailable")}); the facts above are what the record states.</p>`);
    return parts.join("");
  }
  async function render(box, eventId, question) {
    box.innerHTML = `<p class="re-label">Loading the sourced explanation…</p>`;
    try {
      const data = await call(`/v1/research-events/${encodeURIComponent(eventId)}/explanation`, question ? { question } : null);
      // A refused question keeps the sourced explanation on screen under the refusal.
      if (!data.refused) box.dataset.facts = html(data);
      box.innerHTML = (data.refused ? html(data) + (box.dataset.facts || "") : html(data)) + `<form class="re-ask"><label class="sr-only" for="re-q-${E(eventId)}">Ask about this record</label><input id="re-q-${E(eventId)}" maxlength="500" placeholder="Ask about this record (not for advice)"><button class="ac-btn" type="submit">Ask</button></form>`;
      box.querySelector(".re-ask").addEventListener("submit", e => { e.preventDefault(); const v = box.querySelector("input").value.trim(); if (v) render(box, eventId, v); });
    } catch (e) { box.innerHTML = `<p class="ac-status is-error">${E(e.message)}</p>`; }
  }
  /* A toggle button that opens the explanation under its event. */
  function toggle(button, box, eventId) {
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open)); box.hidden = open;
      button.textContent = open ? "Explain" : "Hide explanation";
      if (!open && !box.dataset.loaded) { box.dataset.loaded = "1"; render(box, eventId); }
    });
  }
  window.InsidirExplain = { render, toggle, escape: E, when };
})();
