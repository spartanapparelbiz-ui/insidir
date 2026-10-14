/* Insidir overview (dashboard.html): the shared core of the signed-in home page.

   What this file owns:
     - the formatters every module uses (exact figures: shares and prices as filed, values to the dollar,
       trade dates in UTC, SEC filing dates on the Eastern calendar day), shared through window.InsidirDesk;
     - describe(x): one plain-English sentence for every Form 4 transaction code, used by the followed
       feed, the watchlist, the biggest trades, the table badge and screen-reader labels;
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
   /v1/transactions?limit=100, /v1/status, /v1/filings?limit=1, plus /v1/transactions?ticker=X&limit=20 for
   at most 8 watched tickers with no purchase or sale in the 100-row window, and /v1/insiders only when the
   reader follows fewer than 3 people (v13-overview.js). /v1/me comes from app.js. No synthetic records,
   prices or market metrics: every row comes from one of those responses and links to an Insidir page or
   the original SEC document. 401/402 are handled by app.js (sign in / subscribe); every other failure
   says what failed, in place, with a "Try again" that reloads only that module. */
(() => {"use strict";
const $=id=>document.getElementById(id);
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reduce=matchMedia("(prefers-reduced-motion: reduce)");
// "NONE" and "NA" are placeholders some filers put in the ticker field; they are not symbols.
const tick=x=>{const s=String(x||"").trim().toUpperCase();return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(s)&&s!=="NONE"&&s!=="NA"?s:"";};
const cikOf=x=>/^\d{1,12}$/.test(String(x??"").trim())?String(x).trim():"";
const accession=x=>{const s=String(x||"").replace(/-/g,"");return /^\d{18}$/.test(s)?s:"";};
const validDate=x=>{if(!x)return null;const d=new Date(x);return Number.isNaN(d.getTime())?null:d;};
const DAY=86400000;
/* Intl formatters are built on first use: each one costs about a millisecond to construct, and most are only needed
   once the data has arrived. */
const lazy=make=>{let f=null;return {format:d=>(f||(f=make())).format(d)};};
const fmtDate=lazy(()=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}));
const fmtDay=lazy(()=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}));
const date=x=>{const d=validDate(x);return d?fmtDate.format(d):"Not reported";};
/* Filing dates are SEC (Eastern) calendar days: a Form 4 accepted at 9:30 p.m. ET is filed that day, though it is past
   midnight UTC. Trade dates are date-only values and stay in UTC. */
const fmtFiled=lazy(()=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York"}));
const fmtFiledDay=lazy(()=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"America/New_York"}));
const yearET=lazy(()=>new Intl.DateTimeFormat("en-US",{year:"numeric",timeZone:"America/New_York"}));
const etDay=lazy(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York"}));
const fmtStamp=lazy(()=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"UTC"}));
const filedDate=x=>{const d=validDate(x);return d?fmtFiled.format(d):"Not reported";};
const shortDate=x=>{const d=validDate(x);return d?fmtDay.format(d):"";};
// Short forms drop the year when it is this year: "Oct 12", but "Dec 30, 2025".
const THIS_YEAR=new Date().getFullYear();
const tradedShort=x=>{const d=validDate(x);return !d?"":d.getUTCFullYear()===THIS_YEAR?fmtDay.format(d):fmtDate.format(d);};
const filedShort=x=>{const d=validDate(x);return !d?"":Number(yearET.format(d))===THIS_YEAR?fmtFiledDay.format(d):fmtFiled.format(d);};
const stamp=x=>{const d=validDate(x);return d?fmtStamp.format(d)+" UTC":"Not reported";};
/* Numbers: exact, never rounded to "about". */
const num=x=>{if(x===null||x===undefined||x==="")return null;const n=Number(x);return Number.isFinite(n)?n:null;};
const USD0=lazy(()=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}));
const USD4=lazy(()=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:4}));
const USDC=lazy(()=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}));
const QTY=lazy(()=>new Intl.NumberFormat("en-US",{maximumFractionDigits:4}));
const MINUS="−";
const money=x=>{const n=num(x);return n===null?"Not reported":USD0.format(n);};
const signedMoney=n=>(n>0?"+":n<0?MINUS:"")+USD0.format(Math.abs(n));
const compactMoney=n=>USDC.format(n);
// Prices as filed: weighted-average sale prices often carry four decimals ($41.5321), so up to four are kept.
const price=x=>{const n=num(x);return n===null?"Not reported":USD4.format(n);};
const qty=x=>{const n=num(x);return n===null?"Not reported":QTY.format(n);};
const count=n=>QTY.format(n);
const plural=(n,one,many)=>count(n)+" "+(n===1?one:(many||one+"s"));
const media=window.InsidirMedia;
const shown=n=>media?.displayName?media.displayName(n):String(n||"Reporting person");
/* Issuer names arrive as filed ("EXXON MOBIL CORP"); shown as people write them ("Exxon Mobil Corp"). */
const AS_WRITTEN={NVIDIA:"NVIDIA",JPMORGAN:"JPMorgan",IBM:"IBM",AMD:"AMD",PLC:"plc","&":"&",INC:"Inc.","INC.":"Inc.",CO:"Co","CO.":"Co.",LLC:"LLC",LP:"LP",NV:"N.V.",SA:"S.A.",AG:"AG",SE:"SE",USA:"USA",US:"US",II:"II",III:"III"};
const companyName=raw=>{const s=String(raw||"").replace(/\s+/g," ").trim();if(!s||/[a-z]/.test(s))return s;
 return s.split(" ").map(w=>AS_WRITTEN[w]||(/^[A-Z]{1,2}$/.test(w)?w:w.charAt(0)+w.slice(1).toLowerCase().replace(/([-'’.&])([a-z])/g,(m,a,b)=>a+b.toUpperCase()))).join(" ");};
const companyHref=t=>tick(t)?"company.html?ticker="+encodeURIComponent(tick(t)):"explore.html";
const researchHref=t=>tick(t)?"research.html?ticker="+encodeURIComponent(tick(t)):"research.html";
const filingHref=a=>accession(a)?"filing.html?accession="+accession(a):"filings.html";
// #v10-directory: the people page opens on the search result, not on its hero.
const personHref=n=>String(n||"").trim()?"people.html?q="+encodeURIComponent(String(n).trim().slice(0,80))+"#v10-directory":"people.html";

/* ---------- identity tiles ----------
   Every person and company named on the page gets a tile from entity-media.js: a headshot or the issuer's
   logo standing in for it, a company logo, and initials only when neither exists. The size class is the
   helper's; the page sets the pixel size per place (--ins-size in v13-dashboard.css: feed 48, followed list 40,
   inline 20, table 28). The 4th argument identifies the person by SEC CIK (helper v2; older helpers ignore it). */
const personTile=(name,ticker,cik,size)=>media?media.portrait(String(name||""),tick(ticker),size||"sm",{cik:cikOf(cik)}):"";
const companyTile=(ticker,name,cik,size)=>media?media.logo(tick(ticker),size||"sm",{cik:cikOf(cik),name:companyName(name)}):"";
const hydrate=root=>{try{media?.hydrate?.(root);}catch{/* a tile that cannot resolve keeps its initials */}};
// A name with its tile in front of it; data-ent marks it for the "every name has a tile" check.
const personName=(x,{link=true}={})=>{const n=E(shown(x.owner_name));return link?'<a data-ent="person" href="'+E(personHref(x.owner_name))+'">'+n+'</a>':'<span data-ent="person">'+n+'</span>';};
const whoTile=(x,size)=>personTile(x.owner_name,x.ticker,x.owner_cik,size);
const coTile=(x,size)=>companyTile(x.ticker,x.issuer_name,x.issuer_cik,size);

/* ---------- Form 4 codes ---------- */
/* The SEC's own wording (Form 4 general instructions), shown in the badge's title. */
const CODES={
 P:"Open market or private purchase",S:"Open market or private sale",V:"Transaction voluntarily reported earlier than required",
 A:"Grant, award or other acquisition from the issuer",D:"Disposition to the issuer",F:"Payment of exercise price or tax liability by delivering or withholding securities",
 I:"Discretionary transaction",M:"Exercise or conversion of an exempt derivative security",C:"Conversion of a derivative security",
 E:"Expiration of a short derivative position",H:"Expiration or cancellation of a long derivative position with value received",
 O:"Exercise of an out-of-the-money derivative security",X:"Exercise of an in-the-money or at-the-money derivative security",
 G:"Bona fide gift",L:"Small acquisition under Rule 16a-6",W:"Acquisition or disposition by will or the laws of descent and distribution",
 Z:"Deposit into or withdrawal from a voting trust",J:"Other acquisition or disposition (described in the filing)",K:"Equity swap or similar instrument",
 U:"Disposition from a tender of shares in a change of control"};
/* Plain words for the code legend under the table (only codes on screen are listed). */
const LEGEND={P:"bought on the market",S:"sold on the market",A:"grant or award",M:"option exercise",X:"option exercise",O:"option exercise",
 C:"conversion",F:"shares withheld for tax or the exercise price",G:"gift",D:"returned to the company",E:"position expired",H:"position expired",
 I:"discretionary trade",J:"other, described in the filing",K:"equity swap",L:"small acquisition",W:"will or inheritance",Z:"voting trust",U:"tendered in a change of control",V:"reported early, voluntarily"};
/* Nouns for "Also filed since: option exercise by …" and the "Not a purchase or sale" tile. [one, many] */
const NOUN={A:["grant","grants"],M:["option exercise","option exercises"],X:["option exercise","option exercises"],O:["option exercise","option exercises"],
 C:["conversion","conversions"],F:["tax withholding","tax withholdings"],G:["gift","gifts"],D:["return to the company","returns to the company"],
 E:["expiration","expirations"],H:["expiration","expirations"],I:["discretionary trade","discretionary trades"],J:["other transaction","other transactions"],
 K:["equity swap","equity swaps"],L:["small acquisition","small acquisitions"],W:["will or inheritance","wills or inheritances"],Z:["voting trust change","voting trust changes"],
 U:["tender in a change of control","tenders in a change of control"],V:["early voluntary report","early voluntary reports"],
 "P derivative":["derivative purchase","derivative purchases"],"S derivative":["derivative sale","derivative sales"]};
const code=x=>String(x?.transaction_code||"").replace(/[^A-Z]/gi,"").slice(0,1).toUpperCase();
const codeMeaning=c=>CODES[c]||"";
const nounKey=x=>{const c=code(x);return (c==="P"||c==="S")&&x?.derivative?c+" derivative":c;};
const noun=(x,n=1)=>{const k=typeof x==="string"?x:nounKey(x),w=NOUN[k];return w?w[n===1?0:1]:"Form 4 code "+String(k).slice(0,1);};
/* buy | sell | other, from the engine's category (non-derivative P acquired / S disposed). */
const kind=x=>x?.category==="reported_purchase"?"buy":x?.category==="reported_sale"?"sell":"other";
const tri=k=>k==="buy"?'<i class="rd-tri rd-tri--up" aria-hidden="true"></i>':k==="sell"?'<i class="rd-tri rd-tri--down" aria-hidden="true"></i>':"";
const sharesOf=x=>num(x?.shares);
const signOf=x=>{const ad=String(x?.acquired_disposed||"").toUpperCase();return ad==="A"?1:ad==="D"?-1:kind(x)==="buy"?1:kind(x)==="sell"?-1:0;};
const signedShares=x=>{const n=sharesOf(x);if(n===null)return "Not reported";const s=signOf(x);return (s>0?"+":s<0?MINUS:"")+QTY.format(Math.abs(n));};
const priceOf=x=>num(x?.price_per_share??x?.price);
/* Value as filed: the engine's shares × price; computed the same way when only the parts were stored. */
const valueOf=x=>{const v=num(x?.estimated_value);if(v!==null)return v;const s=sharesOf(x),p=priceOf(x);return s!==null&&s>=0&&p!==null&&p>0?Math.round(s*p*100)/100:null;};
/* Calendar days from the trade date to the SEC filing date (the Eastern calendar day of publication). */
const lagOf=x=>{const t=validDate(x?.transaction_date),p=validDate(x?.published_at);if(!t||!p)return null;const d=Math.round((Date.parse(etDay.format(p))-Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate()))/DAY);return d>=0?d:null;};
const lagWords=n=>n===null?"":n===0?"same day":n===1?"1 day later":count(n)+" days later";
const lagText=lagWords;
const ownership=x=>{const o=String(x?.direct_ownership||"").toUpperCase();return o==="D"?"Direct":o==="I"?"Indirect":"";};
// "Common Stock", "Class A Ordinary Shares" read as "shares"; anything else (units, options, notes) keeps its title.
const isPlainShares=t=>!t||/^(class [a-z0-9]+ )?(common|ordinary)( stock| shares)?( ?,? ?(class [a-z0-9]+|par value.*))?$|^(common )?shares$/i.test(String(t).trim());
const security=x=>{const t=String(x?.security_title||"").replace(/\s+/g," ").trim().slice(0,60);return isPlainShares(t)?"":t;};

/* ---------- describe(x): every Form 4 code in words ----------
   Returns {word, cls, c, text, value, valued, suffix}: `word` and `cls` make the badge ("Sold", red ▼),
   `text` is the sentence after the person's name ("sold 12,500 AAPL shares at $26.00"), `value` is the dollar
   value counted for purchases and sales (null when nothing is counted), `suffix` the qualifiers
   (voluntary, amended, held indirectly). opts.ticker:false leaves the symbol out of the sentence;
   opts.as:"name" uses the company's name instead ("150,000 Tesla, Inc. shares"). */
function describe(x,opts={}){
 const c=code(x),k=kind(x),s=sharesOf(x),p=priceOf(x),v=valueOf(x),T=tick(x?.ticker),ad=String(x?.acquired_disposed||"").toUpperCase();
 const sh=s===null?"an unreported number of":QTY.format(Math.abs(s));
 const company=opts.as==="name"&&x?.issuer_name?companyName(x.issuer_name):T;
 const tk=opts.ticker===false||!company?"":company+" ";
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
  case "M":case "X":case "O":word="Option exercise";text="exercised or converted "+sh+" "+(sec||(tk+"derivative securities").trim());break;
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
 const suffix=[c==="V"?"(reported early, voluntarily)":"",x?.is_amendment?"· amended filing (4/A)":"",ownership(x)==="Indirect"?"· held indirectly (by a trust or family member, for example)":""].filter(Boolean).join(" ");
 return {word,cls,c,text,suffix,valued,value:valued&&v!==null&&v>0?v:null,priced:p!==null};
}
/* The qualifiers in short form for tight lines, each with its full wording: [short, full]. */
const qualifiers=x=>[code(x)==="V"?["reported early","reported early, voluntarily"]:null,x?.is_amendment?["amended filing (4/A)","An amended filing (Form 4/A) restating an earlier one"]:null,
 ownership(x)==="Indirect"?["held indirectly","Held indirectly (by a trust or family member, for example)"]:null].filter(Boolean);
const badge=x=>{const d=describe(x),m=codeMeaning(d.c);return '<span class="rd-type rd-type--'+d.cls+'"'+(m?' title="'+E(d.c+" — "+m)+'"':'')+'>'+tri(d.cls)+E(d.word)+(d.c?' · '+E(d.c):'')+'</span>';};
/* "= $37,350,000", or the reason there is no value. */
const valueText=x=>{const d=describe(x);return d.valued?(d.value!==null?"= "+money(d.value):d.priced?"= $0":"value not reported"):"";};
/* The full sentence for screen readers: "Elon Musk bought 150,000 Tesla, Inc. shares at $249.00, worth $37,350,000. Traded Oct 11, 2026, filed Oct 12, 2026." */
const sentence=(x,extra="")=>{const d=describe(x,{as:"name"});return shown(x.owner_name)+" "+d.text+(d.value!==null?", worth "+money(d.value):"")+". "+
 (validDate(x.transaction_date)?"Traded "+date(x.transaction_date)+", ":"")+(validDate(x.published_at)?"filed "+filedDate(x.published_at)+".":"")+(d.suffix?" "+d.suffix.replace(/^· /,"").replace(/ · /g,", ")+".":"")+(extra?" "+extra:"");};

/* ---------- storage (every access can throw: private windows, blocked site data) ---------- */
const store={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{/* not stored */}}};
const COUNTS_KEY="insidir:overview:counts",SEEN_KEY="insidir:overview:last-seen";
const counts=(()=>{try{const c=JSON.parse(store.get(COUNTS_KEY)||"{}");return c&&typeof c==="object"?c:{};}catch{return {};}})();
let countsTimer=0;
const saveCount=(k,v)=>{counts[k]=v;clearTimeout(countsTimer);countsTimer=setTimeout(()=>store.set(COUNTS_KEY,JSON.stringify(counts)),400);};

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
const fmtVisit=lazy(()=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"})),fmtVisitTime=lazy(()=>new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}));
const lastVisitText=()=>lastSeen===null?"":fmtVisit.format(new Date(lastSeen))+" at "+fmtVisitTime.format(new Date(lastSeen));

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
   priority number first, in idle time (at most 300 ms late), one module per slice of at most ~8 ms. */
const queue=[];let pumping=0;
const idle=window.requestIdleCallback?(fn=>requestIdleCallback(fn,{timeout:300})):(fn=>setTimeout(fn,16));
function pump(){
 if(pumping)return;
 pumping=idle(()=>{pumping=0;const t0=performance.now();
  do{const job=queue.shift();if(!job)break;try{job.fn();}catch(e){console.error(e);}}while(queue.length&&performance.now()-t0<8);
  if(queue.length)pump();});
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
  saveCount("heights",h);
 }),700);
}
/* Content replacing a skeleton fades in place over 200 ms; rows that arrive on screen rise a beat apart
   (blocks below the fold are left to the scroll reveal in v13-motion.js). The class stays on the host: every child a
   render inserts starts the animation by being new, so nothing has to be reset or re-measured. Never under reduced motion. */
function arrive(host){if(host&&!reduce.matches)host.classList.add("rd-arrive");}

/* ---------- derive(): purchases, sales and the rest, from the 100-row window ----------
   One result feeds the Today sentence and 03 Across the market, so their figures always match. An amended
   Form 4/A line replaces the earlier copy of the same line instead of being counted twice. */
let derived=null,derivedFrom=null;
function derive(rows){
 if(rows===derivedFrom&&derived)return derived;
 const out={rows,buys:[],sells:[],others:[],buyValue:0,sellValue:0,buyShares:0,sellShares:0,buyUnpriced:0,sellUnpriced:0,
  lags:[],companies:new Set(),people:new Set(),first:null,last:null,days:new Map(),undated:0,byCompany:new Map(),priced:[],otherCodes:new Map(),replaced:0};
 const same=x=>[x.owner_cik||x.owner_name,x.issuer_cik||x.ticker,x.transaction_date,code(x),String(x.acquired_disposed||""),!!x.derivative,sharesOf(x)].join("|");
 const amendedAt=new Map();
 for(const x of rows)if(x.is_amendment){const p=validDate(x.published_at),k=same(x);if(p&&(!amendedAt.has(k)||p>amendedAt.get(k)))amendedAt.set(k,p);}
 const kept=rows.filter(x=>x.is_amendment||!(amendedAt.get(same(x))>(validDate(x.published_at)||0)));
 out.replaced=rows.length-kept.length;
 // Days to report are the original filing's: an amendment is filed later by design.
 for(const x of rows)if(!x.is_amendment){const l=lagOf(x);if(l!==null)out.lags.push(l);}
 for(const x of kept){
  const k=kind(x),v=valueOf(x),s=sharesOf(x),t=tick(x.ticker),ck=String(x.issuer_cik||"").trim()||t||String(x.issuer_name||"").trim(),when=validDate(x.transaction_date);
  if(ck)out.companies.add(ck);
  const who=String(x.owner_cik||x.owner_name||"").trim();if(who)out.people.add(who);
  if(when){if(!out.first||when<out.first)out.first=when;if(!out.last||when>out.last)out.last=when;}
  if(k==="other"){out.others.push(x);const n=nounKey(x)||"?";out.otherCodes.set(n,(out.otherCodes.get(n)||0)+1);continue;}
  const priced=v!==null&&v>0;
  if(k==="buy"){out.buys.push(x);if(s!==null)out.buyShares+=Math.abs(s);if(priced)out.buyValue+=v;else out.buyUnpriced++;}
  else{out.sells.push(x);if(s!==null)out.sellShares+=Math.abs(s);if(priced)out.sellValue+=v;else out.sellUnpriced++;}
  if(!priced)continue;
  out.priced.push(x);
  if(when){const key=when.toISOString().slice(0,10),e=out.days.get(key)||{key,buy:0,sell:0,nb:0,ns:0};if(k==="buy"){e.buy+=v;e.nb++;}else{e.sell+=v;e.ns++;}out.days.set(key,e);}
  else out.undated++;
  if(ck){const e=out.byCompany.get(ck)||{t,cik:String(x.issuer_cik||""),name:"",buy:0,sell:0,nb:0,ns:0};if(!e.t&&t)e.t=t;if(!e.name&&x.issuer_name)e.name=String(x.issuer_name);if(k==="buy"){e.buy+=v;e.nb++;}else{e.sell+=v;e.ns++;}out.byCompany.set(ck,e);}
 }
 out.net=out.buyValue-out.sellValue;
 out.lags.sort((a,b)=>a-b);
 derived=out;derivedFrom=rows;
 return out;
}
/* "traded Sep 29 – Oct 12, 2026" */
const rangeText=f=>!f.first||!f.last?"":date(f.first)===date(f.last)?"traded "+date(f.first):"traded "+(f.first.getUTCFullYear()===f.last.getUTCFullYear()?shortDate(f.first):date(f.first))+" – "+date(f.last);

/* ---------- shared surface for v4-dashboard.js and v13-overview.js ---------- */
const desk=window.InsidirDesk={CODES,LEGEND,NOUN,E,tick,cikOf,date,filedDate,shortDate,tradedShort,filedShort,stamp,validDate,num,money,signedMoney,compactMoney,price,qty,count,plural,
 kind,code,codeMeaning,noun,nounKey,tri,badge,describe,qualifiers,valueText,sentence,sharesOf,signOf,signedShares,priceOf,valueOf,lagOf,lagText,lagWords,ownership,security,
 shown,companyName,companyHref,researchHref,filingHref,personHref,personTile,companyTile,personName,whoTile,coTile,hydrate,MINUS,DAY,
 api,items,retry,failBlock,failRow,failText,canRetry,load,reload,watch,settled,later,now,arrive,ready,derive,rangeText,
 counts,saveCount,store,lastSeen,lastVisitText,isNew,NEW,importedAt,reduce,media};

/* ================= 02 Your watchlist ================= */
const WATCH_ROWS=8,SAVE_SUGGEST=4;
const tradeDate=x=>validDate(x?.transaction_date)||validDate(x?.published_at);
const newer=(a,b)=>{const da=tradeDate(a),db=tradeDate(b);if(!db)return !!da;if(!da)return false;return da>db||(+da===+db&&(validDate(a.published_at)||0)>(validDate(b.published_at)||0));};
const lookups=new Map(); // ticker → {rows} | {error}
const rowsFor=(t,trades)=>[...(trades||[]).filter(x=>tick(x.ticker)===t),...(lookups.get(t)?.rows||[]).filter(x=>tick(x.ticker)===t)];
const latestTrade=rows=>rows.filter(x=>kind(x)!=="other").reduce((b,x)=>!b||newer(x,b)?x:b,null);
/* "Katherine L. Adams bought 800 shares at $226.40 = $181,120 · traded Oct 12, filed Oct 14 (2 days later)" */
function tradeLine(x,{ticker=false}={}){
 const d=describe(x,{ticker}),v=valueText(x),lag=lagOf(x);
 // Dates and amounts never break inside; a line can only end between them.
 const when=[validDate(x.transaction_date)?"traded "+tradedShort(x.transaction_date):"",
  validDate(x.published_at)?"filed "+filedShort(x.published_at)+(lag!==null&&!x.is_amendment?" ("+lagWords(lag)+")":""):""].filter(Boolean);
 return '<span class="rd-ent rd-ent--inline">'+whoTile(x,"sm")+personName(x,{link:false})+'</span> '+E(d.text)+(v?' <span class="rd-nb">'+E(v)+'</span>':'')+
  (when.length?' · '+when.map(w=>'<span class="rd-nb">'+E(w)+'</span>').join(", "):'');
}
function watchDetail(t,trades){
 const rows=rowsFor(t,trades),best=latestTrade(rows),look=lookups.get(t);
 if(best){
  const since=rows.filter(x=>kind(x)==="other"&&newer(x,best)).reduce((b,x)=>!b||newer(x,b)?x:b,null);
  return {row:best,isNew:isNew(best),html:tradeLine(best)+(isNew(best)?" "+NEW:"")+
   (since?'<small>Also filed since: '+E(noun(since))+' by '+E(shown(since.owner_name))+' ('+E(tradedShort(since.transaction_date)||filedShort(since.published_at))+')</small>':'')};
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
function renderWatchlist(r){
 const host=$("v3-watchlist");if(!host)return;
 const foot=$("v3-watchlist-foot");
 ready(host);ready(foot);
 if(!r.watchlist.ok){host.innerHTML='<li class="rd-rows__msg">'+failBlock("watchlist",r.watchlist.error,"Your watchlist could not be loaded")+'</li>';if(foot)foot.textContent="";return;}
 const trades=r.trades.ok?r.trades.value:[];
 const list=[...new Set(r.watchlist.value.map(x=>tick(x.ticker)).filter(Boolean))];
 if(!list.length){
  // Empty: the most-traded companies in the window, each with a Save button. A saved one becomes a watchlist
  // row in place, so nothing moves under the pointer.
  const n=new Map();for(const x of trades){const t=tick(x.ticker);if(t)n.set(t,(n.get(t)||0)+1);}
  watchSuggest=[...n].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,SAVE_SUGGEST).map(([t])=>t);
  host.innerHTML='<li class="rd-rows__msg"><p class="rd-empty">You have not saved any companies yet. Save one to see its latest insider purchase or sale here.</p></li>'+
   watchSuggest.map((t,i)=>watchRow(t,trades,i+1,{save:true,saved:watchSaved.has(t)})).join("");
  if(foot)foot.textContent=watchSuggest.length?"Suggested: the companies with the most trades in the latest imports.":"";
  saveCount("watch",0);
 }else{
  host.innerHTML=list.slice(0,WATCH_ROWS).map((t,i)=>watchRow(t,trades,i)).join("");
  if(foot)foot.innerHTML=list.length>WATCH_ROWS?'<a href="watchlist.html">'+E(plural(list.length-WATCH_ROWS,"more company","more companies"))+' on your watchlist</a>':"";
  saveCount("watch",Math.min(list.length,WATCH_ROWS));
 }
 hydrate(host);arrive(host);
}
watch(["watchlist","trades"],r=>{
 // Watched tickers with no purchase or sale in the 100-row window: ask for each one's own latest 20 lines first,
 // then render once (a lookup never redraws the module on its own).
 const trades=r.trades.ok?r.trades.value:[];
 const list=r.watchlist.ok?[...new Set(r.watchlist.value.map(x=>tick(x.ticker)).filter(Boolean))].slice(0,WATCH_ROWS):[];
 for(const [t,v] of lookups)if(v.error)lookups.delete(t);
 const missing=list.filter(t=>!lookups.has(t)&&!trades.some(x=>tick(x.ticker)===t&&kind(x)!=="other"));
 Promise.allSettled(missing.map(t=>api("/v1/transactions?ticker="+encodeURIComponent(t)+"&limit=20")
  .then(j=>lookups.set(t,{rows:items(j).filter(x=>tick(x.ticker)===t)}),error=>lookups.set(t,{error})))).then(()=>later(1,()=>renderWatchlist(r)));
});
async function saveTicker(btn){
 const t=tick(btn.dataset.save);if(!t||btn.getAttribute("aria-busy")==="true")return;
 const live=$("v3-watchlist-status"),saved=watchSaved.has(t);
 if(saved){say(live,t+" is already on your watchlist. Manage it on the watchlist page.");return;}
 // Optimistic: the button flips at once, and flips back if the server says no.
 btn.setAttribute("aria-busy","true");watchSaved.add(t);setSaved(btn,true);
 try{await api("/v1/me/watchlist",{method:"POST",body:{ticker:t}});say(live,"Saved "+t+" to your watchlist.");}
 catch(e){watchSaved.delete(t);setSaved(btn,false);say(live,"Could not save "+t+": "+e.message.replace(/\.$/,"")+". Nothing was changed.",true);}
 finally{btn.removeAttribute("aria-busy");}
}
function setSaved(btn,on){const t=btn.dataset.save;btn.classList.toggle("is-saved",on);btn.closest("li")?.classList.toggle("is-saved",on);btn.setAttribute("aria-pressed",String(on));btn.setAttribute("aria-label",(on?"Saved ":"Save ")+t+" to your watchlist");btn.textContent=on?"Saved ✓":"Save "+t+" +";}
function say(el,text,error){if(!el)return;el.textContent=text;el.classList.toggle("is-error",!!error);}

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
const table={rows:null,error:null,filter:"all",lock:0};
function tradeRow(x,i){
 const t=tick(x.ticker),k=kind(x),v=valueOf(x),p=priceOf(x),lag=lagOf(x),d=describe(x);
 const notes=[security(x),ownership(x)==="Indirect"?"held indirectly":"",x.is_amendment?"amended (4/A)":""].filter(Boolean).join(" · ");
 return '<tr class="rd-trade rd-trade--'+k+'" style="--i:'+Math.min(i,8)+'" aria-label="'+E(sentence(x))+'">'+
  '<td data-label="Person" class="rd-td-who"><span class="rd-ent">'+whoTile(x,"sm")+personName(x)+'</span></td>'+
  '<td data-label="Company" class="rd-td-co">'+(t?'<span class="rd-ent">'+coTile(x,"sm")+'<a data-ent="company" href="'+E(companyHref(t))+'">'+E(t)+'</a></span>'+(x.issuer_name?'<span class="rd-sub">'+E(companyName(x.issuer_name))+'</span>':''):
   '<span class="rd-ent">'+coTile(x,"sm")+'<span data-ent="company">'+E(x.issuer_name?companyName(x.issuer_name):"Issuer not reported")+'</span></span><span class="rd-sub">No ticker</span>')+'</td>'+
  '<td data-label="What happened" class="rd-td-what">'+badge(x)+(notes?'<span class="rd-sub">'+E(notes)+'</span>':'')+'</td>'+
  '<td data-label="Shares" class="rd-num rd-td-shares"><span class="rd-qty rd-qty--'+k+'">'+E(signedShares(x))+'</span></td>'+
  '<td data-label="Price" class="rd-num rd-td-price">'+(p!==null?E(price(p)):'<span class="rd-muted">No price</span>')+'</td>'+
  '<td data-label="Value" class="rd-num rd-value rd-td-value">'+(d.valued&&v!==null?E(money(v)):'<span class="rd-muted">'+(d.valued?"Not reported":"Not counted")+'</span>')+'</td>'+
  // Phones show the short dates ("Oct 12"); the other is display:none there, so each width reads one date.
  '<td data-label="Traded" class="rd-nb rd-td-traded">'+(validDate(x.transaction_date)?'<span class="rd-long">'+E(date(x.transaction_date))+'</span><span class="rd-short">'+E(tradedShort(x.transaction_date))+'</span>':'<span class="rd-muted">Not reported</span>')+'</td>'+
  '<td data-label="Filed" class="rd-nb rd-td-filed">'+(validDate(x.published_at)?'<span class="rd-long">'+E(filedDate(x.published_at))+'</span><span class="rd-short">'+E(filedShort(x.published_at))+'</span>'+(lag!==null&&!x.is_amendment?'<span class="rd-sub">'+E(lagWords(lag))+'</span>':''):'<span class="rd-muted">Not reported</span>')+'</td>'+
  '<td class="rd-links"><a class="rd-arrow" href="'+E(filingHref(x.accession))+'" aria-label="'+E("Open the filing: "+shown(x.owner_name)+", "+(t||companyName(x.issuer_name))+", "+date(x.transaction_date))+'">Filing ↗</a></td>'+
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
 table.lock=Math.max(table.lock,wrap.offsetHeight);wrap.style.setProperty("min-height",table.lock+"px","important");
}
function renderTrades(){
 const host=$("v3-trades");if(!host)return;
 host.removeAttribute("aria-busy");
 const wrap=document.querySelector(".rd-table-wrap--trades");if(wrap&&table.filter==="all")wrap.style.removeProperty("min-height");
 remember();
 if(table.error){host.innerHTML=failRow(TRADE_COLS,"trades",table.error,"The latest trades could not be loaded");renderTradesFoot([],[]);return;}
 table.lock=0;
 if(!table.rows)return;
 const c={};for(const k in FILTER)c[k]=table.rows.filter(FILTER[k]).length;
 document.querySelectorAll("[data-count]").forEach(el=>{el.textContent=count(c[el.dataset.count]??0);});
 const {html,list,matching}=tradeRows();
 host.innerHTML=html;
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
addEventListener("resize",()=>{clearTimeout(lockTimer);lockTimer=setTimeout(()=>{const wrap=document.querySelector(".rd-table-wrap--trades");if(!wrap)return;table.lock=0;wrap.style.removeProperty("min-height");},200);},{passive:true});

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
