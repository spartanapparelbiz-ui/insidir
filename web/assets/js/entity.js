/* entity.html?cik=<CIK>: one SEC filer from GET /v1/entities/<cik> (src/sec-directory.mjs). Shows what the record
   says and nothing more: the SEC's name and former names, tickers with when Insidir saw them, the relationships
   imported Form 4 filings state, and EDGAR's latest filings, each with a link to the original. Explicit states for
   an invalid CIK, a CIK EDGAR has never assigned, and EDGAR being unreachable. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const day = x => { const d = new Date(String(x || "").length === 10 ? x + "T12:00:00Z" : x); return x && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"; };
  const status = $("en-status");
  const say = (text, alert) => { if (!status) return; status.textContent = text; if (alert) status.setAttribute("role", "alert"); };
  const KIND = { company: "Company", person: "Reporting person", organization: "Reporting entity", unknown: "SEC filer" };
  const BASIS = { sec_ticker_list: "on the SEC company ticker list", form4_issuer: "issuer on an imported Form 4", edgar_submissions: "from its EDGAR submissions",
    filed_name_pattern: "read from the name as filed (an SEC field does not say)", edgar_entity_lookup: "found in EDGAR's name lookup" };
  const AS = { name: "SEC name", former: "Former name", ticker: "Ticker", filed: "Name as filed" };
  const SOURCE = { sec_ticker_list: "SEC ticker list", edgar_submissions: "EDGAR submissions", edgar_entity_lookup: "EDGAR name lookup", form4_issuer: "Form 4 (issuer)", form4_owner: "Form 4 (reporting owner)" };

  async function request(path, options = {}) {
    let r;
    try { r = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }, ...options }); }
    catch { throw Object.assign(new Error("could not reach Insidir"), { status: 0 }); }
    let j = {};
    try { j = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(j.error || "request failed (HTTP " + r.status + ")"), { status: r.status, body: j });
    return j;
  }
  const row = cells => "<tr>" + cells.map(c => "<td>" + c + "</td>").join("") + "</tr>";
  const link = (url, text) => url && /^https:\/\/www\.sec\.gov\//.test(url) ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + " ↗</a>" : "—";

  function render(r) {
    const e = r.entity, cik = e.cik, bare = String(Number(cik));
    document.title = e.name + " · CIK " + cik + " — insidir.";
    $("en-heading").textContent = e.name;
    const listing = e.kind !== "company" ? "" : e.listed ? "Listed: " + e.tickers.map((t, i) => t + (e.exchanges[i] ? " (" + e.exchanges[i] + ")" : "")).join(", ")
      : e.delistedAt ? "No longer on the SEC company ticker list (dropped " + day(e.delistedAt) + "): delisted, merged, renamed or deregistered" : "No ticker on the SEC company ticker list";
    $("en-subtitle").textContent = [KIND[e.kind] || "SEC filer", "CIK " + cik, listing].filter(Boolean).join(" · ");
    const facts = [["SEC CIK", esc(cik)], ["Kind", esc(KIND[e.kind] || e.kind) + (BASIS[e.kindBasis] ? ' <small>(' + esc(BASIS[e.kindBasis]) + ')</small>' : "")]];
    if (e.tickers.length) facts.push(["Tickers", esc(e.tickers.join(", "))]);
    if (e.sicDescription || e.sic) facts.push(["Industry (SIC)", esc((e.sic || "") + (e.sicDescription ? " · " + e.sicDescription : ""))]);
    if (e.stateOfIncorporation) facts.push(["Incorporated", esc(e.stateOfIncorporation)]);
    facts.push(["Form 4 imported", esc((e.importedFilings.asIssuer ? e.importedFilings.asIssuer + " as issuer" : "") + (e.importedFilings.asIssuer && e.importedFilings.asOwner ? " · " : "") + (e.importedFilings.asOwner ? e.importedFilings.asOwner + " as reporting owner" : "") || "None")]);
    facts.push(["SEC record checked", esc(e.profileRefreshedAt ? day(e.profileRefreshedAt) : r.edgarState === "source_unavailable" ? "EDGAR unreachable just now; showing stored data" : "Not yet")]);
    $("en-meta").innerHTML = facts.map(([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + v + "</dd></div>").join("");
    const actions = [];
    if (e.kind === "company" && e.listed && e.tickers[0]) actions.push('<a class="en-btn" href="company.html?ticker=' + encodeURIComponent(e.tickers[0]) + '">Company report →</a>');
    if (e.isReportingOwner) actions.push('<a class="en-btn" href="person.html?cik=' + bare + '">Reporting-owner file →</a>', '<button type="button" class="en-btn" data-follow="' + esc(cik) + '">Follow +</button>');
    if (e.kind === "company" && !e.listed) actions.push('<span class="en-note">The watchlist follows companies by ticker; this filer has none on the SEC list, so it cannot be added.</span>');
    actions.push(link(r.edgar?.browseUrl || "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + cik + "&owner=include&count=40", "EDGAR filing index"));
    $("en-actions").innerHTML = actions.join(" ");
    const rel = r.imported.asReportingOwner || [];
    $("en-rel").hidden = !rel.length;
    $("en-rel-rows").innerHTML = rel.map(x => row([
      esc(x.issuerName || "CIK " + x.issuerCik) + (x.ticker ? " · " + esc(x.ticker) : ""), esc(x.role || "Not stated on the filing"), String(x.filings), esc(day(x.lastFiledAt)), link(x.evidenceUrl, "Latest filing")
    ])).join("");
    const names = r.names || [];
    $("en-names").hidden = !names.length;
    $("en-names-rows").innerHTML = names.map(n => row([esc(n.name), esc(AS[n.as] || n.as), esc(SOURCE[n.source] || n.source), esc(n.from || n.to ? day(n.from) + " – " + day(n.to) : "—")])).join("");
    const filings = r.edgar?.recentFilings || [];
    $("en-filings").hidden = !filings.length;
    if (r.edgar?.browseUrl) $("en-edgar-all").href = r.edgar.browseUrl;
    $("en-filings-rows").innerHTML = filings.slice(0, 25).map(f => row([esc(f.form), esc(day(f.filedAt)), esc(f.reportDate ? day(f.reportDate) : "—"), link(f.url, "Filing index")])).join("");
    say(r.edgarState === "source_unavailable" ? "SEC EDGAR could not be reached just now; this is what Insidir has stored for CIK " + cik + "."
      : "SEC record for CIK " + cik + (r.edgar?.olderFilingFiles ? ". EDGAR keeps older filings in " + r.edgar.olderFilingFiles + " more file(s); open the full history for them." : "."));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const raw = (new URLSearchParams(location.search).get("cik") || "").trim();
    if (!/^\d{1,10}$/.test(raw) || !/[1-9]/.test(raw)) { say("This link has no valid SEC CIK (up to 10 digits). Search for the company or person instead.", true); return; }
    try { render(await request("/v1/entities/" + encodeURIComponent(raw))); }
    catch (e) {
      if (e.status === 404) say("EDGAR has no filer with CIK " + raw + ". Check the number, or search by name.", true);
      else if (e.status === 401 || e.status === 402) say("Sign in with an active subscription to open SEC filer records.", true);
      else say(e.status === 503 ? e.message : "The SEC record could not be loaded: " + e.message + ". Try again shortly.", true);
    }
    document.addEventListener("click", async ev => {
      const b = ev.target.closest?.("button[data-follow]");
      if (!b) return;
      b.disabled = true;
      try { await request("/v1/me/people", { method: "POST", body: JSON.stringify({ owner_cik: b.dataset.follow }) }); b.textContent = "Following ✓"; say("Saved to the people you follow. Their Form 4 trades appear on your overview as Insidir imports them."); }
      catch (e) { b.disabled = false; say("Could not follow: " + e.message + ".", true); }
    });
  });
})();
