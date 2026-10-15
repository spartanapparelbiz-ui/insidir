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
  /* Market direction prints in words first; the class adds green (purchase) or red (sale) and a ▲/▼ glyph. */
  const direction = category => category === "reported_purchase" ? "up" : category === "reported_sale" ? "down" : "";
  const directionLabel = (category, words) => {
    const dir = direction(category);
    return '<span class="desk-dir' + (dir ? " is-" + dir : "") + '">' +
      (dir ? '<span class="desk-glyph is-' + dir + '" aria-hidden="true"></span>' : "") + esc(words) + "</span>";
  };
  /* Shares as filed: signed by the Form 4 acquired (A) / disposed (D) flag, coloured only for reported purchases
     and sales. Grants, awards, exercises, tax withholding and gifts keep their sign but stay neutral. */
  const signedShares = item => {
    const shares = Number(item.shares);
    if (item.shares == null || item.shares === "" || !Number.isFinite(shares) || shares <= 0) return "";
    const ad = String(item.acquired_disposed || "").toUpperCase();
    const tone = direction(item.category);
    const sign = ad === "D" ? "−" : ad === "A" ? "+" : tone === "up" ? "+" : tone === "down" ? "−" : "";
    const text = sign + shares.toLocaleString("en-US", {maximumFractionDigits:4}) + " sh";
    return '<span class="desk-signed' + (tone ? " is-" + tone : "") + '">' + esc(text) + "</span>";
  };
  const displayPrice = value => {
    if (value == null || value === "") return "";
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ?
      amount.toLocaleString("en-US", {style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:4}) : "";
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
  /* The results arrive in a section that starts hidden, and the scroll reveal (v13-motion.js) passes over anything
     hidden when it first meets it. So their blocks carry data-desk-reveal in the page and are armed as the section
     is first shown: they then rise in as they scroll into view, a beat apart, like the rest of the site. */
  const armReveal = section => {
    for (const block of [section, ...section.querySelectorAll("[data-desk-reveal]")]) {
      if (!block.hasAttribute("data-desk-reveal")) continue;
      block.setAttribute(block.getAttribute("data-desk-reveal") === "group" ? "data-hf-reveal-group" : "data-hf-reveal", "");
      block.removeAttribute("data-desk-reveal");
    }
  };
  /* Identity tiles (entity-media.js): each reporting person's headshot, found by their SEC owner CIK (or the
     company's logo standing in for it), and the company's logo by ticker or issuer CIK. */
  const media = window.InsidirMedia;
  /* A reporting person's name opens their own file (person.html?cik=, the owner CIK without leading zeros) when the
     line carries the CIK. A joint filing (owner_cik null) lists its owners in owners:[{cik,name}], each linked; with no
     list (a line imported before the owners were recorded) its joined owner_name is split on the commas (a ", Inc." or
     ", Jr." stays on the name before it). A name with no CIK opens the people directory's search for it
     (people.html?q=<name>#v10-directory). */
  const fileHref = cik => {
    const c = String(cik ?? "").trim();
    return /^\d{1,10}$/.test(c) && /[1-9]/.test(c) ? "person.html?cik=" + c.replace(/^0+/, "") : "";
  };
  const personHref = (cik, name) => {
    const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    return fileHref(cik) || (n ? "people.html?q=" + encodeURIComponent(n) + "#v10-directory" : "");
  };
  const SUFFIX = /^(?:inc|llc|l\.?l\.?c|l\.?p|lp|ltd|limited|co|corp|corporation|company|plc|n\.?a|n\.?v|s\.?a|ag|se|jr|sr|ii|iii|iv|v|esq|m\.?d|ph\.?d)\.?$/i;
  const splitNames = s => String(s ?? "").split(/\s*,\s*/).filter(Boolean).reduce((out, p) => {
    if (out.length && SUFFIX.test(p)) out[out.length - 1] += ", " + p; else out.push(p);
    return out;
  }, []);
  const ownersOf = item => {
    const listed = item.owner_cik ? [{cik: item.owner_cik, name: item.owner_name}] :
      Array.isArray(item.owners) && item.owners.length ? item.owners.filter(o => o && (o.cik || o.name)) :
      splitNames(item.owner_name).map(name => ({cik: null, name}));
    return listed.length ? listed.slice(0, 12) : [{cik: null, name: ""}];
  };
  /* Names as people write them ("Katherine L. Adams"), the filer-order form ("ADAMS KATHERINE L") kept in the title; issuer
     names likewise ("NVIDIA Corp"), by the helpers every page shares (entity-media.js). */
  const personName = raw => media?.displayName ? media.displayName(raw) : String(raw || "");
  const companyName = raw => media?.companyName ? media.companyName(raw) : String(raw || "");
  const formLabel = f => { const t = String(f || "4").trim(); return /^form\b/i.test(t) ? t : "Form " + t; };
  const ownerNames = owners => owners.map(o => {
    const raw = String(o.name || "").trim(), shown = raw ? personName(raw) : "Reporting person unavailable", href = personHref(o.cik, o.name);
    const title = raw && raw !== shown ? ' title="' + esc(raw) + '"' : "";
    return href ? '<a class="ins-person-link" href="' + esc(href) + '"' + title + '>' + esc(shown) + "</a>" : "<span" + title + ">" + esc(shown) + "</span>";
  }).join(", ");
  const setCompanyHeading = (name, ticker, cik) => {
    const host = byId("research-company");
    const label = esc(companyName(name)) + " (" + esc(ticker) + ")";
    host.innerHTML = media ? media.company({ticker, cik, name, size: "md"}) + "<span>" + label + "</span>" : label;
    media?.hydrate(host);
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
      const shares = signedShares(item), price = displayPrice(item.price_per_share ?? item.price);
      const hasValue = item.estimated_value != null && item.estimated_value !== "";
      const quantity = shares ? shares + (price ? " at " + esc(price) : "") + (hasValue ? " · estimated value" : "") : "Estimated filing value";
      const qualifiers = [
        item.derivative ? "Derivative" : "Non-derivative",
        item.transaction_code ? "Code " + item.transaction_code : "Code unavailable",
        item.is_amendment ? "Amended filing" : ""
      ].filter(Boolean).join(" · ");
      const owners = ownersOf(item), lead = owners.find(o => fileHref(o.cik)) || owners[0];
      return "<tr><td data-label='Reporting person'><div class='ins-person-cell'>" + (window.InsidirMedia?.portrait(lead.name || "",item.ticker||selectedTicker,"sm",{cik:lead.cik,issuerCik:item.issuer_cik})||"") +
        "<div><strong>" + ownerNames(owners) +
        "</strong><small>" + esc(qualifiers) + "</small></div></div></td><td data-label='Transaction'>" + directionLabel(item.category, category) +
        "<small>Trade: " + esc(displayDate(item.transaction_date)) + "</small></td><td data-label='Reported value'>" +
        esc(displayCash(item.estimated_value)) + "<small>" + quantity + "</small></td><td data-label='Published'>" +
        esc(displayDate(item.published_at)) + "<small>" + sourceLink(item.source_url, "Original SEC filing") +
        "</small></td></tr>";
    }).join("");
    host.innerHTML = '<div class="research-table-scroll"><table class="research-table">' +
      '<caption class="sr-only">Imported SEC Form 4 transactions</caption><thead><tr>' +
      '<th>Reporting person</th><th>Transaction</th><th>Reported value</th><th>Published</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    window.InsidirMedia?.hydrate(host);
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
      return "<tr><td data-label='Filing'><div class='ins-company-cell'>" + (window.InsidirMedia?.logo(item.ticker||selectedTicker,"sm",{cik:item.issuer_cik,name:item.issuer_name})||"") +
        "<div><strong>" + esc(formLabel(item.form_type)) +
        (item.is_amendment ? " · amended" : "") + "</strong><small>" + esc(companyName(item.issuer_name) || "Company") +
        "</small></div></div></td><td data-label='Published'>" + esc(displayDate(item.published_at)) +
        // The report period only when the filing states one (not a "Not reported" on every row).
        (displayDate(item.period_of_report) !== "Not reported" ? "<small>Report period: <span class='rd-nb'>" + esc(displayDate(item.period_of_report)) + "</span></small>" : "") +
        "</td><td data-label='Evidence'>" + local + "<small>" + original + "</small></td></tr>";
    }).join("");
    host.innerHTML = '<div class="research-table-scroll"><table class="research-table">' +
      '<caption class="sr-only">Original SEC filings</caption><thead><tr>' +
      '<th>Filing</th><th>Published</th><th>Evidence</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
    window.InsidirMedia?.hydrate(host);
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
      filings.map(f=>'<tr><td data-label="Type"><strong>'+esc(f.form)+'</strong><small>'+esc(f.headline)+'</small></td>'+
        '<td data-label="Filed">'+esc(displayDate(f.filedAt))+'</td><td data-label="Original document">'+sourceLink(f.sourceUrl,"Read filing")+'</td></tr>').join("")+
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
      setCompanyHeading(String(data.company?.name||ticker), ticker, data.company?.cik);
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
      const issuerCik = filings.find(x => x.issuer_cik)?.issuer_cik || transactions.find(x => x.issuer_cik)?.issuer_cik || "";
      setCompanyHeading(name, ticker, issuerCik);
      byId("research-company-link").href = "company.html?ticker=" + encodeURIComponent(ticker);
      byId("research-count").textContent = String(transactions.length);
      byId("research-owners").textContent = String(new Set(transactions.map(x => x.owner_name).filter(Boolean)).size);
      byId("research-latest").textContent = filings.length ?
        displayDate(filings.reduce((latest, item) => item.published_at && item.published_at > latest ? item.published_at : latest, "")) : "None imported";
      byId("research-coverage").textContent = "Imported SEC Form 4 records and available public SEC company disclosures. Coverage is not exhaustive.";
      renderTransactions(transactions);
      renderFilings(filings);
      armReveal(byId("research-results"));
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
