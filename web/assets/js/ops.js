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
      card("Coverage: entities", s.coverage?.report?.entities || s.coverage), card("Coverage: filings and queue", { ...(s.coverage?.report?.filings || {}), ...(s.coverage?.report?.queue || {}) }),
      card("Coverage: backfill", s.coverage?.report?.backfill),
      card("Capabilities", s.capabilities)].join("");
    // Data quality (src/coverage-ingest.mjs qualityChecks): each check's count and up to five example rows to open.
    const quality = Array.isArray(s.coverage?.quality) ? s.coverage.quality : [];
    $("ops-quality").innerHTML = quality.length ? '<table class="ops-table"><thead><tr><th>Check</th><th>Count</th><th>Examples</th></tr></thead><tbody>' +
      quality.map(c => `<tr class="${c.count ? "is-flag" : ""}"><td>${E(c.label)}</td><td>${E(c.count ?? c.error ?? "—")}</td><td>${E((c.examples || []).join(", "))}</td></tr>`).join("") + "</tbody></table>"
      + '<h3>Reconciliation with EDGAR daily indexes</h3><table class="ops-table"><thead><tr><th>Day</th><th>EDGAR listed</th><th>Imported</th><th>Failed</th><th>Waiting</th><th>Missing</th></tr></thead><tbody>'
      + (s.coverage?.report?.reconciliation || []).slice(0, 30).map(r => `<tr class="${r.missing || r.failed ? "is-flag" : ""}"><td>${E(r.day)}</td><td>${E(r.listedByEdgar)}</td><td>${E(r.imported)}</td><td>${E(r.failed)}</td><td>${E(r.waiting)}</td><td>${E(r.missing)}</td></tr>`).join("") + "</tbody></table>"
      : "<p>Data-quality checks are unavailable.</p>";
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
