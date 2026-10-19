/* Operations page (ops.html). POST /v1/admin/session with the admin token and a one-time code opens a 30-minute
   HttpOnly admin session (the token is sent once and kept nowhere); GET /v1/admin/ops is then rendered as cards. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const E = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const when = v => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"; };
  const isDate = (k, v) => typeof v === "string" && /(_at|At|newest|oldest|cursor)$/.test(k) && !isNaN(Date.parse(v));
  const card = (title, obj) => {
    if (!obj || typeof obj !== "object") return "";
    if (obj.unavailable) return `<section class="ops-card"><h2>${E(title)}</h2><p class="ac-status is-error">Unavailable: ${E(obj.unavailable)}</p></section>`;
    const rows = Object.entries(obj).filter(([, v]) => v === null || typeof v !== "object").map(([k, v]) => `<dt>${E(k)}</dt><dd>${E(isDate(k, v) ? when(v) : v ?? "—")}</dd>`).join("");
    return `<section class="ops-card"><h2>${E(title)}</h2><dl>${rows}</dl></section>`;
  };
  async function load() {
    const res = await fetch("/v1/admin/ops", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (res.status === 401 || res.status === 503 || res.status === 429) { $("ops-view").hidden = true; $("ops-login").hidden = false; return false; }
    const s = await res.json();
    $("ops-login").hidden = true; $("ops-view").hidden = false;
    $("ops-generated").textContent = "Status " + s.status + " · " + when(s.generatedAt);
    $("ops-alerts").innerHTML = s.alerts.length ? s.alerts.map(a => `<p class="ops-alert ${a.level === "stale" ? "is-stale" : ""}"><strong>${E(a.area)}</strong> · ${E(a.level)} · ${E(a.detail)}</p>`).join("")
      : `<p class="ops-alert is-ok">No alerts.</p>`;
    $("ops-grid").innerHTML = [card("Ingestion", { ...s.ingestion, ...(s.ingestion?.staleness || {}), reasons: (s.ingestion?.staleness?.reasons || []).join("; ") || null, ...(s.ingestion?.filings || {}) }),
      card("SEC source (this instance)", { ...s.sec, lastError: s.sec?.lastError ? s.sec.lastError.status + " " + s.sec.lastError.message : null }),
      card("Research events", { ...s.researchEvents, ...(s.researchEvents?.builder || {}), ...(s.researchEvents?.failedImports || {}), disclosureCompanies: s.researchEvents?.disclosureSources?.companies, disclosureFailing: s.researchEvents?.disclosureSources?.failing }),
      card("Alerts", { ...s.notifications, ...(s.notifications?.preferences || {}) }), card("Email", s.email),
      card("Billing", { ...s.billing, events7d: (s.billing?.events7d || []).map(e => e.kind + " " + e.n).join(", ") || null, accounts: (s.billing?.accountsByStatus || []).map(e => e.status + " " + e.n).join(", ") || null }),
      card("AI explanations", { ...s.ai, today: (s.ai?.todayByOutcome || []).map(e => e.outcome + " " + e.n).join(", ") || null }),
      card("Security (24 hours)", Array.isArray(s.security) ? Object.fromEntries(s.security.map(r => [r.kind, r.n])) : s.security),
      card("Capabilities", s.capabilities)].join("");
    $("ops-workers").innerHTML = (Array.isArray(s.workers) ? s.workers : []).map(w => card(w.name, { last_started_at: w.last_started_at, last_ok_at: w.last_ok_at, last_error_at: w.last_error_at, last_error: w.last_error, runs: w.runs, failures: w.failures })).join("") || "<p>No worker has reported yet.</p>";
    $("ops-raw").textContent = JSON.stringify(s, null, 2);
    return true;
  }
  document.addEventListener("DOMContentLoaded", () => {
    load().catch(() => {});
    $("ops-login").addEventListener("submit", async e => {
      e.preventDefault();
      const out = $("ops-login-status"), token = $("ops-token"), otp = $("ops-otp");
      out.className = "ac-status"; out.textContent = "Checking…";
      let res;
      try { res = await fetch("/v1/admin/session", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", Authorization: "Bearer " + token.value, "X-Insidir-Admin-OTP": otp.value.trim() } }); }
      catch (_) { out.className = "ac-status is-error"; out.textContent = "The engine could not be reached."; return; }
      token.value = ""; otp.value = "";
      if (!res.ok) { const d = await res.json().catch(() => ({})); out.className = "ac-status is-error"; out.textContent = d.error || "Refused."; return; }
      out.textContent = ""; load().catch(err => { out.className = "ac-status is-error"; out.textContent = String(err.message); });
    });
    $("ops-refresh").addEventListener("click", () => load().catch(() => {}));
    $("ops-signout").addEventListener("click", async () => { await fetch("/v1/admin/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {}); $("ops-view").hidden = true; $("ops-login").hidden = false; });
  });
})();
