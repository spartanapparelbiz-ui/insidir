/* Production research views: no simulated transactions, market prices or politicians. */
(() => {
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const d=x=>{if(!x)return "—";const n=new Date(x);return Number.isNaN(n.getTime())?"—":n.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"})};
const cash=n=>n==null?"—":Number(n).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
const cleanTicker=t=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(t||"").toUpperCase())?String(t).toUpperCase():"";
async function get(path){const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json"}});let v;try{v=await r.json()}catch{throw Error("Research engine unavailable")};if(!r.ok)throw Error(v.error||"Research engine unavailable");return v}
const cell=(html)=>"<td>"+html+"</td>";
/* A reporting person's name opens their own file (person.html?cik=, the owner CIK without leading zeros) when the row
   carries the CIK. A joint filing (owner_cik null) names each owner the engine lists in owners:[{cik,name}], each
   linked; with no list (a line imported before the owners were recorded) its joined owner_name is split on the
   commas (a ", Inc." or ", Jr." stays on the name before it). A name with no CIK opens the people directory's search
   for it (people.html?q=<name>#v10-directory). The tile pictures the first owner with a CIK. */
const fileHref=cik=>{const c=String(cik??"").trim();return /^\d{1,10}$/.test(c)&&/[1-9]/.test(c)?"person.html?cik="+c.replace(/^0+/,""):"";};
const personHref=(cik,name)=>{const n=String(name??"").replace(/\s+/g," ").trim().slice(0,80);return fileHref(cik)||(n?"people.html?q="+encodeURIComponent(n)+"#v10-directory":"");};
const SUFFIX=/^(?:inc|llc|l\.?l\.?c|l\.?p|lp|ltd|limited|co|corp|corporation|company|plc|n\.?a|n\.?v|s\.?a|ag|se|jr|sr|ii|iii|iv|v|esq|m\.?d|ph\.?d)\.?$/i;
const splitNames=s=>String(s??"").split(/\s*,\s*/).filter(Boolean).reduce((out,p)=>{if(out.length&&SUFFIX.test(p))out[out.length-1]+=", "+p;else out.push(p);return out;},[]);
const ownersOf=x=>{const listed=x.owner_cik?[{cik:x.owner_cik,name:x.owner_name}]:Array.isArray(x.owners)&&x.owners.length?x.owners.filter(o=>o&&(o.cik||o.name)):splitNames(x.owner_name).map(name=>({cik:null,name}));return listed.length?listed.slice(0,12):[{cik:null,name:""}];};
const leadOf=x=>{const o=ownersOf(x);return o.find(p=>fileHref(p.cik))||o[0];};
const nameLink=o=>{const n=E(o.name||"Reporting person"),h=personHref(o.cik,o.name);return h?'<a class="ins-person-link" href="'+E(h)+'">'+n+"</a>":n;};
const person=x=>ownersOf(x).map(nameLink).join(", ");
const link=t=>'<a href="company.html?ticker='+encodeURIComponent(cleanTicker(t))+'">'+E(t||"—")+"</a>";
function table(h,rows){return '<table class="data-table live-table"><thead><tr>'+h.map(x=>"<th>"+E(x)+"</th>").join("")+'</tr></thead><tbody>'+rows.join("")+"</tbody></table>"}
function status(msg){return '<div class="live-status">'+E(msg)+'</div>'}
function css(){const s=document.createElement("style");s.textContent='.index-cards,.dash-sky,.sample-note{display:none!important}.dash-body{min-height:100px}.data-table td{padding:12px;border-bottom:1px solid var(--hf-line)}.data-table td a{text-decoration:underline;text-underline-offset:3px}.research-strip{padding:22px;border:1px solid var(--hf-line);background:var(--hf-surface);margin-bottom:18px}.research-strip h2{font:700 24px/1.1 var(--hf-sans);letter-spacing:-.04em;margin:0 0 7px}.research-strip p{font-size:13px;color:var(--hf-muted)}.live-empty{font-size:13px;color:var(--hf-muted);padding:22px}.live-actions{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.live-actions a{padding:10px 15px;border:1px solid var(--hf-line-2);background:transparent;text-decoration:none}.research-source{font-size:11px;color:var(--hf-muted);padding:16px}.live-status{padding:30px;color:var(--hf-muted);line-height:1.7}.live-panel{padding:30px}.live-title{font:800 48px/1 var(--hf-sans);letter-spacing:-.05em;margin:0 0 8px}.live-h2{font:700 30px/1.1 var(--hf-sans);letter-spacing:-.045em;margin:28px 0 13px}';document.head.append(s)}
async function dash(){
 css();document.querySelectorAll("[data-count],[data-spark]").forEach(el=>{el.removeAttribute("data-count");el.removeAttribute("data-spark")});
 const summary=document.querySelector(".dash-hero");if(summary)summary.insertAdjacentHTML("afterend",'<section class="research-strip" aria-label="Data source"><h2>Investigate the evidence. Make your move.</h2><p>Research starts with imported SEC Form 4 disclosures and original filing links. Trade dates and public filing dates can differ. Brokerage trading automation and political datasets are not yet available.</p><div class="live-actions"><a href="research.html">Investigate a company</a><a href="billing.html">Pro and billing</a><a href="alerts.html">My matched activity</a></div></section>');
 const entries=Object.fromEntries(["insider","watch","filings","political"].map(k=>[k,document.querySelector('[data-rows="'+k+'"]')]));
 Object.values(entries).forEach(e=>{if(e)e.innerHTML='<tr>'+cell(status("Loading SEC records…"))+"</tr>"});
 try{const [tx,f,st]=await Promise.all([get("/v1/transactions?limit=50"),get("/v1/filings?limit=12"),get("/v1/status")]);
 const a=tx.items||[],b=f.items||[];
 const shortRows=items=>items.map(t=>'<tr>'+cell(d(t.transaction_date))+cell(person(t))+cell(link(t.ticker))+cell(E(t.category==="reported_purchase"?"Reported purchase":t.category==="reported_sale"?"Reported sale":"Other"))+cell(cash(t.estimated_value))+"</tr>").join("");
 if(entries.insider){const host=entries.insider.closest("table");host.innerHTML=table(["Trade date","Reporting person","Ticker","Type","Est. value"],a.map(t=>'<tr>'+cell(d(t.transaction_date))+cell(person(t))+cell(link(t.ticker))+cell(E(t.category==="reported_purchase"?"Purchase":t.category==="reported_sale"?"Sale":"Other"))+cell(cash(t.estimated_value))+"</tr>"));if(!a.length)entries.insider.closest(".dash-body")?.insertAdjacentHTML("beforeend",status("No transactions imported yet. The official SEC feed has not populated this database."))}
 if(entries.filings){entries.filings.closest("table").innerHTML=table(["Ticker","Form","Published","Source"],b.map(x=>'<tr>'+cell(link(x.ticker))+cell(E(x.form_type))+cell(d(x.published_at))+cell('<a href="filing.html?accession='+encodeURIComponent(x.accession)+'">Review →</a>')+"</tr>"));if(!b.length)entries.filings.closest(".dash-body")?.insertAdjacentHTML("beforeend",status("No source-linked filings imported yet."))}
 if(entries.political){const tableEl=entries.political.closest("table");tableEl.innerHTML='<tbody><tr><td>'+status("Political transaction ingestion is disabled pending legal and licensing review. No political trades shown.")+"</td></tr></tbody>"}
 if(entries.watch){try{const w=await get("/v1/me/watchlist");entries.watch.closest("table").innerHTML=table(["Ticker","Saved","Research"],(w.items||[]).map(x=>'<tr>'+cell(link(x.ticker))+cell(d(x.created_at))+cell('<a href="company.html?ticker='+encodeURIComponent(x.ticker)+'">View filings</a>')+"</tr>"));if(!w.items?.length)entries.watch.closest(".dash-body")?.insertAdjacentHTML("beforeend",status("No saved tickers yet. Open a company to follow it."))}catch{entries.watch.closest("table").innerHTML='<tbody><tr><td>'+status("Sign in to access your saved watchlist.")+'</td></tr></tbody>'}}
 document.querySelector(".dash-sub")?.replaceChildren(document.createTextNode(st.filings+" imported SEC filings · Latest reported disclosures only"));
 const filter=document.querySelector("[data-segmented]");if(filter){filter.addEventListener("click",e=>{const v=e.target.closest("[data-value]")?.dataset.value;if(!v)return;const filtered=v==="all"?a:a.filter(x=>x.category===(v==="buys"?"reported_purchase":"reported_sale"));const tableEl=document.querySelector(".dash-insider table");if(tableEl)tableEl.innerHTML=table(["Trade date","Reporting person","Ticker","Type","Est. value"],filtered.map(t=>'<tr>'+cell(d(t.transaction_date))+cell(person(t))+cell(link(t.ticker))+cell(E(t.category==="reported_purchase"?"Purchase":t.category==="reported_sale"?"Sale":"Other"))+cell(cash(t.estimated_value))+"</tr>"))})}
 }catch(ex){Object.values(entries).forEach(el=>{if(el){const tab=el.closest("table");if(tab)tab.innerHTML='<tbody><tr><td>'+status(ex.message)+"</td></tr></tbody>"}})}
}
async function company(){
 css();const params=new URLSearchParams(location.search),t=cleanTicker(params.get("ticker")||"");
 const main=document.querySelector("main");if(!main)return;
 main.innerHTML='<section class="research-strip"><h1 class="live-title">'+E(t||"Company research")+'</h1><p>Company research · Reported insider transactions · Original SEC evidence</p><div class="live-actions"><a href="dashboard.html">Dashboard</a><a href="research.html?ticker='+encodeURIComponent(t)+'">Investigate this company</a><a href="alerts.html">Alerts</a></div></section><section class="panel live-panel"><div id="company-live">'+status("Loading source-linked company records…")+'</div></section>';
 if(!t){document.querySelector("#company-live").innerHTML=status("Enter a ticker using company.html?ticker=SYMBOL.");return}
 try{const [tx,fil]=await Promise.all([get("/v1/transactions?ticker="+encodeURIComponent(t)+"&limit=75"),get("/v1/filings?ticker="+encodeURIComponent(t)+"&limit=40")]);const rows=(tx.items||[]).map(x=>'<tr>'+cell(d(x.transaction_date))+cell(person(x))+cell(E(x.category))+cell(cash(x.estimated_value))+cell('<a href="filing.html?accession='+encodeURIComponent(x.accession)+'">Source</a>')+"</tr>");
 const fs=(fil.items||[]).map(x=>'<tr>'+cell(d(x.published_at))+cell(E(x.form_type))+cell(E(x.issuer_name))+cell('<a href="filing.html?accession='+encodeURIComponent(x.accession)+'">Review</a>')+"</tr>");
 document.querySelector("#company-live").innerHTML='<div class="live-actions"><button id="follow-co" class="btn btn--dark">Save ticker to watchlist</button></div><h2 class="live-h2">Reported insider transactions</h2>'+(rows.length?table(["Trade date","Reporting person","Category","Estimated value","Filing"],rows):status("No parsed transactions for this ticker in the imported data."))+'<h2 class="live-h2">Original SEC filings</h2>'+(fs.length?table(["Published","Form","Issuer","Source"],fs):status("No matching SEC filings have been imported."))+'<p class="research-source">Source-backed Form 4 research is available here. Brokerage trading, live price charts and expanded data sources are not active.</p>';
 document.querySelector("#follow-co")?.addEventListener("click",async e=>{const btn=e.currentTarget;try{const r=await fetch("/v1/me/watchlist",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({ticker:t})});if(!r.ok)throw Error((await r.json()).error||"Could not save");btn.textContent="Saved to watchlist"}catch{btn.textContent="Sign in to save";btn.onclick=()=>location.assign("signin.html")}})
 }catch(ex){document.querySelector("#company-live").innerHTML=status(ex.message)}
}
async function alerts(){
 css();document.querySelector(".alerts-sub")?.replaceChildren(document.createTextNode("SEC Form 4 activity for companies and people you follow. Opt in above for phone and desktop push notifications."));
 const panel=document.querySelector(".alerts-panel");if(!panel)return;panel.innerHTML='<div class="live-panel" id="alerts-real">'+status("Loading saved watchlist activity…")+"</div>";
 document.querySelector("#manage-alerts")?.setAttribute("hidden","");
 document.querySelector(".alert-filters")?.setAttribute("hidden","");
 /* Identity tiles (entity-media.js): the company's logo beside its ticker, the reporting person's headshot
    (found by SEC owner CIK, or the company's logo standing in for it) beside their name. */
 const M=window.InsidirMedia;
 const co=t=>M?'<div class="ins-company-cell">'+M.logo(cleanTicker(t),"sm")+link(t)+"</div>":link(t);
 const who=x=>{if(!M)return person(x);const l=leadOf(x);return '<div class="ins-person-cell">'+M.portrait(l.name||"",cleanTicker(x.ticker),"sm",{cik:l.cik,issuerCik:x.issuer_cik})+'<span class="ins-person-cell__name">'+person(x)+"</span></div>";};
 try{const r=await get("/v1/me/alerts");const rows=(r.items||[]).map(x=>'<tr>'+cell(d(x.published_at))+cell(co(x.ticker))+cell(who(x))+'<td class="'+(x.category==="reported_purchase"?"buy":x.category==="reported_sale"?"sell":"")+'">'+(x.category==="reported_purchase"?'<span class="desk-glyph is-up" aria-hidden="true"></span>':x.category==="reported_sale"?'<span class="desk-glyph is-down" aria-hidden="true"></span>':"")+E(x.category==="reported_purchase"?"Reported purchase":x.category==="reported_sale"?"Reported sale":"Other transaction")+"</td>"+cell(d(x.transaction_date))+"<td>"+(x.accession?'<button class="btn btn--dark" type="button" data-ai-acc="'+E(x.accession)+'">Explain</button>':"")+"</td></tr>");document.querySelector("#alerts-real").innerHTML=rows.length?table(["Filed","Ticker","Reporting person","Category","Transaction date","Research"],rows):status("No matching transactions in the last 30 days. Save a ticker to start monitoring.");M?.hydrate(document.querySelector("#alerts-real"));
   document.querySelector("#alerts-real")?.addEventListener("click",async event=>{
    const button=event.target.closest("button[data-ai-acc]");if(!button)return;
    button.disabled=true;button.textContent="Researching…";
    try{
     const report=await get("/v1/ai/explain?accession="+encodeURIComponent(button.dataset.aiAcc));
     const row=document.createElement("tr"),detail=document.createElement("td");detail.colSpan=6;detail.className="research-source";
     detail.textContent="Insidir AI research · "+String(report.explanation||"")+" Source: SEC filing "+button.dataset.aiAcc+". Factual description, not investment advice.";
     row.append(detail);button.closest("tr")?.after(row);button.textContent="Explained";
    }catch(error){button.textContent=error.message||"AI unavailable";button.disabled=false;}
   });

 }catch(ex){document.querySelector("#alerts-real").innerHTML=status(ex.message+". Sign in to access personalized activity.")}
}
async function filing(){
 css();const accession=new URLSearchParams(location.search).get("accession"),main=document.querySelector("main");
 if(!main)return;main.innerHTML='<div class="research-strip"><h1 class="live-title">SEC filing detail</h1><p>Original Form 4 ownership record and parsed transactions.</p></div><div id="filing-real" class="panel live-panel">'+status("Loading official filing…")+"</div>";
 if(!/^\d{18}$/.test(accession||"")){document.querySelector("#filing-real").innerHTML=status("Open a Form 4 filing from the dashboard to inspect its original source.");return}
 try{const r=await get("/v1/filings/"+accession),f=r.filing,rows=(r.transactions||[]).map(x=>'<tr>'+cell(d(x.transaction_date))+cell(person(x))+cell(E(x.category))+cell(E(x.transaction_code))+cell(cash(x.estimated_value))+"</tr>");document.querySelector("#filing-real").innerHTML='<h2 class="live-h2">'+E(f.issuer_name||f.ticker||"Form 4")+"</h2><p>Published "+d(f.published_at)+" · Period "+d(f.period_of_report)+(f.is_amendment?" · Amended":"")+"</p>"+(rows.length?table(["Transaction date","Insider","Type","Code","Est. value"],rows):status("No parsed transactions in this filing."))+'<p class="research-source">Official SEC source: '+E(f.source_url)+'</p>';
 }catch(ex){document.querySelector("#filing-real").innerHTML=status(ex.message)}
}
document.addEventListener("DOMContentLoaded",()=>{if(document.body.classList.contains("dash-page"))dash();else if(document.querySelector(".co"))company();else if(document.querySelector(".alerts-main"))alerts();else if(document.querySelector(".filing-main")||location.pathname.endsWith("/filing.html"))filing()});
})();
