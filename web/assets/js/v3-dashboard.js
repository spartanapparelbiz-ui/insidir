/* Insidir overview (dashboard.html): the shared core of the signed-in home page.

   What this file owns:
     - window.InsidirDesk, the surface v4-dashboard.js and v13-overview.js read: form4-words.js's exact figures
       (shares and prices as filed, dollar values to the cent, trade dates in UTC, SEC filing dates on the Eastern
       calendar day) and its describe(x), one plain-English sentence for every Form 4 transaction code, shared with
       the personnel file (person.js); plus the page's tiles, badges, screen-reader sentences and person links
       (person.html?cik=<owner CIK> whenever the CIK is known, else the people directory's search);
     - the data hub: every request starts once, as soon as this script runs, and each module renders once
       when the responses it needs have settled (or again after its own "Try again");
     - the render scheduler: the first screen (Today, 01 People you follow) renders as soon as its data is
       in; everything below renders in priority order in idle callbacks (300 ms timeout), one module per
       slice, so no single task blocks the page;
     - "new since your last visit": localStorage["insidir:overview:last-seen"] is read once before
       anything renders; a row is new when it was imported (created_at, else published_at) after it. The
       time of this visit is written when the page is hidden or left, and only after 4 s of being seen;
     - row counts saved at the last visit (localStorage["insidir:overview:counts"]), which the inline
       skeleton script in dashboard.html uses to reserve the same space before the data arrives;
     - 02 Your watchlist (the latest purchase or sale at each saved company, with Save suggestions when it
       is empty), 02b Your notes and 04 All recent trades (filters crossfade inside a height-locked table).

   Requests: /v1/me/people/updates?limit=40, /v1/me/watchlist, /v1/me/research-decisions,
   /v1/transactions?limit=100, /v1/status, /v1/filings?limit=1, plus, for at most 8 watched tickers with no purchase
   or sale in the 100-row window, /v1/transactions?ticker=X&category=reported_purchase|reported_sale&limit=1 (and
   ?ticker=X&limit=20 when there is neither), and /v1/insiders only when the reader follows fewer than 3 people
   (v13-overview.js). /v1/me comes from app.js. No synthetic records,
   prices or market metrics: every row comes from one of those responses and links to an Insidir page or
   the original SEC document. 401/402 are handled by app.js (sign in / subscribe); every other failure
   says what failed, in place, with a "Try again" that reloads only that module. */
(() => {"use strict";
const $=id=>document.getElementById(id);
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reduce=matchMedia("(prefers-reduced-motion: reduce)");
/* The Form 4 wording and the exact figures are form4-words.js's (window.InsidirForm4, loaded first), shared with the
   personnel file (person.js), so a trade reads the same sentence with the same figures on both pages. */
const F=window.InsidirForm4;
if(!F){console.error("form4-words.js must load before v3-dashboard.js");return;}
const {MONTHS,MINUS,tick,validDate,num,count,plural,money,moneyCents,signedCents,price,qty,decimal,cash,cents,scaled,fromScaled,
 date,filedDate,utcDay,eastern,dayText,CODES,NOUN,code,codeMeaning,nounKey,noun,kind,ownership,security,lagOf,lagWords,sharesText,valueCents,qualifiers,valueText}=F;
const cikOf=x=>/^\d{1,12}$/.test(String(x??"").trim())&&/[1-9]/.test(String(x))?String(x).trim():"";
const accession=x=>{const s=String(x||"").replace(/-/g,"");return /^\d{18}$/.test(s)?s:"";};
const DAY=86400000;
const pad2=n=>(n<10?"0":"")+n;
/* Short dates for tight lines drop the year when it is this year: "Oct 12", but "Dec 30, 2025". */
const THIS_YEAR=new Date().getFullYear();
const shortDate=x=>{const d=validDate(x);return d?dayText(utcDay(d),false):"";};
const tradedShort=x=>{const d=validDate(x);if(!d)return "";const p=utcDay(d);return dayText(p,p.y!==THIS_YEAR);};
const filedShort=x=>{const d=validDate(x);if(!d)return "";const p=eastern(d);return dayText(p,p.y!==THIS_YEAR);};
const stamp=x=>{const d=validDate(x);return d?dayText(utcDay(d))+", "+pad2(d.getUTCHours())+":"+pad2(d.getUTCMinutes())+" UTC":"Not reported";};
/* Sums and differences arrive as numbers worked out from whole cents (derive()), so their own digits are exact. */
const signedMoney=n=>{const c=cents(n);return c===null?"Not reported":signedCents(c);};
// Compact axis labels ("$25M", "$2.5K"), one decimal at most: the chart's scale, never a figure.
const compactMoney=n=>{const a=Math.abs(n);for(const [u,l] of [[1e12,"T"],[1e9,"B"],[1e6,"M"],[1e3,"K"]]){if(a>=u*0.99995){const v=decimal(a/u,0,1);if(v!=="1,000"||l==="T")return (n<0?"-":"")+"$"+v+l;}}return cash(n,0,1);};
const media=window.InsidirMedia;
const shown=n=>media?.displayName?media.displayName(n):String(n||"Reporting person");
/* Issuer names arrive as filed ("EXXON MOBIL CORP"); shown as people write them ("Exxon Mobil Corp"), by the helper every
   page shares (entity-media.js). */
const companyName=raw=>media?.companyName?media.companyName(raw):String(raw||"").trim();
const companyHref=t=>tick(t)?"company.html?ticker="+encodeURIComponent(tick(t)):"explore.html";
const researchHref=t=>tick(t)?"research.html?ticker="+encodeURIComponent(tick(t)):"research.html";
const filingHref=a=>accession(a)?"filing.html?accession="+accession(a):"filings.html";
/* A person's own file (person.html?cik=, the SEC owner CIK without leading zeros) whenever the CIK is known; else the
   people directory's search for the name, opened on the result (#v10-directory), not on its hero. */
const personHref=(n,cik)=>{const c=cikOf(cik);if(c)return "person.html?cik="+c.replace(/^0+/,"");const s=String(n||"").trim();return s?"people.html?q="+encodeURIComponent(s.slice(0,80))+"#v10-directory":"people.html";};

/* ---------- identity tiles ----------
   Every person and company named on the page gets a tile from entity-media.js: a headshot or the issuer's
   logo standing in for it, a company logo, and initials only when neither exists. The size class is the
   helper's; the page sets the pixel size per place (--ins-size in v13-dashboard.css: feed 48, followed list 40,
   inline 20, table 28). People are identified by SEC owner CIK, with the issuer's CIK for its logo standing in
   (and its photo lookup) when the row has no ticker. */
const personTile=(name,ticker,cik,size,issuerCik)=>media?media.portrait(String(name||""),tick(ticker),size||"sm",{cik:cikOf(cik),issuerCik:cikOf(issuerCik)}):"";
const companyTile=(ticker,name,cik,size)=>media?media.logo(tick(ticker),size||"sm",{cik:cikOf(cik),name:companyName(name)}):"";
const hydrate=root=>{try{media?.hydrate?.(root);}catch{/* a tile that cannot resolve keeps its initials */}};
/* ---------- joint filings ----------
   A Form 4 with several reporting owners is stored once with owner_cik null and every owner's name joined by ", " in
   owner_name; the engine adds owners:[{cik,name}] in filing order (sec_filing_owners). owners(x) is that whole list
   (never cut short), merged with any name in owner_name the list lacks (an owner with no CIK, or a line imported before
   the owners were recorded); a name is split on its commas, with a ", Inc." or ", Jr." kept on the name before it. */
const SUFFIX_PART=/^(?:inc|llc|l\.?l\.?c|l\.?p|lp|ltd|limited|co|corp|corporation|company|plc|n\.?a|n\.?v|s\.?a|ag|se|jr|sr|ii|iii|iv|v|esq|m\.?d|ph\.?d)\.?$/i;
function splitNames(raw){const out=[];for(const p of String(raw||"").split(/\s*,\s*/).map(s=>s.trim()).filter(Boolean)){if(out.length&&SUFFIX_PART.test(p))out[out.length-1]+=", "+p;else out.push(p);}return out;}
const nameKey=s=>String(s||"").replace(/[^\p{L}\p{N}]+/gu," ").trim().toUpperCase();
const bareCik=c=>cikOf(c).replace(/^0+/,"");
function owners(x){
 if(!x||cikOf(x.owner_cik))return [];
 const list=(Array.isArray(x.owners)?x.owners:[]).filter(o=>o&&(cikOf(o.cik)||String(o.name||"").trim())).map(o=>({cik:cikOf(o.cik),name:String(o.name||"").trim()}));
 // Each listed owner's own name is taken out of the joined string first (a name may hold a comma itself); what is left
 // are the owners the list lacks.
 let left=String(x.owner_name||"");
 for(const o of list){if(!o.name)continue;let i=left.indexOf(o.name);if(i<0)i=left.toUpperCase().indexOf(o.name.toUpperCase());if(i>=0)left=left.slice(0,i)+","+left.slice(i+o.name.length);}
 const seen=new Set(list.map(o=>nameKey(o.name)).filter(Boolean));
 for(const n of splitNames(left))if(nameKey(n)&&!seen.has(nameKey(n))){seen.add(nameKey(n));list.push({cik:"",name:n});}
 return list.length>1||(list.length===1&&list[0].cik)?list:[];
}
/* The owner a joint line is shown under: one the reader follows (opts.follows(cik), in the followed feed), else the
   first person (not a fund, trust or company), else the first listed. */
const ORG_WORDS=/\b(?:INC|LLC|L\.?L\.?C|LP|L\.P|LTD|CORP|CORPORATION|COMPANY|TRUST|FUND|FUNDS|CAPITAL|PARTNERS|HOLDINGS?|HOLDCO|GROUP|FOUNDATION|BANK|ASSOCIATES|MANAGEMENT|ADVISORS|ADVISERS|INVESTMENTS|PLC|LIMITED|VENTURES|ESTATE|GP)\b|&/i;
/* Short suffixes that are also surnames (Sá, Co, Ag, Se) mark a company only when dotted (S.A.) or after the first word:
   SEC files people surname first ("Sa Neto Francisco" is Francisco Sá Neto). Same rule as isEntityName in src/person-match.mjs. */
const ORG={test:s=>ORG_WORDS.test(String(s||""))||String(s||"").split(/[\s,]+/).filter(Boolean).some((w,i)=>/^(S\.?A|A\.?G|N\.?V|S\.?E|CO)\.?$/i.test(w)&&(i>0||/\./.test(w)))};
function leadOf(m,follows){
 if(typeof follows==="function"){const f=m.find(o=>o.cik&&follows(o.cik));if(f)return f;}
 return m.find(o=>!ORG.test(o.name))||m[0];
}
const plainOthers=n=>n===1?"1 other reporting owner":count(n)+" other reporting owners";
/* "Timothy D. Cook", or for a joint filing "Timothy D. Cook and Katherine L. Adams" (up to three owners named), else
   "Stephen A. Schwarzman and 9 other reporting owners": the subject of a sentence, for screen readers and link labels. */
function ownerLabel(x,{follows}={}){
 const m=owners(x);if(!m.length)return shown(x.owner_name);
 const lead=leadOf(m,follows),rest=m.filter(o=>o!==lead);
 if(!rest.length)return shown(lead.name);
 if(m.length<=3){const n=[lead,...rest].map(o=>shown(o.name||"CIK "+o.cik));return n.slice(0,-1).join(", ")+" and "+n.at(-1);}
 return shown(lead.name||"CIK "+lead.cik)+" and "+plainOthers(rest.length);
}
/* A name with its tile in front of it; data-ent marks it for the "every name has a tile" check. A joint filing is one
   compact label: its lead owner, linked to their own file, then "and N others", which opens the filing (every owner is
   listed and linked there) and names them all in its title. Never the joined owner_name as one person. */
const personName=(x,{link=true,follows}={})=>{
 const m=owners(x);
 if(!m.length){const n=E(shown(x.owner_name));return link?'<a data-ent="person" href="'+E(personHref(x.owner_name,x.owner_cik))+'">'+n+'</a>':'<span data-ent="person">'+n+'</span>';}
 const lead=leadOf(m,follows),rest=m.filter(o=>o!==lead),n=E(shown(lead.name||"CIK "+lead.cik));
 if(!rest.length)return link?'<a data-ent="person" href="'+E(personHref(lead.name,lead.cik))+'">'+n+'</a>':'<span data-ent="person">'+n+'</span>';
 // In the label the lead name may shorten with an ellipsis; its title keeps it whole.
 const who=link?'<a data-ent="person" href="'+E(personHref(lead.name,lead.cik))+'" title="'+n+'">'+n+'</a>':'<span data-ent="person" title="'+n+'">'+n+'</span>';
 const all=rest.map(o=>shown(o.name||"CIK "+o.cik)),title="Filed jointly with "+(all.length>12?all.slice(0,12).join(", ")+" and "+count(all.length-12)+" more":all.join(", "));
 const more="and "+(rest.length===1?"1 other":count(rest.length)+" others"),acc=accession(x.accession);
 return '<span class="rd-who">'+who+' '+(link&&acc?'<a class="rd-who__more" href="'+E(filingHref(acc))+'" title="'+E(title)+'" aria-label="'+E(more+": all "+count(m.length)+" reporting owners on this filing")+'">'+E(more)+'</a>':'<span class="rd-who__more" title="'+E(title)+'">'+E(more)+'</span>')+'</span>';
};
// A joint filing's tile pictures its lead owner, identified by their own CIK and the issuer's for the logo standing in.
const whoTile=(x,size,{follows}={})=>{const m=owners(x);if(!m.length)return personTile(x.owner_name,x.ticker,x.owner_cik,size,x.issuer_cik);const o=leadOf(m,follows);return personTile(o.name,x.ticker,o.cik,size,x.issuer_cik);};
const coTile=(x,size)=>companyTile(x.ticker,x.issuer_name,x.issuer_cik,size);

/* ---------- Form 4 codes ----------
   Plain words for the code legend under the table (only codes on screen are listed). The SEC's own meaning of each
   code (CODES) and the nouns (NOUN) are form4-words.js's. */
const LEGEND={P:"bought on the market",S:"sold on the market",A:"grant or award",M:"option exercise",X:"option exercise",O:"option exercise",
 C:"conversion",F:"shares withheld for tax or the exercise price",G:"gift",D:"returned to the company",E:"position expired",H:"position expired",
 I:"discretionary trade",J:"other, described in the filing",K:"equity swap",L:"small acquisition",W:"will or inheritance",Z:"voting trust",U:"tendered in a change of control",V:"reported early, voluntarily"};
const tri=k=>k==="buy"?'<i class="rd-tri rd-tri--up" aria-hidden="true"></i>':k==="sell"?'<i class="rd-tri rd-tri--down" aria-hidden="true"></i>':"";
/* Numbers for arithmetic only (ranking, chart scales, sums of a few values): every figure shown is written from its digits. */
const sharesOf=x=>num(x?.shares);
const priceOf=x=>num(x?.price_per_share??x?.price);
const valueOf=x=>{const c=valueCents(x);return c===null?null:Number(c)/100;};
const signOf=x=>{const ad=String(x?.acquired_disposed||"").toUpperCase();return ad==="A"?1:ad==="D"?-1:kind(x)==="buy"?1:kind(x)==="sell"?-1:0;};
const signedShares=x=>{const s=sharesText(x);if(s===null)return "Not reported";const g=signOf(x);return (g>0?"+":g<0?MINUS:"")+s;};
const lagText=lagWords;
/* describe(x, opts): the shared sentence, with issuer names written as people write them. */
const describe=(x,opts={})=>F.describe(x,{companyName,...opts});
const badge=x=>{const d=describe(x),m=codeMeaning(d.c);return '<span class="rd-type rd-type--'+d.cls+'"'+(m?' title="'+E(d.c+" — "+m)+'"':'')+'>'+tri(d.cls)+E(d.word)+(d.c?' · '+E(d.c):'')+'</span>';};
/* The full sentence for screen readers: "Elon Musk bought 150,000 Tesla, Inc. shares at $249.00, worth $37,350,000. Traded Oct 11, 2026, filed Oct 12, 2026." */
const sentence=(x,extra="",opts={})=>{const d=describe(x,{as:"name"});
 const when=[validDate(x.transaction_date)?"traded "+date(x.transaction_date):"",validDate(x.published_at)?"filed "+filedDate(x.published_at):""].filter(Boolean).join(", ");
 return ownerLabel(x,opts)+" "+d.text+(d.value!==null?", worth "+moneyCents(d.value):"")+"."+(when?" "+when.charAt(0).toUpperCase()+when.slice(1)+".":"")+qualifiers(x).map(q=>" "+q[1]+".").join("")+(extra?" "+extra:"");};
/* A name as the end of a sentence: "Following James D. Farley Jr." takes no second full stop. */
const endName=n=>String(n||"").replace(/\.+\s*$/,"");

/* ---------- storage (every access can throw: private windows, blocked site data) ---------- */
const store={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{/* not stored */}}};
const COUNTS_KEY="insidir:overview:counts",SEEN_KEY="insidir:overview:last-seen";
const counts=(()=>{try{const c=JSON.parse(store.get(COUNTS_KEY)||"{}");return c&&typeof c==="object"?c:{};}catch{return {};}})();
let countsTimer=0;
// Written at most 400ms after the first change, with every change made meanwhile: a burst of saves (the module heights
// remeasured after a render) can never keep pushing the write back past the moment a reader leaves.
const saveCount=(k,v)=>{counts[k]=v;if(!countsTimer)countsTimer=setTimeout(()=>{countsTimer=0;store.set(COUNTS_KEY,JSON.stringify(counts));},400);};

/* ---------- new since the last visit ---------- */
const lastSeen=(()=>{const t=Date.parse(store.get(SEEN_KEY)||"");return Number.isFinite(t)?t:null;})();
const visitAt=Date.now();
let seenMs=0,seenSince=document.visibilityState==="visible"?performance.now():null;
function leaving(){
 if(seenSince!==null){seenMs+=performance.now()-seenSince;seenSince=null;}
 // A quick bounce keeps the markers; rows imported while the reader was looking count as new next time.
 if(seenMs>=4000)store.set(SEEN_KEY,new Date(visitAt).toISOString());
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")leaving();else seenSince=performance.now();});
addEventListener("pagehide",leaving);
const importedAt=x=>{const c=Date.parse(x?.created_at);return Number.isFinite(c)?c:Date.parse(x?.published_at);};
const isNew=x=>{if(lastSeen===null)return false;const t=importedAt(x);return Number.isFinite(t)&&t>lastSeen;};
const NEW='<span class="rd-new">New<span class="sr-only"> since your last visit</span></span>';
// The reader's own clock: "Oct 12 at 6:40 PM".
const lastVisitText=()=>{if(lastSeen===null)return "";const d=new Date(lastSeen),h=d.getHours();return MONTHS[d.getMonth()]+" "+d.getDate()+" at "+(h%12||12)+":"+pad2(d.getMinutes())+" "+(h<12?"AM":"PM");};

/* ---------- network ---------- */
function explain(status,body){
 if(status===401)return "Your session has ended. Taking you to sign in…";
 if(status===402)return "An active subscription is needed. Taking you to the subscription page…";
 if(status===429)return "Too many requests right now. Wait a moment and try again.";
 if(status>=500)return "The research service is unavailable right now (HTTP "+status+")";
 if(body&&typeof body.error==="string"&&body.error.length<160)return body.error;
 return "The request could not be completed (HTTP "+status+")";
}
async function api(path,{method="GET",body}={}){
 let r;
 try{r=await fetch(path,{method,credentials:"same-origin",headers:body?{Accept:"application/json","Content-Type":"application/json"}:{Accept:"application/json"},body:body?JSON.stringify(body):undefined});}
 catch{throw Object.assign(Error("Could not reach the research service. Check your connection"),{status:0});}
 let j=null;try{j=await r.json();}catch{/* not JSON */}
 if(!r.ok)throw Object.assign(Error(explain(r.status,j)),{status:r.status});
 if(!j||typeof j!=="object")throw Object.assign(Error("The research service sent an unreadable response"),{status:r.status});
 return j;
}
const items=j=>Array.isArray(j?.items)?j.items:[];
const canRetry=e=>e?.status!==401&&e?.status!==402;
// data-hf-atom: a standalone button that moves with the pointer like the other atoms (v13-motion.js), though it sits in a message.
const retry=key=>' <button type="button" class="rd-retry" data-retry="'+key+'" data-hf-atom>Try again</button>';
const failText=(lead,e)=>E(lead?lead+": "+e.message.replace(/\.$/,"")+".":e.message);
const failRow=(cols,key,e,lead)=>'<tr><td colspan="'+cols+'" class="rd-empty rd-empty--error" role="alert">'+failText(lead,e)+(canRetry(e)?retry(key):"")+'</td></tr>';
const failBlock=(key,e,lead)=>'<p class="rd-empty rd-empty--error" role="alert">'+failText(lead,e)+(canRetry(e)?retry(key):"")+'</p>';

/* ---------- data hub ----------
   load(name, path): starts the request now; settle(name) is a promise of {ok, value} or {ok:false, error}.
   watch(names, fn): fn(results) once every named request has settled, and again after a retry of any of them
   (a later settle supersedes an earlier one still in flight). */
const loads=new Map(),watchers=[];
function setLoad(name,promise){loads.set(name,promise);for(const w of watchers)if(w.names.includes(name))fire(w);return promise;}
function load(name,path,pick=x=>x){return setLoad(name,api(path).then(v=>({ok:true,value:pick(v)}),error=>({ok:false,error})));}
function fire(w){
 const ps=w.names.map(n=>loads.get(n));if(ps.some(p=>!p))return;
 const token=++w.token;
 Promise.all(ps).then(rs=>{if(token===w.token)w.fn(Object.fromEntries(w.names.map((n,i)=>[n,rs[i]])));});
}
function watch(names,fn){const w={names,fn,token:0};watchers.push(w);fire(w);}
const settled=name=>loads.get(name)||Promise.resolve({ok:false,error:Error("not requested")});
const REQUESTS={
 updates:["/v1/me/people/updates?limit=40",x=>x],
 watchlist:["/v1/me/watchlist",items],
 notes:["/v1/me/research-decisions",items],
 trades:["/v1/transactions?limit=100",items],
 status:["/v1/status",x=>x],
 filing:["/v1/filings?limit=1",x=>items(x)[0]||null]
};
const reload=name=>{const r=REQUESTS[name];if(r)load(name,r[0],r[1]);};

/* ---------- render scheduler ----------
   now(fn): the first screen, as soon as its data is in. later(priority, fn): everything below it, lowest
   priority number first, in idle time (at most 300 ms late), one module per frame: the next one waits until the
   browser has drawn this one, so each module's style and layout work is its own short task, not one long one. */
const queue=[];let pumping=0;
const idle=window.requestIdleCallback?(fn=>requestIdleCallback(fn,{timeout:300})):(fn=>setTimeout(fn,16));
const afterFrame=fn=>document.hidden||!window.requestAnimationFrame?fn():requestAnimationFrame(()=>idle(fn));
function pump(){
 if(pumping)return;
 pumping=1;
 idle(function run(){
  const job=queue.shift();
  if(job){try{job.fn();}catch(e){console.error(e);}}
  if(queue.length)afterFrame(run);else pumping=0;
 });
}
function later(priority,fn){queue.push({priority,fn});queue.sort((a,b)=>a.priority-b.priority);pump();}
const now=fn=>{try{fn();}catch(e){console.error(e);}};

/* A module's host stops reserving the skeleton's space the moment its real content goes in (same task, so nothing
   paints in between); once every module has rendered, their heights at this width are kept for the next visit. */
const HOSTS=["rd-flow-scope","v10-follow-feed","v10-follow-list","v10-follow-suggest-list","v3-watchlist","v3-watchlist-foot","v3-notes","rd-kpis","rd-companies","rd-largest","v3-trades-foot","rd-about"];
function ready(host){if(!host)return;host.removeAttribute("aria-busy");host.style.removeProperty("min-height");remember();}
let rememberTimer=0;
function remember(){
 clearTimeout(rememberTimer);
 rememberTimer=setTimeout(()=>later(9,()=>{
  const els=HOSTS.map($).filter(Boolean),wrap=document.querySelector(".rd-table-wrap--trades");
  if(els.some(el=>el.getAttribute("aria-busy")==="true"||el.querySelector(".is-skeleton"))||$("v3-trades")?.querySelector(".is-skeleton"))return;
  const h={w:innerWidth};for(const el of els)h[el.id]=el.offsetHeight;
  if(wrap)h.trades=Math.max(table.lock,wrap.offsetHeight);
  // The photo credits (filled by entity-media.js) are measured without the space held for them at load.
  const cr=$("rd-credits");
  // Not written yet (pictures still loading): keep the height measured at the last visit.
  if(cr){
   if(cr.firstChild){const held=cr.style.getPropertyValue("min-height");if(held)cr.style.removeProperty("min-height");h["rd-credits"]=cr.offsetHeight;if(held)cr.style.setProperty("min-height",held,"important");}
   else h["rd-credits"]=Number(counts.heights?.["rd-credits"])||0;
  }
  saveCount("heights",h);
 }),700);
}
/* Content replacing a skeleton crossfades in place over 200 ms: one opacity animation on the module (one layer, not one
   per row; restarted by each render without re-measuring anything). Rows below the fold rise in a beat apart through
   the scroll reveal (v13-motion.js). Never under reduced motion. */
function arrive(host){if(host&&!reduce.matches&&host.animate)host.animate([{opacity:0},{opacity:1}],{duration:200,easing:"cubic-bezier(.2,.7,.1,1)"});}

/* ---------- derive(): purchases, sales and the rest, from the 100-row window ----------
   One result feeds the Today sentence and 03 Across the market, so their figures always match. A line that a Form 4/A
   published after its own filing repeats (an original, or an earlier 4/A) is counted once, from the latest copy: the
   same rule as GET /v1/people/<cik> (form4-words.js restated()), so a sale restated twice is still one sale. Dollar
   values are added in whole cents and shares in units of 1e-8 (BigInt), then given to the modules as numbers (for the
   chart's scale) and as exact digits (buyShares, sellShares). */
let derived=null,derivedFrom=null;
function derive(rows){
 if(rows===derivedFrom&&derived)return derived;
 const out={rows,buys:[],sells:[],others:[],buyValue:0,sellValue:0,buyShares:"0",sellShares:"0",buyUnpriced:0,sellUnpriced:0,buyUnshared:0,sellUnshared:0,
  lags:[],companies:new Set(),people:new Set(),first:null,last:null,days:new Map(),undated:0,byCompany:new Map(),priced:[],otherCodes:new Map(),replaced:0,superseded:new Set()};
 out.superseded=F.restated(rows);
 const kept=rows.filter(x=>!out.superseded.has(x));
 out.replaced=out.superseded.size;
 let buyC=0n,sellC=0n,buyS=0n,sellS=0n;
 const toNum=c=>Number(c)/100;
 // Days to report are the original filing's: an amendment is filed later by design.
 for(const x of rows)if(!x.is_amendment){const l=lagOf(x);if(l!==null)out.lags.push(l);}
 for(const x of kept){
  const k=kind(x),c=valueCents(x),s=scaled(x.shares),t=tick(x.ticker),ck=String(x.issuer_cik||"").trim().replace(/^0+(?=\d)/,"")||t||String(x.issuer_name||"").trim(),when=validDate(x.transaction_date);
  if(ck)out.companies.add(ck);
  // People: each reporting owner once, by CIK; a joint line counts every owner it lists, not its joined names as one.
  const joint=owners(x);
  if(joint.length){for(const o of joint){const k=bareCik(o.cik)||nameKey(o.name);if(k)out.people.add(k);}}
  else{const who=String(bareCik(x.owner_cik)||x.owner_name||"").trim();if(who)out.people.add(who);}
  if(when){if(!out.first||when<out.first)out.first=when;if(!out.last||when>out.last)out.last=when;}
  if(k==="other"){out.others.push(x);const n=nounKey(x)||"?";out.otherCodes.set(n,(out.otherCodes.get(n)||0)+1);continue;}
  // No value counted: either no price was reported, or a price came with no share count (each said in its own words).
  const priced=c!==null&&c>0n,noPrice=!priced&&priceOf(x)===null,noShares=!priced&&!noPrice&&s===null;
  const abs=s===null?0n:s<0n?-s:s;
  if(k==="buy"){out.buys.push(x);buyS+=abs;if(priced)buyC+=c;else if(noPrice)out.buyUnpriced++;else if(noShares)out.buyUnshared++;}
  else{out.sells.push(x);sellS+=abs;if(priced)sellC+=c;else if(noPrice)out.sellUnpriced++;else if(noShares)out.sellUnshared++;}
  if(!priced)continue;
  out.priced.push(x);
  if(when){const key=when.toISOString().slice(0,10),e=out.days.get(key)||{key,buy:0,sell:0,nb:0,ns:0,bc:0n,sc:0n};if(k==="buy"){e.bc+=c;e.nb++;}else{e.sc+=c;e.ns++;}e.buy=toNum(e.bc);e.sell=toNum(e.sc);out.days.set(key,e);}
  else out.undated++;
  if(ck){const e=out.byCompany.get(ck)||{t,cik:String(x.issuer_cik||""),name:"",buy:0,sell:0,nb:0,ns:0,bc:0n,sc:0n};if(!e.t&&t)e.t=t;if(!e.name&&x.issuer_name)e.name=String(x.issuer_name);if(k==="buy"){e.bc+=c;e.nb++;}else{e.sc+=c;e.ns++;}e.buy=toNum(e.bc);e.sell=toNum(e.sc);out.byCompany.set(ck,e);}
 }
 out.buyValue=toNum(buyC);out.sellValue=toNum(sellC);out.net=toNum(buyC-sellC);
 out.buyShares=fromScaled(buyS);out.sellShares=fromScaled(sellS);
 out.lags.sort((a,b)=>a-b);
 derived=out;derivedFrom=rows;
 return out;
}
/* "traded Sep 29 – Oct 12, 2026" */
const rangeText=f=>!f.first||!f.last?"":date(f.first)===date(f.last)?"traded "+date(f.first):"traded "+(f.first.getUTCFullYear()===f.last.getUTCFullYear()?shortDate(f.first):date(f.first))+" – "+date(f.last);

/* A run of facts joined by " · " (HTML parts in, HTML out): each part after the first carries its separator, so the facts
   wrap as units and a separator never opens or closes a line (.rd-seq in v13-app.css; the container gets that class).
   The text reads exactly as parts.join(" · "). */
const seq=parts=>parts.filter(Boolean).map((p,i)=>i?'<span class="rd-bit"><span class="rd-sep"> · </span>'+p+'</span>':'<span class="rd-bit rd-bit--first">'+p+'</span>').join("");

/* ---------- shared surface for v4-dashboard.js and v13-overview.js ---------- */
const desk=window.InsidirDesk={CODES,LEGEND,NOUN,E,tick,cikOf,date,filedDate,shortDate,tradedShort,filedShort,stamp,validDate,num,money,moneyCents,signedMoney,compactMoney,price,qty,count,plural,
 sharesText,valueCents,rawPrice:F.rawPrice,
 kind,code,codeMeaning,noun,nounKey,tri,badge,describe,qualifiers,valueText,sentence,sharesOf,signOf,signedShares,priceOf,valueOf,lagOf,lagText,lagWords,ownership,security,
 shown,ownerLabel,owners,bareCik,companyName,companyHref,researchHref,filingHref,personHref,personTile,companyTile,personName,whoTile,coTile,hydrate,MINUS,DAY,
 api,items,retry,failBlock,failRow,failText,canRetry,load,reload,watch,settled,later,now,arrive,ready,derive,rangeText,
 counts,saveCount,store,lastSeen,lastVisitText,isNew,NEW,importedAt,reduce,media,seq};

/* ================= 02 Your watchlist ================= */
const WATCH_ROWS=8,SAVE_SUGGEST=4;
const tradeDate=x=>validDate(x?.transaction_date)||validDate(x?.published_at);
const newer=(a,b)=>{const da=tradeDate(a),db=tradeDate(b);if(!db)return !!da;if(!da)return false;return da>db||(+da===+db&&(validDate(a.published_at)||0)>(validDate(b.published_at)||0));};
const lookups=new Map(); // ticker → {rows} | {error}
const rowsFor=(t,trades)=>[...(trades||[]).filter(x=>tick(x.ticker)===t),...(lookups.get(t)?.rows||[]).filter(x=>tick(x.ticker)===t)];
const latestTrade=rows=>rows.filter(x=>kind(x)!=="other").reduce((b,x)=>!b||newer(x,b)?x:b,null);
/* "Katherine L. Adams bought 800 shares at $226.40 = $181,120 · traded Oct 12, filed Oct 14 (2 days later)"; the name opens
   the person's file. The deal and the dates are two lines: the " · " between them stays in the text (zero-sized where
   the dates' line begins), so no line ends on it. `tail` (the New mark) closes the dates' line. */
function tradeLine(x,{ticker=false,tail=""}={}){
 const d=describe(x,{ticker}),v=valueText(x),lag=lagOf(x);
 // The price and the value it comes to are one unit ("$226.40 = $181,120"), so a line never begins with "=".
 const at=v&&/^=/.test(v)?/^(.*) at (\$\d[\d,]*(?:\.\d+)?)$/.exec(d.text):null;
 const deal=at?E(at[1])+' at <span class="rd-nb">'+E(at[2])+' '+E(v)+'</span>':E(d.text)+(v?' <span class="rd-nb">'+E(v)+'</span>':'');
 // Dates and amounts never break inside; a line can only end between them.
 const when=[validDate(x.transaction_date)?"traded "+tradedShort(x.transaction_date):"",
  validDate(x.published_at)?"filed "+filedShort(x.published_at)+(lag!==null&&!x.is_amendment?" ("+lagWords(lag)+")":""):""].filter(Boolean);
 return '<span class="rd-row__deal"><span class="rd-ent rd-ent--inline">'+whoTile(x,"sm")+personName(x)+'</span> '+deal+'</span>'+
  (when.length?'<span class="rd-sep rd-sep--break"> · </span><span class="rd-row__when">'+when.map(w=>'<span class="rd-nb">'+E(w)+'</span>').join(", ")+tail+'</span>':tail);
}
function watchDetail(t,trades){
 const rows=rowsFor(t,trades),best=latestTrade(rows),look=lookups.get(t);
 if(best){
  const since=rows.filter(x=>kind(x)==="other"&&newer(x,best)).reduce((b,x)=>!b||newer(x,b)?x:b,null);
  return {row:best,isNew:isNew(best),html:tradeLine(best,{tail:isNew(best)?" "+NEW:""})+
   (since?'<small>Also filed since: '+E(noun(since))+' by <span class="rd-ent rd-ent--inline">'+whoTile(since,"sm")+personName(since)+'</span> ('+E(tradedShort(since.transaction_date)||filedShort(since.published_at))+')</small>':'')};
 }
 if(look?.error)return {html:'<span class="rd-muted">Latest purchase or sale unavailable right now</span>'};
 const others=rows.filter(x=>kind(x)==="other");
 if(!others.length)return {html:'<span class="rd-muted">No insider filings imported yet</span>'};
 const filings=new Set(others.map(x=>x.accession||x.id)).size,kinds=[...new Set(others.map(x=>noun(x)))];
 return {html:'<span class="rd-muted">No purchases or sales imported yet · '+E(plural(filings,"other filing"))+' ('+E(kinds.slice(0,3).join(", "))+')</span>'};
}
const issuerOf=(t,trades)=>{for(const x of rowsFor(t,trades))if(x.issuer_name)return {name:x.issuer_name,cik:x.issuer_cik};return {name:"",cik:""};};
function watchRow(t,trades,i,{save=false,saved=false}={}){
 const d=watchDetail(t,trades),co=issuerOf(t,trades);
 return '<li class="rd-row rd-row--watch'+(save?" rd-row--suggest":"")+(saved?" is-saved":"")+'" data-key="'+E(t)+'" style="--i:'+Math.min(i,8)+'">'+
  companyTile(t,co.name,co.cik,"sm")+
  '<span class="rd-row__id"><a class="rd-row__link" data-ent="company" href="'+E(companyHref(t))+'">'+E(t)+'</a>'+(co.name?'<small>'+E(companyName(co.name))+'</small>':'')+'</span>'+
  '<span class="rd-row__detail">'+d.html+'</span>'+
  (save?'<button type="button" class="rd-save-btn'+(saved?" is-saved":"")+'" data-save="'+E(t)+'" aria-pressed="'+saved+'" aria-label="'+E((saved?"Saved ":"Save ")+t+" to your watchlist")+'" data-hf-atom>'+(saved?"Saved ✓":"Save "+E(t)+" +")+'</button>':'<b aria-hidden="true">↗</b>')+
 '</li>';
}
let watchSaved=new Set(),watchSuggest=[];
const WATCH_EMPTY="You have not saved any companies yet. Save one to see its latest insider purchase or sale here.";
const savedText=()=>"On your watchlist now: "+[...watchSaved].join(", ")+". ";
function renderWatchlist(r){
 const host=$("v3-watchlist");if(!host)return;
 const foot=$("v3-watchlist-foot");
 ready(host);ready(foot);
 if(!r.watchlist.ok){host.innerHTML='<li class="rd-rows__msg">'+failBlock("watchlist",r.watchlist.error,"Your watchlist could not be loaded")+'</li>';if(foot)foot.textContent="";return;}
 const trades=r.trades.ok?r.trades.value:[];
 const list=watchedOf(r);
 if(!list.length){
  // Empty: the most-traded companies in the window, each with a Save button. A saved one becomes a watchlist
  // row in place, so nothing moves under the pointer.
  const n=new Map();for(const x of trades){const t=tick(x.ticker);if(t)n.set(t,(n.get(t)||0)+1);}
  watchSuggest=[...n].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:a[0]>b[0]?1:0)).slice(0,SAVE_SUGGEST).map(([t])=>t);
  host.innerHTML='<li class="rd-rows__msg"><p class="rd-empty" id="v3-watch-empty">'+(watchSaved.size?E(savedText())+'<a href="watchlist.html">Manage your list on the watchlist page</a>.':E(WATCH_EMPTY))+'</p></li>'+
   watchSuggest.map((t,i)=>watchRow(t,trades,i+1,{save:true,saved:watchSaved.has(t)})).join("");
  if(foot)foot.textContent=watchSuggest.length?"Suggested: the companies with the most trades in the latest imports.":"";
  saveCount("watch",Math.min(watchSaved.size,WATCH_ROWS));
 }else{
  host.innerHTML=list.slice(0,WATCH_ROWS).map((t,i)=>watchRow(t,trades,i)).join("");
  if(foot)foot.innerHTML=list.length>WATCH_ROWS?'<a href="watchlist.html">'+E(plural(list.length-WATCH_ROWS,"more company","more companies"))+' on your watchlist</a>':"";
  saveCount("watch",Math.min(list.length,WATCH_ROWS));
 }
 hydrate(host);arrive(host);
}
/* Watched tickers with no purchase or sale in the 100-row window are looked up on their own: the latest purchase and
   the latest sale anywhere in the import (?category=…&limit=1), and only when there is neither, the ticker's latest 20
   lines, to say what it filed instead. One lookup per ticker, shared by the module and the Today line. */
const watchedOf=r=>r.watchlist.ok?[...new Set(r.watchlist.value.map(x=>tick(x.ticker)).filter(Boolean))]:[];
const inflight=new Map();
async function lookup(t){
 const q="/v1/transactions?ticker="+encodeURIComponent(t);
 try{
  const [b,s]=await Promise.all([api(q+"&category=reported_purchase&limit=1"),api(q+"&category=reported_sale&limit=1")]);
  let rows=[...items(b),...items(s)].filter(x=>tick(x.ticker)===t);
  if(!rows.some(x=>kind(x)!=="other"))rows=[...rows,...items(await api(q+"&limit=20")).filter(x=>tick(x.ticker)===t)];
  lookups.set(t,{rows});
 }catch(error){lookups.set(t,{error});}
}
function lookupsFor(r){
 const trades=r.trades.ok?r.trades.value:[];
 return Promise.allSettled(watchedOf(r).slice(0,WATCH_ROWS).filter(t=>!trades.some(x=>tick(x.ticker)===t&&kind(x)!=="other")).map(t=>{
  const known=lookups.get(t);if(known&&!known.error)return null;
  // A failed lookup is asked again after a "Try again" (a new settle of the watchlist or the trades).
  if(!inflight.has(t))inflight.set(t,lookup(t).finally(()=>inflight.delete(t)));
  return inflight.get(t);
 }));
}
/* How many watched companies show a New purchase or sale in the module (the rows it shows, counted its way), for Today. */
desk.watchNew=r=>lookupsFor(r).then(()=>{
 const trades=r.trades.ok?r.trades.value:[],list=watchedOf(r);
 return {watched:list.length,fresh:list.slice(0,WATCH_ROWS).filter(t=>{const b=latestTrade(rowsFor(t,trades));return !!b&&isNew(b);}).length};
});
watch(["watchlist","trades"],r=>{lookupsFor(r).then(()=>later(1,()=>renderWatchlist(r)));});
/* A height kept while a message is rewritten, so nothing below it moves. */
const keepHeight=el=>{if(el)el.style.setProperty("min-height",Math.max(parseFloat(el.style.minHeight)||0,el.getBoundingClientRect().height)+"px","important");};
async function saveTicker(btn){
 const t=tick(btn.dataset.save);if(!t||btn.getAttribute("aria-busy")==="true")return;
 if(watchSaved.has(t)){toast(E(t+" is already on your watchlist. Manage it on the watchlist page."),{near:btn});return;}
 // Optimistic: the button flips at once, and flips back if the server says no.
 btn.setAttribute("aria-busy","true");watchSaved.add(t);setSaved(btn,true);
 try{
  await api("/v1/me/watchlist",{method:"POST",body:{ticker:t}});
  toast(E("Saved "+t+" to your watchlist."),{near:btn});
  const msg=$("v3-watch-empty");if(msg){keepHeight(msg);msg.innerHTML=E(savedText())+'<a href="watchlist.html">Manage your list on the watchlist page</a>.';}
  saveCount("watch",Math.min(watchSaved.size,WATCH_ROWS));
 }
 catch(e){watchSaved.delete(t);setSaved(btn,false);toast(E("Could not save "+t+": "+e.message.replace(/\.$/,"")+". Nothing was changed."),{error:true,near:btn});}
 finally{btn.removeAttribute("aria-busy");}
}
/* The label swaps in place: the button keeps at least the width it had, so its edge never moves under the pointer. */
function setSaved(btn,on){const t=btn.dataset.save;keepWidth(btn);btn.classList.toggle("is-saved",on);btn.closest("li")?.classList.toggle("is-saved",on);btn.setAttribute("aria-pressed",String(on));btn.setAttribute("aria-label",(on?"Saved ":"Save ")+t+" to your watchlist");btn.textContent=on?"Saved ✓":"Save "+t+" +";}
const keepWidth=el=>{if(el)el.style.setProperty("min-width",Math.max(parseFloat(el.style.minWidth)||0,el.getBoundingClientRect().width)+"px","important");};
/* The page's notice (#rd-toast, role=status): fixed to the bottom of the screen, or to the top when the reader acted in
   the lower part of it, so it never covers what they just pressed. It never moves the page. A confirmation leaves after
   5 s, an Undo after 6 s, an error after 8 s; it stays while focus is inside it. */
let toastTimer=0;
function toast(html,{error=false,ms=0,near=null}={}){
 const el=$("rd-toast");if(!el)return;
 clearTimeout(toastTimer);
 const r=near?.getBoundingClientRect?.();
 el.classList.toggle("is-top",!!r&&r.top+r.height/2>innerHeight*0.5);
 el.innerHTML=html;el.classList.toggle("is-error",error);
 const wait=ms||(error?8000:5000),clear=()=>{if(el.contains(document.activeElement)){toastTimer=setTimeout(clear,1500);return;}el.textContent="";};
 toastTimer=setTimeout(clear,wait);
}
Object.assign(desk,{toast,keepHeight,keepWidth,endName});

/* ================= 02b Your notes ================= */
const STATUS={researching:"Researching",watching:"Watching",passed:"Passed"};
const NOTE_ROWS=6;
watch(["notes"],r=>later(2,()=>{
 const host=$("v3-notes");if(!host)return;
 ready(host);
 if(!r.notes.ok){host.innerHTML='<li class="rd-rows__msg">'+failBlock("notes",r.notes.error,"Your notes could not be loaded")+'</li>';return;}
 const arr=r.notes.value.filter(x=>tick(x.ticker));
 saveCount("notes",Math.min(arr.length,NOTE_ROWS));
 host.innerHTML=arr.length?arr.slice(0,NOTE_ROWS).map((x,i)=>{
  const t=tick(x.ticker),note=String(x.notes||"").replace(/\s+/g," ").trim();
  return '<li class="rd-row-wrap" style="--i:'+Math.min(i,8)+'"><a class="rd-row rd-row--note" href="'+E(researchHref(t))+'"><span class="rd-row__id"><span class="rd-ent">'+companyTile(t,"","","sm")+'<strong data-ent="company">'+E(t)+'</strong></span><small>'+E(STATUS[x.review_status||x.reviewStatus]||"Note")+'</small></span><span class="rd-row__detail">'+(note?E(note.length>96?note.slice(0,95)+"…":note):'<span class="rd-muted">No written note</span>')+'<small>Updated '+E(date(x.updated_at||x.created_at))+'</small></span><b aria-hidden="true">↗</b></a></li>';
 }).join("")+(arr.length>NOTE_ROWS?'<li class="rd-rows__msg"><p class="rd-more"><a href="research.html">All '+E(arr.length)+' notes on the research desk</a></p></li>':''):
  '<li class="rd-rows__msg"><p class="rd-empty">No notes yet. Notes you write on the <a href="research.html">research desk</a> appear here.</p></li>';
 hydrate(host);arrive(host);
}));

/* ================= 04 All recent trades ================= */
const FILTER={all:()=>true,reported_purchase:x=>kind(x)==="buy",reported_sale:x=>kind(x)==="sell",other:x=>kind(x)==="other"};
const FILTER_NAME={all:["trade","trades"],reported_purchase:["purchase","purchases"],reported_sale:["sale","sales"],other:["grant, exercise or gift","grants, exercises and gifts"]};
const EMPTY_NAME={reported_purchase:"purchases",reported_sale:"sales",other:"grants, exercises or gifts"};
const TRADE_ROWS=12,TRADE_COLS=9;
const table={rows:null,error:null,filter:"all",lock:0,cols:false};
function tradeRow(x,i){
 const t=tick(x.ticker),k=kind(x),v=valueCents(x),p=F.rawPrice(x),lag=lagOf(x),d=describe(x);
 // A line a later 4/A repeats stays listed, and says it is not counted in 03's totals (derive()).
 const restated=table.rows?derive(table.rows).superseded.has(x):false;
 const notes=[security(x),ownership(x)==="Indirect"?"held indirectly":"",x.rule_10b5_1===true?"Rule 10b5-1 plan marked on the filing":"",x.is_amendment?"amended (4/A)":"",restated?"restated by a later 4/A, not counted":""].filter(Boolean).join(" · ");
 return '<tr class="rd-trade rd-trade--'+k+'" style="--i:'+Math.min(i,8)+'" aria-label="'+E(sentence(x))+'">'+
  '<td data-label="Person" class="rd-td-who"><span class="rd-ent">'+whoTile(x,"sm")+personName(x)+'</span></td>'+
  '<td data-label="Company" class="rd-td-co">'+(t?'<span class="rd-ent">'+coTile(x,"sm")+'<a data-ent="company" href="'+E(companyHref(t))+'">'+E(t)+'</a></span>'+(x.issuer_name?'<span class="rd-sub">'+E(companyName(x.issuer_name))+'</span>':''):
   '<span class="rd-ent">'+coTile(x,"sm")+'<span data-ent="company">'+E(x.issuer_name?companyName(x.issuer_name):"Issuer not reported")+'</span></span><span class="rd-sub">No ticker</span>')+'</td>'+
  '<td data-label="What happened" class="rd-td-what">'+badge(x)+(notes?'<span class="rd-sub">'+E(notes)+'</span>':'')+'</td>'+
  '<td data-label="Shares" class="rd-num rd-td-shares"><span class="rd-qty rd-qty--'+k+'">'+E(signedShares(x))+'</span></td>'+
  // Phones read a missing price or value in words on the record's second line ("no price reported").
  '<td data-label="Price" class="rd-num rd-td-price">'+(F.digits(p)!==null?E(price(p)):'<span class="rd-muted"><span class="rd-long">No price</span><span class="rd-short">no price reported</span></span>')+'</td>'+
  '<td data-label="Value" class="rd-num rd-value rd-td-value">'+(d.valued&&d.tiny?"Under $0.01":d.valued&&v!==null?E(moneyCents(v)):d.valued?'<span class="rd-muted"><span class="rd-long">Not reported</span><span class="rd-short">value not reported</span></span>':'<span class="rd-muted rd-muted--uncounted">Not counted</span>')+'</td>'+
  // Phones show the short dates ("Oct 12"); the other is display:none there, so each width reads one date.
  '<td data-label="Traded" class="rd-nb rd-td-traded">'+(validDate(x.transaction_date)?'<span class="rd-long">'+E(date(x.transaction_date))+'</span><span class="rd-short">'+E(tradedShort(x.transaction_date))+'</span>':'<span class="rd-muted">Not reported</span>')+'</td>'+
  '<td data-label="Filed" class="rd-nb rd-td-filed">'+(validDate(x.published_at)?'<span class="rd-long">'+E(filedDate(x.published_at))+'</span><span class="rd-short">'+E(filedShort(x.published_at))+'</span>'+(lag!==null&&!x.is_amendment?'<span class="rd-sub">'+E(lagWords(lag))+'</span>':''):'<span class="rd-muted">Not reported</span>')+'</td>'+
  // The security and the qualifiers as the phone record's last line (on wider screens they sit under the badge). Placed
  // before the link cell, which stays the row's last cell for the table's own rules.
  (notes?'<td class="rd-td-q" aria-hidden="true">'+E(notes)+'</td>':'')+
  '<td class="rd-links"><a class="rd-arrow" href="'+E(filingHref(x.accession))+'" aria-label="'+E("Open the filing: "+ownerLabel(x)+", "+(t||companyName(x.issuer_name))+", "+date(x.transaction_date))+'">Filing ↗</a></td>'+
 '</tr>';
}
function tradeRows(){
 const all=table.rows,matching=all.filter(FILTER[table.filter]||FILTER.all),list=matching.slice(0,TRADE_ROWS);
 let html;
 if(!list.length)html='<tr><td colspan="'+TRADE_COLS+'" class="rd-empty">'+(all.length?"No "+EMPTY_NAME[table.filter]+" among the "+count(all.length)+" latest imported trades.":"No trades have been imported yet. New Form 4 filings appear here after the next SEC import.")+'</td></tr>';
 else html=list.map(tradeRow).join("");
 return {html,list,matching};
}
function renderTradesFoot(list,matching){
 const foot=$("v3-trades-foot");if(!foot)return;
 if(table.rows||table.error)ready(foot);
 const name=FILTER_NAME[table.filter];
 const shown=!list.length?"":matching.length>list.length?"Showing the latest "+count(list.length)+" of "+count(matching.length)+(table.filter==="all"?"":" "+name[1])+". ":"Showing "+(matching.length===1?"the only ":"all "+count(matching.length)+" ")+(matching.length===1?name[0]:name[1])+". ";
 const codes=[...new Set(list.map(code))].filter(c=>LEGEND[c]).sort((a,b)=>"PSAMXOCFGDEHIJKLWZUV".indexOf(a)-"PSAMXOCFGDEHIJKLWZUV".indexOf(b));
 foot.innerHTML=E(shown)+(list.length?'<a href="filings.html">Browse every filing ↗</a>':'')+
  (codes.length?'<span class="rd-legend-codes">Codes: '+E(codes.map(c=>c+" "+LEGEND[c]).join(", "))+'.</span>':'');
}
/* While filtering, the table keeps at least the height it had (that of "All" first), so nothing below it moves.
   Measured at the click, when the layout is already clean, never right after a render. */
function lockTable(){
 const wrap=document.querySelector(".rd-table-wrap--trades");if(!wrap)return;
 // Wide screens (a real table): the columns keep the widths "All" gave them, so no heading slides sideways while the
 // rows crossfade. Read first, then written.
 const tbl=wrap.querySelector("table"),ths=[...(tbl?.tHead?.rows[0]?.cells||[])];
 if(!table.cols&&ths.length&&getComputedStyle(tbl).display==="table"){
  const ws=ths.map(th=>th.getBoundingClientRect().width);
  ths.forEach((th,i)=>{th.style.setProperty("box-sizing","border-box","important");th.style.setProperty("width",ws[i]+"px","important");});
  table.cols=true;
 }
 // The exact (fractional) height: a rounded one would let the page grow or shrink by a pixel on each filter.
 table.lock=Math.max(table.lock,wrap.getBoundingClientRect().height);wrap.style.setProperty("min-height",table.lock+"px","important");
}
function unlockCols(){
 if(!table.cols)return;
 for(const th of document.querySelector(".rd-table--trades")?.tHead?.rows[0]?.cells||[]){th.style.removeProperty("width");th.style.removeProperty("box-sizing");}
 table.cols=false;
}
/* The filters work once there are rows to filter; while loading and after an error they are disabled (out of the tab
   order) and show no counts. */
function setFilters(on){document.querySelectorAll("button[data-filter]").forEach(b=>{b.disabled=!on;});if(!on)document.querySelectorAll("[data-count]").forEach(el=>{el.textContent="";});}
function renderTrades(){
 const host=$("v3-trades");if(!host)return;
 host.removeAttribute("aria-busy");
 const wrap=document.querySelector(".rd-table-wrap--trades");if(wrap&&table.filter==="all"){wrap.style.removeProperty("min-height");unlockCols();}
 remember();
 if(table.error){host.innerHTML=failRow(TRADE_COLS,"trades",table.error,"The latest trades could not be loaded");renderTradesFoot([],[]);setFilters(false);return;}
 table.lock=0;
 if(!table.rows)return;
 setFilters(true);
 const c={};for(const k in FILTER)c[k]=table.rows.filter(FILTER[k]).length;
 document.querySelectorAll("[data-count]").forEach(el=>{el.textContent=count(c[el.dataset.count]??0);});
 const {html,list,matching}=tradeRows();
 host.innerHTML=html;
 if(table.filter==="all")saveCount("rows",list.length);
 renderTradesFoot(list,matching);
 hydrate(host);arrive(host);
}
let filterTimer=0;
function setFilter(f){
 if(!(f in FILTER)||!table.rows)return;
 table.filter=f;
 document.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.filter===f)));
 lockTable();
 const host=$("v3-trades"),matching=table.rows.filter(FILTER[f]),name=FILTER_NAME[f];
 const live=$("v3-trades-status");if(live)live.textContent=f==="all"?"Showing all "+count(matching.length)+" trades":"Showing "+count(matching.length)+" "+(matching.length===1?name[0]:name[1]);
 // The incoming rows are new elements, so the entering animation (a class kept on the body) starts on them by itself.
 const swap=()=>{const r=tradeRows();host.innerHTML=r.html;renderTradesFoot(r.list,r.matching);hydrate(host);host.classList.remove("is-leaving");if(!reduce.matches)host.classList.add("is-entering");};
 clearTimeout(filterTimer);
 // Outgoing rows fade over 120 ms; incoming rows fade in and rise 8 px, 30 ms apart (v13-dashboard.css).
 if(reduce.matches)swap();else{host.classList.add("is-leaving");filterTimer=setTimeout(swap,120);}
}
watch(["trades"],r=>{
 table.rows=r.trades.ok?r.trades.value:null;table.error=r.trades.ok?null:r.trades.error;
 later(4,renderTrades);
});
// A new width means new row heights: the lock is measured again at the next filter click.
let lockTimer=0;
addEventListener("resize",()=>{clearTimeout(lockTimer);lockTimer=setTimeout(()=>{const wrap=document.querySelector(".rd-table-wrap--trades");if(!wrap)return;table.lock=0;wrap.style.removeProperty("min-height");unlockCols();},200);},{passive:true});

/* ---------- events ---------- */
document.addEventListener("click",e=>{
 const f=e.target.closest?.("button[data-filter]");if(f){setFilter(f.dataset.filter);return;}
 const s=e.target.closest?.("button[data-save]");if(s){void saveTicker(s);return;}
 const b=e.target.closest?.("button[data-retry]");if(!b)return;
 const key=b.dataset.retry;b.disabled=true;b.textContent="Loading…";
 if(key==="about"){reload("status");reload("filing");}
 else if(key==="follow")reload("updates");
 else reload(key);
});

/* ---------- start: every request at once, before anything renders ---------- */
for(const name of Object.keys(REQUESTS))reload(name);
})();
