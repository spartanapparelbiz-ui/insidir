/* Insidir personnel file (person.html?cik=<SEC CIK>): one reporting person's public SEC record.

   Styled as a declassified personnel file, and honest about it: every field comes from the public SEC Form 4
   records Insidir has imported (GET /v1/people/<cik>), nothing is hidden, redacted, invented or inferred, and
   the page gives no advice. Sections: the subject (file photo, name as people write it and as filed, typed
   fields, Follow), 01 Record (exact totals, all imported records against the last 30 days), 02 Known
   affiliations (each company with the roles stated in the filings, plus other issuers SEC EDGAR lists for
   the same CIK), 03 Activity log (every transaction in plain words, 25 at a time), 04 Filed records (the
   Form 4 list with SEC links).

   Requests: GET /v1/people/<cik> (the file), GET /v1/me/people (is this person followed), POST /v1/me/people
   and DELETE /v1/me/people/<cik> (Follow / Unfollow, live, with Undo), and GET /v1/media through
   entity-media.js (the photo or the company logo standing in, and company logos). 401 sends the browser to
   sign in and 402 to subscribe, with next= set to this file (auth.js and subscribe.js bring the reader back
   to it); 404 gives the API's reason (no imported lines, or only joint filings not yet attributed to each
   person); anything else says what failed with a Try again.

   Amendments and joint filings, as the API reports them: a line a later Form 4/A repeats (x.superseded) is
   listed in the activity log and marked "restated by a later 4/A, not counted", and the Record counts it once;
   a line with no owner CIK comes from a joint filing and says who it was filed with.

   Figures and the Form 4 wording come from form4-words.js (window.InsidirForm4), the module the overview
   (v3-dashboard.js) uses, so the file and the dashboard read the same sentences and figures. */
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

/* ---------- exact figures and Form 4 wording ----------
   form4-words.js (window.InsidirForm4, loaded first) writes every figure from its digits as filed and every
   transaction in the same sentence as the overview (v3-dashboard.js), so the file and the dashboard read alike:
   shares and prices keep every significant digit up to 8 decimals, dollar values are cents as stored, trade dates
   are UTC days and filing dates the SEC's Eastern calendar day. */
const F=window.InsidirForm4;
const {MONTHS,MINUS,SCALE,digits,decimal,cash,cents,fromCents,scaled,fromScaled,validDate,eastern,utcDay,dayText,isoOf,date,filedDate,tradeIso,filedIso,num,
 money,moneyCents,signedCents,price,count,plural,CODES,NOUN,code,nounKey,kind,rawPrice,sharesText,valueCents,lagOf,lagWords,ownership,isPlainShares,security,describe,valueText}=F;
const shown=n=>media?.displayName?media.displayName(n):String(n||"Reporting person").replace(/\b\w+/g,w=>w.charAt(0)+w.slice(1).toLowerCase());
/* Issuer names as people write them ("Exxon Mobil Corp"), by the helper every page shares (entity-media.js). */
const companyName=raw=>media?.companyName?media.companyName(raw):String(raw||"").trim();
const tri=k=>k==="buy"?'<i class="pf-tri pf-tri--up" aria-hidden="true"></i>':k==="sell"?'<i class="pf-tri pf-tri--down" aria-hidden="true"></i>':"";

/* ---------- joint filings ----------
   A Form 4 with several reporting owners is imported with no single owner CIK (owner_cik null) and every owner's
   name joined by commas, so the line is this person's and someone else's: "joint filing with Jane Doe". The names
   come from the line (x.owners [{cik,name}] when the engine sends them, each linked to their own file), less this
   person's own names as filed. */
const isJoint=x=>x&&(x.owner_cik===null||x.owner_cik===undefined||x.owner_cik==="");
const myNames=()=>new Set([file?.person?.name,...(Array.isArray(file?.person?.filed_names)?file.person.filed_names:[])].map(n=>String(n||"").replace(/\s+/g," ").trim().toUpperCase()).filter(Boolean));
function jointWith(x){
 if(Array.isArray(x.owners)&&x.owners.length)return x.owners.filter(o=>o&&!sameCik(o.cik,personCik)).map(o=>({name:String(o.name||"").trim(),cik:cikOf(o.cik)})).filter(o=>o.name||o.cik);
 const mine=myNames(),all=String(x.owner_name||"").split(/\s*,\s*/).map(n=>n.replace(/\s+/g," ").trim()).filter(Boolean);
 const others=all.filter(n=>!mine.has(n.toUpperCase()));
 return (others.length<all.length?others:all).map(name=>({name,cik:""}));
}
const jointText=x=>{const w=jointWith(x).map(o=>shown(o.name)||"CIK "+pad10(o.cik));return w.length?"joint filing with "+w.slice(0,3).join(", ")+(w.length>3?" and "+count(w.length-3)+" more":""):"joint filing (several reporting owners)";};
const jointLinks=x=>{const w=jointWith(x);return w.slice(0,3).map(o=>o.cik?'<a class="pf-link pf-link--inline" data-hf-atom href="person.html?cik='+o.cik.replace(/^0+/,"")+'">'+E(shown(o.name)||"CIK "+pad10(o.cik))+'</a>':E(shown(o.name))).join(", ")+(w.length>3?" and "+E(count(w.length-3))+" more":"");};
// The qualifiers in short form, each with its full wording: [short, full] (form4-words.js), plus the joint filing.
const qualifiers=x=>[...F.qualifiers(x),isJoint(x)?[jointText(x),"A joint Form 4: several reporting owners filed this line together",jointLinks(x)]:null].filter(Boolean);
const badge=x=>{const d=describe(x,{companyName}),m=CODES[d.c]||"";return '<span class="pf-badge pf-badge--'+d.cls+'"'+(m?' title="'+E(d.c+" — "+m)+'"':'')+'>'+tri(d.cls)+E(d.word)+(d.c?' · '+E(d.c):'')+'</span>';};

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
 else if(kind==="missing"){
  // The API says why (src/person-profile.mjs): no lines at all, or none filed by this CIK alone while joint filings
  // (several reporting owners on one Form 4) are not yet attributed to each person. Either way, honestly.
  const why=String(message||"").trim().replace(/\.?$/,".");
  h="No file for CIK "+cik;
  p=E(/joint/i.test(why)?why:"No imported SEC records for CIK "+cik+".")+" Insidir builds a file only from the Form 4 filings it has imported"+(/joint/i.test(why)?".":"; a person who has only filed jointly with other reporting owners may have none here yet.")+" SEC EDGAR lists every filing under this CIK.";
  extra=people+'<a href="'+E("https://www.sec.gov/cgi-bin/own-disp?action=getowner&CIK="+cik)+'" target="_blank" rel="noopener noreferrer">Look up CIK '+E(cik)+' on SEC EDGAR ↗</a>';}
 else if(kind==="signin"){h="Sign in to open this file";p="Your session has ended. Taking you to sign in; you come back to this file afterwards.";}
 else if(kind==="subscribe"){h="This file needs an active subscription";p="Taking you to the subscription step; you come back to this file afterwards.";}
 else{h="This file could not be loaded";p="The personnel file for CIK "+E(cik)+" could not be loaded: "+E(message||"unknown error")+".";extra='<button type="button" class="pf-btn" data-hf-atom data-pf-retry>Try again</button>'+people;}
 box.innerHTML='<p class="pf-state__label">'+(kind==="error"?"Error":kind==="missing"||kind==="badcik"?"File not found":"Access")+'</p><h1>'+E(h)+'</h1><p>'+p+'</p>'+(extra?'<div class="pf-state__links">'+extra+'</div>':"");
 box.hidden=false;
 box.classList.toggle("is-error",kind==="error");
 main.classList.add("is-state");main.classList.remove("is-loading");main.removeAttribute("aria-busy");
 $("pf-file").hidden=true;head.hidden=true;
 if(kind==="missing"||kind==="badcik")document.title="No file — personnel file — insidir.";
}
function clearState(){const box=$("pf-state");if(box){box.hidden=true;box.innerHTML="";}main.classList.remove("is-state");$("pf-file").hidden=false;head.hidden=false;}

/* ---------- 01 Record ---------- */
const cellOf=(t,type)=>{
 const bucket=t?.[type]||{},n=num(bucket.count)||0,sh=digits(bucket.shares),v=digits(bucket.value);
 if(!n)return '<td><b class="pf-none">None</b><span>no '+(type==="purchases"?"purchases":"sales")+'</span></td>';
 const cls=type==="purchases"?"pf-up":"pf-down";
 // One line whose stored value is $0.00 with shares: worth under half a cent, as in the log.
 const tiny=n===1&&v!==null&&cents(v)===0n&&sh!==null&&scaled(sh)>0n;
 return '<td><b class="'+cls+'">'+(tiny?"Under $0.01":v!==null?E(money(v)):"Value not reported")+'</b><span>in '+E(plural(n,type==="purchases"?"purchase":"sale"))+(sh!==null?" · "+E(plural(sh,"share"))+"":"")+'</span></td>';
};
function otherCell(t,list){
 const n=num(t?.other?.count)||0;
 if(!n)return '<td><b class="pf-none">None</b><span>no other transactions</span></td>';
 // What they are, from the lines this file loaded (a line a later 4/A repeats is counted once, like the
 // totals): counted when every one of them is here, else named.
 const by=new Map();for(const x of list){if(kind(x)!=="other"||x.superseded===true)continue;const k=nounKey(x);by.set(k,(by.get(k)||0)+1);}
 const total=[...by.values()].reduce((a,b)=>a+b,0);
 const words=[...by.entries()].sort((a,b)=>b[1]-a[1]).map(([k,c])=>{const w=NOUN[k]||["Form 4 code "+k,"Form 4 code "+k];return total===n?count(c)+" "+w[c===1?0:1]:w[1];});
 const what=words.length?(total===n?words.join(", "):"including "+words.join(", ")):"grants, exercises, withholdings and similar";
 return '<td><b>'+E(plural(n,"transaction"))+'</b><span>'+E(what)+'</span></td>';
}
function netCell(t){
 const b=cents(t?.purchases?.value),s=cents(t?.sales?.value),nb=num(t?.purchases?.count)||0,ns=num(t?.sales?.count)||0;
 if(!nb&&!ns)return '<td><b class="pf-none">None</b><span>no purchases or sales</span></td>';
 const n=(b??0n)-(s??0n);
 return '<td><b>'+E(signedCents(n))+'</b><span>'+(n>0n?"more bought than sold":n<0n?"more sold than bought":"bought and sold the same")+((nb&&b===null)||(ns&&s===null)?" · some values not reported":"")+'</span></td>';
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
function totalsOf(all){
 const list=all.filter(x=>x.superseded!==true);
 const part=cat=>{const r=list.filter(x=>x.category===cat);const vals=r.map(valueCents);
  return {count:r.length,shares:fromScaled(r.reduce((a,x)=>a+(scaled(x.shares)??0n),0n)),value:vals.some(v=>v!==null)?fromCents(vals.reduce((a,v)=>a+(v??0n),0n)):null};};
 const dates=list.map(x=>tradeIso(x.transaction_date)).filter(Boolean).sort(),pub=all.map(x=>validDate(x.published_at)?x.published_at:"").filter(Boolean).sort();
 return {transactions:list.length,superseded:all.length-list.length,filings:new Set(all.map(x=>x.accession)).size,purchases:part("reported_purchase"),sales:part("reported_sale"),other:{count:list.filter(x=>kind(x)==="other").length},
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
  '</tbody></table>'+restatedNote(all,d30);
}
/* Lines a later Form 4/A repeats: listed in the activity log, marked, and counted once (from the latest filing). */
function restatedNote(all,d30){
 const n=num(all.superseded)||0,m=num(d30.superseded)||0;
 if(!n)return "";
 return '<p class="pf-record__note">'+E(plural(n,"line")+" repeated by a later Form 4/A "+(n===1?"is":"are")+" listed in the activity log but counted once, from the latest filing"+(m?" ("+count(m)+" of them filed in the last 30 days)":"")+".")+'</p>';
}

/* ---------- 02 Known affiliations ---------- */
const roleList=r=>{const arr=Array.isArray(r)?r:String(r||"").split(/\s*[·;]\s*/);return [...new Set(arr.map(s=>String(s||"").replace(/\s+/g," ").trim().slice(0,80)).filter(Boolean))];};
/* The newest Form 4 this file holds for each company (filings come newest first), so a company whose role the
   answer leaves empty can point at the filing that states it. The API reads roles for its 8 most recent
   companies only, and leaves them empty when a document is missing or slow; it never guesses one. */
let latestForm=new Map();
const issuerKeys=o=>[cikOf(o?.issuer_cik)?"c:"+Number(o.issuer_cik):"",tick(o?.ticker)?"t:"+tick(o.ticker):""].filter(Boolean);
function indexFilings(){
 latestForm=new Map();
 const byPublished=[...rows].sort((a,b)=>String(b.published_at||"").localeCompare(String(a.published_at||"")));
 for(const f of [...filings,...byPublished]){const a=accession(f.accession);if(a)for(const k of issuerKeys(f))if(!latestForm.has(k))latestForm.set(k,a);}
}
const latestFormOf=c=>{for(const k of issuerKeys(c)){const a=latestForm.get(k);if(a)return a;}return "";};
function rolesHtml(c){
 const r=roleList(c?.roles);
 if(r.length)return E(r.join(", "));
 const a=latestFormOf(c);
 return 'Role not shown here'+(a?'; it is stated in <a class="pf-link pf-link--inline" data-hf-atom href="filing.html?accession='+a+'">the latest Form 4 ↗</a>':'; each Form 4 states it');
}
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
   '<dl class="pf-aff__facts"><div><dt>Role</dt><dd>'+rolesHtml(c)+'</dd></div><div><dt>Traded</dt><dd>'+E(traded)+'</dd></div>'+
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
 const d=describe(x,{companyName}),v=valueText(x),lag=lagOf(x),t=tick(x.ticker),acc=accession(x.accession),q=qualifiers(x),restated=x.superseded===true;
 const co=t||companyName(x.issuer_name)||"Issuer not reported";
 const filed=validDate(x.published_at)?"Filed "+filedDate(x.published_at)+(lag!==null&&!x.is_amendment?" ("+lagWords(lag)+")":""):"Filing date not reported";
 return '<li class="pf-log__row'+(restated?" is-restated":"")+'" tabindex="-1" data-i="'+i+'">'+
  '<p class="pf-log__what">'+badge(x)+' <span class="pf-log__text">'+E(d.text)+'</span>'+(v?' <b class="pf-log__value'+(d.cls==="buy"?" pf-up":d.cls==="sell"?" pf-down":"")+'">'+E(v)+'</b>':"")+
   (q.length?'<span class="pf-log__notes">'+q.map(n=>'<span title="'+E(n[1])+'">'+(n[2]?"joint filing with "+n[2]:E(n[0]))+'</span>').join(" · ")+'</span>':"")+'</p>'+
  '<p class="pf-log__when"><time datetime="'+E(tradeIso(x.transaction_date))+'">'+E(validDate(x.transaction_date)?"Traded "+date(x.transaction_date):"Trade date not reported")+'</time><span>'+E(filed)+'</span></p>'+
  '<p class="pf-log__where"><span class="pf-co">'+coTile(t,x.issuer_name,x.issuer_cik,"xs")+'<span data-ent="company">'+E(co)+'</span></span>'+
   (acc?'<a class="pf-link" data-hf-atom href="filing.html?accession='+acc+'">Form '+E(x.is_amendment?"4/A":"4")+' ↗</a>':secUrl(x.source_url)?'<a class="pf-link" data-hf-atom href="'+E(secUrl(x.source_url))+'" target="_blank" rel="noopener noreferrer">SEC filing ↗</a>':"")+'</p></li>';
}
const moreButton=(what,left)=>left>0?'<div class="pf-more"><button type="button" class="pf-btn" data-hf-atom data-pf-more="'+what+'">Show '+Math.min(PAGE,left)+' more <span>· '+count(left)+' left</span></button></div>':"";
function renderLog(){
 const host=$("pf-log");logShown=Math.min(rows.length,PAGE);
 host.innerHTML=rows.length?'<ol class="pf-log" id="pf-log-list">'+rows.slice(0,logShown).map(logRow).join("")+'</ol>'+moreButton("log",rows.length-logShown):'<p class="pf-empty">No transactions in the imported records.</p>';
 // The record counts a line a later 4/A repeats once; the log lists both copies and marks the earlier one.
 const repeated=rows.filter(x=>x.superseded===true).length,counted=rows.length-repeated;
 const total=num(file?.totals?.all?.transactions)??counted;
 const again=repeated?" ("+plural(repeated,"line")+" repeated in a later 4/A "+(repeated===1?"is":"are")+" marked and counted once)":"";
 $("pf-log-note").textContent=!rows.length?"Every imported transaction, newest first, in plain words.":
  (total>counted?"The newest "+count(rows.length)+" lines of "+plural(total,"imported transaction")+", in plain words"+again+"; the filed records below and SEC EDGAR hold the rest.":"All "+plural(rows.length,"imported transaction line")+", newest first, in plain words"+again+".")+" Each badge carries the transaction’s Form 4 code.";
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
// The subject names the most recent companies only; the rest are one link away, in Known affiliations.
const SUBJECT_COMPANIES=3;
function renderSubject(d,companies){
 const p=d.person||{},raw=String(p.name||rows[0]?.owner_name||"").replace(/\s+/g," ").trim()||"Reporting person";
 personName=shown(raw);
 const lead=companies[0],leadT=tick(lead?.ticker)||tick(rows[0]?.ticker);
 const leadCik=cikOf(lead?.issuer_cik)||cikOf(rows[0]?.issuer_cik);
 document.title=personName+" — personnel file — insidir.";
 $("pf-fileno").textContent=pad10(personCik);
 $("pf-name").textContent=personName;
 const filed=[...new Set([raw,...(Array.isArray(p.filed_names)?p.filed_names:[])].map(n=>String(n||"").replace(/\s+/g," ").trim()).filter(Boolean))];
 $("pf-asfiled").innerHTML='As filed: <span>'+E(filed[0])+'</span>'+(filed.length>1?' · also as '+filed.slice(1,4).map(n=>'<span>'+E(n)+'</span>').join(", "):"");
 const frame=document.querySelector(".pf-photo__frame");
 // The headshot; else the lead company's logo stands in, by ticker or (with no ticker) by its SEC CIK.
 if(frame&&media)frame.innerHTML=media.person({name:raw,cik:personCik,ticker:leadT,issuerCik:leadCik||undefined,size:"lg",label:true});
 const all=d.totals?.all||totalsOf(rows);
 const more=companies.length-SUBJECT_COMPANIES;
 const roles=companies.length?'<span class="pf-roles">'+companies.slice(0,SUBJECT_COMPANIES).map(c=>'<span class="pf-role">'+coTile(c.ticker,c.issuer_name,c.issuer_cik,"xs")+'<b class="pf-role__co" data-ent="company">'+E(tick(c.ticker)||coLabel(c))+'</b><span class="pf-role__text">'+rolesHtml(c)+'</span></span>').join("")+
  (more>0?'<a class="pf-link pf-role-more" data-hf-atom href="#pf-aff-title">+'+E(count(more))+' more in Known affiliations ↓</a>':"")+'</span>':"Not stated in the imported filings";
 const latest=filings[0];
 $("pf-fields").innerHTML=
  field("Role(s)",roles)+
  field("SEC CIK",'<span class="pf-mono">'+E(pad10(personCik))+'</span>')+
  field("On file",E(plural(num(all.filings)??filings.length,"Form 4 filing"))+" · "+E(plural(num(all.transactions)??rows.length,"transaction line")))+
  field("Earliest trade on file",validDate(all.first_transaction_date)?E(date(all.first_transaction_date)):"Not reported")+
  field("Last filed",validDate(all.last_published_at)?E(filedDate(all.last_published_at))+(latest&&tick(latest.ticker)?' <small>Form '+E(String(latest.form_type||"4").slice(0,8))+' for '+E(tick(latest.ticker))+'</small>':""):"Not reported");
 const co=$("pf-company-link");
 if(leadT){co.href=companyHref(leadT);co.textContent="Open "+leadT+" company report ↗";co.hidden=false;}else co.hidden=true;
 const edgar=$("pf-edgar-link");
 edgar.href=secUrl(d.edgar_url)||"https://www.sec.gov/cgi-bin/own-disp?action=getowner&CIK="+pad10(personCik);edgar.hidden=false;
 if(typeof d.disclaimer==="string"&&d.disclaimer.trim()&&!/recommendation|prediction/i.test(d.disclaimer))$("pf-disclaimer").textContent="Everything in this file comes from public SEC filings. Nothing here is secret, a recommendation or a prediction. "+d.disclaimer.trim().slice(0,240);
 // The file photo's caption says what the tile shows once it has settled (a photo, or the company logo standing in).
 const tile=frame?.querySelector("[data-media]"),cap=$("pf-photo-caption");
 const leadName=leadT||coLabel(lead||{issuer_cik:leadCik});
 const caption=()=>{if(!tile||!cap)return;const c=tile.classList;const text=c.contains("is-photo")?"File photo":c.contains("is-stand-in")?"No published photo · "+leadName+" logo":c.contains("is-monogram")?"No published photo or logo":c.contains("is-logo")?"Logo on file":"File photo";if(cap.textContent!==text)cap.textContent=text;};
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
 indexFilings();
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

/* ---------- SEC historical index when this owner has no imported Form 4 ---------- */
function renderSecHistory(d){
 const box=$("pf-state");
 if(!box)return;
 file=d;personCik=cikOf(d.person?.cik)||askedCik;
 const name=String(d.person?.name||"SEC reporting filer"),entries=Array.isArray(d.sec_filing_index)?d.sec_filing_index:[];
 const official=secUrl(d.edgar_url),source=secUrl(d.source_url);
 const rows=entries.map(x=>{
   const form=/^(3|4|5)(\/A)?$/.test(String(x.form_type||""))?x.form_type:"4";
   const acc=accession(x.accession);
   if(!acc)return "";
   const issued=validDate(x.filed_at)?date(x.filed_at):"Filing date unavailable";
   const report=validDate(x.report_date)?" · Report period "+date(x.report_date):"";
   return '<li class="pf-history-row"><span>'+E(issued)+'</span><strong>Form '+E(form)+'</strong><span>'+E(dashed(acc))+'</span><small>'+E(report)+'</small></li>';
 }).join("");
 box.innerHTML='<p class="pf-state__label">SEC ARCHIVE / SOURCE-VERIFIED</p>'+
  '<h1>'+E(shown(name))+'</h1>'+
  '<p>SEC reporting CIK '+E(pad10(personCik))+' · '+E(entries.length)+' ownership filing'+(entries.length===1?"":"s")+' listed in the latest SEC submissions index.</p>'+
  '<p><strong>Historical filing index found.</strong> These are original SEC record references. The Form 4 transactions have not yet been imported into Insidir, so we are not showing invented trade totals or holdings.</p>'+
  '<div class="pf-state__links">'+(official?'<a href="'+E(official)+'" target="_blank" rel="noopener noreferrer">Open all filings on SEC EDGAR ↗</a>':"")+
  (source?'<a href="'+E(source)+'" target="_blank" rel="noopener noreferrer">Official SEC source data ↗</a>':"")+
  '<a href="people.html">Back to people directory ↗</a></div>'+
  '<section aria-labelledby="pf-historical-heading"><h2 id="pf-historical-heading">SEC filing history</h2>'+
  '<p>'+E(d.history_partial?"This list is partial; additional historical filings may exist in the SEC archive.":"These are the qualifying ownership reports returned by the latest SEC submissions index.")+'</p>'+
  '<ol class="pf-history-list">'+rows+'</ol></section>';
 box.hidden=false;box.classList.remove("is-error");
 main.classList.add("is-state");main.classList.remove("is-loading");main.removeAttribute("aria-busy");
 $("pf-file").hidden=true;head.hidden=true;
 document.title=shown(name)+" · SEC filing index — insidir.";
}
/* ---------- Follow / Unfollow, live, with Undo ---------- */
/* The notice (#pf-toast, role=status) sits right after the Follow button in the page order, so Undo is the next
   Tab stop; on screen it is fixed to the bottom and never moves the page. A confirmation leaves after 5 s, an
   Undo after 6 s, an error after 8 s, and it stays while keyboard focus is inside it (as on the overview). */
let toastTimer=0;
function toast(html,{error=false,ms=0}={}){
 const el=$("pf-toast");if(!el)return;
 clearTimeout(toastTimer);
 el.innerHTML=html;el.classList.toggle("is-error",error);
 const clear=()=>{if(el.contains(document.activeElement)){toastTimer=setTimeout(clear,1500);return;}el.textContent="";};
 toastTimer=setTimeout(clear,ms||(error?8000:5000));
}
/* The button is never disabled once the file is on screen, so keyboard focus stays on it through a request
   (a disabled button drops focus to the page); while a request runs it is aria-disabled and presses are ignored. */
function setFollow(on){
 const b=$("pf-follow");if(!b)return;
 b.disabled=!file;
 b.setAttribute("aria-disabled",String(followBusy));
 b.classList.toggle("is-busy",followBusy);
 b.classList.toggle("is-following",on===true);
 b.setAttribute("aria-pressed",String(on===true));
 b.textContent=on===true?"Following ✓":"Follow +";
}
/* The CIK as the follow list holds it: the forms already followed (the routes match the exact string, and a
   person may be on the list as "1214156" or "0001214156"), else the CIK as the records store it. */
let followedAs=[];
/* The CIK as the import stores it (person.cik, usually 10 digits): POST /v1/me/people and the followed feed match it
   exactly, so following from this file and from the overview stores the same form. Without it, the form the lines
   carry, else the SEC's 10-digit form. */
const followCik=()=>cikOf(file?.person?.cik)||cikOf(rows.find(x=>sameCik(x.owner_cik,personCik))?.owner_cik)||pad10(personCik);
async function follow({undo=false}={}){
 if(followBusy)return;
 followBusy=true;const was=following;following=true;setFollow(true);
 const cik=followCik();
 try{
  // Autopilot: a new follow starts on "Important updates"; the mode and pause are set below the button (v33-platform.js).
  await api("/v1/me/people",{method:"POST",body:{owner_cik:cik,mode:"important"}});
  if(!followedAs.includes(cik))followedAs.push(cik);
  toast(E(undo?"Following "+personName+" again.":"Following "+personName+". Updates will appear in your briefing."));
  document.dispatchEvent(new CustomEvent("insidir:followed",{detail:{kind:"person",id:cik}}));
 }catch(e){
  following=was;
  if(e.status!==401&&e.status!==402)toast(E("Could not follow "+personName+": "+String(e.message||"").replace(/\.$/,"")+". Nothing was changed."),{error:true});
 }finally{followBusy=false;setFollow(following);}
}
async function unfollow(){
 if(followBusy)return;
 followBusy=true;following=false;setFollow(false);
 const forms=followedAs.length?[...followedAs]:[followCik()];
 let removed=0;
 try{
  // Every stored form goes, so the person is really off the list; a failure leaves them followed.
  for(const cik of forms){await api("/v1/me/people/"+encodeURIComponent(cik),{method:"DELETE"});followedAs=followedAs.filter(c=>c!==cik);removed++;}
  document.dispatchEvent(new CustomEvent("insidir:unfollowed",{detail:{kind:"person"}}));
  toast('Unfollowed '+E(personName)+'. <button type="button" class="pf-undo" data-pf-undo aria-label="'+E("Undo: follow "+personName+" again")+'">Undo</button>',{ms:UNDO_MS});
 }catch(e){
  following=removed<forms.length;
  if(e.status!==401&&e.status!==402)toast(E("Could not unfollow "+personName+": "+String(e.message||"").replace(/\.$/,"")+". "+(removed?"You still follow them.":"Nothing was changed.")),{error:true});
 }finally{followBusy=false;setFollow(following);}
}
async function loadFollowing(){
 try{
  const x=await api("/v1/me/people");
  const list=Array.isArray(x.items)?x.items:[];
  followedAs=[...new Set(list.map(p=>String(p?.owner_cik??"").trim()).filter(c=>sameCik(c,askedCik)))];
  following=followedAs.length>0;
 }catch{following=null;followedAs=[];/* unknown: "Follow +" still works, a repeat follow is harmless */}
 if(file)setFollow(following);
}

/* ---------- load ---------- */
async function load(){
 main.classList.add("is-loading");main.setAttribute("aria-busy","true");
 try{file=await api("/v1/people/"+encodeURIComponent(askedCik)+"?limit="+LIMIT);if(file?.coverage==="sec_submissions_history_only")renderSecHistory(file);else render(file);
  // Changes, Connections and the follow settings (v33-platform.js) are drawn once the file exists.
  document.dispatchEvent(new CustomEvent("insidir:person",{detail:{cik:personCik}}));}
 catch(e){
  if(e.status===401||e.status===402)return;
  if(e.status===404)showState("missing",e.message);
  else if(e.status===400)showState("badcik");
  else showState("error",e.message);
 }
}
document.addEventListener("click",e=>{
 const t=e.target;
 // Undo: focus goes back to the Follow button at once (the notice is about to be replaced), then follow again.
 if(t.closest?.("button[data-pf-undo]")){$("pf-follow")?.focus({preventScroll:true});void follow({undo:true});return;}
 if(t.closest?.("#pf-follow")){if(following===true)void unfollow();else void follow();return;}
 const more=t.closest?.("button[data-pf-more]");if(more){showMore(more.dataset.pfMore);return;}
 const again=t.closest?.("button[data-pf-retry]");
 if(again){again.disabled=true;again.textContent="Loading…";const box=$("pf-state");void load().then(()=>{if(box&&!box.hidden)box.querySelector("button[data-pf-retry]")?.focus({preventScroll:true});});}
});

$("pf-fileno").textContent=askedCik?pad10(askedCik):"—";
if(!askedCik)showState("badcik");
else{void loadFollowing();void load();}
})();
