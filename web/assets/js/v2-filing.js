(() => {
"use strict";
const $=id=>document.getElementById(id),E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const d=x=>{if(!x)return "Not reported";const v=new Date(x);return Number.isNaN(v.getTime())?"Not reported":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(v)};
/* Filing timestamps are shown on the SEC's calendar day (America/New_York): a Form 4 accepted at 9:30 p.m. ET was filed that day,
   though it is already past midnight UTC. Date-only values (trade and report dates) stay in UTC. */
const filed=x=>{if(!x)return "Not reported";const v=new Date(x);return Number.isNaN(v.getTime())?"Not reported":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York"}).format(v)};
const money=x=>x==null||!Number.isFinite(Number(x))?"Not reported":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x));
const num=x=>x==null||!Number.isFinite(Number(x))?null:new Intl.NumberFormat("en-US",{maximumFractionDigits:6}).format(Number(x));
/* Prices as filed (up to six decimals), never rounded to whole dollars. */
const price=x=>x==null||!Number.isFinite(Number(x))?null:"$"+new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:6}).format(Number(x));
/* SEC Form 4 transaction codes in plain words (General Instructions, Item 8). Only P and S are open-market trades. */
const CODE={P:"Open-market or private purchase",S:"Open-market or private sale",A:"Grant or award",M:"Exercise or conversion of a derivative",C:"Conversion of a derivative",
  F:"Shares withheld for tax or exercise price",G:"Gift",D:"Disposition to the issuer",J:"Other acquisition or disposition (described in a footnote)",X:"Exercise of an in-the-money or at-the-money derivative",
  I:"Discretionary transaction",L:"Small acquisition",W:"Acquisition or disposition by will or the laws of descent",Z:"Deposit into or withdrawal from a voting trust",
  K:"Equity swap or similar instrument",U:"Disposition in a change of control",E:"Expiration of a short derivative position",H:"Expiration (or cancellation) of a long derivative position",O:"Exercise of an out-of-the-money derivative",V:"Transaction voluntarily reported earlier than required"};
/* Identity tiles (entity-media.js): the issuer's logo in the heading, each reporting person's headshot (or
   the issuer's logo standing in for it, found by issuer CIK when the filing has no ticker) in the rows. Names stay visible beside them, so tiles are aria-hidden. */
const media=window.InsidirMedia;
/* Each reporting person's name opens their own file (person.html?cik=, the owner CIK without leading zeros) when the
   line carries the CIK; a joint filing (several reporting owners on one line, owner_cik null) names each owner the
   engine lists in owners:[{cik,name}], each linked; with no list (a line imported before the owners were recorded) its
   joined owner_name is split on the commas (a ", Inc." or ", Jr." stays on the name before it). A name with no CIK
   opens the people directory's search for it (people.html?q=<name>#v10-directory). */
const fileHref=cik=>{const c=String(cik??"").trim();return /^\d{1,10}$/.test(c)&&/[1-9]/.test(c)?"person.html?cik="+c.replace(/^0+/,""):"";};
const personHref=(cik,name)=>{const n=String(name??"").replace(/\s+/g," ").trim().slice(0,80);return fileHref(cik)||(n?"people.html?q="+encodeURIComponent(n)+"#v10-directory":"");};
const SUFFIX=/^(?:inc|llc|l\.?l\.?c|l\.?p|lp|ltd|limited|co|corp|corporation|company|plc|n\.?a|n\.?v|s\.?a|ag|se|jr|sr|ii|iii|iv|v|esq|m\.?d|ph\.?d)\.?$/i;
const splitNames=s=>String(s??"").split(/\s*,\s*/).filter(Boolean).reduce((out,p)=>{if(out.length&&SUFFIX.test(p))out[out.length-1]+=", "+p;else out.push(p);return out;},[]);
const ownersOf=t=>{const listed=t.owner_cik?[{cik:t.owner_cik,name:t.owner_name}]:Array.isArray(t.owners)&&t.owners.length?t.owners.filter(o=>o&&(o.cik||o.name)):splitNames(t.owner_name).map(name=>({cik:null,name}));return listed.length?listed:[{cik:null,name:""}];};
const nameLink=o=>{const n=E(o.name||"Reporting person"),h=personHref(o.cik,o.name);return h?'<a class="ins-person-link" href="'+E(h)+'">'+n+"</a>":n;};
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
    // The plain-English panel (filing-simple.js) reads the same answer.
    document.dispatchEvent(new CustomEvent("insidir:filing",{detail:data}));
    const heading=$("filing-heading"),title=String(f.issuer_name||f.ticker||"Ownership filing").slice(0,150);
    heading.innerHTML=(media&&(f.ticker||f.issuer_cik)?media.company({ticker:f.ticker,cik:f.issuer_cik,name:f.issuer_name,size:"lg"}):"")+"<span>"+E(title)+"</span>";
    $("filing-subtitle").textContent=(f.form_type||"Form 4")+" · "+(f.ticker||"No ticker")+" · Published "+filed(f.published_at);
    status.textContent="Imported SEC record retrieved. Verify reported details against the original filing.";
    // A Rule 10b5-1 plan, as the filer marked it (the box exists on filings made under the April 2023 form; older ones do not state it).
    const plan=f.rule_10b5_1===true?"Marked by the filer":f.rule_10b5_1===false?"Not marked":"Not stated on this form";
    meta.innerHTML="<span><strong>Form</strong> "+E(f.form_type||"4")+"</span><span><strong>Published</strong> "+E(filed(f.published_at))+"</span><span><strong>Report period</strong> "+E(d(f.period_of_report))+"</span>"+
      "<span><strong>Rule 10b5-1 plan</strong> "+E(plan)+"</span>"+
      // The engine's checks on this filing (src/sec.mjs validateOwnership): passed, notes, or failed with the reasons.
      (f.validation_status?"<span><strong>Checks</strong> "+E(f.validation_status==="valid"?"Passed":f.validation_status==="warnings"?"Passed with notes: ":"Failed, so this filing is shown as filed and never used for alerts: ")+
        E((Array.isArray(f.validation_issues)?f.validation_issues:[]).map(i=>i.detail).join("; "))+"</span>":"")+(f.is_amendment?"<span><strong>Amendment</strong> "+(f.original_filed_on?"of the filing made "+E(d(f.original_filed_on)):"(original filing date not stated)")+"</span>":"");
    let url=source(f.source_url);
    src.innerHTML=url?'<a href="'+E(url)+'" target="_blank" rel="noopener noreferrer" class="cl-source-link" data-hf-atom>Read original SEC filing ↗</a>':"Original source URL unavailable";
    rows.innerHTML=items.length?items.map(t=>{
      const code=String(t.transaction_code||"").toUpperCase(),type=CODE[code]||"Other ownership transaction";
      // What the line says, as filed: amount, security, price; for a derivative, what it converts into; ownership; timeliness.
      const amount=num(t.shares),px=price(t.price_per_share);
      const what=[amount?(t.acquired_disposed==="D"?"Disposed of ":t.acquired_disposed==="A"?"Acquired ":"")+amount+" "+(t.security_title||"securities"):null,
        px&&Number(t.price_per_share)>0?"at "+px:"no price reported",
        t.derivative&&t.underlying_shares!=null?"for "+num(t.underlying_shares)+" "+(t.underlying_title||"underlying shares")+(t.exercise_price!=null?" at "+price(t.exercise_price):""):null,
        t.direct_ownership==="I"?"held indirectly"+(t.nature_of_ownership?" ("+t.nature_of_ownership+")":""):t.direct_ownership==="D"?"held directly":null,
        t.timeliness==="L"?"marked late by the filer":t.timeliness==="E"?"reported early":null].filter(Boolean).join(" · ");
      const owners=ownersOf(t),lead=owners.find(o=>fileHref(o.cik))||owners[0],who=owners.map(nameLink).join(", ");
      return "<tr><td>"+(media?"<div class='ins-person-cell'>"+media.portrait(lead.name||"",t.ticker||f.ticker,"sm",{cik:lead.cik,issuerCik:t.issuer_cik||f.issuer_cik})+"<span class='ins-person-cell__name'>"+who+"</span></div>":who)+"</td><td>"+E(type)+"<span class='cl-muted'>Code "+E(code||"not provided")+" · "+E(what)+"</span></td><td>"+E(d(t.transaction_date))+"</td><td>"+E(money(t.estimated_value))+"</td></tr>";
    }).join(""):'<tr><td colspan="4" class="cl-empty">No parsed transactions are available for this filing. Open the original SEC document.</td></tr>';
    media?.hydrate(heading);media?.hydrate(rows);
  }catch(e){status.textContent=e.message;rows.innerHTML='<tr><td colspan="4" class="cl-empty">Filing details unavailable. <a href="filings.html">Browse other filings →</a></td></tr>';}
});
})();
