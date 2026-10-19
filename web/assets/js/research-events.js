/* Research events on the company report (company.html, Insider activity tab): GET /v1/research-events?ticker=,
   newest filing first, each with its trade date, filing date and retrieval time kept apart, the original SEC
   filing, and a sourced explanation (research-explain.js). */
(() => {
  "use strict";
  const LABEL = { insider_purchase: ["Purchase", "is-up"], insider_sale: ["Sale", "is-down"], multi_insider_purchase: ["Several insiders", "is-up"], form4_amendment: ["Amended Form 4", ""], company_disclosure: ["Company filing", ""] };
  const day = v => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"; };
  const tradeDay = v => v ? new Date(String(v).slice(0, 10) + "T00:00:00Z").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const safe = u => /^https:\/\/(www\.)?sec\.gov\//.test(String(u || "")) ? u : null;
  let next = null;
  async function load(list, ticker, append) {
    const X = window.InsidirExplain, E = X.escape;
    let data;
    try {
      const res = await fetch(`/v1/research-events?ticker=${encodeURIComponent(ticker)}&limit=25${append && next ? "&before=" + encodeURIComponent(next) : ""}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || "Research events are unavailable right now.");
    } catch (e) { list.innerHTML = `<li class="ac-empty">${E(e.message)}</li>`; return; }
    next = data.items.length === 25 ? data.next : null;
    document.getElementById("cx-re-more").hidden = !next;
    if (!append) list.replaceChildren();
    if (!data.items.length && !append) {
      list.innerHTML = `<li class="ac-empty">No research events for ${E(ticker)} in Insidir's import yet.${data.lastImportAt ? " Last import " + E(day(data.lastImportAt)) + "." : ""}</li>`; return;
    }
    for (const ev of data.items) {
      const [label, tone] = LABEL[ev.event_type] || ["Filing", ""];
      const li = document.createElement("li"); li.className = "ac-item";
      const trade = tradeDay(ev.transaction_date), tradeEnd = tradeDay(ev.transaction_date_end), source = safe(ev.source_urls && ev.source_urls[0]);
      li.innerHTML = `<p class="ac-item__summary"><span class="ac-badge ${tone}">${E(label)}</span>${E(ev.summary)}</p>
        <p class="ac-item__meta">${trade ? `Traded ${E(trade)}${tradeEnd && tradeEnd !== trade ? " to " + E(tradeEnd) : ""} · ` : ""}Filed ${E(day(ev.filing_date))} · retrieved ${E(day(ev.ingested_at))}${ev.reporting_lag_days != null ? ` · reported ${E(ev.reporting_lag_days)} day(s) after the trade` : ""}${source ? ` · <a href="${E(source)}" rel="noopener noreferrer" target="_blank">Original filing</a>` : ""}</p>
        <div class="ac-item__actions"><button type="button" class="ac-btn" data-explain>Explain</button></div><div class="re-explain" hidden></div>`;
      X.toggle(li.querySelector("[data-explain]"), li.querySelector(".re-explain"), ev.id);
      list.append(li);
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    const list = document.getElementById("cx-re-list");
    const ticker = (new URLSearchParams(location.search).get("ticker") || "").trim().toUpperCase();
    if (!list || !window.InsidirExplain) return;
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker)) { document.getElementById("cx-research-events").hidden = true; return; }
    load(list, ticker, false);
    document.getElementById("cx-re-more").addEventListener("click", () => load(list, ticker, true));
  });
})();
