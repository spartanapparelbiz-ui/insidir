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
  /* Sections that start hidden: the scroll reveal (v13-motion.js) passes over anything hidden when it first meets it,
     so their blocks carry data-desk-reveal in the page and are armed as the section is first shown. */
  const armReveal=section=>{
    for(const block of [section,...section.querySelectorAll("[data-desk-reveal]")]){
      if(!block.hasAttribute("data-desk-reveal"))continue;
      block.setAttribute(block.getAttribute("data-desk-reveal")==="group"?"data-hf-reveal-group":"data-hf-reveal","");
      block.removeAttribute("data-desk-reveal");
    }
  };
  /* Identity tiles (entity-media.js): each stock's real company logo, and each reporting person's headshot
     (found by SEC owner CIK, or the company's logo standing in for it). */
  const media=window.InsidirMedia;
  const withLogo=(ticker,html)=>media&&validTicker(ticker)?'<div class="ins-company-cell">'+media.logo(ticker,"sm")+'<div>'+html+'</div></div>':html;
  /* The reporting person's name opens their own file (person.html?cik=, the owner CIK without leading zeros) when the
     row carries the CIK. A joint filing (owner_cik null) names each owner the engine lists in owners:[{cik,name}], each
     linked; with no list its joined owner_name is split on the commas (a ", Inc." or ", Jr." stays on the name before
     it). A name with no CIK opens the people directory's search for it (people.html?q=<name>#v10-directory). The tile
     pictures the first owner with a CIK. */
  const fileHref=cik=>{const c=String(cik??"").trim();return /^\d{1,10}$/.test(c)&&/[1-9]/.test(c)?"person.html?cik="+c.replace(/^0+/,""):"";};
  const personHref=(cik,name)=>{const n=String(name??"").replace(/\s+/g," ").trim().slice(0,80);return fileHref(cik)||(n?"people.html?q="+encodeURIComponent(n)+"#v10-directory":"");};
  const SUFFIX=/^(?:inc|llc|l\.?l\.?c|l\.?p|lp|ltd|limited|co|corp|corporation|company|plc|n\.?a|n\.?v|s\.?a|ag|se|jr|sr|ii|iii|iv|v|esq|m\.?d|ph\.?d)\.?$/i;
  const splitNames=s=>String(s??"").split(/\s*,\s*/).filter(Boolean).reduce((out,p)=>{if(out.length&&SUFFIX.test(p))out[out.length-1]+=", "+p;else out.push(p);return out;},[]);
  const ownersOf=item=>{const listed=item.owner_cik?[{cik:item.owner_cik,name:item.owner_name}]:Array.isArray(item.owners)&&item.owners.length?item.owners.filter(o=>o&&(o.cik||o.name)):splitNames(item.owner_name).map(name=>({cik:null,name}));return listed.length?listed.slice(0,12):[{cik:null,name:""}];};
  const nameLink=o=>{const n=escapeHTML(o.name||"Reporting person"),h=personHref(o.cik,o.name);return h?'<a class="ins-person-link" href="'+escapeHTML(h)+'">'+n+'</a>':n;};
  const personName=item=>ownersOf(item).map(nameLink).join(", ");
  const owner=item=>{
    if(!media)return '<small>'+personName(item)+'</small>';
    const list=ownersOf(item),lead=list.find(o=>fileHref(o.cik))||list[0];
    return '<div class="ins-person-cell ins-person-cell--sub">'+media.portrait(lead.name||"",String(item.ticker||"").toUpperCase(),"xs",{cik:lead.cik,issuerCik:item.issuer_cik})+'<small>'+personName(item)+'</small></div>';
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
      return '<tr><td data-label="Ticker">'+withLogo(ticker,'<strong>'+escapeHTML(ticker)+'</strong><small>Entered manually</small>')+'</td>'+
        '<td data-label="Shares entered">'+escapeHTML(qty(item.quantity))+'</td><td data-label="Last edited">'+escapeHTML(date(item.updated_at))+'</td>'+
        '<td data-label="Research"><a class="portfolio-small-link" href="research.html?ticker='+encodeURIComponent(ticker)+'">View SEC research →</a></td>'+
        '<td class="manual-holdings-table__remove"><button class="manual-remove" type="button" data-remove-ticker="'+escapeHTML(ticker)+'" aria-label="Remove '+escapeHTML(ticker)+'">Remove</button></td></tr>';
    }).join("");
    host.innerHTML='<div class="portfolio-table-scroll"><table class="portfolio-table manual-holdings-table">'+
      '<caption class="sr-only">Stocks you entered manually</caption><thead><tr><th>Ticker</th><th>Shares entered</th><th>Last edited</th><th>Research</th><th></th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>';
    media?.hydrate(host);
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
        return '<tr><td data-label="Ticker">'+withLogo(ticker.toUpperCase(),'<strong>'+escapeHTML(ticker)+'</strong><small>Ticker-only match</small>')+'</td>'+
          '<td data-label="Published event">'+event(item.category,category)+owner(item)+'</td>'+
          '<td data-label="Filed">'+escapeHTML(date(item.published_at))+'</td><td data-label="Original source">'+
          (link?'<a class="portfolio-small-link" href="'+escapeHTML(link)+'" rel="noopener noreferrer" target="_blank">SEC filing ↗</a>':'Source unavailable')+
          '</td></tr>';
      }).join("")+'</tbody></table></div>';
    media?.hydrate(host);
  }
  async function load(){
    try{
      const data=await request("/v1/me/manual-holdings");
      el("manual-signin").hidden=true;
      armReveal(el("manual-content"));
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
