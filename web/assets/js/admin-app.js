/* Insidir's internal admin pages on ui.css: ops.html (GET /v1/admin/ops), admin-costs.html (GET /v1/admin/costs) and
   admin-funnel.html (GET /v1/admin/funnel?days=). The page is chosen by <main data-admin="ops|costs|funnel">.
   Admin access needs the admin token AND a one-time code (src/admin-auth.mjs, docs/OPERATIONS.md §2): the form sends
   both once to POST /v1/admin/session, which opens a 30-minute HttpOnly admin session cookie; neither value is kept
   by the page. DELETE /v1/admin/session closes it. Every figure is read from the engine and labelled with where it
   came from; nothing here is invented. UI.api() is not used: a 401 here means "open an admin session", not
   "log in as a member". */
(() => {
  "use strict";
  const UI = window.InsidirUI || {};
  const esc = UI.esc || (s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const filingHref = UI.filingHref || (() => "");
  const $ = (s, r = document) => r.querySelector(s);
  const num = v => v == null || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v);
  const int = v => num(v) == null ? "—" : Math.round(num(v)).toLocaleString("en-US");
  const usd = (v, d = 4) => num(v) == null ? "—" : "$" + num(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d });
  const pct = v => num(v) == null ? "—" : (num(v) * 100).toFixed(1) + "%";
  const ms = v => num(v) == null ? "—" : num(v).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " ms";
  const when = v => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"; };
  const words = s => String(s ?? "").replace(/_/g, " ");
  // "lastSuccessAt" → "Last success at", "runs_24h" → "Runs 24h"
  const human = k => { const s = String(k).replace(/_/g, " ").replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/\s+/g, " ").trim().toLowerCase().replace(/ usd$/, " (USD)").replace(/ ms$/, " (ms)"); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* ---------- building blocks ---------- */
  const kv = rows => `<dl class="adm-kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const card = (title, body, sub) => `<section class="card adm-card"><h3 class="adm-card__t">${esc(title)}</h3>${sub ? `<p class="adm-sub">${sub}</p>` : ""}${body}</section>`;
  let secN = 0;
  const section = (title, body, dek) => { const id = "adm-s" + (++secN); return `<section class="adm-sec" aria-labelledby="${id}"><h2 class="t-section" id="${id}">${esc(title)}</h2>${dek ? `<p class="adm-sec__dek">${dek}</p>` : ""}${body}</section>`; };
  const note = html => `<p class="adm-note">${html}</p>`;
  const none = (t = "None recorded.") => `<p class="adm-none">${esc(t)}</p>`;
  const stat = (label, value, sub) => `<div class="card adm-stat"><p class="t-label muted">${esc(label)}</p><p class="adm-stat__v">${value}</p>${sub ? `<p class="t-micro muted">${esc(sub)}</p>` : ""}</div>`;
  const R = l => ({ l, r: true }), W = l => ({ l, wrap: true });
  /* cols: strings, R("…") for right-aligned figures, W("…") for wrapping text; rows: arrays of HTML cells, or {flag, cells} */
  function table(label, cols, rows, empty) {
    if (!rows.length) return none(empty);
    const c = cols.map(x => typeof x === "string" ? { l: x } : x);
    const cls = x => x.r ? ' class="r"' : x.wrap ? ' class="wrap"' : "";
    return `<div class="adm-scroll" tabindex="0" role="region" aria-label="${esc(label)}"><table class="table adm-table"><caption class="sr-only">${esc(label)}</caption><thead><tr>${c.map(x => `<th scope="col"${x.r ? ' class="r"' : ""}>${esc(x.l)}</th>`).join("")}</tr></thead><tbody>${
      rows.map(r => { const cells = Array.isArray(r) ? r : r.cells, flag = !Array.isArray(r) && r.flag;
        return `<tr${flag ? ' class="is-flag"' : ""}>${cells.map((v, i) => `<td${cls(c[i] || {})}>${i === 0 && flag ? '<span class="adm-flag" aria-hidden="true"></span><span class="sr-only">Flagged: </span>' : ""}${v}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div>`;
  }
  // a filing reference (accession, "accession:N:0", "accession: codes") opens the filing; anything else is text
  const ref = v => { const s = String(v ?? ""), h = s ? filingHref("", s) : ""; return h ? `<a href="${esc(h)}">${esc(s)}</a>` : esc(s || "—"); };
  const isDate = (k, v) => typeof v === "string" && /(_at|At|newest|oldest|cursor|newest_detected)$/.test(k) && !isNaN(Date.parse(v));
  const value = (k, v) => v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : isDate(k, v) ? esc(when(v))
    : typeof v === "number" ? (/usd$/i.test(k) ? usd(v, 4) : Number.isInteger(v) ? int(v) : esc(v.toLocaleString("en-US", { maximumFractionDigits: 4 }))) : esc(words(v));
  /* An object from the snapshot as one card of label/value pairs; nested objects are shown elsewhere or in the raw JSON. */
  function objCard(title, obj) {
    if (!obj || typeof obj !== "object") return card(title, none("Not reported."));
    if (obj.unavailable) return card(title, `<p class="adm-status is-error">Unavailable: ${esc(obj.unavailable)}</p>`);
    const rows = Object.entries(obj).filter(([, v]) => v === null || typeof v !== "object").map(([k, v]) => [human(k), value(k, v)]);
    return card(title, rows.length ? kv(rows) : none("Nothing reported."));
  }

  /* ---------- admin-costs.html ---------- */
  const sourceNote = s => s && s.source ? esc(words(s.source)) + (s.reason ? " — " + esc(s.reason) : "") + (s.note ? " — " + esc(s.note) : "") : "";
  function costs(r) {
    const ai = r.ai || {}, l30 = ai.last30 || {}, m = r.grossMargin || {}, st = r.stripe || {}, inf = r.infrastructure || {}, nt = r.notifications || {}, bg = r.background || {}, db = r.database || {}, cache = r.cache || {};
    meta("Generated " + when(r.generatedAt) + " · " + (r.window || "") + (r.cached ? " · cached for up to a minute" : ""));
    const limit = (k, v) => [human(k), /usd$/i.test(k) ? usd(v, 2) : value(k, v)];
    return section("Overview", `<div class="adm-stats">${
        stat("AI cost, 30 days (provider-reported)", usd(l30.measuredUsd), "Estimated separately: " + usd(l30.estimatedUsd)) +
        stat("AI requests, 30 days", int(l30.requests), int(l30.ok) + " succeeded") +
        stat("Cache hit rate", pct(cache.hitRate), int(cache.hits) + " hits · " + int(cache.misses) + " generations") +
        stat("Paying subscribers", int(r.subscribers?.paying), int(r.subscribers?.trialing) + " in trial")}</div>`) +
      section("Spend and margin", `<div class="adm-grid">${
        card("AI spend", kv([
          ["Today (reported / estimated)", usd(ai.today?.measuredUsd) + " / " + usd(ai.today?.estimatedUsd)],
          ["This month (reported / estimated)", usd(ai.month?.measuredUsd) + " / " + usd(ai.month?.estimatedUsd)],
          ["Input / output tokens, 30 days", int(l30.inputTokens) + " / " + int(l30.outputTokens)],
          ["Average reported cost per explanation", usd(l30.averageMeasuredCostPerExplanation, 6)],
          ["Reported AI cost per paying subscriber", usd(l30.measuredCostPerPayingSubscriber, 4)],
          ["Target per subscriber per month", usd(l30.targetPerSubscriberUsd, 2)],
          ["Customers using AI / requests each", int(l30.customersUsingAi) + " / " + (num(l30.requestsPerActiveCustomer) == null ? "—" : num(l30.requestsPerActiveCustomer).toFixed(1))]]) +
          note("Models: fast " + esc(ai.models?.fast) + " · deep " + esc(ai.models?.deep) + (ai.configured ? "" : " · provider key not configured"))) +
        card("Limits in force", kv(Object.entries(ai.limits || {}).map(([k, v]) => limit(k, v)))) +
        card("Gross margin, 30 days", m.source === "unavailable" || !m.source ? `<p class="adm-plain">${esc(m.reason || "Not reported.")}</p>` :
          kv([["Revenue (Stripe, net of refunds)", usd(m.revenueUsd, 2)], ["Stripe fees", usd(m.components?.stripeFeesUsd, 2)], ["AI (reported)", usd(m.components?.aiMeasuredUsd)],
            ["Hosting", m.components?.infraUsd == null ? "not included" : usd(m.components.infraUsd, 2) + " (entered)"], ["Gross margin", pct(m.grossMargin)]]) +
          note("Basis: " + esc(words(m.source)) + ". " + (m.excluded || []).map(esc).join("; "))) +
        card("Stripe", `<p class="adm-plain">${sourceNote(st)}</p>` + (st.source === "measured" ? kv([["Gross charges", usd(st.grossUsd, 2)], ["Fees", usd(st.feesUsd, 2)], ["Refunds", usd(st.refundsUsd, 2)],
          ...(st.disputesUsd != null ? [["Disputes", usd(st.disputesUsd, 2)]] : []), ["Transactions", int(st.transactions)]]) : "")) +
        card("Infrastructure", `<p class="adm-plain">${sourceNote(inf)}</p>` + (inf.monthlyUsd != null ? kv([["Per month (operator-entered)", usd(inf.monthlyUsd, 2)]]) : "")) +
        card("Notifications, 7 days", kv([["Delivered", int(nt.sent)], ["Failed", int(nt.failed)], ["Waiting / retrying", int(nt.pending) + " / " + int(nt.retrying)]]))}</div>`) +
      section("AI by feature and model", card("By feature", table("AI by feature", ["Feature", R("Requests"), R("Succeeded"), R("Rejected by checks"), R("Cost")],
          (ai.byFeature || []).map(f => [esc(f.feature), int(f.requests), int(f.ok), int(f.rejected), usd(f.cost)]))) +
        card("By model", table("AI by model", ["Model", "Tier", R("Requests"), R("Input tokens"), R("Output tokens"), R("Cost"), R("Avg latency")],
          (ai.byModel || []).map(f => [esc(f.model), esc(f.tier), int(f.requests), int(f.input_tokens), int(f.output_tokens), usd(f.cost), f.avg_latency_ms == null ? "—" : ms(f.avg_latency_ms)])))) +
      section("Daily AI activity", card("Last 30 days", table("Daily AI activity", ["Day", R("Requests"), R("Failed"), R("Reported cost"), R("Estimated cost")],
        (ai.daily || []).map(d => [esc(d.day), int(d.requests), int(d.failed), usd(d.measured), usd(d.estimated)])))) +
      section("Background jobs", card("Intelligence jobs", table("Background jobs", ["Job", "Started", "Status", W("Detail"), W("Error")],
          (bg.jobs || []).map(j => [esc(j.job), esc(when(j.started_at)), esc(j.status), esc(JSON.stringify(j.detail || {}).slice(0, 160)), esc(j.error || "")]))) +
        card("SEC ingest runs", table("SEC ingest runs", ["Started", "Status", R("Discovered"), R("Parsed"), R("Failed"), R("Skipped")],
          (bg.ingest || []).map(j => [esc(when(j.started_at)), esc(j.status), int(j.discovered), int(j.parsed), int(j.failed), int(j.skipped)])))) +
      section("Database timings", card("In-process timings", table("Database timings by route", ["Route", R("Calls"), R("p50"), R("p95"), R("Max")],
          (db.appTimings || []).map(t => [esc(t.label), int(t.count), ms(t.p50Ms), ms(t.p95Ms), ms(t.maxMs)]))) +
        card("pg_stat_statements", Array.isArray(db.pgStatStatements) ? table("Slowest queries", [W("Query"), R("Calls"), R("Mean"), R("Max")],
          db.pgStatStatements.map(q => [esc(q.query), int(q.calls), ms(q.mean_ms), ms(q.max_ms)])) : note(esc(db.pgStatStatements || "Not reported.")))) +
      section("Cached explanations", card("By source and status", table("Cached explanations", ["Source", "Status", R("Count"), R("Reuses")],
        (cache.explanations || []).map(e => [esc(e.source_type), esc(e.status), int(e.n), int(e.hits)]))));
  }

  /* ---------- admin-funnel.html ---------- */
  function funnel(r) {
    const stages = r.stages || [], head = stages[0];
    meta("Last " + r.days + " days · measuring since " + (r.measuredSince ? when(r.measuredSince) : "no events yet"));
    return (r.sufficient ? "" : `<div class="card card--2 adm-card" role="status"><h2 class="adm-card__t">Not enough data yet.</h2><p class="adm-sub">${esc(r.note)}</p></div>`) +
      section("Stages", card("Visitors to paying accounts", table("Funnel stages", [W("Stage"), R("Count"), R("Rate"), "Of"],
        stages.map(s => [esc(s.label), int(s.count) + " " + esc(s.unit), s === head ? "—" : pct(s.rate), s.of ? esc(s.of) : ""])) + note(esc(r.method)))) +
      section("By source (?ref=)", card("First ?ref= a visitor arrived with", table("Funnel by source", ["Source", R("Visitors"), R("Accounts"), R("Trials ($1)"), R("Trial rate"), R("Paid ($39)"), R("Paid rate")],
        (r.sources || []).map(x => [esc(x.ref), int(x.visits), int(x.signups), int(x.trials), pct(x.trialRate), int(x.paid), pct(x.paidRate)])) +
        note("The source is the first ?ref= a visitor arrived with, kept in a 90-day first-party cookie and saved on the account and its Stripe customer. Trial rate is trials over visitors; paid rate is first $39 renewals over trials."))) +
      section("Experiments", (r.experiments || []).length ? r.experiments.map(x => card(x.name,
        table("Experiment " + x.name, ["Arm", R("Visitors"), R("Clicked a trial button"), R("Accounts"), R("Paid"), R("Paid rate")],
          (x.arms || []).map(a => [esc(a.arm), int(a.exposed), int(a.cta) + " (" + pct(a.ctaRate) + ")", int(a.signups), int(a.paid), pct(a.paidRate)])) +
        `<p class="adm-plain"><strong>${esc(x.decision)}</strong></p>`)).join("") : card("Experiments", none("No experiment has been seen yet.")));
  }

  /* ---------- ops.html ---------- */
  function ops(s) {
    meta("Status " + s.status + " · " + when(s.generatedAt));
    const ing = s.ingestion || {}, re = s.researchEvents || {}, cov = s.coverage || {}, rep = cov.report || {};
    const list = (a, f) => (Array.isArray(a) ? a : []).map(f).join(", ") || null;
    const alerts = Array.isArray(s.alerts) ? s.alerts : [];
    const quality = Array.isArray(cov.quality) ? cov.quality : [];
    const workers = Array.isArray(s.workers) ? s.workers : [];
    const errors = Array.isArray(ing.recentErrors) ? ing.recentErrors : [];
    return section("Alerts", `<div class="card adm-card">${alerts.length ? `<ul class="adm-alerts">${alerts.map(a =>
        `<li class="${a.level === "stale" ? "is-stale" : ""}"><span class="adm-level">${esc(human(a.level))}</span><p><b>${esc(a.area)}</b> · ${esc(a.detail)}</p></li>`).join("")}</ul>` : none("No alerts.")}</div>`) +
      section("Engine", `<div class="adm-grid">${[
        objCard("Ingestion", ing.unavailable ? ing : { ...ing, ...(ing.staleness || {}), reasons: (ing.staleness?.reasons || []).join("; ") || null, ...(ing.filings || {}) }),
        objCard("SEC source (this instance)", s.sec && { ...s.sec, lastError: s.sec.lastError ? s.sec.lastError.status + " " + s.sec.lastError.message : null }),
        objCard("Research events", re.unavailable ? re : { ...re, ...(re.builder || {}), ...(re.failedImports || {}), disclosureCompanies: re.disclosureSources?.companies, disclosureFailing: re.disclosureSources?.failing }),
        objCard("Alerts", s.notifications && (s.notifications.unavailable ? s.notifications : { ...s.notifications, ...(s.notifications.preferences || {}) })),
        objCard("Billing", s.billing && (s.billing.unavailable ? s.billing : { ...s.billing, events7d: list(s.billing.events7d, e => e.kind + " " + e.n), accounts: list(s.billing.accountsByStatus, e => e.status + " " + e.n) })),
        objCard("AI spend and limits", s.ai && (s.ai.unavailable ? s.ai : { ...s.ai, refusalsToday: list(s.ai.refusalsToday, e => e.budget + " " + e.n) })),
        objCard("Security (24 hours)", Array.isArray(s.security) ? Object.fromEntries(s.security.map(x => [x.kind, x.n])) : s.security),
        objCard("Coverage: entities", rep.entities || cov),
        objCard("Coverage: filings and queue", { ...(rep.filings || {}), ...(rep.queue || {}) }),
        objCard("Coverage: backfill", rep.backfill),
        objCard("Capabilities", s.capabilities)].join("")}</div>`) +
      section("Data quality", quality.length ? card("Checks", table("Data-quality checks", [W("Check"), R("Count"), W("Examples")],
          quality.map(c => ({ flag: !!c.count, cells: [esc(c.label), c.count != null ? int(c.count) : esc(c.error ?? "—"), (c.examples || []).map(ref).join(", ")] })))) +
        card("Reconciliation with EDGAR daily indexes", table("Reconciliation with EDGAR daily indexes", ["Day", R("EDGAR listed"), R("Imported"), R("Failed"), R("Waiting"), R("Missing")],
          (rep.reconciliation || []).slice(0, 30).map(r => ({ flag: !!(r.missing || r.failed), cells: [esc(r.day), int(r.listedByEdgar), int(r.imported), int(r.failed), int(r.waiting), int(r.missing)] }))))
        : card("Checks", none("Data-quality checks are unavailable."))) +
      section("Recent filing errors", card("Filings that failed to import", table("Recent filing errors", ["Accession", "Form", W("Error"), "Updated"],
        errors.map(e => [ref(e.accession), esc(e.form_type), esc(e.error_message), esc(when(e.updated_at))]), "No filing has failed to import."))) +
      section("Workers", workers.length ? `<div class="adm-grid">${workers.map(w => objCard(w.name, { last_started_at: w.last_started_at, last_ok_at: w.last_ok_at, last_error_at: w.last_error_at, last_error: w.last_error, runs: w.runs, failures: w.failures })).join("")}</div>`
        : card("Workers", none("No worker has reported yet."))) +
      section("Raw snapshot", `<details class="card adm-raw"><summary>Show JSON</summary><pre>${esc(JSON.stringify(s, null, 2))}</pre></details>`);
  }

  /* ---------- the page ---------- */
  const main = $("[data-admin]");
  if (!main) return;
  const kind = main.dataset.admin;
  const RENDER = { costs, funnel, ops };
  const box = $("[data-adm-report]"), form = $("[data-adm-signin]"), bar = $("[data-adm-bar]"), status = $("[data-adm-status]");
  const meta = t => { const el = $("[data-adm-meta]"); if (el) el.textContent = t; };
  let days = "30", seq = 0;
  const endpoint = () => kind === "costs" ? "/v1/admin/costs" : kind === "funnel" ? "/v1/admin/funnel?days=" + encodeURIComponent(days) : "/v1/admin/ops";
  const skeleton = () => { box.setAttribute("aria-busy", "true"); box.innerHTML = '<div class="adm-skel" aria-hidden="true"><span class="skel"></span><span class="skel"></span><span class="skel" style="height:240px"></span></div><p class="sr-only">Loading…</p>'; };
  const say = (text, error) => { status.textContent = text || ""; status.classList.toggle("is-error", !!error); };
  function signedOut(message) {
    bar.hidden = true; form.hidden = false; box.innerHTML = ""; box.removeAttribute("aria-busy"); meta("");
    say(message || "", !!message);
  }
  function failed(title, detail) {
    box.removeAttribute("aria-busy");
    box.innerHTML = `<div class="card err adm-err" role="alert"><p><b>${esc(title)}</b> ${esc(detail)}</p><button class="btn btn--secondary" type="button" data-adm-retry>Try again</button></div>`;
    $("[data-adm-retry]", box).addEventListener("click", load);
  }
  async function load() {
    const my = ++seq;
    if (form.hidden) skeleton();
    let res, data = null;
    try { res = await fetch(endpoint(), { credentials: "same-origin", headers: { Accept: "application/json" } }); data = await res.json().catch(() => null); }
    catch (e) { if (my === seq) { form.hidden = true; bar.hidden = false; failed("The report could not be loaded.", "The engine could not be reached."); } return; }
    if (my !== seq) return;
    // No session (401/403), too many failed attempts (429) or admin access closed (503): the sign-in card.
    if ([401, 403, 429, 503].includes(res.status)) return signedOut(res.status === 401 || res.status === 403 ? "" : data?.error || "HTTP " + res.status);
    form.hidden = true; bar.hidden = false; say("");
    if (!res.ok || !data) return failed("The report could not be loaded.", data?.error || "HTTP " + res.status);
    try {
      secN = 0;
      box.innerHTML = RENDER[kind](data);
      box.removeAttribute("aria-busy");
      if (UI.enter) UI.enter(box.querySelectorAll(".adm-sec"));
    } catch (e) { failed("The report could not be shown.", String(e?.message || e)); }
  }
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const token = $("#admin-token"), otp = $("#admin-otp");
    if (!token.value.trim()) { say("Enter the admin token.", true); token.focus(); return; }
    if (!/^\d{6}$/.test(otp.value.trim())) { say("Enter the 6-digit code from your authenticator app.", true); otp.focus(); return; }
    try { sessionStorage.removeItem("insidir-admin-token"); } catch { /* an older version kept the token here */ }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; say("Checking…");
    let res;
    try { res = await fetch("/v1/admin/session", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", Authorization: "Bearer " + token.value.trim(), "X-Insidir-Admin-OTP": otp.value.trim() } }); }
    catch { btn.disabled = false; say("The engine could not be reached.", true); return; }
    token.value = ""; otp.value = ""; btn.disabled = false;
    if (!res.ok) { const d = await res.json().catch(() => null); say(d?.error || "The session could not be opened.", true); token.focus(); return; }
    say(""); form.hidden = true; load();
  });
  $("[data-adm-refresh]").addEventListener("click", load);
  $("[data-adm-signout]").addEventListener("click", async () => {
    seq++;
    await fetch("/v1/admin/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    signedOut("");
    say("Session closed.");
    $("#admin-token").focus();
  });
  for (const b of document.querySelectorAll("[data-adm-days]")) b.addEventListener("click", () => {
    days = b.dataset.admDays;
    for (const o of document.querySelectorAll("[data-adm-days]")) o.setAttribute("aria-pressed", String(o === b));
    load();
  });
  load();
})();
