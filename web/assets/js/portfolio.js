/* Read-only holdings view: no trades, order forms, simulated data or persistence in the browser. */
(() => {
  "use strict";
  const el=id=>document.getElementById(id);
  const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=(v,currency="USD")=>v==null||!Number.isFinite(Number(v))?"Not available":
    new Intl.NumberFormat("en-US",{style:"currency",currency:/^[A-Z]{3}$/.test(currency)?currency:"USD",maximumFractionDigits:2}).format(Number(v));
  const num=value=>value==null||!Number.isFinite(Number(value))?"—":Number(value).toLocaleString("en-US",{maximumFractionDigits:6});
  const safeDate=value=>{const d=new Date(value);return value&&!Number.isNaN(d.getTime())?d.toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}):"Not reported";};
  const secLink=url=>{try{const u=new URL(url);return u.protocol==="https:"&&(u.hostname==="www.sec.gov"||u.hostname==="sec.gov")?u.toString():null;}catch{return null;}};
  const safeTicker=value=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(value||""))?value:null;
  const setStatus=(message,error=false)=>{el("portfolio-status").textContent=message;el("portfolio-status").style.color=error?"var(--red)":"var(--muted)";};
  async function request(path,method="GET"){
    const r=await fetch(path,{method,credentials:"same-origin",headers:{"Accept":"application/json"}});
    let result;try{result=await r.json();}catch{throw Error("Insidir engine unavailable");}
    if(!r.ok){const error=new Error(result.error||"Request failed");error.status=r.status;throw error;}
    return result;
  }
  function renderPortfolio(data) {
    const accounts=Array.isArray(data.accounts)?data.accounts:[];
    const host=el("portfolio-accounts");
    host.innerHTML=accounts.length?accounts.map(a=>{
      const positions=Array.isArray(a.positions)?a.positions:[];
      const rows=positions.map(p=>{
        const ticker=safeTicker(p.researchTicker);
        const research=ticker?'<a class="portfolio-small-link" href="research.html?ticker='+encodeURIComponent(ticker)+'">SEC research →</a>':
          '<span style="color:var(--muted)">No exact U.S. stock match</span>';
        return '<tr><td><strong>'+escapeHtml(p.symbol)+'</strong><small>'+escapeHtml(p.description||p.kind)+'</small></td>'+
          '<td>'+escapeHtml(num(p.quantity))+'</td><td>'+escapeHtml(money(p.price,p.currency))+'</td><td>'+research+'</td></tr>';
      }).join("");
      return '<article class="portfolio-account"><div class="portfolio-account-head"><div>'+
        '<p class="research-eyebrow">INVESTMENT ACCOUNT · READ ONLY</p><h3>'+escapeHtml(a.name)+'</h3>'+
        '<p>'+escapeHtml(a.maskedNumber||"Masked account")+' · Positions as of '+escapeHtml(safeDate(a.positionsAsOf||a.accountSyncedAt))+'</p></div>'+
        '<div class="portfolio-value"><strong>'+escapeHtml(money(a.netValue,a.currency))+'</strong><small>Reported account value</small></div></div>'+
        (a.error?'<p class="portfolio-empty">'+escapeHtml(a.error)+'</p>':positions.length?'<div class="portfolio-table-scroll"><table class="portfolio-table">'+
          '<thead><tr><th>Position</th><th>Units</th><th>Last reported price</th><th>Public research</th></tr></thead><tbody>'+
          rows+'</tbody></table></div>':'<p class="portfolio-empty">No positions returned for this account. It may still have holdings unavailable through the connection.</p>')+
        '</article>';
    }).join(""):'<p class="portfolio-empty">No investment accounts have been shared yet. Manage your brokerage connections in SnapTrade Personal, then refresh this page.</p>';
    const items=Array.isArray(data.recentSecActivity)?data.recentSecActivity:[];
    el("portfolio-activity").innerHTML=items.length?'<div class="portfolio-table-scroll"><table class="portfolio-table">'+
      '<thead><tr><th>Ticker</th><th>Reported event</th><th>Published</th><th>Original source</th></tr></thead><tbody>'+
      items.map(t=>{
        const link=secLink(t.source_url);
        return '<tr><td><strong>'+escapeHtml(t.ticker)+'</strong><small>Unverified ticker match</small></td>'+
          '<td>'+escapeHtml(t.category==="reported_purchase"?"Reported purchase":t.category==="reported_sale"?"Reported sale":"Other ownership transaction")+
          '<small>'+escapeHtml(t.owner_name||"Reporting person")+'</small></td><td>'+escapeHtml(safeDate(t.published_at))+'</td>'+
          '<td>'+(link?'<a class="portfolio-small-link" target="_blank" rel="noopener noreferrer" href="'+escapeHtml(link)+'">SEC filing ↗</a>':'Not available')+'</td></tr>';
      }).join("")+'</tbody></table></div>':
      '<p class="portfolio-empty">No matching imported insider filings in the past 30 days. This does not mean no relevant SEC records exist; use the Research Desk for other disclosures.</p>';
    if(data.truncatedAccounts)setStatus("Only the first eight investment accounts are shown. Other accounts may be connected.");
    el("portfolio-results").hidden=false;
  }
  async function refresh() {
    setStatus("Loading brokerage holdings and related SEC filings…");
    try {const data=await request("/v1/me/brokerage/portfolio");renderPortfolio(data);
      if(!data.truncatedAccounts)setStatus("Read-only data loaded. Brokerage data may be delayed and positions are never trade instructions.");
    } catch(e){setStatus(e.message,true);}
  }
  async function status(){
    try{
      const r=await request("/v1/me/brokerage/status");
      el("portfolio-login").hidden=true;
      el("portfolio-connect").hidden=!r.available||r.connected;
      el("portfolio-refresh").hidden=!r.connected||!r.available;
      el("portfolio-disconnect").hidden=!r.connected;
      el("portfolio-results").hidden=!r.connected||!r.available;
      if(!r.available){setStatus(r.connected?
        "Existing brokerage permission found, but portfolio access is disabled. You can disconnect below.":
        "Brokerage connections are not configured yet. Research Desk is still available.");return;}
      if(!r.connected){setStatus("No connected brokerage. You can grant read-only access through SnapTrade Personal.");return;}
      setStatus("SnapTrade read-only access connected. Fetching investment accounts…");
      await refresh();
    }catch(e){
      if(e.status===401){el("portfolio-login").hidden=false;setStatus("Sign in to connect your brokerage securely.");}
      else setStatus(e.message,true);
    }
  }
  el("portfolio-connect").addEventListener("click",async()=>{
    const b=el("portfolio-connect");b.disabled=true;setStatus("Creating read-only authorization…");
    try {const result=await request("/v1/me/brokerage/connect","POST");
      const dest=new URL(result.url);
      if(dest.protocol!=="https:"||dest.hostname!=="dashboard.snaptrade.com")throw Error("Invalid authorization destination");
      location.assign(dest.toString());
    } catch(e){setStatus(e.message,true);b.disabled=false;}
  });
  el("portfolio-disconnect").addEventListener("click",async()=>{
    if(!confirm("Disconnect Insidir's brokerage access? You can reconnect later."))return;
    const b=el("portfolio-disconnect");b.disabled=true;setStatus("Revoking brokerage authorization…");
    try{await request("/v1/me/brokerage","DELETE");await status();}
    catch(e){setStatus(e.message+". If needed, also revoke Insidir directly in your SnapTrade account.",true);}
    finally{b.disabled=false;}
  });
  el("portfolio-refresh").addEventListener("click",refresh);
  const flag=new URLSearchParams(location.search).get("connection");
  if(flag==="connected")setStatus("Brokerage authorization completed. Checking access…");
  else if(flag==="cancelled")setStatus("Brokerage authorization was cancelled. No account was linked.");
  else if(flag==="error")setStatus("Connection failed or expired. Please try again.",true);
  if(flag)history.replaceState(null,"",location.pathname);
  status();
})();
