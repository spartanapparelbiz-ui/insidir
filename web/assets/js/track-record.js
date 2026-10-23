/* The insider's track record on the personnel file (person.html#track-record): how the stock did 1, 3 and 6 months
   after each past open-market buy and sale, the hit rates, and every trade linked to its SEC Form 4.
   Request: GET /v1/people/<cik>/track-record (src/track-record.mjs), once the file itself has loaded (insidir:person).
   Nothing is estimated: a horizon that has not passed reads "pending", a missing close reads "no close". */
(()=>{"use strict";
const box=document.getElementById("pf-track");
if(!box)return;
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const secUrl=v=>{try{const u=new URL(String(v||""));return u.protocol==="https:"&&(u.hostname==="sec.gov"||u.hostname.endsWith(".sec.gov"))?u.href:"";}catch{return "";}};
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const day=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d||""));return m?MONTHS[+m[2]-1]+" "+(+m[3])+", "+m[1]:"";};
const addDays=(d,n)=>new Date(Date.parse(d+"T00:00:00Z")+n*864e5).toISOString().slice(0,10);
const pct=r=>r==null?"":(r>0?"+":r<0?"−":"")+Math.abs(r*100).toFixed(1)+"%";
const money=v=>{const n=Math.abs(Number(v)||0);return n>=1e9?"$"+(n/1e9).toFixed(1)+"B":n>=1e6?"$"+(n/1e6).toFixed(1)+"M":n>=1e3?"$"+Math.round(n/1e3)+"K":"$"+Math.round(n);};
const price=v=>v==null?"—":"$"+Number(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

function tile(side,code,h){
 const s=side?.[h.key]||{n:0,hits:0,avg:null};
 const word=code==="P"?"up":"fell after";
 return '<div class="tr-tile'+(s.n&&s.n<3?" is-thin":"")+'"><dt>'+E(h.words)+'</dt><dd><b>'+(s.n?E(s.hits+"/"+s.n):"—")+'</b>'+
  '<span>'+(s.n?E(word)+(s.avg!=null?" · avg "+E(pct(s.avg)):""):"no result yet")+'</span></dd></div>';
}
function sideBlock(title,side,code,sentence,horizons){
 if(!side?.count)return "";
 return '<section class="tr-side" aria-label="'+E(title)+'"><h3>'+E(title)+' <span>'+E(side.count+" on record")+'</span></h3>'+
  '<dl class="tr-tiles">'+horizons.map(h=>tile(side,code,h)).join("")+'</dl>'+(sentence?'<p class="tr-sentence">'+E(sentence)+'</p>':"")+'</section>';
}
function cell(t,h){
 const r=t.returns[h.key];
 if(t.pending[h.key])return '<span class="tr-pending" title="'+E("The "+h.words+" mark is "+day(addDays(t.trade_date,h.days)))+'">pending</span>';
 if(r==null)return '<span class="tr-pending" title="No close within a week of the date">no close</span>';
 const hit=t.hits[h.key];
 return '<span class="tr-ret tr-ret--'+(r>0?"up":r<0?"down":"flat")+(hit?" is-hit":"")+'">'+(hit?'<i aria-hidden="true">●</i>':'<i aria-hidden="true">○</i>')+E(pct(r))+'</span>'+
  '<span class="sr-only">'+(hit?" (a hit)":" (not a hit)")+'</span>';
}
function row(t,h3){
 const url=secUrl(t.filing_url||t.evidence?.url);
 const what=(t.code==="P"?"Bought ":"Sold ")+money(t.value)+(t.pre_scheduled?" · pre-scheduled (10b5-1)":"");
 return '<tr class="tr-row tr-row--'+(t.code==="P"?"buy":"sell")+'">'+
  '<td data-label="Traded">'+E(day(t.trade_date))+'</td>'+
  '<td data-label="Company">'+(t.ticker?'<a href="company.html?ticker='+encodeURIComponent(t.ticker)+'">'+E(t.ticker)+'</a>':"CIK "+E(t.issuer_cik))+'</td>'+
  '<td data-label="Trade"><span class="tr-badge tr-badge--'+(t.code==="P"?"buy":"sell")+'">'+(t.code==="P"?"Buy":"Sale")+'</span> '+E(what)+'</td>'+
  '<td data-label="Price" class="tr-num" title="'+E(t.price_source==="form4"?"Price per share as filed on the Form 4":"Close on the trade date (the Form 4 price was missing or a split since makes it incomparable)")+'">'+E(price(t.price))+(t.price_source==="close"?"*":"")+'</td>'+
  h3.map(h=>'<td data-label="'+E(h.words)+'" class="tr-num">'+cell(t,h)+'</td>').join("")+
  '<td class="tr-link">'+(url?'<a href="'+E(url)+'" rel="noopener" target="_blank" aria-label="'+E("Form 4 for the "+(t.code==="P"?"buy":"sale")+" on "+day(t.trade_date))+'">Form 4 ↗</a>':"")+'</td></tr>';
}
function render(d){
 const H=Array.isArray(d.horizons)&&d.horizons.length?d.horizons:[{key:"1m",days:30,words:"1 month"},{key:"3m",days:91,words:"3 months"},{key:"6m",days:182,words:"6 months"}];
 const trades=Array.isArray(d.trades)?d.trades:[];
 if(!trades.length){box.innerHTML='<p class="tr-empty">No open-market buys or sales on file for this person yet. Awards, gifts, option exercises and tax withholding are not trades they chose to make, so they have no track record.</p>';return;}
 const companies=(Array.isArray(d.companies)?d.companies:[]).filter(c=>c.card);
 box.innerHTML=
  '<div class="tr-sides">'+sideBlock("Open-market buys",d.overall?.buys,"P",d.overall?.sentences?.buys,H)+sideBlock("Open-market sales",d.overall?.sells,"S",d.overall?.sentences?.sells,H)+'</div>'+
  (companies.length>1?'<ul class="tr-companies">'+companies.map(c=>'<li><b>'+E(c.ticker||"CIK "+c.issuer_cik)+'</b> '+E(c.card)+'</li>').join("")+'</ul>':"")+
  '<div class="tr-table-wrap"><table class="tr-table"><caption class="sr-only">Every open-market trade and how the stock did afterwards</caption><thead><tr><th scope="col">Traded</th><th scope="col">Company</th><th scope="col">Trade</th><th scope="col" class="tr-num">Price</th>'+
  H.map(h=>'<th scope="col" class="tr-num">'+E(h.words)+'</th>').join("")+'<th scope="col"><span class="sr-only">SEC filing</span></th></tr></thead><tbody>'+trades.map(t=>row(t,H)).join("")+'</tbody></table></div>'+
  '<p class="tr-method"><b>How this is worked out.</b> '+E(d.methodology||"")+' ● marks a hit. * the close on the trade date stands in for the filed price. Prices: '+E(d.priceSource?.name||"market data")+', delayed.</p>'+
  '<p class="tr-disclaimer">'+E(d.disclaimer||"Research, not investment advice.")+'</p>';
}
async function load(cik){
 box.setAttribute("aria-busy","true");
 try{
  const res=await fetch("/v1/people/"+encodeURIComponent(cik)+"/track-record",{credentials:"same-origin",headers:{Accept:"application/json"}});
  if(res.status===401||res.status===402){box.innerHTML='<p class="tr-empty">The track record is part of Insidir Pro. <a href="subscribe.html">Start 7 days for $1</a>.</p>';return;}
  if(!res.ok)throw new Error("HTTP "+res.status);
  render(await res.json());
 }catch(e){box.innerHTML='<p class="tr-empty">The track record could not be loaded right now. The trades themselves are in the activity log below.</p>';}
 finally{box.removeAttribute("aria-busy");}
}
document.addEventListener("insidir:person",e=>{const cik=String(e.detail?.cik||"").replace(/\D/g,"");if(cik)void load(cik);});
})();
