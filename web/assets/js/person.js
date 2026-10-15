/* Insidir personnel file (person.html?cik=<SEC CIK>): one reporting person's public SEC record.

   Styled as a declassified personnel file, and honest about it: every field comes from the public SEC Form 4
   records Insidir has imported (GET /v1/people/<cik>), nothing is hidden, redacted, invented or inferred, and
   the page gives no advice. Sections: the subject (file photo, name as people write it and as filed, typed
   fields, Follow), 01 Record (exact totals, all imported records against the last 30 days), 02 Known
   affiliations (each company with the roles stated in the filings, plus other issuers SEC EDGAR lists for
   the same CIK), 03 Activity log (every transaction in plain words, 25 at a time), 04 Filed records (the
   Form 4 list with SEC links).

   Requests: GET /v1/people/<cik> (the file), GET /v1/me/people (is this person followed), POST /v1/me/people
   and DELETE /v1/me/people/<cik> (Follow / Unfollow, live, with Undo for 6 s), and GET /v1/media through
   entity-media.js (the photo or the company logo standing in, and company logos). 401 sends the browser to
   sign in and 402 to subscribe, back to this file afterwards; 404 says no imported records exist for the
   CIK; anything else says what failed with a Try again.

   The wording of Form 4 codes (describe()) and the exact formatters are copied from v3-dashboard.js so the
   file reads exactly like the overview; both should move to one shared module. */
(()=>{"use strict";
const $=id=>document.getElementById(id);
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const media=window.InsidirMedia;
const reduce=matchMedia("(prefers-reduced-motion: reduce)");
const PAGE=25,UNDO_MS=6000,DAY=86400000,LIMIT=500;

/* ---------- identifiers ---------- */
const tick=x=>{const s=String(x||"").trim().toUpperCase();return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(s)&&s!=="NONE"&&s!=="NA"?s:"";};
const cikOf=x=>{const s=String(x??"").trim();return /^\d{1,10}$/.test(s)&&/[1-9]/.test(s)?s:"";};
const pad10=c=>String(c).replace(/^0+/,"").padStart(10,"0");
const sameCik=(a,b)=>cikOf(a)!==""&&cikOf(b)!==""&&Number(a)===Number(b);
const accession=x=>{const s=String(x||"").replace(/-/g,"");return /^\d{18}$/.test(s)?s:"";};
const dashed=a=>a?a.slice(0,10)+"-"+a.slice(10,12)+"-"+a.slice(12):"";
// Links out go to the SEC only (https, sec.gov).
const secUrl=v=>{try{const u=new URL(String(v||""));return u.protocol==="https:"&&!u.username&&(u.hostname==="sec.gov"||u.hostname.endsWith(".sec.gov"))?u.href:"";}catch{return "";}};

/* ---------- exact formatting (copied from v3-dashboard.js) ----------
   Numbers from their shortest round-trip digits, rounded half away from zero only past the digits shown,
   grouped by thousands; trade dates in UTC, SEC filing dates on the Eastern calendar day. */
const MONTHS="Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const group=s=>s.replace(/\B(?=(\d{3})+(?!\d))/g,",");
function roundDigits(a,max){
 let s=String(a);if(/e/i.test(s))s=a.toFixed(Math.min(20,max+6));
 let [i,f=""]=s.split(".");
 if(f.length<=max)return [i,f];
 const keep=f.slice(0,max);
 if(f.charCodeAt(max)-48<5)return [i,keep];
 const d=(i+keep).split("").map(Number);let k=d.length-1;
 while(k>=0){if(d[k]<9){d[k]++;break;}d[k]=0;k--;}
 if(k<0)d.unshift(1);
 const all=d.join(""),cut=all.length-keep.length;
 return [all.slice(0,cut)||"0",all.slice(cut)];
}
function decimal(n,min,max){
 const [i,f]=roundDigits(Math.abs(n),max);let g=f.replace(/0+$/,"");while(g.length<min)g+="0";
 const out=group(i.replace(/^0+(?=\d)/,""))+(g?"."+g:"");
 return (n<0&&/[1-9]/.test(out)?"-":"")+out;
}
const MINUS="−";
const cash=(n,min,max)=>{const s=decimal(n,min,max);return s.charAt(0)==="-"?MINUS+"$"+s.slice(1):"$"+s;};
const validDate=x=>{if(!x)return null;const d=new Date(x);return Number.isNaN(d.getTime())?null:d;};
function eastern(d){
 const y=d.getUTCFullYear(),sun=(m,n)=>{const w=new Date(Date.UTC(y,m,1)).getUTCDay();return 1+(7-w)%7+7*(n-1);},lastSun=m=>{const l=new Date(Date.UTC(y,m+1,0));return l.getUTCDate()-l.getUTCDay();};
 const [a,b]=y>=2007?[Date.UTC(y,2,sun(2,2),7),Date.UTC(y,10,sun(10,1),6)]:[Date.UTC(y,3,sun(3,1),7),Date.UTC(y,9,lastSun(9),6)];
 const t=d.getTime(),e=new Date(t+(t>=a&&t<b?-4:-5)*3600000);
 return {y:e.getUTCFullYear(),m:e.getUTCMonth(),d:e.getUTCDate()};
}
const utcDay=d=>({y:d.getUTCFullYear(),m:d.getUTCMonth(),d:d.getUTCDate()});
const dayText=p=>MONTHS[p.m]+" "+p.d+", "+p.y;
const isoOf=p=>p.y+"-"+String(p.m+1).padStart(2,"0")+"-"+String(p.d).padStart(2,"0");
const date=x=>{const d=validDate(x);return d?dayText(utcDay(d)):"Not reported";};
const filedDate=x=>{const d=validDate(x);return d?dayText(eastern(d)):"Not reported";};
const tradeIso=x=>{const d=validDate(x);return d?isoOf(utcDay(d)):"";};
const filedIso=x=>{const d=validDate(x);return d?isoOf(eastern(d)):"";};
const num=x=>{if(x===null||x===undefined||x==="")return null;const n=Number(x);return Number.isFinite(n)?n:null;};
// Dollar values to the cent when there are cents ($1,132,000 or $41,532.10): nothing is rounded away.
const money=x=>{const n=num(x);if(n===null)return "Not reported";const c=Math.round(Math.abs(n)*100)%100!==0;return cash(n,c?2:0,2);};
const signedMoney=n=>n>0?"+"+money(n):n<0?money(n):"$0";
// Prices as filed: weighted-average prices often carry four decimals ($41.5321).
const price=x=>{const n=num(x);return n===null?"Not reported":cash(n,2,4);};
const count=n=>decimal(n,0,4);
const plural=(n,one,many)=>count(n)+" "+(n===1?one:(many||one+"s"));
const shown=n=>media?.displayName?media.displayName(n):String(n||"Reporting person").replace(/\b\w+/g,w=>w.charAt(0)+w.slice(1).toLowerCase());
const AS_WRITTEN={NVIDIA:"NVIDIA",JPMORGAN:"JPMorgan",IBM:"IBM",AMD:"AMD",PLC:"plc","&":"&",INC:"Inc.","INC.":"Inc.",CO:"Co","CO.":"Co.",LLC:"LLC",LP:"LP",NV:"N.V.",SA:"S.A.",AG:"AG",SE:"SE",USA:"USA",US:"US",II:"II",III:"III"};
const companyName=raw=>{const s=String(raw||"").replace(/\s+/g," ").trim();if(!s||/[a-z]/.test(s))return s;
 return s.split(" ").map(w=>AS_WRITTEN[w]||(/^[A-Z]{1,2}$/.test(w)?w:w.charAt(0)+w.slice(1).toLowerCase().replace(/([-'’.&])([a-z])/g,(m,a,b)=>a+b.toUpperCase()))).join(" ");};

/* ---------- Form 4 codes in words (copied from v3-dashboard.js) ---------- */
const CODES={
 P:"Open market or private purchase",S:"Open market or private sale",V:"Transaction voluntarily reported earlier than required",
 A:"Grant, award or other acquisition from the issuer",D:"Disposition to the issuer",F:"Payment of exercise price or tax liability by delivering or withholding securities",
 I:"Discretionary transaction",M:"Exercise or conversion of an exempt derivative security",C:"Conversion of a derivative security",
 E:"Expiration of a short derivative position",H:"Expiration or cancellation of a long derivative position with value received",
 O:"Exercise of an out-of-the-money derivative security",X:"Exercise of an in-the-money or at-the-money derivative security",
 G:"Bona fide gift",L:"Small acquisition under Rule 16a-6",W:"Acquisition or disposition by will or the laws of descent and distribution",
 Z:"Deposit into or withdrawal from a voting trust",J:"Other acquisition or disposition (described in the filing)",K:"Equity swap or similar instrument",
 U:"Disposition from a tender of shares in a change of control"};
const NOUN={A:["grant","grants"],M:["option exercise","option exercises"],X:["option exercise","option exercises"],O:["option exercise","option exercises"],
 C:["conversion","conversions"],F:["tax withholding","tax withholdings"],G:["gift","gifts"],D:["return to the company","returns to the company"],
 E:["expiration","expirations"],H:["expiration","expirations"],I:["discretionary trade","discretionary trades"],J:["other transaction","other transactions"],
 K:["equity swap","equity swaps"],L:["small acquisition","small acquisitions"],W:["will or inheritance","wills or inheritances"],Z:["voting trust change","voting trust changes"],
 U:["tender in a change of control","tenders in a change of control"],V:["early voluntary report","early voluntary reports"],
 "P derivative":["derivative purchase","derivative purchases"],"S derivative":["derivative sale","derivative sales"]};
const code=x=>String(x?.transaction_code||"").replace(/[^A-Z]/gi,"").slice(0,1).toUpperCase();
const nounKey=x=>{const c=code(x);return (c==="P"||c==="S")&&x?.derivative?c+" derivative":c;};
const kind=x=>x?.category==="reported_purchase"?"buy":x?.category==="reported_sale"?"sell":"other";
const tri=k=>k==="buy"?'<i class="pf-tri pf-tri--up" aria-hidden="true"></i>':k==="sell"?'<i class="pf-tri pf-tri--down" aria-hidden="true"></i>':"";
const sharesOf=x=>num(x?.shares);
const priceOf=x=>num(x?.price_per_share??x?.price);
const valueOf=x=>{const v=num(x?.estimated_value);if(v!==null)return v;const s=sharesOf(x),p=priceOf(x);return s!==null&&s>=0&&p!==null&&p>0?Math.round(s*p*100)/100:null;};
/* Calendar days from the trade date to the SEC filing date (the Eastern calendar day of publication). */
const lagOf=x=>{const t=validDate(x?.transaction_date),p=validDate(x?.published_at);if(!t||!p)return null;const d=Math.round((Date.parse(filedIso(x.published_at))-Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate()))/DAY);return d>=0?d:null;};
const lagWords=n=>n===null?"":n===0?"same day":n===1?"1 day later":count(n)+" days later";
const ownership=x=>{const o=String(x?.direct_ownership||"").toUpperCase();return o==="D"?"Direct":o==="I"?"Indirect":"";};
const isPlainShares=t=>!t||/^(class [a-z0-9]+ )?(common|ordinary)( stock| shares)?( ?,? ?(class [a-z0-9]+|par value.*))?$|^(common )?shares$/i.test(String(t).trim());
const security=x=>{const t=String(x?.security_title||"").replace(/\s+/g," ").trim().slice(0,60);return isPlainShares(t)?"":t;};
/* describe(x): {word, cls, c, text, value, valued, priced}; the same sentence as the overview's. */
function describe(x){
 const c=code(x),k=kind(x),s=sharesOf(x),p=priceOf(x),v=valueOf(x),T=tick(x?.ticker),ad=String(x?.acquired_disposed||"").toUpperCase();
 const sh=s===null?"an unreported number of":decimal(Math.abs(s),0,4);
 const tk=T?T+" ":"";
 const sec=security(x),units=sec||(tk+"shares").trim();
 const verb=ad==="A"?"acquired":ad==="D"?"disposed of":"reported";
 let word,cls="other",text,valued=false;
 const at=p!==null?" at "+price(p):" (no price reported)";
 if(k==="buy"){word="Bought";cls="buy";text="bought "+sh+" "+tk+"shares"+at;valued=true;}
 else if(k==="sell"){word="Sold";cls="sell";text="sold "+sh+" "+tk+"shares"+at;valued=true;}
 else switch(c){
  case "P":word="Bought";text="bought "+sh+" "+(sec||(tk+"derivative securities").trim());break;
  case "S":word="Sold";text="sold "+sh+" "+(sec||(tk+"derivative securities").trim());break;
  case "A":word="Grant";text="received "+sh+" "+tk+(sec||"shares")+" as a grant or award";break;
  // The derivative side of an exercise is the option or unit; the plain-shares side is the stock it became.
  case "M":case "X":case "O":word="Option exercise";text=!x?.derivative&&!sec?(ad==="D"?"disposed of ":"acquired ")+sh+" "+tk+"shares by exercising or converting derivative securities":"exercised or converted "+sh+" "+(sec||(tk+"derivative securities").trim());break;
  case "C":word="Conversion";text="converted "+sh+" "+(sec||"derivative securities")+" into "+(T?T+" ":"")+"shares";break;
  case "F":word="Tax withholding";text="had "+sh+" "+tk+"shares withheld to pay tax or the exercise price";break;
  case "G":word="Gift";text=(ad==="A"?"received ":"gave ")+sh+" "+tk+"shares as a gift";break;
  case "D":word="Returned";text="returned "+sh+" shares to "+(T||"the company");break;
  case "E":case "H":word="Expired";text=(sec||"Derivative")+" position of "+sh+" expired";break;
  case "I":word="Discretionary";text=verb+" "+sh+" "+units+" in a discretionary trade";break;
  case "J":word="Other";text="other transaction, described in the filing: "+verb+" "+sh+" "+units;break;
  case "K":word="Equity swap";text="equity swap: "+verb+" "+sh+" "+units;break;
  case "L":word="Small acquisition";text="small acquisition: "+verb+" "+sh+" "+units;break;
  case "W":word="Will or inheritance";text=verb+" "+sh+" "+units+" by will or inheritance";break;
  case "Z":word="Voting trust";text=(ad==="D"?"withdrew ":"deposited ")+sh+" "+units+(ad==="D"?" from":" into")+" a voting trust";break;
  case "U":word="Tender";text="tendered "+sh+" "+units+" in a change of control";break;
  case "V":word="Voluntary";text=verb+" "+sh+" "+units;break;
  default:word=c?"Code "+c:"Other";text=verb+" "+sh+" "+units;
 }
 return {word,cls,c,text,valued,value:valued&&v!==null&&v>0?v:null,priced:p!==null};
}
const qualifiers=x=>[code(x)==="V"?["reported early","Reported early, voluntarily"]:null,x?.is_amendment?["amended filing (4/A)","An amended filing (Form 4/A) restating an earlier one"]:null,
 ownership(x)==="Indirect"?["held indirectly","Held indirectly (by a trust or family member, for example)"]:null].filter(Boolean);
const badge=x=>{const d=describe(x),m=CODES[d.c]||"";return '<span class="pf-badge pf-badge--'+d.cls+'"'+(m?' title="'+E(d.c+" — "+m)+'"':'')+'>'+tri(d.cls)+E(d.word)+(d.c?' · '+E(d.c):'')+'</span>';};
const valueText=x=>{const d=describe(x);return d.valued?(d.value!==null?"= "+money(d.value):d.priced?"= $0":"value not reported"):"";};

/* ---------- tiles ---------- */
const coTile=(t,name,cik,size)=>media?media.logo(tick(t),size||"sm",{cik:cikOf(cik),name:companyName(name)}):"";

/* ---------- requests ---------- */
let leaving=false;
// 401: the session ended; 402: no active subscription. Back to this file afterwards.
function gate(status){
 if(leaving)return;
 leaving=true;
 const next=encodeURIComponent("person.html"+location.search);
 showState(status===401?"signin":"subscribe");
 location.assign((status===401?"signin.html":"subscribe.html")+"?next="+next);
}
async function api(path,{method="GET",body}={}){
 let r;
 try{r=await fetch(path,{method,credentials:"same-origin",headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});}
 catch{throw Object.assign(new Error("could not reach the research service"),{status:0});}
 let j=null;try{j=await r.json();}catch{/* not JSON */}
 if(r.status===401||r.status===402){gate(r.status);throw Object.assign(new Error(r.status===401?"sign in required":"subscription required"),{status:r.status});}
 if(!r.ok)throw Object.assign(new Error(r.status>=500?"the research service is unavailable (HTTP "+r.status+")":(j&&typeof j.error==="string"&&j.error.slice(0,160))||"request failed (HTTP "+r.status+")"),{status:r.status});
 if(!j||typeof j!=="object")throw Object.assign(new Error("unreadable response from the research service"),{status:r.status});
 return j;
}

/* ---------- page state ---------- */
const main=document.querySelector("main.pf"),head=document.querySelector(".pf-head");
const params=new URLSearchParams(location.search);
const rawCik=(params.get("cik")||"").trim();
const askedCik=cikOf(rawCik);
let file=null,personCik=askedCik,personName="this person",following=null,followBusy=false,logShown=0,filingsShown=0,rows=[],filings=[];
const live=t=>{const el=$("pf-live");if(el)el.textContent=t;};

function showState(kind,message){
 const box=$("pf-state");if(!box)return;
 const cik=askedCik?pad10(askedCik):"";
 const people='<a href="people.html">Search the people directory ↗</a>';
 let h="",p="",extra="";
 if(kind==="badcik"){h="No file number";p=rawCik?"“"+E(rawCik.slice(0,40))+"” is not an SEC CIK. A personnel file is opened by a reporting person’s SEC CIK: up to 10 digits, as in person.html?cik=1214156.":"This address names no reporting person. A personnel file is opened by a reporting person’s SEC CIK, as in person.html?cik=1214156.";extra=people;}
 else if(kind==="missing"){h="No file for CIK "+cik;p="No imported SEC records for CIK "+E(cik)+". Insidir builds a file only from Form 4 filings it has imported; this CIK has none yet.";
  extra=people+'<a href="'+E("https://www.sec.gov/cgi-bin/own-disp?action=getowner&CIK="+cik)+'" target="_blank" rel="noopener noreferrer">Look up CIK '+E(cik)+' on SEC EDGAR ↗</a>';}
 else if(kind==="signin"){h="Sign in to open this file";p="Your session has ended. Taking you to sign in; you will come back to this file afterwards.";}
 else if(kind==="subscribe"){h="This file needs an active subscription";p="Taking you to the subscription step; you will come back to this file afterwards.";}
 else{h="This file could not be loaded";p="The personnel file for CIK "+E(cik)+" could not be loaded: "+E(message||"unknown error")+".";extra='<button type="button" class="pf-btn" data-hf-atom data-pf-retry>Try again</button>'+people;}
 box.innerHTML='<p class="pf-state__label">'+(kind==="error"?"Error":kind==="missing"||kind==="badcik"?"File not found":"Access")+'</p><h1>'+E(h)+'</h1><p>'+p+'</p>'+(extra?'<div class="pf-state__links">'+extra+'</div>':"");
 box.hidden=false;
 box.classList.toggle("is-error",kind==="error");
 main.classList.add("is-state");main.classList.remove("is-loading");main.removeAttribute("aria-busy");
 $("pf-file").hidden=true;head.hidden=true;
 if(kind==="missing"||kind==="badcik")document.title="No file · Personnel file · Insidir";
}
function clearState(){const box=$("pf-state");if(box){box.hidden=true;box.innerHTML="";}main.classList.remove("is-state");$("pf-file").hidden=false;head.hidden=false;}

/* ---------- 01 Record ---------- */
const cellOf=(t,type)=>{
 const bucket=t?.[type]||{},n=num(bucket.count)||0,sh=num(bucket.shares),v=num(bucket.value);
 if(!n)return '<td><b class="pf-none">None</b><span>no '+(type==="purchases"?"purchases":"sales")+'</span></td>';
 const cls=type==="purchases"?"pf-up":"pf-down";
 return '<td><b class="'+cls+'">'+(v!==null?E(money(v)):"Value not reported")+'</b><span>in '+E(plural(n,type==="purchases"?"purchase":"sale"))+(sh!==null?" · "+E(plural(sh,"share"))+"":"")+'</span></td>';
};
function otherCell(t,list){
 const n=num(t?.other?.count)||0;
 if(!n)return '<td><b class="pf-none">None</b><span>no other transactions</span></td>';
 // What they are, from the lines this file loaded: counted when every one of them is here, else named.
 const by=new Map();for(const x of list){if(kind(x)!=="other")continue;const k=nounKey(x);by.set(k,(by.get(k)||0)+1);}
 const total=[...by.values()].reduce((a,b)=>a+b,0);
 const words=[...by.entries()].sort((a,b)=>b[1]-a[1]).map(([k,c])=>{const w=NOUN[k]||["Form 4 code "+k,"Form 4 code "+k];return total===n?count(c)+" "+w[c===1?0:1]:w[1];});
 const what=words.length?(total===n?words.join(", "):"including "+words.join(", ")):"grants, exercises, withholdings and similar";
 return '<td><b>'+E(plural(n,"transaction"))+'</b><span>'+E(what)+'</span></td>';
}
function netCell(t){
 const b=num(t?.purchases?.value),s=num(t?.sales?.value),nb=num(t?.purchases?.count)||0,ns=num(t?.sales?.count)||0;
 if(!nb&&!ns)return '<td><b class="pf-none">None</b><span>no purchases or sales</span></td>';
 const n=(b||0)-(s||0);
 return '<td><b>'+E(signedMoney(Math.round(n*100)/100))+'</b><span>'+(n>0?"more bought than sold":n<0?"more sold than bought":"bought and sold the same")+((nb&&b===null)||(ns&&s===null)?" · some values not reported":"")+'</span></td>';
}
function median(list){
 const lags=list.filter(x=>!x.is_amendment).map(lagOf).filter(n=>n!==null).sort((a,b)=>a-b);
 if(!lags.length)return null;
 const m=lags.length>>1,v=lags.length%2?lags[m]:(lags[m-1]+lags[m])/2;
 return {v,n:lags.length};
}
function lagCell(list){
 const m=median(list);
 if(!m)return '<td><b class="pf-none">None</b><span>no dated lines</span></td>';
 return '<td><b>'+E(m.v===1?"1 day":count(m.v)+" days")+'</b><span>median of '+E(plural(m.n,"line"))+', trade date to filing date</span></td>';
}
/* Totals counted from the lines themselves: used only when the answer carries none. */
function totalsOf(list){
 const part=cat=>{const r=list.filter(x=>x.category===cat);const vals=r.map(valueOf);return {count:r.length,shares:r.reduce((a,x)=>a+(sharesOf(x)||0),0),value:vals.some(v=>v!==null)?Math.round(vals.reduce((a,v)=>a+(v||0),0)*100)/100:null};};
 const dates=list.map(x=>tradeIso(x.transaction_date)).filter(Boolean).sort(),pub=list.map(x=>validDate(x.published_at)?x.published_at:"").filter(Boolean).sort();
 return {transactions:list.length,filings:new Set(list.map(x=>x.accession)).size,purchases:part("reported_purchase"),sales:part("reported_sale"),other:{count:list.filter(x=>kind(x)==="other").length},
  first_transaction_date:dates[0]||null,last_transaction_date:dates.at(-1)||null,last_published_at:pub.at(-1)||null};
}
function renderRecord(d){
 const since=new Date(Date.now()-30*DAY);
 const recent=rows.filter(x=>{const p=validDate(x.published_at);return p&&p>=since;});
 const all=d.totals?.all||totalsOf(rows),d30=d.totals?.d30||totalsOf(recent);
 const span=validDate(all.first_transaction_date)&&validDate(all.last_transaction_date)?date(all.first_transaction_date)+" – "+date(all.last_transaction_date):"Traded dates not reported";
 $("pf-record").innerHTML='<table class="pf-table"><caption class="sr-only">Record of reported Form 4 transactions: all imported records and the last 30 days</caption>'+
  '<thead><tr><td></td><th scope="col">All imported records<small>'+E(plural(num(all.transactions)||0,"line"))+' · traded '+E(span)+'</small></th><th scope="col">Last 30 days<small>'+E(plural(num(d30.transactions)||0,"line"))+' · filed since '+E(dayText(eastern(since)))+'</small></th></tr></thead><tbody>'+
  '<tr><th scope="row">'+tri("buy")+'Bought</th>'+cellOf(all,"purchases")+cellOf(d30,"purchases")+'</tr>'+
  '<tr><th scope="row">'+tri("sell")+'Sold</th>'+cellOf(all,"sales")+cellOf(d30,"sales")+'</tr>'+
  '<tr><th scope="row">Other<small>not a purchase or sale</small></th>'+otherCell(all,rows)+otherCell(d30,recent)+'</tr>'+
  '<tr><th scope="row">Net<small>bought minus sold</small></th>'+netCell(all)+netCell(d30)+'</tr>'+
  '<tr><th scope="row">Filing delay<small>trade to filing</small></th>'+lagCell(rows)+lagCell(recent)+'</tr>'+
  '</tbody></table>';
}

/* ---------- 02 Known affiliations ---------- */
const roleList=r=>{const arr=Array.isArray(r)?r:String(r||"").split(/\s*[·;]\s*/);return [...new Set(arr.map(s=>String(s||"").replace(/\s+/g," ").trim().slice(0,80)).filter(Boolean))];};
const rolesText=c=>{const r=roleList(c?.roles);return r.length?r.join(", "):"Role not available from the filings read";};
const companyHref=t=>tick(t)?"company.html?ticker="+encodeURIComponent(tick(t)):"";
const coLabel=c=>companyName(c?.issuer_name)||tick(c?.ticker)||"Issuer CIK "+pad10(c?.issuer_cik||"0");
function renderAffiliations(d,companies){
 const host=$("pf-affiliations");
 const cards=companies.map(c=>{
  const t=tick(c.ticker),href=companyHref(t),n=num(c.transactions)||0;
  const traded=validDate(c.first_transaction_date)?date(c.first_transaction_date)+(c.last_transaction_date&&tradeIso(c.last_transaction_date)!==tradeIso(c.first_transaction_date)?" – "+date(c.last_transaction_date):""):"Not reported";
  const bought=num(c.purchases_value),sold=num(c.sales_value);
  const totals=[plural(n,"line")];
  if(bought)totals.push('<span class="pf-up">bought '+E(money(bought))+'</span>');
  if(sold)totals.push('<span class="pf-down">sold '+E(money(sold))+'</span>');
  return '<article class="pf-aff">'+
   '<div class="pf-aff__id">'+coTile(t,c.issuer_name,c.issuer_cik,"md")+'<div><h3><span data-ent="company">'+E(coLabel(c))+'</span></h3><p>'+E([t,c.issuer_cik?"issuer CIK "+pad10(c.issuer_cik):""].filter(Boolean).join(" · "))+'</p></div></div>'+
   '<dl class="pf-aff__facts"><div><dt>Role</dt><dd>'+E(rolesText(c))+'</dd></div><div><dt>Traded</dt><dd>'+E(traded)+'</dd></div>'+
   '<div><dt>On file</dt><dd>'+totals.map((s,i)=>i?s:E(s)).join(" · ")+'</dd></div><div><dt>Last filed</dt><dd>'+E(filedDate(c.last_published_at))+'</dd></div></dl>'+
   (href?'<a class="pf-link" data-hf-atom href="'+E(href)+'">Company report ↗</a>':"")+'</article>';
 });
 // Issuers SEC EDGAR lists for the same CIK that are not in the imported records.
 const others=(Array.isArray(d.other_issuers)?d.other_issuers:[]).filter(o=>o&&(cikOf(o.cik)||tick(o.ticker))&&!companies.some(c=>sameCik(c.issuer_cik,o.cik)||(tick(o.ticker)&&tick(o.ticker)===tick(c.ticker))));
 const seen=new Set(),uniq=others.filter(o=>{const k=cikOf(o.cik)?Number(o.cik):tick(o.ticker);if(seen.has(k))return false;seen.add(k);return true;}).slice(0,24);
 const also=uniq.length?'<div class="pf-also"><h3>Also reports for</h3><p>Other issuers SEC EDGAR lists for CIK '+E(pad10(personCik))+'. Their filings are not in Insidir’s imports yet.</p><ul>'+uniq.map(o=>{
   const t=tick(o.ticker),name=companyName(o.name)||t||"Issuer CIK "+pad10(o.cik);
   const href=t?companyHref(t):cikOf(o.cik)?"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK="+pad10(o.cik)+"&type=4":"";
   const ext=!t;
   return '<li>'+coTile(t,o.name,o.cik,"sm")+'<span><span data-ent="company">'+E(name)+'</span><small>'+E([t,cikOf(o.cik)?"CIK "+pad10(o.cik):"",o.relation?String(o.relation).slice(0,60):"",validDate(o.last_transaction_date||o.lastDate)?"last traded "+date(o.last_transaction_date||o.lastDate):""].filter(Boolean).join(" · "))+'</small></span>'+
    (href?'<a class="pf-link" data-hf-atom href="'+E(href)+'"'+(ext?' target="_blank" rel="noopener noreferrer"':"")+'>'+(ext?"SEC EDGAR ↗":"Company report ↗")+'</a>':"")+'</li>';
  }).join("")+'</ul></div>':"";
 host.innerHTML=(cards.length?'<div class="pf-affs">'+cards.join("")+'</div>':'<p class="pf-empty">No company is named in the imported filings.</p>')+also;
}

/* ---------- 03 Activity log ---------- */
function logRow(x,i){
 const d=describe(x),v=valueText(x),lag=lagOf(x),t=tick(x.ticker),acc=accession(x.accession),q=qualifiers(x);
 const co=t||companyName(x.issuer_name)||"Issuer not reported";
 const filed=validDate(x.published_at)?"Filed "+filedDate(x.published_at)+(lag!==null&&!x.is_amendment?" ("+lagWords(lag)+")":""):"Filing date not reported";
 return '<li class="pf-log__row" tabindex="-1" data-i="'+i+'">'+
  '<p class="pf-log__what">'+badge(x)+' <span class="pf-log__text">'+E(d.text)+'</span>'+(v?' <b class="pf-log__value'+(d.cls==="buy"?" pf-up":d.cls==="sell"?" pf-down":"")+'">'+E(v)+'</b>':"")+
   (q.length?'<span class="pf-log__notes">'+q.map(n=>'<span title="'+E(n[1])+'">'+E(n[0])+'</span>').join(" · ")+'</span>':"")+'</p>'+
  '<p class="pf-log__when"><time datetime="'+E(tradeIso(x.transaction_date))+'">'+E(validDate(x.transaction_date)?"Traded "+date(x.transaction_date):"Trade date not reported")+'</time><span>'+E(filed)+'</span></p>'+
  '<p class="pf-log__where"><span class="pf-co">'+coTile(t,x.issuer_name,x.issuer_cik,"xs")+'<span data-ent="company">'+E(co)+'</span></span>'+
   (acc?'<a class="pf-link" data-hf-atom href="filing.html?accession='+acc+'">Form '+E(x.is_amendment?"4/A":"4")+' ↗</a>':secUrl(x.source_url)?'<a class="pf-link" data-hf-atom href="'+E(secUrl(x.source_url))+'" target="_blank" rel="noopener noreferrer">SEC filing ↗</a>':"")+'</p></li>';
}
const moreButton=(what,left)=>left>0?'<div class="pf-more"><button type="button" class="pf-btn" data-hf-atom data-pf-more="'+what+'">Show '+Math.min(PAGE,left)+' more <span>· '+count(left)+' left</span></button></div>':"";
function renderLog(){
 const host=$("pf-log");logShown=Math.min(rows.length,PAGE);
 host.innerHTML=rows.length?'<ol class="pf-log" id="pf-log-list">'+rows.slice(0,logShown).map(logRow).join("")+'</ol>'+moreButton("log",rows.length-logShown):'<p class="pf-empty">No transactions in the imported records.</p>';
 const total=num(file?.totals?.all?.transactions)||rows.length;
 $("pf-log-note").textContent=!rows.length?"Every imported transaction, newest first, in plain words.":
  (total>rows.length?"The newest "+count(rows.length)+" of "+plural(total,"imported transaction")+", in plain words; the filed records below and SEC EDGAR hold the rest.":"All "+plural(rows.length,"imported transaction")+", newest first, in plain words.")+" Each badge carries the transaction’s Form 4 code.";
}
function filingRow(f,i){
 const acc=accession(f.accession),t=tick(f.ticker),src=secUrl(f.source_url),form=String(f.form_type||"4").slice(0,8),lines=num(f.lines);
 return '<li class="pf-filing" tabindex="-1" data-i="'+i+'"><span class="pf-filing__form">Form '+E(form)+'</span>'+
  '<span class="pf-co">'+coTile(t,f.issuer_name,f.issuer_cik,"sm")+'<span><span data-ent="company">'+E(t||companyName(f.issuer_name)||"Issuer not reported")+'</span>'+(t&&f.issuer_name?'<small>'+E(companyName(f.issuer_name))+'</small>':"")+'</span></span>'+
  '<span class="pf-filing__date">Filed '+E(filedDate(f.published_at))+'</span>'+
  '<span class="pf-filing__lines">'+(lines!==null?E(plural(lines,"line")):"")+'</span>'+
  '<span class="pf-filing__acc">'+E(dashed(acc)||String(f.accession||"").slice(0,24))+'</span>'+
  '<span class="pf-filing__links">'+(acc?'<a class="pf-link" data-hf-atom href="filing.html?accession='+acc+'">Open ↗</a>':"")+(src?'<a class="pf-link" data-hf-atom href="'+E(src)+'" target="_blank" rel="noopener noreferrer">SEC EDGAR ↗</a>':"")+'</span></li>';
}
function renderFilings(){
 const host=$("pf-filings");filingsShown=Math.min(filings.length,PAGE);
 const total=num(file?.totals?.all?.filings)||filings.length;
 $("pf-filed-note").textContent=(total>filings.length?"The newest "+count(filings.length)+" of "+plural(total,"Form 4 filing")+" behind this file":"The Form 4 filings behind this file")+", with the original documents on SEC EDGAR.";
 host.innerHTML=filings.length?'<ol class="pf-filings" id="pf-filings-list">'+filings.slice(0,filingsShown).map(filingRow).join("")+'</ol>'+moreButton("filings",filings.length-filingsShown):'<p class="pf-empty">No Form 4 filings in the imported records.</p>';
}
/* Show the next page without redrawing what is on screen, and put focus on the first new record. */
function showMore(what){
 const list=what==="log"?rows:filings,host=$(what==="log"?"pf-log":"pf-filings"),ol=$(what==="log"?"pf-log-list":"pf-filings-list");
 if(!ol)return;
 const from=what==="log"?logShown:filingsShown,to=Math.min(list.length,from+PAGE);
 ol.insertAdjacentHTML("beforeend",list.slice(from,to).map((x,i)=>(what==="log"?logRow:filingRow)(x,from+i)).join(""));
 if(what==="log")logShown=to;else filingsShown=to;
 host.querySelector(".pf-more")?.remove();
 host.insertAdjacentHTML("beforeend",moreButton(what,list.length-to));
 media?.hydrate(ol);
 ol.children[from]?.focus({preventScroll:false});
 live("Showing "+count(to)+" of "+count(list.length)+(what==="log"?" transactions.":" filings."));
}

/* ---------- the subject ---------- */
function field(label,value){return '<div><dt>'+E(label)+'</dt><dd>'+value+'</dd></div>';}
function renderSubject(d,companies){
 const p=d.person||{},raw=String(p.name||rows[0]?.owner_name||"").replace(/\s+/g," ").trim()||"Reporting person";
 personName=shown(raw);
 const lead=companies[0],leadT=tick(lead?.ticker)||tick(rows[0]?.ticker);
 document.title=personName+" · Personnel file · Insidir";
 $("pf-fileno").textContent=pad10(personCik);
 $("pf-name").textContent=personName;
 const filed=[...new Set([raw,...(Array.isArray(p.filed_names)?p.filed_names:[])].map(n=>String(n||"").replace(/\s+/g," ").trim()).filter(Boolean))];
 $("pf-asfiled").innerHTML='As filed: <span>'+E(filed[0])+'</span>'+(filed.length>1?' · also as '+filed.slice(1,4).map(n=>'<span>'+E(n)+'</span>').join(", "):"");
 const frame=document.querySelector(".pf-photo__frame");
 if(frame&&media)frame.innerHTML=media.person({name:raw,cik:personCik,ticker:leadT,size:"lg",label:true});
 const all=d.totals?.all||totalsOf(rows);
 const roles=companies.length?companies.map(c=>'<span class="pf-role"><span class="pf-co">'+coTile(c.ticker,c.issuer_name,c.issuer_cik,"xs")+'<span data-ent="company">'+E(tick(c.ticker)||coLabel(c))+'</span></span> '+E(rolesText(c))+'</span>').join(""):"Not stated in the imported filings";
 const latest=filings[0];
 $("pf-fields").innerHTML=
  field("Role(s)",roles)+
  field("SEC CIK",'<span class="pf-mono">'+E(pad10(personCik))+'</span>')+
  field("On file",E(plural(num(all.filings)??filings.length,"Form 4 filing"))+" · "+E(plural(num(all.transactions)??rows.length,"transaction line")))+
  field("First seen in imports",validDate(all.first_transaction_date)?E(date(all.first_transaction_date))+' <small>earliest imported trade</small>':"Not reported")+
  field("Last filed",validDate(all.last_published_at)?E(filedDate(all.last_published_at))+(latest&&tick(latest.ticker)?' <small>Form '+E(String(latest.form_type||"4").slice(0,8))+' for '+E(tick(latest.ticker))+'</small>':""):"Not reported");
 const co=$("pf-company-link");
 if(leadT){co.href=companyHref(leadT);co.textContent="Open "+leadT+" company report ↗";co.hidden=false;}else co.hidden=true;
 const edgar=$("pf-edgar-link");
 edgar.href=secUrl(d.edgar_url)||"https://www.sec.gov/cgi-bin/own-disp?action=getowner&CIK="+pad10(personCik);edgar.hidden=false;
 if(typeof d.disclaimer==="string"&&d.disclaimer.trim()&&!/recommendation|prediction/i.test(d.disclaimer))$("pf-disclaimer").textContent="Everything in this file comes from public SEC filings. Nothing here is secret, a recommendation or a prediction. "+d.disclaimer.trim().slice(0,240);
 // The file photo's caption says what the tile shows once it has settled (a photo, or the company logo standing in).
 const tile=frame?.querySelector("[data-media]"),cap=$("pf-photo-caption");
 const caption=()=>{if(!tile||!cap)return;const c=tile.classList;const text=c.contains("is-photo")?"File photo":c.contains("is-stand-in")?"No published photo · "+(leadT||"company")+" logo":c.contains("is-monogram")?"No published photo or logo":c.contains("is-logo")?"Logo on file":"File photo";if(cap.textContent!==text)cap.textContent=text;};
 if(tile&&window.MutationObserver){new MutationObserver(caption).observe(tile,{attributes:true,attributeFilter:["class"]});}
 caption();
}
/* The fields are typed onto the file one line after another (only the lines on screen; lines below the fold
   rise in with the page's scroll reveal instead). Nothing moves under reduced motion. */
function typeFields(){
 if(reduce.matches)return;
 const lines=[...$("pf-fields").children],vh=innerHeight;
 lines.forEach((el,i)=>{if(el.getBoundingClientRect().top<vh){el.style.setProperty("--i",String(i));el.classList.add("pf-typed");}});
 head.classList.add("is-stamped");
}

function render(d){
 const companies=(Array.isArray(d.companies)?d.companies:[]).filter(c=>c&&typeof c==="object")
  .sort((a,b)=>String(b.last_published_at||"").localeCompare(String(a.last_published_at||""))||String(b.last_transaction_date||"").localeCompare(String(a.last_transaction_date||"")));
 rows=(Array.isArray(d.transactions)?d.transactions:[]).filter(x=>x&&typeof x==="object")
  .sort((a,b)=>String(tradeIso(b.transaction_date)).localeCompare(String(tradeIso(a.transaction_date)))||String(b.published_at||"").localeCompare(String(a.published_at||"")));
 filings=(Array.isArray(d.filings)?d.filings:[]).filter(f=>f&&typeof f==="object").sort((a,b)=>String(b.published_at||"").localeCompare(String(a.published_at||"")));
 personCik=cikOf(d.person?.cik)||askedCik;
 clearState();
 renderSubject(d,companies);
 renderRecord(d);
 renderAffiliations(d,companies);
 renderLog();
 renderFilings();
 main.classList.remove("is-loading");main.classList.add("is-ready");main.removeAttribute("aria-busy");
 media?.hydrate(main);
 requestAnimationFrame(typeFields);
 setFollow(following);
}

/* ---------- Follow / Unfollow, live, with Undo ---------- */
let toastTimer=0;
function toast(html,{error=false,keep=false}={}){
 const el=$("pf-toast");if(!el)return;
 clearTimeout(toastTimer);
 el.innerHTML=html;el.classList.toggle("is-error",error);
 if(!keep)toastTimer=setTimeout(()=>{if(!el.contains(document.activeElement))el.textContent="";},error?8000:UNDO_MS);
}
function setFollow(on){
 const b=$("pf-follow");if(!b)return;
 b.disabled=!file||followBusy;
 b.classList.toggle("is-following",on===true);
 b.setAttribute("aria-pressed",String(on===true));
 b.textContent=on===true?"Following ✓":"Follow +";
}
// The stored CIK (as the records hold it) is what the follow routes match on.
const followCik=()=>cikOf(file?.person?.cik)||personCik;
async function follow({undo=false}={}){
 if(followBusy)return;
 followBusy=true;const was=following;following=true;setFollow(true);
 try{
  await api("/v1/me/people",{method:"POST",body:{owner_cik:followCik()}});
  toast(E(undo?"Following "+personName+" again.":"Following "+personName+". Their new filings now appear under People you follow on your overview."));
 }catch(e){
  following=was;
  if(e.status!==401&&e.status!==402)toast(E("Could not follow "+personName+": "+String(e.message||"").replace(/\.$/,"")+". Nothing was changed."),{error:true});
 }finally{followBusy=false;setFollow(following);}
}
async function unfollow(){
 if(followBusy)return;
 followBusy=true;following=false;setFollow(false);
 const cik=followCik();
 try{
  await api("/v1/me/people/"+encodeURIComponent(cik),{method:"DELETE"});
  toast('Unfollowed '+E(personName)+'. <button type="button" class="pf-undo" data-pf-undo aria-label="'+E("Undo: follow "+personName+" again")+'">Undo</button>',{keep:true});
  // Undo stays for 6 s; then the notice goes (focus on Undo returns to the Follow button first).
  toastTimer=setTimeout(()=>{const el=$("pf-toast");if(el?.querySelector("[data-pf-undo]")){const had=el.contains(document.activeElement);el.textContent="";if(had)$("pf-follow")?.focus({preventScroll:true});}},UNDO_MS);
 }catch(e){
  following=true;
  if(e.status!==401&&e.status!==402)toast(E("Could not unfollow "+personName+": "+String(e.message||"").replace(/\.$/,"")+". Nothing was changed."),{error:true});
 }finally{followBusy=false;setFollow(following);}
}
async function loadFollowing(){
 try{
  const x=await api("/v1/me/people");
  const list=Array.isArray(x.items)?x.items:[];
  following=list.some(p=>sameCik(p?.owner_cik,askedCik));
 }catch{following=null;/* unknown: "Follow +" still works, a repeat follow is harmless */}
 if(file)setFollow(following);
}

/* ---------- load ---------- */
async function load(){
 main.classList.add("is-loading");main.setAttribute("aria-busy","true");
 try{file=await api("/v1/people/"+encodeURIComponent(askedCik)+"?limit="+LIMIT);render(file);}
 catch(e){
  if(e.status===401||e.status===402)return;
  if(e.status===404)showState("missing");
  else if(e.status===400)showState("badcik");
  else showState("error",e.message);
 }
}
document.addEventListener("click",e=>{
 const t=e.target;
 if(t.closest?.("button[data-pf-undo]")){void follow({undo:true}).then(()=>$("pf-follow")?.focus({preventScroll:true}));return;}
 if(t.closest?.("#pf-follow")){if(following===true)void unfollow();else void follow();return;}
 const more=t.closest?.("button[data-pf-more]");if(more){showMore(more.dataset.pfMore);return;}
 const again=t.closest?.("button[data-pf-retry]");
 if(again){again.disabled=true;again.textContent="Loading…";const box=$("pf-state");void load().then(()=>{if(box&&!box.hidden)box.querySelector("button[data-pf-retry]")?.focus({preventScroll:true});});}
});

$("pf-fileno").textContent=askedCik?pad10(askedCik):"—";
if(!askedCik)showState("badcik");
else{void loadFollowing();void load();}
})();
