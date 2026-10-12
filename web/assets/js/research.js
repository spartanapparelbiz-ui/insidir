/* Source-backed research-to-decision workflow. No simulated findings or brokerage orders. */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const cleanTicker = value => {
    const symbol = String(value || "").trim().toUpperCase();
    return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol) ? symbol : "";
  };
  const displayDate = value => {
    if (!value) return "Not reported";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not reported" :
      new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(date);
  };
  const displayCash = value => {
    if (value == null || value === "") return "Not reported";
    const amount = Number(value);
    return Number.isFinite(amount) ?
      amount.toLocaleString("en-US", {style:"currency",currency:"USD",maximumFractionDigits:0}) :
      "Not reported";
  };
  const safeSource = value => {
    try {
      const url = new URL(String(value));
      if (url.protocol !== "https:") return "";
      if (url.hostname !== "sec.gov" && !url.hostname.endsWith(".sec.gov")) return "";
      return url.href;
    } catch { return ""; }
  };
  const accessionLink = value => /^\d{18}$/.test(String(value || "")) ?
    "filing.html?accession=" + encodeURIComponent(value) : "";
  const sourceLink = (value, label) => {
    const uri = safeSource(value);
    return uri ? '<a class="research-text-link" href="' + esc(uri) +
      '" target="_blank" rel="noopener noreferrer">' + esc(label) + ' ↗</a>' : "Source unavailable";
  };
  const setFeedback = (id, message, error = false) => {
    const el = byId(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-error", Boolean(error));
  };
  async function request(path, options) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: options && options.body ? {"Content-Type":"application/json"} : {"Accept":"application/json"},
      ...options
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error("Research engine unavailable"); }
    if (!response.ok) {
      const err = new Error(data.error || "Unable to load research");
      err.status = response.status;
      throw err;
    }
    return data;
  }
  function renderTransactions(transactions) {
    const host = byId("research-transactions");
    if (!transactions.length) {
      host.innerHTML = '<p class="research-empty">No imported Form 4 transactions match this ticker. This does not mean no insider activity occurred.</p>';
      return;
    }
    const rows = transactions.map(item => {
      const category = item.category === "reported_purchase" ? "Reported purchase" :
        item.category === "reported_sale" ? "Reported sale" : "Other transaction";
      const qualifiers = [
        item.derivative ? "Derivative" : "Non-derivative",
        item.transaction_code ? "Code " + item.transaction_code : "Code unavailable",
        item.is_amendment ? "Amended filing" : ""
      ].filter(Boolean).join(" · ");
      return "<tr><td><strong>" + esc(item.owner_name || "Reporting person unavailable") +
        "</strong><small>" + esc(qualifiers) + "</small></td><td>" + esc(category) +
        "<small>Trade: " + esc(displayDate(item.transaction_date)) + "</small></td><td>" +
        esc(displayCash(item.estimated_value)) + "<small>Estimated filing value</small></td><td>" +
        esc(displayDate(item.published_at)) + "<small>" + sourceLink(item.source_url, "Original SEC filing") +
        "</small></td></tr>";
    }).join("");
    host.innerHTML = '<div class="research-table-scroll"><table class="research-table">' +
      '<caption class="sr-only">Imported SEC Form 4 transactions</caption><thead><tr>' +
      '<th>Reporting person</th><th>Transaction</th><th>Reported value</th><th>Published</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function renderFilings(filings) {
    const host = byId("research-filings");
    if (!filings.length) {
      host.innerHTML = '<p class="research-empty">No imported filings found. Verify the ticker and check SEC EDGAR directly.</p>';
      return;
    }
    const rows = filings.map(item => {
      const details = accessionLink(item.accession);
      const local = details ? '<a class="research-text-link" href="' + esc(details) + '">Review parsed details →</a>' : "";
      const original = sourceLink(item.source_url, "SEC source");
      return "<tr><td><strong>" + esc(item.form_type || "Form 4") +
        (item.is_amendment ? " · amended" : "") + "</strong><small>" + esc(item.issuer_name || "Company") +
        "</small></td><td>" + esc(displayDate(item.published_at)) +
        "<small>Report period: " + esc(displayDate(item.period_of_report)) +
        "</small></td><td>" + local + "<small>" + original + "</small></td></tr>";
    }).join("");
    host.innerHTML = '<div class="research-table-scroll"><table class="research-table">' +
      '<caption class="sr-only">Original SEC filings</caption><thead><tr>' +
      '<th>Filing</th><th>Published</th><th>Evidence</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }
  let selectedTicker = "";
  const usd = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "Unavailable";
    return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(n);
  };
  function renderIntelFindings(findings) {
    const host=byId("intel-findings");
    if (!findings.length) {
      host.innerHTML='<p class="research-empty">No qualifying disclosures in the recent company history. This does not mean no relevant filing exists.</p>';
      return;
    }
    host.innerHTML=findings.map(item=>
      '<article class="intel-finding"><time>'+esc(displayDate(item.reportedAt))+'</time><div>'+
      '<h4>'+esc(item.title)+'</h4><p>'+esc(item.explanation)+'</p>'+
      sourceLink(item.sourceUrl,"Verify at SEC")+'</div></article>').join("");
  }
  function renderIntelFacts(facts) {
    byId("intel-facts").innerHTML = facts.length ? facts.map(f=>
      '<div class="intel-fact"><span>'+esc(f.label)+'</span><strong>'+esc(usd(f.value))+
      '</strong><small>Period '+esc(f.start?displayDate(f.start)+" – ":"")+esc(displayDate(f.periodEnd))+
      ' · '+esc(f.form)+' · filed '+esc(displayDate(f.filedAt))+'</small>'+
      '<small>'+sourceLink(f.sourceUrl,"Source filing")+'</small></div>').join("") :
      '<p class="research-empty">No comparable XBRL facts were available from the SEC for this company.</p>';
  }
  function renderIntelFilings(filings) {
    const host=byId("intel-filings");
    if(!filings.length){host.innerHTML='<p class="research-empty">No selected SEC company filings found.</p>';return;}
    host.innerHTML='<div class="research-table-scroll"><table class="research-table"><thead><tr>'+
      '<th>Type</th><th>Filed</th><th>Original document</th></tr></thead><tbody>'+
      filings.map(f=>'<tr><td><strong>'+esc(f.form)+'</strong><small>'+esc(f.headline)+'</small></td>'+
        '<td>'+esc(displayDate(f.filedAt))+'</td><td>'+sourceLink(f.sourceUrl,"Read filing")+'</td></tr>').join("")+
      '</tbody></table></div>';
  }
  async function loadIntelligence(ticker) {
    const host=byId("intel-overview");
    host.hidden=true;
    setFeedback("intel-status","Connecting official SEC company submissions and financial facts…");
    try {
      const data=await request("/v1/intelligence?ticker="+encodeURIComponent(ticker));
      if(selectedTicker!==ticker)return;
      const filings=Array.isArray(data.filings)?data.filings:[];
      const facts=Array.isArray(data.facts)?data.facts:[];
      const brief=data.brief||{};
      host.hidden=false;
      byId("intel-summary").textContent=brief.summary||"No intelligence summary available.";
      byId("research-company").textContent=String(data.company?.name||ticker)+" ("+ticker+")";
      renderIntelFindings(Array.isArray(brief.findings)?brief.findings:[]);
      renderIntelFacts(facts);
      renderIntelFilings(filings);
      byId("intel-caveats").textContent=[
        ...(Array.isArray(brief.caveats)?brief.caveats:[]),
        ...(Array.isArray(data.warnings)?data.warnings:[])
      ].join(" ");
      setFeedback("intel-status","Official SEC data retrieved. Evidence is descriptive, not a recommendation.");
    } catch (err) {
      if(selectedTicker!==ticker)return;
      host.hidden=true;
      setFeedback("intel-status","Additional SEC intelligence is unavailable: "+err.message+
        ". Imported insider research below may still be accessible.",true);
    }
  }
  async function loadReview(ticker) {
    const status = byId("research-review-status");
    const notes = byId("research-review-notes");
    status.value = "researching";
    notes.value = "";
    setFeedback("research-review-feedback", "Checking your private research journal…");
    try {
      const data = await request("/v1/me/research-decisions?ticker=" + encodeURIComponent(ticker));
      if (selectedTicker !== ticker) return;
      const saved = (data.items || [])[0];
      if (saved) {
        status.value = saved.review_status;
        notes.value = saved.notes || "";
        setFeedback("research-review-feedback", "Saved review loaded. You can update it at any time.");
      } else setFeedback("research-review-feedback", "No review saved yet. Your notes are visible only to your account.");
    } catch (err) {
      if (selectedTicker !== ticker) return;
      if (err.status === 401) {
        byId("research-save").disabled = true;
        setFeedback("research-review-feedback", "Sign in to save private research notes.");
        const link = document.createElement("a");
        link.href = "signin.html";
        link.className = "research-text-link";
        link.textContent = " Sign in →";
        byId("research-review-feedback").append(link);
      } else {
        byId("research-save").disabled = true;
        setFeedback("research-review-feedback", "Private journal unavailable: " + err.message, true);
      }
    }
  }
  async function loadTicker(ticker) {
    selectedTicker = ticker;
    byId("research-save").disabled = false;
    byId("research-results").hidden = true;
    setFeedback("research-feedback", "Loading available SEC evidence for " + ticker + "…");
    try {
      const all = await Promise.all([
        request("/v1/transactions?ticker=" + encodeURIComponent(ticker) + "&limit=75"),
        request("/v1/filings?ticker=" + encodeURIComponent(ticker) + "&limit=30")
      ]);
      if (selectedTicker !== ticker) return;
      const transactions = Array.isArray(all[0].items) ? all[0].items : [];
      const filings = Array.isArray(all[1].items) ? all[1].items : [];
      const name = filings.find(x => x.issuer_name)?.issuer_name ||
        transactions.find(x => x.issuer_name)?.issuer_name || ticker;
      byId("research-company").textContent = name + " (" + ticker + ")";
      byId("research-company-link").href = "company.html?ticker=" + encodeURIComponent(ticker);
      byId("research-count").textContent = String(transactions.length);
      byId("research-owners").textContent = String(new Set(transactions.map(x => x.owner_name).filter(Boolean)).size);
      byId("research-latest").textContent = filings.length ?
        displayDate(filings.reduce((latest, item) => item.published_at && item.published_at > latest ? item.published_at : latest, "")) : "None imported";
      byId("research-coverage").textContent = "Imported SEC Form 4 records and available public SEC company disclosures. Coverage is not exhaustive.";
      renderTransactions(transactions);
      renderFilings(filings);
      byId("research-results").hidden = false;
      setFeedback("research-feedback", "Displaying imported records for " + ticker + ". No live prices, politician trades or simulated signals.");
      loadReview(ticker);
      loadIntelligence(ticker);
    } catch (err) {
      if (selectedTicker !== ticker) return;
      setFeedback("research-feedback", err.message + ". No sample data has been substituted.", true);
    }
  }
  const search = byId("research-search");
  if (!search) return;
  search.addEventListener("submit", event => {
    event.preventDefault();
    const ticker = cleanTicker(byId("research-ticker").value);
    if (!ticker) {
      setFeedback("research-feedback", "Enter a valid ticker symbol (letters, digits, dots or hyphens).", true);
      return;
    }
    byId("research-ticker").value = ticker;
    history.replaceState(null, "", "research.html?ticker=" + encodeURIComponent(ticker));
    loadTicker(ticker);
  });
  byId("research-review-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!selectedTicker || byId("research-save").disabled) return;
    const button = byId("research-save");
    button.disabled = true;
    setFeedback("research-review-feedback", "Saving your research review…");
    try {
      const data = await request("/v1/me/research-decisions", {
        method:"POST",
        body: JSON.stringify({
          ticker: selectedTicker,
          reviewStatus: byId("research-review-status").value,
          notes: byId("research-review-notes").value
        })
      });
      setFeedback("research-review-feedback", data.item ? "Research review saved privately. No trade was placed." : "No review was saved.");
    } catch (err) {
      setFeedback("research-review-feedback", "Could not save review: " + err.message, true);
    } finally { button.disabled = false; }
  });
  const preset = new URLSearchParams(location.search).get("ticker");
  if (preset) {
    const ticker = cleanTicker(preset);
    if (ticker) {
      byId("research-ticker").value = ticker;
      loadTicker(ticker);
    } else setFeedback("research-feedback", "Invalid ticker in link. Enter a valid ticker above.", true);
  }
})();
