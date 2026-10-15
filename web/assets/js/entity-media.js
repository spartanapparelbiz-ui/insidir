/* Insidir identity tiles: a real headshot or a real logo for every person and company on a page.
 * Nothing here is generated: no avatar or favicon services, no drawn faces, no stand-in artwork.
 *
 * Where the pictures come from
 *   1. The engine's media pipeline, asked once per page through GET /v1/media (one batch for every tile,
 *      then follow-ups for anything still resolving). Company logos are resolved server-side from
 *      stockanalysis, Wikipedia / Wikidata, companiesmarketcap, FMP, EODHD, nvstly and the company's own
 *      website; headshots are matched to SEC reporting owners (by owner CIK, with a proven tie to the
 *      company) from Wikimedia Commons, the company's own leadership pages and SEC proxy statements
 *      (DEF 14A). Every image is re-hosted on this origin at /v1/media/<sha256>.<ext>; any other src in
 *      an answer is refused.
 *   2. A small curated set below: 11 brand marks and 4 portraits, each from a named Wikimedia Commons
 *      file page (or the company's brand page). They are used when the engine has nothing for that
 *      company or person, or cannot be reached. Portraits load the Commons 250px thumbnail (at least 2x
 *      the largest tile); scripts/verify-media.mjs reads this file.
 *
 * Fallback chain (the first that exists wins)
 *   person:  engine headshot -> curated Commons portrait -> the owner's own logo (a listed company that
 *            files as an owner) or the issuer's logo standing in (by ticker, or by issuer CIK when the row
 *            has none) -> curated mark -> monogram initials
 *   company: engine logo by ticker (by issuer CIK when no ticker was reported) -> curated mark -> monogram
 *   Monogram initials appear only when every lookup came back empty, or the engine was unavailable and
 *   nothing curated exists. While a headshot is still resolving the issuer's logo is asked for at the same
 *   time (on the logo schedule, never held back by the photo queue's retryAfter) and stands in once known;
 *   until then the tile shows a still field of halftone dots.
 *
 * When to ask again: a pending logo follows its own quick hint (retryAfterLogos, else 2/4/8 s ...) and a pending
 * headshot the engine's photo hint, both on one schedule of ten asks (about six minutes). A headshot whose company
 * job has not started yet (listed in the answer's `queued`) waits its turn without using that schedule up: it is
 * asked every 15-60 s while it stays queued, and no key is asked for longer than about 15 minutes in all.
 *
 * Tiles never change size: the box comes from --ins-size and every state only swaps the tile's classes
 * and its one <img>'s src (no nodes are added or removed, so the motion layer never rescans for it).
 * A picture that arrives later lands on the site's spring (entity-media.css); answers are cached in
 * memory and in sessionStorage ("ins-media:v2"), so moving between pages shows final tiles at once.
 * A tile next to the name it pictures is aria-hidden with alt=""; {label:true} makes it role="img".
 * No links inside tiles: photo credits go to a [data-media-credits] footnote (credits()).
 *
 * API (window.InsidirMedia): logo(ticker,size,{cik,name,label}), portrait(name,ticker,size,{cik,issuerCik,label}),
 * company({ticker,cik,name,size,label}), person({name,cik,ticker,issuerCik,size,label}), hydrate(root),
 * credits(root), ready(root) (a Promise, for checks), refresh(), logoFor(ticker,{cik}) and
 * photoFor(cik,ticker,{issuerCik}) (Promises for pages that draw their own frames), photo(name,ticker)
 * (curated portrait record), displayName, initials, knownBrand.
 */
(() => {
"use strict";
if (window.InsidirMedia) return;
const marks=Object.freeze({
 AAPL:{name:"Apple",src:"assets/icons/apple.svg",source:"https://commons.wikimedia.org/wiki/File:Apple_logo_black.svg"},
 MSFT:{name:"Microsoft",src:"assets/icons/microsoft.svg",source:"https://commons.wikimedia.org/wiki/File:Microsoft_logo.svg"},
 NVDA:{name:"NVIDIA",src:"assets/icons/nvidia.svg",source:"https://commons.wikimedia.org/wiki/File:Nvidia_Logo.svg"},
 TSLA:{name:"Tesla",src:"assets/icons/tesla.svg",source:"https://commons.wikimedia.org/wiki/File:Tesla_T_symbol.svg"},
 META:{name:"Meta",src:"assets/icons/meta.svg",source:"https://about.meta.com/brand/resources/meta/company-brand/"},
 GOOGL:{name:"Alphabet / Google",src:"assets/icons/google.svg",source:"https://about.google/brand-resource-center/"},
 GOOG:{name:"Alphabet / Google",src:"assets/icons/google.svg",source:"https://about.google/brand-resource-center/"},
 ABNB:{name:"Airbnb",src:"assets/icons/airbnb.svg",source:"https://www.airbnb.com/press"},
 AMZN:{name:"Amazon",src:"https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",source:"https://commons.wikimedia.org/wiki/File:Amazon_logo.svg"},
 NFLX:{name:"Netflix",src:"https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg",source:"https://commons.wikimedia.org/wiki/File:Netflix_2015_logo.svg"},
 IBM:{name:"IBM",src:"https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg",source:"https://commons.wikimedia.org/wiki/File:IBM_logo.svg"}
});
const images=Object.freeze({
  "AAPL:COOK TIMOTHY D":"tim-cook",
  "AAPL:TIMOTHY D COOK":"tim-cook",
  "AAPL:TIM COOK":"tim-cook",
  "MSFT:NADELLA SATYA":"satya-nadella",
  "MSFT:SATYA NADELLA":"satya-nadella",
  "NVDA:HUANG JEN HSUN":"jensen-huang",
  "NVDA:HUANG JENSEN":"jensen-huang",
  "NVDA:JENSEN HUANG":"jensen-huang",
  "TSLA:MUSK ELON":"elon-musk",
  "TSLA:ELON MUSK":"elon-musk"
});
/* thumb: the Commons 250px rendition (native width 250) used for every on-page portrait. Each file
   is a head-and-shoulders crop, so the small square tiles show a face, not a distant figure. */
const photos=Object.freeze({
 "tim-cook":{name:"Tim Cook",src:"https://upload.wikimedia.org/wikipedia/commons/c/c5/Tim_Cook_%282017%29_%28cropped2%29.jpg",
   thumb:"https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Tim_Cook_%282017%29_%28cropped2%29.jpg/250px-Tim_Cook_%282017%29_%28cropped2%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Tim_Cook_(2017)_(cropped2).jpg",credit:"Austin Community College / Catalin Abagiu",license:"CC BY 2.0"},
 "satya-nadella":{name:"Satya Nadella",src:"https://upload.wikimedia.org/wikipedia/commons/4/4a/Satya_Nadella_%28cropped%29.jpg",
   thumb:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Satya_Nadella_%28cropped%29.jpg/250px-Satya_Nadella_%28cropped%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Satya_Nadella_(cropped).jpg",credit:"Brian Smale",license:"CC BY-SA 4.0"},
 "jensen-huang":{name:"Jensen Huang",src:"https://upload.wikimedia.org/wikipedia/commons/5/59/Jensen_Huang_%28cropped%29_%282024%29.jpg",
   thumb:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Jensen_Huang_%28cropped%29_%282024%29.jpg/250px-Jensen_Huang_%28cropped%29_%282024%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Jensen_Huang_(cropped)_(2024).jpg",credit:"European Commission / Peter Dasilva",license:"CC BY 4.0"},
 "elon-musk":{name:"Elon Musk",src:"https://upload.wikimedia.org/wikipedia/commons/3/30/Elon_Musk_close-up_%28cropped%29.jpg",
   thumb:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Elon_Musk_close-up_%28cropped%29.jpg/250px-Elon_Musk_close-up_%28cropped%29.jpg",
   source:"https://commons.wikimedia.org/wiki/File:Elon_Musk_close-up_(cropped).jpg",credit:"U.S. Air Force / Justin Pacheco",license:"Public domain (US federal work)"}
});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalizeTicker=s=>String(s||"").trim().toUpperCase();
const normalize=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();

/* ---------- names: SEC files people as "LAST FIRST MIDDLE"; show them as people write them ---------- */
const ENTITY=/\b(INC|LLC|L\.?L\.?C|LP|L\.P|LTD|CORP|CORPORATION|CO|COMPANY|TRUST|FUND|FUNDS|CAPITAL|PARTNERS|HOLDINGS|GROUP|FOUNDATION|BANK|ASSOCIATES|MANAGEMENT|ADVISORS|INVESTMENTS|N\.?V|S\.?A|PLC|AG|SE|LIMITED|VENTURES|ESTATE)\b|&/i;
const ACRONYM=/^(LLC|LP|LLP|PLC|AG|SE|NV|SA|II|III|IV|USA|US|UK|L\.P\.?|N\.A\.?)[.,]?$/;
const titleCase=s=>String(s).toLowerCase().replace(/(^|[\s\-'’(])([a-z])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\/([a-z]{2,3})\//g,(m,a)=>"/"+a.toUpperCase()+"/").split(" ").map(w=>ACRONYM.test(w.toUpperCase())?w.toUpperCase():w).join(" ");
function displayName(raw){
 const name=String(raw||"").replace(/\s+/g," ").trim();
 if(!name)return "Reporting person";
 if(/[a-z]/.test(name))return name;
 if(ENTITY.test(name))return titleCase(name);
 const parts=name.replace(/,/g," ").split(" ").filter(Boolean);
 if(parts.length<2)return titleCase(name);
 const suffix=/^(JR|SR|II|III|IV|V)\.?$/i.test(parts.at(-1))?parts.pop():"";
 const [last,...given]=parts;
 const fix=t=>/^[A-Z]\.?$/.test(t)?t.charAt(0)+".":titleCase(t);
 return [...given.map(fix),fix(last),suffix?(/^(II|III|IV|V)$/.test(suffix)?suffix:titleCase(suffix.replace(/\.$/,""))+"."):""].filter(Boolean).join(" ");
}
/* Initials: the first letter of the first and the last name word, as people write the name.
   Words split on whitespace only, so "Vanderbilt-Worthington" and "O'Brien" stay one word
   (AV, MO); generational suffixes are dropped; organisations use their first two words. */
const SUFFIX=/^(?:[JjSs][Rr]|II|III|IV|V)$/;
function initials(raw){
 const words=displayName(raw).split(/\s+/).map(w=>w.replace(/[^\p{L}\p{N}]/gu,"")).filter(Boolean);
 if(!words.length)return "";
 if(ENTITY.test(String(raw||""))||words.length===1)return (words[0][0]+(words[1]?.[0]||"")).toUpperCase();
 const named=words.filter(w=>!SUFFIX.test(w)),list=named.length?named:words;
 return (list[0][0]+(list.length>1?list.at(-1)[0]:"")).toUpperCase();
}
/* Monogram drawn as SVG text so it scales with whatever tile size the page uses. */
function monogram(text){
 const t=String(text||"").slice(0,2);
 return '<svg class="ins-media__monogram" viewBox="0 0 40 40" style="width:100%;height:100%" aria-hidden="true" focusable="false"><text x="20" y="21" text-anchor="middle" dominant-baseline="middle" font-size="'+(t.length>1?14:16)+'" font-weight="600" fill="currentColor">'+esc(t)+'</text></svg>';
}
const companySymbol='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2m3 0h2M9 11h2m3 0h2M9 15h2m3 0h2"/></svg>';
/* A company's name as people write it: SEC titles arrive in capitals ("FORD MOTOR CO"). */
const companyLabel=s=>{const n=String(s||"").replace(/\s*\/[A-Z]{2,3}\/?\s*$/,"").replace(/\s+\/(?:NEW|DE|MD|NV)\/?(?=\s|$)/gi,"").replace(/\s+/g," ").trim().slice(0,120);return n&&!/[a-z]/.test(n)&&n.length>4?titleCase(n):n;};

/* ---------- identities ---------- */
// Engine media are content-addressed on this origin; nothing else from an answer is ever loaded.
const MEDIA_SRC=/^\/v1\/media\/[a-f0-9]{64}\.(?:png|webp|jpeg|svg)$/;
// The engine lists share classes with a hyphen (BRK-B); BRK.B is the same company.
const apiTicker=v=>{const t=normalizeTicker(v).replace(/\./g,"-");return /^[A-Z0-9][A-Z0-9-]{0,14}$/.test(t)?t:"";};
const apiCik=v=>{const s=String(v??"").trim();return /^\d{1,10}$/.test(s)?s.replace(/^0+/,""):"";};
const markFor=t=>{const k=normalizeTicker(t);return k?marks[k]||marks[k.replace(/-/g,".")]||null:null;};
const curatedFor=(name,t)=>{const slug=images[normalizeTicker(t)+":"+normalize(name)];return slug?photos[slug]:null;};
const SIZES=["xs","sm","md","lg"];
// Credit links go only to Wikimedia Commons or the SEC; a photo from a company's own site names its host instead.
const creditUrl=v=>{try{const u=new URL(String(v));return u.protocol==="https:"&&!u.username&&!u.password&&(u.hostname==="commons.wikimedia.org"||u.hostname==="sec.gov"||u.hostname.endsWith(".sec.gov"))?u.href:"";}catch{return "";}};
const count=x=>{const n=Number(x);return Number.isFinite(n)&&n>0&&n<20000?Math.round(n):null;};
function cleanLogo(v){
 if(!v||typeof v!=="object"||!MEDIA_SRC.test(String(v.src)))return null;
 const out={src:v.src,w:count(v.w),h:count(v.h),source:String(v.source||"").slice(0,40),name:companyLabel(v.name)};
 if(v.alt&&MEDIA_SRC.test(String(v.alt.src)))out.alt={src:v.alt.src,w:count(v.alt.w),h:count(v.alt.h)};
 if(v.ticker&&apiTicker(v.ticker))out.ticker=apiTicker(v.ticker);
 return out;
}
function cleanPhoto(v){
 if(!v||typeof v!=="object"||!MEDIA_SRC.test(String(v.src)))return null;
 return {src:v.src,w:count(v.w)||256,h:count(v.h)||256,source:String(v.source||"").slice(0,40),credit:String(v.credit||"").replace(/\s+/g," ").trim().slice(0,160),
  sourceUrl:creditUrl(v.sourceUrl),name:String(v.name||"").replace(/\s+/g," ").trim().slice(0,80)};
}

/* ---------- answers: memory + sessionStorage ---------- */
// Keys: L:<TICKER> and L:cik:<CIK> (logos), P:<owner CIK> (headshots), O:<owner CIK> (an entity files there).
const STORE="ins-media:v2",HIT_TTL=12*3600e3,MISS_TTL=3600e3;
const cache=new Map();
let saveTimer=0;
try{
 const saved=JSON.parse(sessionStorage.getItem(STORE)||"{}"),now=Date.now();
 for(const [k,e] of Object.entries(saved&&typeof saved==="object"?saved:{})){
  if(!Array.isArray(e)||!(e[1]>now))continue;
  const v=k[0]==="L"?cleanLogo(e[0]):k[0]==="P"?cleanPhoto(e[0]):k[0]==="O"&&e[0]?{entity:true,ticker:apiTicker(e[0].ticker)||null}:null;
  if(v||e[0]===null)cache.set(k,{v,exp:e[1]});
 }
}catch{/* private mode or full storage: memory only */}
const save=()=>{
 saveTimer=0;
 try{
  const out={},now=Date.now();let n=0;
  for(const [k,e] of cache){if(e.exp>now&&n++<3000)out[k]=[e.v,e.exp];}
  sessionStorage.setItem(STORE,JSON.stringify(out));
 }catch{/* quota or blocked storage */}
};
const saveSoon=()=>{if(!saveTimer)saveTimer=setTimeout(save,300);};
const get=k=>{const e=cache.get(k);if(!e)return undefined;if(e.exp<=Date.now()){cache.delete(k);return undefined;}return e.v;};
const put=(k,v)=>{cache.set(k,{v,exp:Date.now()+(v?HIT_TTL:MISS_TTL)});saveSoon();};
const broken=new Set(),retried=new Set();   // image URLs that failed to load (twice) / once

/* ---------- requests: one batch, then follow-ups for pending keys only ---------- */
// Request keys: t:<TICKER>, c:<CIK>, and a headshot by owner CIK: p:<owner CIK>:<TICKER> (the issuer's ticker),
// p:<owner CIK>:cik:<issuer CIK> (an issuer with no ticker) or p:<owner CIK> (no issuer known). The part after
// "p:" is what goes in people=; an engine that does not know a form lists it as invalid and the tile steps down.
const queue=new Set(),inflight=new Set(),tries=new Map(),due=new Map(),gaveUp=new Set();
const since=new Map(),queuedAsks=new Map();   // key -> when it was first answered pending / asks while its job was queued
const LIMITS={t:60,c:60,p:100};
const SCHEDULE=[2,4,8,15,30,60,60,60,60,60];   // seconds: about six minutes in all
const QUEUED=[15,15,30,30,60];                  // seconds between asks while a headshot's company job waits its turn
const CEILING=15*60e3;                          // no key is asked again for longer than this after its first pending answer
const drop=rk=>{tries.delete(rk);since.delete(rk);queuedAsks.delete(rk);};
const OUTAGE=[30,120];                          // a 5xx or a dropped connection: asked again after 30 s, then 2 min, then not this visit
let offlineUntil=0,outages=0,lostOnline=false,flushTimer=0,firstQueued=0,retryTimer=0,wanted=new Set();
const isOffline=()=>offlineUntil>Date.now();
const cacheKey=rk=>rk[0]==="t"?"L:"+rk.slice(2):rk[0]==="c"?"L:cik:"+rk.slice(2):"P:"+rk.split(":")[1];
const photoKey=(C,T,IC)=>C?"p:"+C+(T?":"+T:IC?":cik:"+IC:""):"";
// A pending pair as the engine lists it ("<owner>:<TICKER>", "<owner>:cik:<issuer>" or "<owner>") -> request key.
function pairKey(s){
 const m=/^(\d{1,10})(?::(?:cik:(\d{1,10})|([^:]+)))?$/i.exec(String(s));
 if(!m||!apiCik(m[1]))return "";
 if(m[2])return apiCik(m[2])?photoKey(apiCik(m[1]),"",apiCik(m[2])):"";
 if(m[3])return apiTicker(m[3])?photoKey(apiCik(m[1]),apiTicker(m[3])):"";
 return photoKey(apiCik(m[1]));
}
function need(rk){
 if(queue.has(rk)||inflight.has(rk)||due.has(rk)||gaveUp.has(rk)||isOffline())return;
 queue.add(rk);
 const now=Date.now();
 if(!firstQueued)firstQueued=now;
 clearTimeout(flushTimer);
 // Coalesce: 30 ms after the last new key, and never more than 150 ms after the first.
 flushTimer=setTimeout(flush,Math.max(0,Math.min(30,firstQueued+150-now)));
}
function flush(){
 flushTimer=0;firstQueued=0;
 const chunks=[];let chunk={t:[],c:[],p:[]};
 for(const rk of queue){
  const k=rk[0];
  if(chunk[k].length>=LIMITS[k]){chunks.push(chunk);chunk={t:[],c:[],p:[]};}
  chunk[k].push(rk);
 }
 queue.clear();
 if(chunk.t.length||chunk.c.length||chunk.p.length)chunks.push(chunk);
 for(const c of chunks)send(c);
}
async function send(c){
 const keys=[...c.t,...c.c,...c.p];
 const followUp=keys.every(k=>tries.has(k));
 for(const k of keys)inflight.add(k);
 const q=[];
 if(c.t.length)q.push("tickers="+c.t.map(k=>k.slice(2)).join(","));
 if(c.p.length)q.push("people="+c.p.map(k=>k.slice(2)).join(","));
 if(c.c.length)q.push("ciks="+c.c.map(k=>k.slice(2)).join(","));
 // A follow-up may wait a moment for logos already resolving, so they land in this answer.
 if(followUp)q.push("wait=1200");
 let res=null,body=null;
 try{
  res=await fetch("/v1/media?"+q.join("&"),{credentials:"same-origin",headers:{Accept:"application/json"}});
  if(res.ok)body=await res.json();
 }catch{body=null;}
 for(const k of keys)inflight.delete(k);
 if(body&&typeof body==="object"){outages=0;apply(body,keys);}
 else if(res&&res.status===429){const s=Number(res.headers.get("Retry-After"))||15;for(const k of keys)later(k,s,false);}
 else if(res&&res.status===400){
  // The engine could read nothing in this request (a key form it does not know): nothing to show for these keys
  // on this visit; every other request goes on as before.
  for(const k of keys){drop(k);gaveUp.add(k);}
 }
 else{
  // Not available to this page (a preview without the engine, signed out, unpaid): curated pictures and
  // initials for this visit. A server error or a dropped connection is asked again after 30 s, then after
  // 2 minutes; after that, not on this visit (unless the browser comes back online).
  const unavailable=Boolean(res&&res.status>=400&&res.status<500);
  if(unavailable||outages>=OUTAGE.length){offlineUntil=Infinity;lostOnline=!unavailable;}
  else if(!isOffline()){   // two batches failing together count as one outage
   const wait=1000*OUTAGE[outages++];
   offlineUntil=Date.now()+wait;
   setTimeout(()=>{if(offlineUntil!==Infinity&&!isOffline()){offlineUntil=0;wakeSoft();}},wait+500);
  }
 }
 update();
}
// Given up after repeated outages: a browser that comes back online asks once more.
window.addEventListener("online",()=>{if(lostOnline&&offlineUntil===Infinity){lostOnline=false;outages=OUTAGE.length;offlineUntil=0;wakeSoft();}});
function apply(body,sent){
 const obj=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:{};
 for(const [k,v] of Object.entries(obj(body.logos))){
  if(k.startsWith("cik:")){const c=apiCik(k.slice(4));if(c)put("L:cik:"+c,cleanLogo(v));}
  else{const t=apiTicker(k);if(t)put("L:"+t,cleanLogo(v));}
 }
 for(const [k,v] of Object.entries(obj(body.owners))){const c=apiCik(k);if(c&&v&&v.entity)put("O:"+c,{entity:true,ticker:apiTicker(v.ticker)||null});}
 for(const [k,v] of Object.entries(obj(body.photos))){const c=apiCik(k);if(c)put("P:"+c,cleanPhoto(v));}
 const pending=new Set(),p=obj(body.pending);
 for(const k of Array.isArray(p.logos)?p.logos:[]){const s=String(k);const rk=s.startsWith("cik:")?(apiCik(s.slice(4))?"c:"+apiCik(s.slice(4)):""):(apiTicker(s)?"t:"+apiTicker(s):"");if(rk)pending.add(rk);}
 const pendingPhotos=Array.isArray(p.photos)?p.photos:[];
 for(const k of pendingPhotos){const rk=pairKey(k);if(rk)pending.add(rk);}
 // Headshots whose company job has not started yet: asked again without using up the schedule.
 const queued=new Set();
 for(const k of Array.isArray(body.queued)?body.queued:[]){const rk=pairKey(k);if(rk&&pending.has(rk))queued.add(rk);}
 /* When to ask again. retryAfter is the engine's hint for the slowest pending kind (a photo job that waits
    its turn says 15 s), so it paces headshots only. Logos resolve in a second or two: they follow their own
    hint (retryAfterLogos) or the 2/4/8 s schedule, so a logo, and the person tile it stands in for, is never
    held back by a photo queue. */
 const secs=(v,fallback)=>{const n=Number(v);return v!=null&&Number.isFinite(n)?Math.max(0,Math.min(120,n)):fallback;};
 const photoAfter=secs(body.retryAfterPhotos,secs(body.retryAfter,0));
 const logoAfter=secs(body.retryAfterLogos,pendingPhotos.length?0:secs(body.retryAfter,0));
 for(const rk of pending){if(get(cacheKey(rk))===undefined)later(rk,rk[0]==="p"?photoAfter:logoAfter,true,queued.has(rk));}
 // Asked for, answered neither way (a form this engine does not know, listed as invalid): nothing to show for it on
 // this visit. Kept in memory only, so the same person asked for another way (with a ticker) is still answered.
 for(const rk of sent){
  if(pending.has(rk))continue;
  drop(rk);
  if(get(cacheKey(rk))===undefined)gaveUp.add(rk);
 }
}
/* Asks for rk again later. counts: the ask uses up one step of SCHEDULE (a 429 does not); inQueue: the engine says
   the company job behind this headshot has not started, so it waits its turn on QUEUED instead, off the schedule.
   Either way nothing is asked again once CEILING has passed since the key was first answered pending. */
function later(rk,afterS,counts,inQueue=false){
 const now=Date.now(),first=since.get(rk)??now;
 if(!since.has(rk))since.set(rk,first);
 const n=tries.get(rk)||0;
 if(now-first>=CEILING||(counts&&!inQueue&&n>=SCHEDULE.length)){drop(rk);gaveUp.add(rk);return;}
 if(!tries.has(rk))tries.set(rk,0);
 let wait;
 if(inQueue){const q=queuedAsks.get(rk)||0;queuedAsks.set(rk,q+1);wait=Math.max(QUEUED[Math.min(q,QUEUED.length-1)],afterS);}
 else{if(counts)tries.set(rk,n+1);wait=Math.max(SCHEDULE[Math.min(n,SCHEDULE.length-1)],afterS);}
 // The last ask lands at the ceiling, not past it.
 due.set(rk,Math.min(now+1000*wait,Math.max(now+1000,first+CEILING)));
 armRetry();
}
function armRetry(){
 clearTimeout(retryTimer);retryTimer=0;
 if(!due.size)return;
 let next=Infinity;for(const t of due.values())next=Math.min(next,t);
 retryTimer=setTimeout(retryDue,Math.max(50,next-Date.now()));
}
function retryDue(){
 retryTimer=0;
 if(document.hidden)return;   // resumed on visibilitychange
 const now=Date.now();
 for(const [rk,t] of due){
  if(t>now+250)continue;
  due.delete(rk);
  // Only what a tile on the page still waits for is asked again.
  if(wanted.has(rk))need(rk);else drop(rk);
 }
 armRetry();
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)retryDue();});

/* ---------- decisions ---------- */
function lookup(ck,rk){
 const v=get(ck);
 if(v!==undefined)return v&&!broken.has(v.src)?{value:v}:{value:null};
 if(gaveUp.has(rk)||isOffline())return {value:null,soft:true};
 return {wait:rk};
}
/* A company's logo through the chain; peek: only what is already known, without asking. The engine resolves a
   ticker through its SEC CIK, so the issuer CIK is asked for only when no ticker was reported. */
function companyLogo(T,C,peek){
 let soft=false;
 const [ck,rk]=T?["L:"+T,"t:"+T]:C?["L:cik:"+C,"c:"+C]:[null,null];
 if(ck){const r=lookup(ck,rk);if(r.value)return {entry:r.value,key:ck};if(r.wait)return peek?null:{wait:r.wait};soft=Boolean(r.soft);}
 const m=T?markFor(T):null;
 if(m&&!broken.has(m.src))return {entry:{src:m.src,name:m.name,hard:true,realSource:m.source},soft};
 return {soft};
}
/* d: {media:"person"|"company", name (as filed), ticker, cik, issuerCik (a person's company when it has no
   ticker), co (company name)} -> a view of the tile:
   {kind:"photo"|"logo"|"monogram"|"loading", src, standIn, own, wide, title, label, credit, key, realSource, wait:[...], soft} */
function decide(d){
 const T=apiTicker(d.ticker),C=apiCik(d.cik);
 if(d.media!=="person"){
  const lg=companyLogo(T,C,false);
  if(lg.wait)return loadingView(d,[lg.wait]);
  return lg.entry?logoView(d,lg,{}):monogramView(d,lg.soft,{logo:Boolean(T||C)});
 }
 const IC=T?"":apiCik(d.issuerCik),prk=photoKey(C,T,IC);
 const wait=[];let soft=false;
 if(prk){
  const r=lookup("P:"+C,prk);
  if(r.value)return photoView(d,r.value,"P:"+C);
  if(r.wait)wait.push(r.wait);
  soft=Boolean(r.soft);
 }
 if(!wait.length){
  const cur=curatedFor(d.name,d.ticker);
  if(cur&&!broken.has(cur.thumb))return photoView(d,{src:cur.thumb,w:250,h:250,credit:cur.credit+" · "+cur.license,sourceUrl:cur.source,curated:true},null);
 }
 // A listed company that files as an owner shows its own logo; anyone else the issuer's (by ticker, or by issuer
 // CIK when no ticker was reported), standing in.
 const own=C?get("O:"+C):undefined,ownT=own&&own.ticker||"";
 const LT=ownT||T,LC=ownT?"":IC;
 const lg=companyLogo(LT,LC,false);
 if(wait.length){
  // The headshot is still resolving: the stand-in is asked for at the same time, on its own (faster) schedule.
  if(lg.entry)return {...logoView(d,lg,{standIn:!ownT,own:Boolean(ownT)}),wait};
  return loadingView(d,lg.wait?[...wait,lg.wait]:wait);
 }
 if(lg.wait)return loadingView(d,[lg.wait]);
 return lg.entry?logoView(d,lg,{standIn:!ownT,own:Boolean(ownT),soft:soft||lg.soft}):monogramView(d,soft||lg.soft,{photo:Boolean(prk),logo:Boolean(LT||LC)});
}
const personName=d=>displayName(d.name);
function coName(d,entry){return companyLabel(d.media==="person"?(entry&&entry.name)||"":d.co||(entry&&entry.name)||"")||normalizeTicker(d.ticker)||"Company";}
function photoView(d,p,key){
 const who=personName(d);
 const credit=p.curated?{name:who,text:p.credit,url:p.sourceUrl,src:p.src}:{name:who,text:p.credit||"",url:p.sourceUrl||"",src:p.src};
 return {kind:"photo",src:p.src,w:p.w,h:p.h,key,title:"Photo of "+who+(p.credit?" · "+p.credit:""),label:"Photo of "+who,credit,wait:[]};
}
function logoView(d,lg,{standIn=false,own=false,soft=false}){
 const e=lg.entry,co=coName(own?{...d,media:"company"}:d,e);
 const wide=e.w&&e.h?e.w/e.h>1.8:false;
 const who=d.media==="person"?personName(d):"";
 const title=standIn?"No published photo of "+who+" · "+co+" logo":co+" logo";
 const label=standIn?co+" logo (no published photo of "+who+")":co+" logo";
 return {kind:"logo",src:e.src,w:e.w,h:e.h,wide,standIn,key:lg.key||null,realSource:e.hard?e.realSource:"",title,label,wait:[],soft};
}
function loadingView(d,wait){return {kind:"loading",label:d.media==="person"?personName(d):coName(d,null),title:"",wait};}
/* The title says what was actually looked for: initials after both lookups came back empty, after only the one
   that was possible, or while the engine cannot be reached. */
function monogramView(d,soft,{photo=false,logo=false}={}){
 if(d.media==="person"){
  const who=personName(d);
  const why=soft?"photo not available right now":photo&&logo?"no published photo or company logo found":photo?"no published photo found":logo?"no company logo found":"";
  return {kind:"monogram",text:initials(d.name),title:why?who+" · "+why:who,label:who,wait:[],soft};
 }
 const co=coName(d,null),t=normalizeTicker(d.ticker).replace(/[^A-Z0-9]/g,"");
 const why=soft?"logo not available right now":logo?"no published logo found":"";
 return {kind:"monogram",text:t?t[0]:initials(d.co||""),title:why?co+" · "+why:co,label:co,wait:[],soft};
}
const sigOf=v=>v.kind+"|"+(v.src||"")+"|"+(v.standIn?1:0);

/* ---------- markup ---------- */
const STATE_CLASSES=["is-loading","is-photo","is-logo","is-monogram","is-stand-in","is-wide","ins-media--missing","ins-media--monogram"];
function stateClasses(v){
 if(v.kind==="loading")return ["is-loading"];
 if(v.kind==="monogram")return ["is-monogram","ins-media--missing","ins-media--monogram"];
 if(v.kind==="photo")return ["is-photo"];
 return ["is-logo",...(v.standIn?["is-stand-in"]:[]),...(v.wide?["is-wide"]:[])];
}
function render(d){
 const v=decide(d),size=SIZES.includes(d.size)?d.size:"sm";
 const a=['class="'+["ins-media","ins-media--"+(d.media==="person"?"person":"company"),"ins-media--"+size,...stateClasses(v)].join(" ")+'"','data-media="'+(d.media==="person"?"person":"company")+'"'];
 if(d.name)a.push('data-name="'+esc(d.name)+'"');
 if(d.ticker)a.push('data-ticker="'+esc(normalizeTicker(d.ticker))+'"');
 if(apiCik(d.cik))a.push('data-cik="'+apiCik(d.cik)+'"');
 if(d.media==="person"&&apiCik(d.issuerCik))a.push('data-issuer-cik="'+apiCik(d.issuerCik)+'"');
 if(d.co)a.push('data-co="'+esc(d.co)+'"');
 if(d.label)a.push('data-label="1" role="img" aria-label="'+esc(v.label)+'"');else a.push('aria-hidden="true"');
 if(v.title)a.push('title="'+esc(v.title)+'"');
 if(v.realSource)a.push('data-real-source="'+esc(v.realSource)+'"');
 if(v.wait.length)a.push("data-media-wait");
 if(v.credit)a.push(...creditAttrs(v.credit));
 const text=v.kind==="monogram"?v.text:d.media==="person"?initials(d.name):(normalizeTicker(d.ticker)[0]||initials(d.co||""));
 const glyph=text?monogram(text):companySymbol;
 const img=v.src?'<img src="'+esc(v.src)+'" alt="" decoding="async" loading="lazy">':'<img alt="" decoding="async">';
 return '<span '+a.join(" ")+">"+glyph+img+"</span>";
}
const creditAttrs=c=>['data-credit-name="'+esc(c.name)+'"','data-credit="'+esc(c.text)+'"',...(c.url?['data-credit-url="'+esc(c.url)+'"']:[]),'data-credit-src="'+esc(c.src)+'"'];
const describe=el=>({media:el.dataset.media==="person"?"person":"company",name:el.dataset.name||"",ticker:el.dataset.ticker||"",cik:el.dataset.cik||"",issuerCik:el.dataset.issuerCik||"",co:el.dataset.co||""});
function options(o){return o&&typeof o==="object"?o:{};}
function logo(ticker,size="sm",opts){const o=options(opts);return render({media:"company",ticker:normalizeTicker(ticker),cik:o.cik,co:o.name?companyLabel(o.name):"",size,label:Boolean(o.label)});}
// opts.issuerCik: the person's company by SEC CIK, for an issuer with no ticker (its logo stands in by CIK).
function portrait(name,ticker,size="sm",opts){const o=options(opts);return render({media:"person",name:String(name||"").replace(/\s+/g," ").trim().slice(0,160),ticker:normalizeTicker(ticker),cik:o.cik,issuerCik:o.issuerCik,size,label:Boolean(o.label)});}
const person=(o={})=>portrait(o.name,o.ticker,o.size,o);
const company=(o={})=>logo(o.ticker,o.size,o);

/* ---------- painting ---------- */
const info=new WeakMap();   // tile -> {near, sig, target}
const st=el=>{let s=info.get(el);if(!s){s={near:false,sig:null,target:null};info.set(el,s);}return s;};
const waiting=new Set();   // tiles and promise watchers that still wait for an answer
const soft=new Set();      // tiles settled on a fallback because the engine could not be reached
const reducedQ=window.matchMedia?matchMedia("(prefers-reduced-motion: reduce)"):{matches:false};
const preloads=new Map();
function preload(src){
 let p=preloads.get(src);
 if(!p){
  const im=new Image();im.decoding="async";im.src=src;
  // A failure is not remembered here: the engine may store the same bytes again (failed() decides what to retry).
  p=(im.decode?im.decode():new Promise((ok,no)=>{im.onload=ok;im.onerror=no;})).then(()=>im.naturalWidth>0,()=>false).then(ok=>{if(!ok)preloads.delete(src);return ok;});
  preloads.set(src,p);
 }
 return p;
}
function currentSig(el){
 const img=el.querySelector(":scope>img"),c=el.classList;
 const kind=c.contains("is-photo")?"photo":c.contains("is-logo")?"logo":c.contains("is-monogram")?"monogram":"loading";
 return kind+"|"+(img&&kind!=="monogram"&&kind!=="loading"?img.getAttribute("src")||"":"")+"|"+(c.contains("is-stand-in")?1:0);
}
function paint(el,v){
 const s=st(el),sig=sigOf(v);
 if(el.hasAttribute("data-media-wait")!==Boolean(v.wait.length))el.toggleAttribute("data-media-wait",Boolean(v.wait.length));
 if(s.sig===null)s.sig=currentSig(el);
 if(s.sig===sig){s.target=null;return;}
 if(s.target===sig)return;
 // Never take a picture away to show dots again (a refresh, an image re-asked after an error).
 if(v.kind==="loading"&&!/^(loading|monogram)\|/.test(s.sig))return;
 if(!v.src){s.target=null;commit(el,v,sig,s.sig.startsWith("loading|"));return;}
 s.target=sig;
 preload(v.src).then(ok=>{
  if(s.target!==sig||!el.isConnected)return;
  s.target=null;
  if(ok)commit(el,v,sig,true);else{failed(v);settle(el);}
 });
}
function commit(el,v,sig,land){
 const s=st(el);s.sig=sig;
 el.classList.remove(...STATE_CLASSES);
 el.classList.add(...stateClasses(v));
 let img=el.querySelector(":scope>img");
 if(v.src){
  if(!img){img=document.createElement("img");img.alt="";img.decoding="async";el.append(img);}
  if(img.getAttribute("src")!==v.src){img.removeAttribute("loading");img.src=v.src;}
 }
 if(v.kind==="monogram"){
  const t=el.querySelector(":scope>svg.ins-media__monogram text");
  if(t&&v.text&&t.textContent!==v.text)t.textContent=v.text;
 }
 if(v.realSource)el.setAttribute("data-real-source",v.realSource);else el.removeAttribute("data-real-source");
 if(v.title)el.title=v.title;else el.removeAttribute("title");
 if(el.dataset.label==="1")el.setAttribute("aria-label",v.label);
 for(const n of ["data-credit-name","data-credit","data-credit-url","data-credit-src"])el.removeAttribute(n);
 if(v.credit){el.dataset.creditName=v.credit.name;el.dataset.credit=v.credit.text;if(v.credit.url)el.dataset.creditUrl=v.credit.url;el.dataset.creditSrc=v.credit.src;}
 // Land on the site's spring (entity-media.css); two names, so a second arrival plays it again.
 if(land&&!reducedQ.matches)el.dataset.land=el.dataset.land==="a"?"b":"a";
 creditsSoon();
}
// An image that does not load: an engine answer is dropped and asked for once more, anything else is skipped.
function failed(v){
 if(!v||!v.src)return;
 if(v.key&&!retried.has(v.src)){retried.add(v.src);cache.delete(v.key);saveSoon();}
 else broken.add(v.src);
 for(const el of document.querySelectorAll("[data-media]")){
  const s=info.get(el);
  if(!s)continue;
  if(s.sig&&s.sig.split("|")[1]===v.src){s.sig=null;settle(el,true);}
 }
 update();
}
function settle(el,force){
 const v=decide(describe(el)),s=st(el);
 if(force&&s.sig===null)s.sig="loading||0";
 if(v.wait.length){waiting.add(el);if(s.near)for(const k of v.wait){wanted.add(k);need(k);}}
 else{waiting.delete(el);if(v.soft)soft.add(el);else soft.delete(el);}
 paint(el,v);
 return v;
}
let updating=false;
function update(){if(updating)return;updating=true;queueMicrotask(pass);}
function pass(){
 updating=false;
 const now=new Set();
 for(const item of waiting){
  if(!(item instanceof Element)){checkWatcher(item,now);continue;}
  if(!item.isConnected){waiting.delete(item);continue;}
  const v=settle(item);
  if(st(item).near)for(const k of v.wait)now.add(k);
 }
 wanted=now;
}
function wakeSoft(){for(const el of soft){soft.delete(el);if(el.isConnected){waiting.add(el);}}update();}

/* ---------- lazy: tiles ask when they come within 600px of the viewport ----------
   Near is a matter of where the tile is laid out: a tile clipped for a moment (a line still being typed in with a
   clip-path, a strip's overflow) but within the margin asks with the rest of the first screen, not in a batch of
   its own once the clip lets go. A tile with no box (a closed tab panel) waits until it has one. */
const MARGIN=600;
const nearBox=r=>(r.width>0||r.height>0)&&r.bottom>-MARGIN&&r.top<innerHeight+MARGIN&&r.right>-MARGIN&&r.left<innerWidth+MARGIN;
const io="IntersectionObserver" in window?new IntersectionObserver(entries=>{
 for(const e of entries){
  if(!e.isIntersecting&&!nearBox(e.boundingClientRect))continue;
  io.unobserve(e.target);
  st(e.target).near=true;
  settle(e.target);
 }
},{rootMargin:MARGIN+"px",scrollMargin:MARGIN+"px"}):null;
const bound=new WeakSet();
function bind(el){
 if(bound.has(el))return;
 bound.add(el);
 const img=el.querySelector(":scope>img");
 if(img)img.addEventListener("error",()=>{const s=st(el);if(img.getAttribute("src")&&s.target===null){const v=decide(describe(el));failed(v.src===img.getAttribute("src")?v:{src:img.getAttribute("src"),key:null});}});
 const v=decide(describe(el));
 if(v.wait.length){waiting.add(el);if(io)io.observe(el);else st(el).near=true;}
 settle(el);
}
/* Legacy static markup (people.html "Familiar faces"): an <img data-real-image> over a monogram that
   shows only once the image has actually loaded (naturalWidth>0), and is removed if it fails. */
function hydrateLegacy(root){
 for(const img of root.querySelectorAll("img[data-real-image]:not([data-real-ready])")){
  img.dataset.realReady="1";
  const cell=img.closest(".ins-media");
  const ready=()=>cell?.classList.remove("ins-media--pending","ins-media--missing");
  const fail=()=>{cell?.classList.remove("ins-media--pending");cell?.classList.add("ins-media--missing");img.remove();};
  img.addEventListener("load",()=>{if(img.naturalWidth>0)ready();else fail();},{once:true});
  img.addEventListener("error",fail,{once:true});
  // Static markup can finish (or fail, e.g. when Wikimedia is blocked) before this runs.
  if(img.complete&&img.naturalWidth>0)ready();
  else if(img.complete&&img.loading!=="lazy"&&img.getAttribute("src"))fail();
 }
}
function hydrate(root=document){
 if(!root?.querySelectorAll)return;
 for(const host of document.querySelectorAll("[data-media-credits]"))hold(host);
 hydrateLegacy(root);
 if(root.matches?.("[data-media]"))bind(root);
 for(const el of root.querySelectorAll("[data-media]"))bind(el);
 update();
 creditsSoon();
}
// Tiles a page adds without calling hydrate() still get bound.
let rescan=0;
if(window.MutationObserver)new MutationObserver(muts=>{
 if(rescan)return;
 for(const m of muts)for(const n of m.addedNodes){
  if(n.nodeType===1&&(n.matches("[data-media]")||n.querySelector("[data-media]"))){rescan=setTimeout(()=>{rescan=0;hydrate(document);},40);return;}
 }
}).observe(document.documentElement,{childList:true,subtree:true});

/* ---------- promise lookups for pages that draw their own frames (the company report) ---------- */
// A watcher {kind:"logo"|"photo", ticker, cik, resolve} waits in the same set as the tiles.
function checkWatcher(w,now){
 const v=w.kind==="logo"?companyLogo(apiTicker(w.ticker),apiCik(w.cik),false):lookup("P:"+apiCik(w.cik),photoKey(apiCik(w.cik),apiTicker(w.ticker),apiTicker(w.ticker)?"":apiCik(w.issuerCik)));
 if(v.wait){waiting.add(w);if(now)now.add(v.wait);wanted.add(v.wait);need(v.wait);return;}
 waiting.delete(w);
 const e=w.kind==="logo"?v.entry||null:v.value||null;
 w.resolve(e?{...e}:null);
}
function logoFor(ticker,opts){
 const o=options(opts);
 if(!apiTicker(ticker)&&!apiCik(o.cik))return Promise.resolve(null);
 return new Promise(resolve=>{checkWatcher({kind:"logo",ticker,cik:o.cik,resolve});});
}
// photoFor(ownerCik, issuer ticker, {issuerCik}): the issuer by CIK when it has no ticker.
function photoFor(cik,ticker,opts){
 if(!apiCik(cik))return Promise.resolve(null);
 return new Promise(resolve=>{checkWatcher({kind:"photo",ticker,cik,issuerCik:options(opts).issuerCik,resolve});});
}

/* ---------- credits footnote ----------
   The footnote ([data-media-credits]) never moves what follows it on screen (a closing note, the footer):
   - its space is held from the start: the height it had at this width on the last visit to this page
     (sessionStorage "ins-media-credits:v1"), or one line (two on a narrow screen) on a first visit;
   - new text goes in only while the footnote is off screen: still below the fold, or scrolled past (the
     browser's scroll anchoring then keeps the page still). Text that arrives while it is on screen waits until
     it scrolls away; a page too short to scroll takes it at once, without ever giving space back;
   - the held space is fitted to the text off screen too, and that height is kept for the next visit.
   A page that holds the space itself (the dashboard, from its own last visit) keeps its height. */
const HELD_STORE="ins-media-credits:v1";
const ownHold=new WeakSet(),pendingText=new Map();
let creditTimer=0,heldSizes={};
try{const v=JSON.parse(sessionStorage.getItem(HELD_STORE)||"{}");if(v&&typeof v==="object"&&!Array.isArray(v))heldSizes=v;}catch{/* memory only */}
function hold(host){
 if(host.hasAttribute("data-media-held"))return;
 host.setAttribute("data-media-held","");
 if(host.style.getPropertyValue("min-height"))return;
 const e=heldSizes[location.pathname],h=e&&Math.abs(Number(e.w)-innerWidth)<24?Number(e.h):0;
 host.style.setProperty("min-height",h>0&&h<4000?h+"px":innerWidth<600?"3.4em":"1.7em","important");
 ownHold.add(host);
}
const onScreen=el=>{const r=el.getBoundingClientRect();return r.height>0&&r.bottom>0&&r.top<innerHeight;};
const hostIO=window.IntersectionObserver?new IntersectionObserver(es=>{for(const e of es)if(!e.isIntersecting&&pendingText.has(e.target))write(e.target,false);}):null;
function write(host,visible){
 const html=pendingText.get(host);
 pendingText.delete(host);
 hostIO?.unobserve(host);
 if(html===undefined)return;
 const before=host.offsetHeight;
 if(host.innerHTML!==html)host.innerHTML=html;
 // Nothing to credit yet (pictures still on their way): the held space waits for the text.
 if(!ownHold.has(host)||!html)return;
 host.style.removeProperty("min-height");
 const natural=host.offsetHeight;
 // On screen (a page too short to scroll) the footnote may grow but never gives space back.
 if(visible&&natural<before)host.style.setProperty("min-height",before+"px","important");
 heldSizes[location.pathname]={w:innerWidth,h:natural};
 try{sessionStorage.setItem(HELD_STORE,JSON.stringify(heldSizes));}catch{/* quota or blocked storage */}
}
function creditsSoon(){if(!creditTimer)creditTimer=setTimeout(()=>{creditTimer=0;credits();},250);}
function credits(){
 const hosts=document.querySelectorAll("[data-media-credits]");
 if(!hosts.length)return;
 const seen=new Set(),items=[];let logos=false;
 for(const el of document.querySelectorAll("[data-credit-src]")){
  const src=el.dataset.creditSrc;
  if(!src||seen.has(src))continue;
  seen.add(src);
  const url=creditUrl(el.dataset.creditUrl||"");
  const where=url?(/wikimedia\.org$/.test(new URL(url).hostname)?"Wikimedia Commons":"SEC filing"):"";
  items.push('<span class="ins-media-credits__item">'+esc(el.dataset.creditName||"Photo")+(el.dataset.credit?": "+esc(el.dataset.credit):"")+
   (url?' · <a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+where+" ↗</a>":"")+"</span>");
 }
 if(document.querySelector("[data-media].is-logo,.cx-logo:not([hidden]) img,.cx-mark img"))logos=true;
 const html=items.length?"Photos: "+items.join("; ")+". Shown in grayscale."+(logos?" Logos are trademarks of their owners.":""):logos?"Logos are trademarks of their owners, shown in grayscale.":"";
 const short=document.documentElement.scrollHeight<=innerHeight+1;
 for(const host of hosts){
  // A one-line footnote, not a live region: aria-live="off" also keeps the motion layer from rescanning for it.
  if(host.tagName==="P"&&!host.hasAttribute("aria-live"))host.setAttribute("aria-live","off");
  hold(host);
  if(host.innerHTML===html&&!pendingText.has(host))continue;
  pendingText.set(host,html);
  const visible=onScreen(host);
  if(!visible||short||!hostIO)write(host,visible);
  else hostIO.observe(host);
 }
}

/* ---------- checks and maintenance ---------- */
// ready(root): every tile in root asks now (no lazy wait); resolves {settled} once none waits and every picture has loaded.
function ready(root=document,{timeout=20000}={}){
 hydrate(root);
 const tiles=()=>[...(root.matches?.("[data-media]")?[root]:[]),...root.querySelectorAll("[data-media]")];
 for(const el of tiles()){st(el).near=true;if(io)io.unobserve(el);el.querySelector(":scope>img[loading]")?.removeAttribute("loading");settle(el);}
 const start=Date.now();
 return new Promise(resolve=>{
  const tick=()=>{
   const list=tiles();
   const busy=list.some(el=>el.hasAttribute("data-media-wait")||st(el).target!==null||el.classList.contains("is-loading")||
     ((el.classList.contains("is-photo")||el.classList.contains("is-logo"))&&!(el.querySelector(":scope>img")?.complete)));
   if(!busy||Date.now()-start>timeout){resolve({settled:!busy,tiles:list.length});return;}
   setTimeout(tick,100);
  };
  tick();
 });
}
// refresh(): forget every answer and ask again; tiles keep what they show until the new answer lands.
function refresh(){
 cache.clear();try{sessionStorage.removeItem(STORE);}catch{}
 tries.clear();since.clear();queuedAsks.clear();due.clear();gaveUp.clear();broken.clear();retried.clear();preloads.clear();offlineUntil=0;
 for(const el of document.querySelectorAll("[data-media]")){if(bound.has(el)){const s=st(el);s.sig=null;waiting.add(el);}}
 update();
}
function photo(name,ticker){const slug=images[normalizeTicker(ticker)+":"+normalize(name)];return slug?photos[slug]:null;}
window.InsidirMedia=Object.freeze({logo,portrait,person,company,photo,hydrate,credits,ready,refresh,logoFor,photoFor,displayName,initials,knownBrand:t=>Boolean(marks[normalizeTicker(t)])});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>hydrate());else hydrate();
})();
