/* Internal conversion report (admin-funnel.html) for GET /v1/admin/funnel. The token, when used, stays in this tab's
   sessionStorage (shared with the cost report) and is sent only to Insidir's own API. Only measured counts are shown:
   a stage with nothing before it shows no rate, and an experiment is never called before it has enough data. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const int = n => n == null ? "—" : Number(n).toLocaleString("en-US");
  const pct = n => n == null ? "—" : (n * 100).toFixed(1) + "%";
  const KEY = "insidir-admin-token";
  const token = () => { try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; } };
  const table = (cols, rows) => rows.length ? '<div class="ix-tablewrap"><table class="ix-table"><thead><tr>' + cols.map(c => '<th scope="col">' + esc(c) + "</th>").join("") + "</tr></thead><tbody>" + rows.map(r => "<tr>" + r.map(v => "<td>" + v + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>" : '<p class="ix-note">None recorded.</p>';

  function render(r) {
    const head = r.stages[0];
    $("[data-report]").innerHTML =
      '<p class="ix-note" style="margin:0 0 18px">Last ' + esc(r.days) + " days · measuring since " + esc(r.measuredSince ? new Date(r.measuredSince).toLocaleString() : "no events yet") + "</p>" +
      (r.sufficient ? "" : '<div class="ix-error" role="status"><strong>Not enough data yet.</strong>' + esc(r.note) + "</div>") +
      '<section class="ix-block"><h2 class="ix-block__title">Stages</h2>' +
      table(["Stage", "Count", "Rate", "Of"], r.stages.map(s => [esc(s.label), int(s.count) + " " + esc(s.unit), s === head ? "—" : pct(s.rate), s.of ? esc(s.of) : ""])) +
      '<p class="ix-note">' + esc(r.method) + "</p></section>" +
      '<section class="ix-block"><h2 class="ix-block__title">Experiments</h2>' +
      (r.experiments.length ? r.experiments.map(x => "<h3>" + esc(x.name) + "</h3>" +
        table(["Arm", "Visitors", "Clicked a trial button", "Accounts", "Paid", "Paid rate"], x.arms.map(a => [esc(a.arm), int(a.exposed), int(a.cta) + " (" + pct(a.ctaRate) + ")", int(a.signups), int(a.paid), pct(a.paidRate)])) +
        '<p class="ix-plain"><strong>' + esc(x.decision) + "</strong></p>").join("") : '<p class="ix-note">No experiment has been seen yet.</p>') + "</section>";
  }
  async function load() {
    const box = $("[data-report]");
    box.innerHTML = '<p class="ix-note">Loading…</p>';
    try {
      const t = token();
      const res = await fetch("/v1/admin/funnel?days=" + encodeURIComponent($("[data-days]").value), { credentials: "same-origin", headers: t ? { Authorization: "Bearer " + t, Accept: "application/json" } : { Accept: "application/json" } });
      const data = await res.json().catch(() => null);
      if (!res.ok) { box.innerHTML = '<div class="ix-error" role="alert"><strong>' + (res.status === 401 || res.status === 403 ? "Administrator access required." : "The report could not be loaded.") + "</strong>" + esc(data && data.error || "HTTP " + res.status) + "</div>"; return; }
      render(data);
    } catch (e) { box.innerHTML = '<div class="ix-error" role="alert"><strong>The report could not be loaded.</strong>' + esc(e.message) + "</div>"; }
  }
  function start() {
    $("[data-token-form]").addEventListener("submit", e => { e.preventDefault(); try { sessionStorage.setItem(KEY, $("#admin-token").value.trim()); } catch { /* private mode */ } $("#admin-token").value = ""; load(); });
    $("[data-refresh]").addEventListener("click", load);
    $("[data-days]").addEventListener("change", load);
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
