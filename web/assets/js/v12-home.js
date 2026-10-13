/* Insidir V12: real SEC-backed, accessible interactive public research preview. */
(()=>{"use strict";
const $=id=>document.getElementById(id),esc=x=>String(x??"").replace(/[&<>"']/g,c=>c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;");
const money=v=>v==null||!Number.isFinite(Number(v))?"—":(Number(v)<0?"−":"")+"$"+new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(Math.abs(Number(v)));
const day=v=>{const d=new Date(v);return !v||Number.isNaN(d.getTime())?"Not reported":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d)};
const secUrl=s=>{try{const u=new URL(String(s));return u.protocol==="https:"&&["www.sec.gov","sec.gov"].includes(u.hostname)?u.href:""}catch{return ""}};
let ticker="NVDA",metric="revenue",report=null,seq=0;
const chart=$("v12-demo-chart"),status=$("v12-demo-status");
if(!chart)return;
function set(id,value){if($(id))$(id).textContent=value}
function loading(){chart.innerHTML='<div class="v12-chart-loading" aria-label="Loading annual SEC financial figures"><span></span><span></span><span></span><span></span><span></span></div>'}
function draw(){
 const label=report?.financialHistory?.[metric]?.label||({"revenue":"Revenue","netIncome":"Net income","operatingCashFlow":"Operating cash flow"}[metric]);
 const points=(report?.financialHistory?.[metric]?.points||[]).filter(x=>x&&x.periodEnd&&Number.isFinite(Number(x.value))).slice(-7);
 const last=points.at(-1),source=secUrl(last?.sourceUrl);
 set("v12-demo-value",last?money(last.value):"—");
 set("v12-demo-period",last?label+" · FY ended "+day(last.periodEnd):"No comparable annual SEC data for this measure");
 $("v12-demo-source").href=source||"https://www.sec.gov/edgar/search/";
 document.querySelectorAll("[data-v12-metric]").forEach(b=>{const active=b.dataset.v12Metric===metric;b.classList.toggle("is-active",active);b.setAttribute("aria-pressed",String(active))});
 if(!points.length){chart.innerHTML='<p class="v12-state">No comparable annual SEC records were returned for this measure. Nothing is simulated.</p>';chart.setAttribute("aria-label","Financial data unavailable");return}
 const W=770,H=200,left=60,right=20,top=13,bottom=28,vals=points.map(p=>Number(p.value)),lo=Math.min(0,...vals),hi=Math.max(0,...vals);
 let spread=hi-lo;if(!spread)spread=1;
 const lower=lo-spread*.09,upper=hi+spread*.11;
 const px=i=>left+(points.length===1?0.5:i/(points.length-1))*(W-left-right),py=v=>top+(upper-v)/(upper-lower)*(H-top-bottom);
 const dots=points.map((p,i)=>({x:px(i),y:py(Number(p.value)),p}));
 const y0=py(0),line=dots.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" "),area="M"+dots[0].x+" "+y0+" L"+dots.map(p=>p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" L")+" L"+dots.at(-1).x+" "+y0+" Z";
 const grid=[0,.25,.5,.75,1].map(f=>{let val=lower+(upper-lower)*f,y=py(val);return '<line x1="'+left+'" x2="'+(W-right)+'" y1="'+y+'" y2="'+y+'" class="v12-grid-line"/><text x="'+(left-9)+'" y="'+(y+4)+'" text-anchor="end" class="v12-axis">'+esc(money(val))+'</text>'}).join("");
 const marks=dots.map(p=>'<circle class="v12-plot-dot" cx="'+p.x+'" cy="'+p.y+'" r="4"><title>'+esc(day(p.p.periodEnd)+": "+money(p.p.value))+'</title></circle>').join("");
 const years=dots.map(p=>'<text class="v12-axis" text-anchor="middle" x="'+p.x+'" y="'+(H-4)+'">'+esc(p.p.periodEnd.slice(0,4))+'</text>').join("");
 chart.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(label+" from annual SEC 10-K reports")+""><defs><linearGradient id="v12-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#29dca8" stop-opacity=".29"/><stop offset="100%" stop-color="#29dca8" stop-opacity=".015"/></linearGradient></defs>'+grid+'<path d="'+area+'" fill="url(#v12-chart-fill)"/><path d="'+line+'" class="v12-plot-line"/>'+marks+years+'</svg>';
 chart.setAttribute("aria-label",label+" annual SEC financial data, from "+day(points[0].periodEnd)+" to "+day(last.periodEnd));
}
function facts(){
 const info=[["Revenue","revenue"],["Net income","netIncome"],["Operating cash flow","operatingCashFlow"],["Total assets","assets"]];
 const lookup=id=>{const official=(report?.facts||[]).find(f=>f.id===id);if(official)return official;const pt=report?.financialHistory?.[id]?.points?.at(-1);return pt?{value:pt.value,periodEnd:pt.periodEnd,sourceUrl:pt.sourceUrl}:null};
 $("v12-demo-facts").innerHTML=info.map(([label,id])=>{const f=lookup(id);return '<div class="v12-aside-fact"><div><span>'+esc(label)+'</span><strong>'+esc(money(f?.value))+'</strong></div><small>'+esc(f?"Period ended "+day(f.periodEnd):"Not reported")+'</small></div>'}).join("");
}
async function load(t){
 if(!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t))return;
 ticker=t;metric="revenue";report=null;const call=++seq;
 for(const b of document.querySelectorAll("[data-v12-ticker]")){const active=b.dataset.v12Ticker===t;b.classList.toggle("is-active",active);b.setAttribute("aria-pressed",String(active))}
 set("v12-demo-symbol",t+" / COMPANY REPORT");
 set("v12-demo-company",({NVDA:"NVIDIA",AAPL:"Apple",MSFT:"Microsoft",GOOGL:"Alphabet"})[t]||t);
 set("v12-demo-cik","Loading official SEC company details…");set("v12-demo-value","—");set("v12-demo-period","Retrieving full-year SEC records…");
 set("v12-demo-status","Loading verified SEC data for "+t+"…");
 $("v12-demo-open").href="company.html?ticker="+encodeURIComponent(t);
 $("v12-demo-facts").innerHTML='<p class="v12-state">Loading public company facts…</p>';loading();
 try{
  const response=await fetch("/v1/intelligence?ticker="+encodeURIComponent(t),{headers:{Accept:"application/json"}});
  if(!response.ok)throw Error("SEC service temporarily unavailable");
  const data=await response.json();if(call!==seq)return;
  if(!data?.company)throw Error("No matching SEC company record");
  report=data;
  set("v12-demo-company",data.company.name||t);
  set("v12-demo-cik","SEC CIK "+(data.company.cik||"not reported")+" · Public company record");
  set("v12-demo-status","Official annual SEC filings · figures may use different reporting periods");
  facts();draw();
 }catch(err){
  if(call!==seq)return;
  set("v12-demo-cik","SEC company information temporarily unavailable");
  set("v12-demo-status","Company data unavailable now. You can still open the full report.");
  $("v12-demo-facts").innerHTML='<p class="v12-state">Official company figures could not be loaded. No estimates or sample values are shown.</p>';
  chart.innerHTML='<p class="v12-state">The SEC research service is temporarily unavailable. Try another company or open the full report.</p>';
 }
}
document.querySelectorAll("[data-v12-ticker]").forEach(b=>b.addEventListener("click",()=>{void load(b.dataset.v12Ticker)}));
document.querySelectorAll("[data-v12-metric]").forEach(b=>b.addEventListener("click",()=>{metric=b.dataset.v12Metric;draw()}));
void load("NVDA");
})();