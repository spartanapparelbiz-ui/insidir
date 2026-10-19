/* Internal cost dashboard (admin-costs.html) for GET /v1/admin/costs. The token, when used, stays in this tab's
   sessionStorage and is sent only to Insidir's own API. Every number is labelled with where it came from. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n, d = 4) => n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d });
  const int = n => n == null ? "—" : Number(n).toLocaleString("en-US");
  const pct = n => n == null ? "—" : (n * 100).toFixed(1) + "%";
  const KEY = "insidir-admin-token";
  const token = () => { try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; } };
  const card = (title, body) => '<section class="ix-card"><h2 class="ix-card__title">' + esc(title) + "</h2>" + body + "</section>";
  const stat = (label, value, note) => "<div><dt>" + esc(label) + "</dt><dd>" + value + (note ? "<small>" + esc(note) + "</small>" : "") + "</dd></div>";
  const table = (cols, rows) => rows.length ? '<div class="ix-tablewrap"><table class="ix-table"><thead><tr>' + cols.map(c => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" + rows.map(r => "<tr>" + r.map(v => "<td>" + v + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>" : '<p class="ix-note">None recorded.</p>';
  const sourceNote = s => s && s.source ? esc(s.source.replace(/_/g, " ")) + (s.reason ? " — " + esc(s.reason) : "") + (s.note ? " — " + esc(s.note) : "") : "";

  function render(r) {
    const ai = r.ai, l30 = ai.last30, m = r.grossMargin;
    $("[data-report]").innerHTML =
      '<p class="ix-note" style="margin:0 0 18px">Generated ' + esc(new Date(r.generatedAt).toLocaleString()) + " · " + esc(r.window) + (r.cached ? " · cached for up to a minute" : "") + "</p>" +
      '<dl class="ix-stats">' + stat("AI cost, 30 days (provider-reported)", usd(l30.measuredUsd), "Estimated separately: " + usd(l30.estimatedUsd)) +
        stat("AI requests, 30 days", int(l30.requests), int(l30.ok) + " succeeded") +
        stat("Cache hit rate", pct(r.cache.hitRate), int(r.cache.hits) + " hits · " + int(r.cache.misses) + " generations") +
        stat("Paying subscribers", int(r.subscribers.paying), int(r.subscribers.trialing) + " in trial") + "</dl>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">' +
      card("AI spend", '<dl class="ix-rules">' +
        "<li><span>Today (reported / estimated)</span><b>" + usd(ai.today.measuredUsd) + " / " + usd(ai.today.estimatedUsd) + "</b></li>" +
        "<li><span>This month (reported / estimated)</span><b>" + usd(ai.month.measuredUsd) + " / " + usd(ai.month.estimatedUsd) + "</b></li>" +
        "<li><span>Input / output tokens, 30 days</span><b>" + int(l30.inputTokens) + " / " + int(l30.outputTokens) + "</b></li>" +
        "<li><span>Average reported cost per explanation</span><b>" + usd(l30.averageMeasuredCostPerExplanation, 6) + "</b></li>" +
        "<li><span>Reported AI cost per paying subscriber</span><b>" + usd(l30.measuredCostPerPayingSubscriber, 4) + "</b></li>" +
        "<li><span>Target per subscriber per month</span><b>" + usd(l30.targetPerSubscriberUsd, 2) + "</b></li>" +
        "<li><span>Customers using AI / requests each</span><b>" + int(l30.customersUsingAi) + " / " + (l30.requestsPerActiveCustomer == null ? "—" : l30.requestsPerActiveCustomer.toFixed(1)) + "</b></li></dl>" +
        '<p class="ix-note">Models: fast ' + esc(ai.models.fast) + " · deep " + esc(ai.models.deep) + (ai.configured ? "" : " · provider key not configured") + "</p>") +
      card("Limits in force", '<ul class="ix-rules">' + Object.entries(ai.limits).map(([k, v]) => "<li><span>" + esc(k) + "</span><b>" + esc(v) + "</b></li>").join("") + "</ul>") +
      card("Gross margin, 30 days", m.source === "unavailable" ? '<p class="ix-plain">' + esc(m.reason) + "</p>" :
        '<ul class="ix-rules"><li><span>Revenue (Stripe, net of refunds)</span><b>' + usd(m.revenueUsd, 2) + "</b></li><li><span>Stripe fees</span><b>" + usd(m.components.stripeFeesUsd, 2) + "</b></li><li><span>AI (reported)</span><b>" + usd(m.components.aiMeasuredUsd) + "</b></li><li><span>Hosting</span><b>" + (m.components.infraUsd == null ? "not included" : usd(m.components.infraUsd, 2) + " (entered)") + "</b></li><li><span>Gross margin</span><b>" + pct(m.grossMargin) + "</b></li></ul>" +
        '<p class="ix-note">Basis: ' + esc(m.source.replace(/_/g, " ")) + ". " + (m.excluded || []).map(esc).join("; ") + "</p>") +
      card("Stripe", '<p class="ix-plain">' + sourceNote(r.stripe) + "</p>" + (r.stripe.source === "measured" ? '<ul class="ix-rules"><li><span>Gross charges</span><b>' + usd(r.stripe.grossUsd, 2) + "</b></li><li><span>Fees</span><b>" + usd(r.stripe.feesUsd, 2) + "</b></li><li><span>Refunds</span><b>" + usd(r.stripe.refundsUsd, 2) + "</b></li><li><span>Transactions</span><b>" + int(r.stripe.transactions) + "</b></li></ul>" : "")) +
      card("Infrastructure", '<p class="ix-plain">' + sourceNote(r.infrastructure) + "</p>" + (r.infrastructure.monthlyUsd != null ? '<p class="ix-plain">' + usd(r.infrastructure.monthlyUsd, 2) + " per month (operator-entered)</p>" : "")) +
      card("Notifications, 7 days", '<ul class="ix-rules"><li><span>Delivered</span><b>' + int(r.notifications.sent) + "</b></li><li><span>Failed</span><b>" + int(r.notifications.failed) + "</b></li><li><span>Waiting / retrying</span><b>" + int(r.notifications.pending) + " / " + int(r.notifications.retrying) + "</b></li></ul>") +
      "</div>" +
      '<section class="ix-block" style="margin-top:28px"><h2 class="ix-block__title">AI by feature and model</h2>' +
        table(["Feature", "Requests", "Succeeded", "Rejected by checks", "Cost"], ai.byFeature.map(f => [esc(f.feature), int(f.requests), int(f.ok), int(f.rejected), usd(f.cost)])) +
        table(["Model", "Tier", "Requests", "Input tokens", "Output tokens", "Cost", "Avg latency"], ai.byModel.map(f => [esc(f.model), esc(f.tier), int(f.requests), int(f.input_tokens), int(f.output_tokens), usd(f.cost), f.avg_latency_ms == null ? "—" : int(f.avg_latency_ms) + " ms"])) + "</section>" +
      '<section class="ix-block"><h2 class="ix-block__title">Daily AI activity</h2>' + table(["Day", "Requests", "Failed", "Reported cost", "Estimated cost"], ai.daily.map(d => [esc(d.day), int(d.requests), int(d.failed), usd(d.measured), usd(d.estimated)])) + "</section>" +
      '<section class="ix-block"><h2 class="ix-block__title">Background jobs</h2>' + table(["Job", "Started", "Status", "Detail", "Error"], r.background.jobs.map(j => [esc(j.job), esc(new Date(j.started_at).toLocaleString()), esc(j.status), esc(JSON.stringify(j.detail || {})).slice(0, 160), esc(j.error || "")])) +
        table(["SEC ingest started", "Status", "Discovered", "Parsed", "Failed", "Skipped"], r.background.ingest.map(j => [esc(new Date(j.started_at).toLocaleString()), esc(j.status), int(j.discovered), int(j.parsed), int(j.failed), int(j.skipped)])) + "</section>" +
      '<section class="ix-block"><h2 class="ix-block__title">Database timings</h2>' + table(["Route", "Calls", "p50", "p95", "Max"], r.database.appTimings.map(t => [esc(t.label), int(t.count), int(t.p50Ms) + " ms", int(t.p95Ms) + " ms", int(t.maxMs) + " ms"])) +
        (Array.isArray(r.database.pgStatStatements) ? table(["Query", "Calls", "Mean", "Max"], r.database.pgStatStatements.map(q => [esc(q.query), int(q.calls), q.mean_ms + " ms", q.max_ms + " ms"])) : '<p class="ix-note">' + esc(r.database.pgStatStatements) + "</p>") + "</section>" +
      '<section class="ix-block"><h2 class="ix-block__title">Cached explanations</h2>' + table(["Source", "Status", "Count", "Reuses"], r.cache.explanations.map(e => [esc(e.source_type), esc(e.status), int(e.n), int(e.hits)])) + "</section>";
  }
  async function load() {
    const box = $("[data-report]");
    box.innerHTML = '<p class="ix-note">Loading…</p>';
    try {
      const t = token();
      const res = await fetch("/v1/admin/costs", { credentials: "same-origin", headers: t ? { Authorization: "Bearer " + t, Accept: "application/json" } : { Accept: "application/json" } });
      const data = await res.json().catch(() => null);
      if (!res.ok) { box.innerHTML = '<div class="ix-error" role="alert"><strong>' + (res.status === 401 || res.status === 403 ? "Administrator access required." : "The report could not be loaded.") + "</strong>" + esc(data && data.error || "HTTP " + res.status) + "</div>"; return; }
      render(data);
    } catch (e) { box.innerHTML = '<div class="ix-error" role="alert"><strong>The report could not be loaded.</strong>' + esc(e.message) + "</div>"; }
  }
  function start() {
    $("[data-token-form]").addEventListener("submit", e => { e.preventDefault(); try { sessionStorage.setItem(KEY, $("#admin-token").value.trim()); } catch { /* private mode */ } $("#admin-token").value = ""; load(); });
    $("[data-refresh]").addEventListener("click", load);
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
