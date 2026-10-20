/* data.html: the coverage report from GET /v1/coverage (src/coverage-ingest.mjs). Every number is a count the engine
   made from its database for this request; nothing here is a target, an estimate or a fixed figure. */
(() => {
  "use strict";
  const host = document.getElementById("mk-coverage-body");
  if (!host) return;
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const num = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "—";
  const when = v => { const d = new Date(v); return v && !Number.isNaN(d.getTime()) ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }) : "never"; };
  const day = v => { const d = new Date(String(v || "") + "T12:00:00Z"); return v && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"; };
  fetch("/v1/coverage", { headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))).then(c => {
    const e = c.entities, f = c.filings, b = c.backfill, q = c.queue, s = c.lastSuccessfulSync || {};
    const cell = (k, v, note) => '<div><dt>' + esc(k) + '</dt><dd>' + v + (note ? '<small>' + esc(note) + '</small>' : "") + '</dd></div>';
    const quality = (c.quality || []).filter(x => x.count);
    host.innerHTML =
      '<dl class="mk-coverage__grid">' +
      cell("SEC filers indexed", num(e.total), num(e.searchableNames) + " searchable names and tickers") +
      cell("Companies", num(e.companies), num(e.listedCompanies) + " on the SEC ticker list · " + num(e.unlistedCompanies) + " without a listed ticker") +
      cell("Reporting owners", num(e.reportingOwners), num(e.persons) + " people · " + num(e.organizations) + " entities, by filed name") +
      cell("Form 4 filings imported", num(f.parsed), num(f.transactions) + " reported lines · " + num(f.failed) + " failed to parse") +
      cell("EDGAR listed, last " + b.windowDays + " days", num(b.listedByEdgar), b.indexDaysRead + " of " + b.businessDays + " business-day indexes read" + (b.earliestDay ? " · from " + day(b.earliestDay) : "")) +
      cell("Imported of those", b.percentImported == null ? "—" : num(b.imported) + " (" + b.percentImported + "%)", num(q.pending + q.retry + q.running) + " waiting · " + num(q.failed) + " failed every attempt") +
      '</dl>' +
      '<p class="mk-coverage__sync">Last successful runs · ticker list: ' + esc(when(s["company-directory"])) + ' · daily index: ' + esc(when(s["daily-index"])) + ' · import queue: ' + esc(when(s["ingest-queue"])) + ' · newest filing imported: ' + esc(when(f.newestPublishedAt)) + '</p>' +
      (quality.length ? '<details class="mk-coverage__quality"><summary>Data checks with findings (' + quality.length + ')</summary><ul>' + quality.map(x => '<li>' + esc(x.label) + ': <b>' + num(x.count) + '</b></li>').join("") + '</ul></details>' : "") +
      '<details class="mk-coverage__gaps"><summary>What is not covered</summary><ul>' + (c.universe?.notCovered || []).map(x => '<li>' + esc(x) + '</li>').join("") + '</ul></details>';
  }).catch(err => { host.innerHTML = '<p class="mk-coverage__wait">The coverage report is unavailable right now (' + esc(err.message) + '). Nothing is shown rather than an old or estimated figure.</p>'; });
})();
