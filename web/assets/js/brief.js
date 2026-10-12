/* Insidir dashboard: real imported SEC records only. No synthetic prices or transactions. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const E = text => String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ticker = value => {
    const t=String(value||"").trim().toUpperCase();
    return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)?t:null;
  };
  const date = value => {
    const d=new Date(value);
    return value&&!Number.isNaN(d.getTime())?
      new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d):"Not reported";
  };
  const value = amount => {
    if(amount===null||amount===undefined||amount===""||!Number.isFinite(Number(amount)))return "—";
    return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(amount));
  };
  const secUrl = input => {try{
    const url=new URL(input);
    return url.protocol==="https:" && (url.hostname==="www.sec.gov"||url.hostname==="sec.gov") &&
      !url.username&&!url.password?url.toString():null;
  }catch{return null;}};
  const companyLink = t => ticker(t)?'research.html?ticker='+encodeURIComponent(ticker(t)):"research.html";
  const disclosureLink = item => {
    const src=secUrl(item.source_url);
    return src?'<a href="'+E(src)+'" target="_blank" rel="noopener noreferrer">Original SEC ↗</a>':
      item.accession&&/^\d{18}$/.test(String(item.accession))?
      '<a href="filing.html?accession='+encodeURIComponent(item.accession)+'">View filing ↗</a>':
      '<span>Source unavailable</span>';
  };
  async function api(url){
    const response=await fetch(url,{headers:{Accept:"application/json"},credentials:"same-origin"});
    let data;try{data=await response.json();}catch{throw Error("Unable to read the SEC data response");}
    if(!response.ok){const err=Error(data?.error||"SEC data temporarily unavailable");err.status=response.status;throw err;}
    return data;
  }
  const typeLabel=t=>t==="reported_purchase"?"Purchase":t==="reported_sale"?"Sale":"Other";
  const typeClass=t=>t==="reported_purchase"?"brief-tag--buy":t==="reported_sale"?"brief-tag--sell":"";
  let trades=[],activeFilter="all";
  function renderTransactions(){
    const shown=trades.filter(t=>activeFilter==="all"||t.category===activeFilter).slice(0,14);
    $("brief-transactions").innerHTML=shown.length?shown.map(t=>{
      const tck=ticker(t.ticker);
      return '<tr><td>'+E(date(t.transaction_date))+'</td><td>'+E(t.owner_name||"Not reported")+'</td>'+
        '<td>'+(tck?'<a href="'+E(companyLink(tck))+'">'+E(tck)+'</a>':"—")+'</td>'+
        '<td><span class="brief-tag '+typeClass(t.category)+'">'+typeLabel(t.category)+'</span></td>'+
        '<td class="brief-right">'+E(value(t.estimated_value))+'</td></tr>';
    }).join(""):'<tr><td class="brief-empty" colspan="5">No imported transactions for this filter. Explore a company in the Research Desk.</td></tr>';
  }
  async function loadTransactions(){
    try{
      const data=await api("/v1/transactions?limit=50");
      trades=Array.isArray(data.items)?data.items:[];
      renderTransactions();
    }catch(error){$("brief-transactions").innerHTML='<tr><td colspan="5" class="brief-empty">'+E(error.message)+' — try again later.</td></tr>';}
  }
  async function loadFilings(){
    try{
      const data=await api("/v1/filings?limit=10");
      const list=Array.isArray(data.items)?data.items:[];
      $("brief-filings").innerHTML=list.length?list.slice(0,8).map(item=>{
        const t=ticker(item.ticker);
        const form=String(item.form_type||"SEC filing").slice(0,40);
        const name=String(item.issuer_name||t||"Company disclosure").slice(0,80);
        return '<div class="brief-filing"><a class="brief-filing__title" href="'+E(companyLink(t))+'">'+
          E(t||name)+'</a><span class="brief-filing__date">'+E(date(item.published_at))+'</span>'+
          '<span class="brief-filing__meta">'+E(form)+' · '+E(name)+' · '+disclosureLink(item)+'</span></div>';
      }).join(""):'<p class="brief-empty">No filings have been imported yet. You can still use the Research Desk to explore other SEC company disclosures.</p>';
    }catch(error){$("brief-filings").innerHTML='<p class="brief-empty">'+E(error.message)+'</p>';}
  }
  async function loadStatus(){
    try{
      const data=await api("/v1/status");
      $("brief-indexed").textContent=Number(data.filings||0).toLocaleString("en-US");
      const run=data.lastIngest;
      $("brief-import").textContent=run?.finished_at?date(run.finished_at):"Not reported";
    }catch{$("brief-indexed").textContent="Unavailable";$("brief-import").textContent="Unavailable";}
  }
  async function loadWatchlist(){
    try{
      const data=await api("/v1/me/watchlist");
      const items=Array.isArray(data.items)?data.items:[];
      $("brief-watchlist").innerHTML=items.length?
        '<p>Your tracked companies</p>'+items.slice(0,12).map(t=>
        '<a href="'+E(companyLink(t.ticker))+'">'+E(t.ticker)+'</a>').join(""):
        '<p>No saved stocks yet. Investigate a company first, then save it to your watchlist.</p>';
    }catch(e){
      $("brief-watchlist").innerHTML=e.status===401?
        '<p>Sign in to save companies and revisit your research.</p><a href="signin.html">Sign in ↗</a>':
        '<p>Could not load your watchlist right now.</p>';
    }
  }
  document.addEventListener("DOMContentLoaded",()=>{
    const greeting=document.querySelector("[data-greeting]");
    if(greeting){
      const h=new Date().getHours();
      greeting.textContent=h>=5&&h<12?"Good morning.":h>=12&&h<18?"Good afternoon.":"Good evening.";
    }
    const input=$("brief-ticker");
    input?.closest("form")?.addEventListener("submit",event=>{
      const t=ticker(input.value);
      if(!t){event.preventDefault();input.setCustomValidity("Enter a valid stock ticker");input.reportValidity();}
      else input.value=t;
    });
    input?.addEventListener("input",()=>input.setCustomValidity(""));
    document.querySelectorAll("[data-filter]").forEach(btn=>btn.addEventListener("click",()=>{
      activeFilter=btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b===btn)));
      renderTransactions();
    }));
    void Promise.allSettled([loadTransactions(),loadFilings(),loadStatus(),loadWatchlist()]);
  });
})();
