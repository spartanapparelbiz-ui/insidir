/* Free, self-reported portfolio. No Plaid, broker permissions, orders, live prices or synthetic data. */
(() => {
  "use strict";
  const el=id=>document.getElementById(id);
  if(!el("manual-form"))return;
  const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const validTicker=value=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(value);
  const qty=value=>value==null?"—":String(value).replace(/(?:\.0+|(?<=\.[0-9]*[1-9])0+)$/,"");
  const date=value=>{if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});};
  const sourceURL=value=>{try{const u=new URL(String(value));return u.protocol==="https:"&&
    (u.hostname==="www.sec.gov"||u.hostname==="sec.gov")?u.toString():null;}catch{return null;}};
  /* Reported purchases print green with ▲, sales red with ▼; the words always carry the meaning. */
  const event=(category,words)=>{
    const dir=category==="reported_purchase"?"up":category==="reported_sale"?"down":"";
    return '<span class="desk-dir'+(dir?" is-"+dir:"")+'">'+(dir?'<span class="desk-glyph is-'+dir+'" aria-hidden="true"></span>':"")+escapeHTML(words)+'</span>';
  };
  const feedback=(message,isError=false)=>{const node=el("manual-feedback");node.textContent=message;node.classList.toggle("is-error",Boolean(isError));};
  async function request(path,options={}){
    const res=await fetch(path,{credentials:"same-origin",headers:{
      Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},...options});
    let json;try{json=await res.json();}catch{throw Error("Portfolio service unavailable");}
    if(!res.ok){const error=new Error(json.error||"Request failed");error.status=res.status;throw error;}
    return json;
  }
  function renderHoldings(items){
    const host=el("manual-holdings");
    if(!items.length){host.innerHTML='<p class="portfolio-empty">No stocks added yet. Enter your first ticker above.</p>';return;}
    const rows=items.map(item=>{
      const ticker=String(item.ticker||"").toUpperCase();
      if(!validTicker(ticker))return "";
      return '<tr><td data-label="Ticker"><strong>'+escapeHTML(ticker)+'</strong><small>Entered manually</small></td>'+
        '<td data-label="Shares entered">'+escapeHTML(qty(item.quantity))+'</td><td data-label="Last edited">'+escapeHTML(date(item.updated_at))+'</td>'+
        '<td data-label="Research"><a class="portfolio-small-link" href="research.html?ticker='+encodeURIComponent(ticker)+'">View SEC research →</a></td>'+
        '<td class="manual-holdings-table__remove"><button class="manual-remove" type="button" data-remove-ticker="'+escapeHTML(ticker)+'" aria-label="Remove '+escapeHTML(ticker)+'">Remove</button></td></tr>';
    }).join("");
    host.innerHTML='<div class="portfolio-table-scroll"><table class="portfolio-table manual-holdings-table">'+
      '<caption class="sr-only">Stocks you entered manually</caption><thead><tr><th>Ticker</th><th>Shares entered</th><th>Last edited</th><th>Research</th><th></th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>';
  }
  function renderEvidence(items){
    const host=el("manual-evidence");
    if(!items.length){host.innerHTML='<p class="portfolio-empty">No matching imported Form 4 filings in the last 30 days. This does not mean there is no relevant SEC information. Open a ticker’s Research Desk to view other SEC disclosures.</p>';return;}
    host.innerHTML='<div class="portfolio-table-scroll"><table class="portfolio-table">'+
      '<thead><tr><th>Ticker</th><th>Published event</th><th>Filed</th><th>Original source</th></tr></thead>'+
      '<tbody>'+items.map(item=>{
        const ticker=String(item.ticker||"");
        const category=item.category==="reported_purchase"?"Reported purchase":item.category==="reported_sale"?"Reported sale":"Other Form 4 transaction";
        const link=sourceURL(item.source_url);
        return '<tr><td data-label="Ticker"><strong>'+escapeHTML(ticker)+'</strong><small>Ticker-only match</small></td>'+
          '<td data-label="Published event">'+event(item.category,category)+'<small>'+escapeHTML(item.owner_name||"Reporting person")+'</small></td>'+
          '<td data-label="Filed">'+escapeHTML(date(item.published_at))+'</td><td data-label="Original source">'+
          (link?'<a class="portfolio-small-link" href="'+escapeHTML(link)+'" rel="noopener noreferrer" target="_blank">SEC filing ↗</a>':'Source unavailable')+
          '</td></tr>';
      }).join("")+'</tbody></table></div>';
  }
  async function load(){
    try{
      const data=await request("/v1/me/manual-holdings");
      el("manual-signin").hidden=true;
      el("manual-content").hidden=false;
      renderHoldings(data.items||[]);
      renderEvidence(data.recentSecActivity||[]);
      feedback((data.items||[]).length+' stocks saved privately. Shares are self-reported and do not reflect current market values.');
      el("manual-save").disabled=false;
    }catch(e){
      el("manual-content").hidden=true;
      if(e.status===401){
        el("manual-signin").hidden=false;
        feedback("Sign in or create an account to save your stocks. No brokerage connection required.");
      }else feedback(e.message,true);
    }
  }
  el("manual-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const ticker=el("manual-ticker").value.trim().toUpperCase();
    const quantity=el("manual-quantity").value.trim();
    if(!validTicker(ticker)||!/^\d{1,10}(?:\.\d{1,8})?$/.test(quantity)||
       Number(quantity)<=0||Number(quantity)>1e9){
      feedback("Enter a valid ticker and a share quantity greater than zero (up to 8 decimals).",true);return;
    }
    const button=el("manual-save");button.disabled=true;feedback("Saving your holding…");
    try {
      await request("/v1/me/manual-holdings",{method:"POST",body:JSON.stringify({ticker,quantity})});
      el("manual-ticker").value="";el("manual-quantity").value="";
      await load();
    }catch(e){feedback(e.message,true);}finally{button.disabled=false;}
  });
  el("manual-holdings").addEventListener("click",async event=>{
    const button=event.target.closest("[data-remove-ticker]");
    if(!button)return;
    const ticker=button.getAttribute("data-remove-ticker");
    if(!validTicker(ticker))return;
    if(!confirm("Remove "+ticker+" from your manually entered holdings?"))return;
    button.disabled=true;feedback("Removing "+ticker+"…");
    try{await request("/v1/me/manual-holdings/"+encodeURIComponent(ticker),{method:"DELETE"});await load();}
    catch(e){feedback(e.message,true);button.disabled=false;}
  });
  load();
})();
