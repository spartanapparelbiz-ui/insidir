(() => {
"use strict";
const $=id=>document.getElementById(id),E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const d=x=>{if(!x)return "Not reported";const v=new Date(x);return Number.isNaN(v.getTime())?"Not reported":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(v)};
const money=x=>x==null||!Number.isFinite(Number(x))?"Not reported":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(x));
const source=x=>{try{let u=new URL(String(x));return u.protocol==="https:"&&(u.hostname==="sec.gov"||u.hostname==="www.sec.gov")&&!u.username&&!u.password?u.toString():"";}catch{return ""}};
document.addEventListener("DOMContentLoaded",async()=>{
  const a=new URLSearchParams(location.search).get("accession");
  const status=$("filing-status"),rows=$("filing-rows"),meta=$("filing-meta"),src=$("filing-source");
  if(!/^\d{18}$/.test(a||"")){status.textContent="Select a filing from the SEC filings library.";rows.innerHTML='<tr><td class="cl-empty" colspan="4">No filing selected. <a href="filings.html">Browse imported filings →</a></td></tr>';return;}
  try{
    const resp=await fetch("/v1/filings/"+encodeURIComponent(a),{credentials:"same-origin",headers:{Accept:"application/json"}});
    const data=await resp.json();
    if(!resp.ok)throw Error(data.error||"Could not load filing");
    const f=data.filing,items=Array.isArray(data.transactions)?data.transactions:[];
    $("filing-heading").textContent=String(f.issuer_name||f.ticker||"Ownership filing").slice(0,150);
    $("filing-subtitle").textContent=(f.form_type||"Form 4")+" · "+(f.ticker||"No ticker")+" · Published "+d(f.published_at);
    status.textContent="Imported SEC record retrieved. Verify reported details against the original filing.";
    meta.innerHTML="<span><strong>Form</strong> "+E(f.form_type||"4")+"</span><span><strong>Published</strong> "+E(d(f.published_at))+"</span><span><strong>Report period</strong> "+E(d(f.period_of_report))+"</span>"+(f.is_amendment?"<span>Amendment</span>":"");
    let url=source(f.source_url);
    src.innerHTML=url?'<a href="'+E(url)+'" target="_blank" rel="noopener noreferrer" class="cl-source-link" data-hf-atom>Read original SEC filing ↗</a>':"Original source URL unavailable";
    rows.innerHTML=items.length?items.map(t=>{
      const type=t.category==="reported_purchase"?"Reported purchase":t.category==="reported_sale"?"Reported sale":"Other ownership transaction";
      return "<tr><td>"+E(t.owner_name||"Reporting person")+"</td><td>"+E(type)+"<span class='cl-muted'>Code: "+E(t.transaction_code||"not provided")+"</span></td><td>"+E(d(t.transaction_date))+"</td><td>"+E(money(t.estimated_value))+"</td></tr>";
    }).join(""):'<tr><td colspan="4" class="cl-empty">No parsed transactions are available for this filing. Open the original SEC document.</td></tr>';
  }catch(e){status.textContent=e.message;rows.innerHTML='<tr><td colspan="4" class="cl-empty">Filing details unavailable. <a href="filings.html">Browse other filings →</a></td></tr>';}
});
})();
