/* "Explain it simply" on the filing page (filing.html). GET /v1/filings/<accession> answers `simple`
   (src/plain-language.mjs form4Simple): a headline in everyday words, short labelled points (who, what, when, what it
   means, what it doesn't tell you) and the form's terms explained. v2-filing.js passes that answer here in an
   "insidir:filing" event, so the filing is fetched once. The reader chooses "Explain it simply" or "As filed"
   (remembered in localStorage); "As filed" folds the points away and leaves the filing's own lines below. Where the
   deployment has AI explanations on (GET /v1/ai/status), a button asks GET /v1/ai/explain for a short cited summary. */
(() => {
  "use strict";
  const KEY = "insidir:filing-mode";
  const E = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const root = document.getElementById("filing-simple");
  if (!root) return;
  const body = root.querySelector("[data-simple-body]"), buttons = [...root.querySelectorAll("[data-mode]")];
  const read = () => { try { return localStorage.getItem(KEY) === "filed" ? "filed" : "simple"; } catch { return "simple"; } };
  const setMode = (mode, save) => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    body.hidden = mode !== "simple";
    root.classList.toggle("is-filed", mode !== "simple");
    if (save) try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
  };
  for (const b of buttons) b.addEventListener("click", () => setMode(b.dataset.mode, true));
  document.addEventListener("insidir:filing", e => {
    const s = e.detail && e.detail.simple, accession = e.detail?.filing?.accession;
    if (!s || !Array.isArray(s.points) || !s.points.length) return;
    root.querySelector("[data-simple-headline]").textContent = s.headline || "";
    root.querySelector("[data-simple-formal]").textContent = s.formal ? "On the form: " + s.formal : "";
    root.querySelector("[data-simple-points]").innerHTML = s.points.map(p => `<div><dt>${E(p.label)}</dt><dd>${E(p.text)}</dd></div>`).join("");
    const terms = Array.isArray(s.terms) ? s.terms : [];
    root.querySelector("[data-simple-terms]").innerHTML = terms.map(t => `<div><dt>${E(t.term)}</dt><dd>${E(t.meaning)}</dd></div>`).join("");
    root.querySelector(".fl-terms").hidden = !terms.length;
    root.hidden = false;
    setMode(read(), false);
    if (accession) ai(accession);
  });
  // Optional AI summary: only offered when the deployment has it configured; any failure says so plainly.
  async function ai(accession) {
    const box = root.querySelector("[data-ai]"), go = root.querySelector("[data-ai-go]"), out = root.querySelector("[data-ai-out]");
    try {
      const st = await fetch("/v1/ai/status", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!st.ok || !(await st.json()).configured) return;
    } catch { return; }
    box.hidden = false;
    go.addEventListener("click", async () => {
      go.disabled = true; out.textContent = "Writing a summary from the filing…";
      try {
        const r = await fetch("/v1/ai/explain?accession=" + encodeURIComponent(accession), { credentials: "same-origin", headers: { Accept: "application/json" } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw Error(d.error || "AI summary unavailable. The plain-English points above are complete.");
        out.textContent = d.explanation || "";
        go.hidden = true;
      } catch (err) { out.textContent = err.message; go.disabled = false; }
    });
  }
})();
