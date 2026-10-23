/* Internal conversion report (admin-funnel.html) for GET /v1/admin/funnel. Admin access needs the token AND a one-time
   code (docs/OPERATIONS.md §2): the form opens the same 30-minute HttpOnly admin session as ops.html and the cost
   report, and neither value is stored by the page. Only measured counts are shown:
   a stage with nothing before it shows no rate, and an experiment is never called before it has enough data. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const int = n => n == null ? "—" : Number(n).toLocaleString("en-US");
  const pct = n => n == null ? "—" : (n * 100).toFixed(1) + "%";
  const table = (cols, rows) => rows.length ? '<div class="ix-tablewrap"><table class="ix-table"><thead><tr>' + cols.map(c => '<th scope="col">' + esc(c) + "</th>").join("") + "</tr></thead><tbody>" + rows.map(r => "<tr>" + r.map(v => "<td>" + v + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>" : '<p class="ix-note">None recorded.</p>';

  function render(r) {
    const head = r.stages[0];
    $("[data-report]").innerHTML =
      '<p class="ix-note" style="margin:0 0 18px">Last ' + esc(r.days) + " days · measuring since " + esc(r.measuredSince ? new Date(r.measuredSince).toLocaleString() : "no events yet") + "</p>" +
      (r.sufficient ? "" : '<div class="ix-error" role="status"><strong>Not enough data yet.</strong>' + esc(r.note) + "</div>") +
      '<section class="ix-block"><h2 class="ix-block__title">Stages</h2>' +
      table(["Stage", "Count", "Rate", "Of"], r.stages.map(s => [esc(s.label), int(s.count) + " " + esc(s.unit), s === head ? "—" : pct(s.rate), s.of ? esc(s.of) : ""])) +
      '<p class="ix-note">' + esc(r.method) + "</p></section>" +
      '<section class="ix-block"><h2 class="ix-block__title">By source (?ref=)</h2>' +
      table(["Source", "Visitors", "Accounts", "Trials ($1)", "Trial rate", "Paid ($39)", "Paid rate"], (r.sources || []).map(x => [esc(x.ref), int(x.visits), int(x.signups), int(x.trials), pct(x.trialRate), int(x.paid), pct(x.paidRate)])) +
      '<p class="ix-note">The source is the first ?ref= a visitor arrived with, kept in a 90-day first-party cookie and saved on the account and its Stripe customer. Trial rate is trials over visitors; paid rate is first $39 renewals over trials.</p></section>' +
      '<section class="ix-block"><h2 class="ix-block__title">Experiments</h2>' +
      (r.experiments.length ? r.experiments.map(x => "<h3>" + esc(x.name) + "</h3>" +
        table(["Arm", "Visitors", "Clicked a trial button", "Accounts", "Paid", "Paid rate"], x.arms.map(a => [esc(a.arm), int(a.exposed), int(a.cta) + " (" + pct(a.ctaRate) + ")", int(a.signups), int(a.paid), pct(a.paidRate)])) +
        '<p class="ix-plain"><strong>' + esc(x.decision) + "</strong></p>").join("") : '<p class="ix-note">No experiment has been seen yet.</p>') + "</section>";
  }
  async function load() {
    const box = $("[data-report]");
    box.innerHTML = '<p class="ix-note">Loading…</p>';
    try {
      const res = await fetch("/v1/admin/funnel?days=" + encodeURIComponent($("[data-days]").value), { credentials: "same-origin", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => null);
      if (!res.ok) { box.innerHTML = '<div class="ix-error" role="alert"><strong>' + (res.status === 401 || res.status === 403 ? "Administrator access required." : "The report could not be loaded.") + "</strong>" + esc(data && data.error || "HTTP " + res.status) + "</div>"; return; }
      render(data);
    } catch (e) { box.innerHTML = '<div class="ix-error" role="alert"><strong>The report could not be loaded.</strong>' + esc(e.message) + "</div>"; }
  }
  function start() {
    $("[data-token-form]").addEventListener("submit", async e => {
      e.preventDefault();
      const box = $("[data-report]");
      try { sessionStorage.removeItem("insidir-admin-token"); } catch { /* an older version kept the token here */ }
      const res = await fetch("/v1/admin/session", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", Authorization: "Bearer " + $("#admin-token").value.trim(), "X-Insidir-Admin-OTP": $("#admin-otp").value.trim() } }).catch(() => null);
      $("#admin-token").value = ""; $("#admin-otp").value = "";
      if (!res || !res.ok) { const d = res ? await res.json().catch(() => null) : null; box.innerHTML = '<div class="ix-error" role="alert"><strong>Administrator access required.</strong>' + esc(d && d.error || "The session could not be opened.") + "</div>"; return; }
      load();
    });
    $("[data-refresh]").addEventListener("click", load);
    $("[data-days]").addEventListener("change", load);
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
