/* Insidir UI runtime (web/assets/css/ui.css): the app shell and the small pieces every screen shares.
   window.InsidirUI:
     api(path, opts)        same-origin JSON; 401 → sign in, 402 → subscribe, other failures throw {status, message}
     fmt                    one money format ($1.2M), one price ($78.60), one date (Oct 23, 2026), percent, time ago
     logo(t,size,name)      a rounded square: the company's real logo from the media pipeline (GET /v1/media, cached),
                            a monogram on surface 2 until one exists; hydrateLogos(root) fills them in
     monogram(name)         an insider's initials
     face(name,{cik,ticker,issuerCik,size}) an insider's real photo from the media pipeline (GET /v1/media people=) when
                            one exists, their initials until then or when there is none; hydrateLogos(root) fills both
                            logos and faces in, and fills every [data-ui-credits] with the photo credits
     spark(values)          a 30-day sparkline (green when up over the window, coral when down)
     ring(score)            the signal score as a thin ring meter
     roll(el,to,format)     numbers roll to their value (spring, under 400 ms)
     enter(nodes)           rows and cards animate in (opacity and 6px), once
   The shell (sidebar, top bar with ⌘K, account menu, phone tab bar) mounts itself into [data-ui-shell].
   prefers-reduced-motion: everything lands in its final state. */
(()=>{"use strict";
const I=window.InsidirIcons, M=window.Motion||null;
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const TICK=/^[A-Z][A-Z0-9.-]{0,9}$/;
// The wordmark is a logo, not a font: web/assets/brand/insidir-wordmark.svg, inlined so it never waits on a request.
const WORDMARK=`<svg viewBox="70 -793 4531 803" aria-hidden="true"><path fill="currentColor" d="M70 0V-136H260V-415H95V-550H400V-136H560V0ZM320 -637Q279 -637 254.5 -658.047619047619Q230.0 -679.0952380952381 230 -715Q230 -751 254.5 -772.0Q279 -793 320 -793Q361 -793 385.5 -772.0Q410 -751 410 -715Q410.0 -679.0952380952381 385.5 -658.047619047619Q361 -637 320 -637Z M666 0V-550H811V-445H855L811 -410Q811 -480 851.0 -520.0Q891 -560 959 -560Q1039 -560 1087.5 -504.0Q1136 -448 1136 -355V0H986V-340Q986 -383 963.5 -406.5Q941 -430 900 -430Q860 -430 838.0 -406.5Q816 -383 816 -340V0Z M1477 10Q1409 10 1358.0 -11.5Q1307 -33 1278.5 -71.0Q1250 -109 1250 -160H1400Q1400 -136 1421.5 -121.5Q1443 -107 1477 -107H1521Q1562 -107 1583.5 -122.0Q1605 -137 1605 -164Q1605 -189 1586.0 -202.5Q1567 -216 1527 -221L1463 -229Q1360 -242 1313.0 -279.0Q1266 -316 1266 -392Q1266 -472 1321.0 -516.0Q1376 -560 1482 -560H1520Q1621 -560 1681.0 -516.0Q1741 -472 1741 -398H1591Q1591 -418 1571.5 -430.5Q1552 -443 1520 -443H1482Q1445 -443 1428.0 -430.5Q1411 -418 1411 -393Q1411 -370 1426.5 -358.0Q1442 -346 1476 -341L1545 -332Q1649 -319 1699.5 -280.0Q1750 -241 1750 -164Q1750 -80 1692.0 -35.0Q1634 10 1521 10Z M1870 0V-136H2060V-415H1895V-550H2200V-136H2360V0ZM2120 -637Q2079 -637 2054.5 -658.047619047619Q2030.0 -679.0952380952381 2030 -715Q2030 -751 2054.5 -772.0Q2079 -793 2120 -793Q2161 -793 2185.5 -772.0Q2210 -751 2210 -715Q2210.0 -679.0952380952381 2185.5 -658.047619047619Q2161 -637 2120 -637Z M2643 10Q2560 10 2510.0 -48.0Q2460 -106 2460 -205V-345Q2460 -443 2510.0 -501.5Q2560 -560 2643 -560Q2711 -560 2750.0 -520.5Q2789 -481 2789 -410L2754 -445H2789L2784 -580V-730H2934V0H2789V-105H2754L2789 -140Q2789 -69 2750.0 -29.5Q2711 10 2643 10ZM2697 -120Q2738 -120 2761.0 -143.5Q2784 -167 2784 -210V-340Q2784 -383 2761.0 -406.5Q2738 -430 2697 -430Q2655 -430 2632.5 -406.5Q2610 -383 2610 -340V-210Q2610 -167 2632.5 -143.5Q2655 -120 2697 -120Z M3070 0V-136H3260V-415H3095V-550H3400V-136H3560V0ZM3320 -637Q3279 -637 3254.5 -658.047619047619Q3230.0 -679.0952380952381 3230 -715Q3230 -751 3254.5 -772.0Q3279 -793 3320 -793Q3361 -793 3385.5 -772.0Q3410 -751 3410 -715Q3410.0 -679.0952380952381 3385.5 -658.047619047619Q3361 -637 3320 -637Z M3682 0V-550H3822V-445H3860L3817 -381Q3817 -470 3858.0 -515.0Q3899 -560 3978 -560Q4069 -560 4119.5 -505.0Q4170 -450 4170 -350V-305H4010V-340Q4010 -385 3985.5 -410.0Q3961 -435 3920 -435Q3877 -435 3854.5 -410.0Q3832 -385 3832 -340V0Z M4500 10Q4454 10 4426.5 -17.5Q4399 -45 4399 -91Q4399 -138 4426.5 -165.0Q4454 -192 4500 -192Q4547 -192 4574.0 -165.0Q4601 -138 4601 -91Q4601 -45 4574.0 -17.5Q4547 10 4500 10Z"/></svg>`;

/* ---------- data ---------- */
async function api(path,{method="GET",body}={}){
 const res=await fetch(path,{method,credentials:"same-origin",headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
 if(res.status===401){location.href="/signin.html?next="+encodeURIComponent(location.pathname.replace(/^\//,"")+location.search);throw Object.assign(Error("Sign in required"),{status:401});}
 if(res.status===402){location.href="/subscribe.html?next="+encodeURIComponent(location.pathname.replace(/^\//,"")+location.search);throw Object.assign(Error("Subscription required"),{status:402});}
 let data=null;try{data=await res.json();}catch{}
 if(!res.ok)throw Object.assign(Error(data?.error||"Something went wrong"),{status:res.status});
 return data;
}

/* An ownership filing opens inside Insidir (filing.html: the whole form as filed, with the original on SEC.gov linked);
   the accession comes from the trade's id ("<accession>:N:0") or the filing's SEC address. Anything else stays on SEC.gov. */
const filingHref=(url,id)=>{const a=/^(\d{18}|\d{10}-\d{2}-\d{6})(?::|$)/.exec(String(id||""))?.[1]||/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/(\d{18})\//.exec(String(url||""))?.[1];
 return a?"/filing.html?accession="+encodeURIComponent(a):String(url||"");};

/* ---------- formats ---------- */
const n=v=>v==null||v===""?null:Number.isFinite(Number(v))?Number(v):null;
const fmt={
 money(v){const x=n(v);if(x==null)return "—";const a=Math.abs(x),s=x<0?"−":"";
  if(a>=1e9)return s+"$"+(a/1e9).toFixed(1).replace(/\.0$/,"")+"B";if(a>=1e6)return s+"$"+(a/1e6).toFixed(1).replace(/\.0$/,"")+"M";
  if(a>=1e3)return s+"$"+Math.round(a/1e3)+"K";return s+"$"+Math.round(a).toLocaleString("en-US");},
 price(v){const x=n(v);return x==null?"—":"$"+x.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});},
 shares(v){const x=n(v);return x==null?"—":Math.round(x).toLocaleString("en-US");},
 pct(v,d=1){const x=n(v);if(x==null)return "—";const p=(x*100).toFixed(d);return (x>0?"+":x<0?"−":"")+p.replace("-","")+"%";},
 date(v,year=true){const s=String(v instanceof Date?v.toISOString():v||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return "";
  return new Date(s+"T00:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",...(year?{year:"numeric"}:{}),timeZone:"UTC"});},
 ago(v,now=Date.now()){const t=Date.parse(v);if(!Number.isFinite(t))return "";const m=Math.max(1,Math.round((now-t)/6e4));
  if(m<60)return m+"m";const h=Math.round(m/60);if(h<24)return h+"h";const d=Math.round(h/24);return d<30?d+"d":fmt.date(v,false);},
 person(raw){const s=String(raw??"").trim().replace(/\s+/g," ");if(!s)return "An insider";if(s!==s.toUpperCase())return s;
  const p=s.toLowerCase().split(" ").map(w=>w.replace(/(^|[-'])([a-z])/g,(_,a,b)=>a+b.toUpperCase())).map(w=>/^[A-Z]$/.test(w)?w+".":w);
  return p.length>1&&!/,/.test(s)?[...p.slice(1),p[0]].join(" "):p.join(" ");},
 company(raw){const s=String(raw??"").trim();if(!s)return "";const t=s===s.toUpperCase()?s.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()):s;
  return t.replace(/\b(Inc|Corp|Corporation|Co|Ltd|Plc|Llc|Lp|N\.?V|S\.?A)\.?$/i,"").replace(/[,\s]+$/,"")||t;},
 role(r){return r?(/^(CEO|CFO|COO)$/.test(r)?r:r.charAt(0).toUpperCase()+r.slice(1)):"Insider";}
};
/* A big number: the figure at full size, and "$", the unit and decimals at 60% in muted.
   money: $2.1M → $ | 2.1 | M ; price: $75.34 → $ | 75 | .34 */
function big(v,kind="money"){
 const t=kind==="price"?fmt.price(v):fmt.money(v);if(t==="—")return t;
 const m=kind==="price"?/^(−?\$)([\d,]+)(\.\d+)?$/.exec(t):/^(−?\$)([\d,.]+)([KMB]?)$/.exec(t);
 if(!m)return esc(t);
 return `<span class="u">${esc(m[1])}</span>${esc(m[2])}${m[3]?`<span class="u">${esc(m[3])}</span>`:""}`;
}
/* What an insider did, as coloured text with a 6px dot: Bought, Sold, or Plan sale (10b5-1). */
const trade=m=>m.planned?`<span class="trade trade--plan" title="Sale under a pre-scheduled 10b5-1 plan">Plan sale</span>`:`<span class="trade trade--${m.kind==="buy"?"buy":"sell"}">${m.kind==="buy"?"Bought":"Sold"}</span>`;
const initials=name=>{const w=fmt.person(name).replace(/[^A-Za-z .-]/g,"").split(/\s+/).filter(Boolean);return ((w[0]?.[0]||"")+(w.length>1?w.at(-1)[0]:"")).toUpperCase()||"·";};

/* ---------- logos ---------- */
const MEDIA=/^\/v1\/media\/[a-f0-9]{64}\.(png|webp|jpeg|svg)$/;
const KEY="insidir:logos:v1";let store={};try{store=JSON.parse(sessionStorage.getItem(KEY)||"{}")||{};}catch{store={};}
const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify(store));}catch{}saveFaces();};
function logo(t,size=28,name=""){const T=String(t||"").toUpperCase();const label=fmt.company(name)||T;
 const mono=(T||label).replace(/[^A-Z0-9]/gi,"").slice(0,T.length>3?2:Math.min(2,T.length||2)).toUpperCase()||"·";
 const src=store[T];
 return `<span class="logo logo--${size}${src?" has-img":""}" data-logo="${esc(T)}" aria-hidden="true"><span class="logo__mono">${esc(mono)}</span>${src?`<img alt="" src="${esc(src)}" loading="lazy" decoding="async">`:""}</span>`;}
const pending=new Set();let timer=0,tries=0;
function hydrateLogos(root=document){
 for(const el of $$("[data-logo]",root)){const t=el.dataset.logo;if(!TICK.test(t))continue;if(store[t])paint(el,store[t]);else if(store[t]!==null)pending.add(t);}
 for(const el of $$("[data-face]",root)){const c=el.dataset.cik;if(faces[c])paintFace(el,faces[c]);else if(faces[c]!==null)pendingFaces.add(el.dataset.face);}
 credits();
 clearTimeout(timer);timer=setTimeout(askLogos,60);
}
function paint(el,src){if(el.querySelector("img"))return;const img=new Image();img.alt="";img.decoding="async";img.onload=()=>el.classList.add("has-img");img.src=src;el.append(img);}
async function askLogos(){
 const list=[...pending].slice(0,40),people=[...pendingFaces].slice(0,60);if(!list.length&&!people.length)return;
 try{const q=[list.length?"tickers="+list.join(","):"",people.length?"people="+people.map(encodeURIComponent).join(","):""].filter(Boolean).join("&");
  const r=await fetch("/v1/media?"+q,{credentials:"same-origin",headers:{Accept:"application/json"}});if(!r.ok)throw 0;const b=await r.json();
  for(const [k,v] of Object.entries(b.logos||{})){const t=String(k).toUpperCase();if(v&&MEDIA.test(String(v.src))){store[t]=v.src;pending.delete(t);for(const el of $$(`[data-logo="${CSS.escape(t)}"]`))paint(el,v.src);}else if(v===null){store[t]=null;pending.delete(t);}}
  for(const [k,v] of Object.entries(b.photos||{})){const c=String(k).replace(/^0+/,"");
   if(v&&MEDIA.test(String(v.src)))faces[c]={src:v.src,credit:v.credit||null,source:v.source||null,sourceUrl:v.sourceUrl||null,name:v.name||null};else if(v===null)faces[c]=null;
   for(const key of [...pendingFaces])if(key.split(":")[0]===c)pendingFaces.delete(key);
   if(faces[c])for(const el of $$(`[data-face][data-cik="${CSS.escape(c)}"]`))paintFace(el,faces[c]);}
  save();credits();
  const waiting=(b.pending?.logos||[]).length+(b.pending?.photos||[]).length;if(waiting&&tries++<5)setTimeout(askLogos,1000*Math.min(8,2**tries));
 }catch{/* the monogram stays */}
}
/* ---------- faces: insiders' photos ---------- */
const FKEY="insidir:faces:v1";let faces={};try{faces=JSON.parse(sessionStorage.getItem(FKEY)||"{}")||{};}catch{faces={};}
const pendingFaces=new Set();
const saveFaces=()=>{try{sessionStorage.setItem(FKEY,JSON.stringify(faces));}catch{}};
const cikOf=v=>{const s=String(v??"").trim();return /^\d{1,10}$/.test(s)?s.replace(/^0+/,""):"";};
function face(name,{cik,ticker,issuerCik,size=24}={}){
 const c=cikOf(cik),T=String(ticker||"").toUpperCase(),ic=cikOf(issuerCik);
 const key=c?(TICK.test(T)?c+":"+T:ic?c+":cik:"+ic:c):"",f=c?faces[c]:null;
 return `<span class="mono face face--${size}${f?" has-img":""}"${key?` data-face="${esc(key)}" data-cik="${esc(c)}"`:""} aria-hidden="true"><span class="face__mono">${esc(initials(name))}</span>${f?`<img alt="" src="${esc(f.src)}" loading="lazy" decoding="async">`:""}</span>`;}
function paintFace(el,f){if(!f||el.querySelector("img"))return;const img=new Image();img.alt="";img.decoding="async";img.onload=()=>el.classList.add("has-img");img.src=f.src;el.append(img);}
/* Every photo shown is credited: [data-ui-credits] lists the photographer or source and licence for each face on the page. */
function credits(){
 const shown=[...new Set($$("[data-face].has-img,[data-face]").map(el=>el.dataset.cik))].map(c=>faces[c]).filter(f=>f&&(f.credit||f.source));
 const text=shown.length?"Photos: "+[...new Set(shown.map(f=>[f.name,f.credit||f.source].filter(Boolean).join(", ")))].join("; ")+".":"";
 for(const el of $$("[data-ui-credits]"))el.textContent=text;
}

/* ---------- small pictures ---------- */
const monogram=(name,size=24)=>`<span class="mono${size===32?" mono--32":""}" aria-hidden="true">${esc(initials(name))}</span>`;
function spark(values,{w=96,h=28}={}){const v=(values||[]).map(Number).filter(Number.isFinite);if(v.length<2)return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true"></svg>`;
 const lo=Math.min(...v),hi=Math.max(...v),span=hi-lo||1,step=w/(v.length-1);
 const d=v.map((x,i)=>(i?"L":"M")+(i*step).toFixed(1)+" "+(h-2-(x-lo)/span*(h-4)).toFixed(1)).join("");
 const cls=v.at(-1)>=v[0]?"var(--up)":"var(--down)";
 return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" stroke="${cls}"/></svg>`;}
function ring(score,{size=48,label}={}){const s=Math.max(0,Math.min(100,Number(score)||0)),r=size/2-2,c=2*Math.PI*r;
 return `<span class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(label||"Signal score "+s+" of 100")}"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="ring__track" cx="${size/2}" cy="${size/2}" r="${r}"/><circle class="ring__val" cx="${size/2}" cy="${size/2}" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-ring="${(c*(1-s/100)).toFixed(2)}"/></svg><b data-roll="${s}">${reduce?s:0}</b></span>`;}
function settle(root=document){
 for(const c of $$("[data-ring]",root)){requestAnimationFrame(()=>{c.style.strokeDashoffset=c.dataset.ring;});}
 for(const el of $$("[data-roll]",root))roll(el,Number(el.dataset.roll),x=>String(Math.round(x)));
}
// numbers roll to their value; format may return HTML (html:true) for the split big numbers
function roll(el,to,format=String,{html=false}={}){
 const put=v=>{if(html)el.innerHTML=format(v);else el.textContent=format(v);};
 if(reduce||!M?.animate||!Number.isFinite(to)){put(to);return;}
 M.animate(0,to,{type:"spring",stiffness:180,damping:26,duration:.4,onUpdate:put,onComplete:()=>put(to)});
}
function enter(nodes){if(reduce)return;const list=[...nodes];list.forEach((el,i)=>{
 if(M?.animate)M.animate(el,{opacity:[0,1],transform:["translateY(6px)","translateY(0)"]},{type:"spring",stiffness:260,damping:30,delay:Math.min(i,8)*0.03});
 else el.classList.add("enter");});}

/* ---------- shell ---------- */
const NAV=[["dashboard","Today","sun","/dashboard.html"],["watchlist","Watchlist","star","/watchlist.html"],["alerts","Alerts","bell","/alerts.html"],
 ["intelligence","Intelligence","sparkles","/intelligence.html"],["connections","Connections","waypoints","/explore.html"],["settings","Settings","settings","/account.html"]];
const TABS=["dashboard","watchlist","alerts","intelligence"];
function mountShell(){
 const host=$("[data-ui-shell]");if(!host)return;
 const here=host.dataset.page||"";
 const side=`<aside class="side" aria-label="Main">
 <div class="side__top"><a class="wordmark" href="/dashboard.html" aria-label="Insidir, Today">${WORDMARK}</a><button class="btn btn--ghost btn--icon" type="button" data-ui-collapse aria-label="Collapse sidebar">${I.svg("panel-left")}</button></div>
 <nav class="side__nav">${NAV.slice(0,5).map(([k,l,i,h])=>`<a class="nav-i" href="${h}"${k===here?' aria-current="page"':""} title="${l}">${I.svg(i)}<span>${l}</span>${k==="alerts"?'<b class="badge" data-ui-unread hidden></b>':""}</a>`).join("")}</nav>
 <div class="side__foot">${NAV.slice(5).map(([k,l,i,h])=>`<a class="nav-i" href="${h}"${k===here?' aria-current="page"':""} title="${l}">${I.svg(i)}<span>${l}</span></a>`).join("")}</div></aside>`;
 const top=`<header class="top" data-ui-top>
 <a class="top__mark wordmark" href="/dashboard.html" aria-label="Insidir, Today">${WORDMARK}</a>
 <button class="top__search" type="button" data-ui-cmdk>${I.svg("search")}<span class="lbl-long">Search a stock, insider or fund</span><span class="lbl-short">Search</span><span class="kbd">⌘K</span></button>
 <div class="top__end"><a class="btn btn--ghost btn--icon top__bell" href="/alerts.html" aria-label="Alerts">${I.svg("bell")}<span class="dot dot--new" data-ui-unread-dot hidden></span></a>
 <button class="btn btn--ghost btn--icon" type="button" data-ui-account aria-label="Account" aria-haspopup="menu" aria-expanded="false"><span class="mono" data-ui-me>·</span></button></div></header>`;
 const tabs=`<nav class="tabs-m" aria-label="Main">${NAV.filter(x=>TABS.includes(x[0])).map(([k,l,i,h])=>`<a href="${h}"${k===here?' aria-current="page"':""}>${I.svg(i,20)}<span>${l}</span></a>`).join("")}</nav>`;
 const main=host.innerHTML;
 host.className="shell";host.innerHTML=side+`<div class="main">${top}<main class="page" id="main">${main}</main></div>`+tabs;
 try{if(localStorage.getItem("insidir:side")==="collapsed")host.classList.add("is-collapsed");}catch{}
 $("[data-ui-collapse]").addEventListener("click",()=>{host.classList.toggle("is-collapsed");try{localStorage.setItem("insidir:side",host.classList.contains("is-collapsed")?"collapsed":"open");}catch{}});
 const topEl=$("[data-ui-top]");const stick=()=>topEl.classList.toggle("is-stuck",scrollY>4);addEventListener("scroll",stick,{passive:true});stick();
 // who is signed in, and unread alerts
 api("/v1/me").then(me=>{const e=me?.user?.email||"";$("[data-ui-me]").textContent=(e[0]||"·").toUpperCase();$("[data-ui-account]").dataset.email=e;}).catch(()=>{});
 // unread alerts: a plain fetch, so a member without access (a paid route answers 402) is never sent away from
 // Settings or Billing, where they fix billing, download their data or delete the account
 fetch("/v1/me/notifications?limit=1&unread=1",{credentials:"same-origin",headers:{Accept:"application/json"}}).then(r=>r.ok?r.json():null).then(x=>{const u=Number(x?.unread)||0;const b=$("[data-ui-unread]");if(u){b.hidden=false;b.textContent=u>99?"99+":u;$("[data-ui-unread-dot]").hidden=false;}}).catch(()=>{});
 $("[data-ui-account]").addEventListener("click",e=>accountMenu(e.currentTarget));
 $("[data-ui-cmdk]").addEventListener("click",()=>palette());
 addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();palette();}if(e.key==="/"&&!/input|textarea|select/i.test(document.activeElement?.tagName||"")&&!document.activeElement?.isContentEditable){e.preventDefault();palette();}});
}
function accountMenu(btn){
 const open=$(".menu[data-ui-menu]");if(open){open.remove();btn.setAttribute("aria-expanded","false");return;}
 const r=btn.getBoundingClientRect();const m=document.createElement("div");m.className="menu";m.dataset.uiMenu="";m.setAttribute("role","menu");
 m.style.top=(r.bottom+8+scrollY)+"px";m.style.right=(innerWidth-r.right)+"px";
 m.innerHTML=`<div class="menu__who">${esc(btn.dataset.email||"Signed in")}</div><a role="menuitem" href="/account.html">${I.svg("user")}Account</a><a role="menuitem" href="/billing.html">${I.svg("credit-card")}Billing</a><a role="menuitem" href="/alerts.html#settings">${I.svg("bell")}Alert settings</a><button role="menuitem" type="button" data-ui-logout>${I.svg("log-out")}Log out</button>`;
 document.body.append(m);btn.setAttribute("aria-expanded","true");m.querySelector("a,button").focus();
 if(M?.animate&&!reduce)M.animate(m,{opacity:[0,1],transform:["translateY(-4px) scale(.98)","none"]},{type:"spring",stiffness:400,damping:30});
 const close=ev=>{if(ev.type==="keydown"&&ev.key!=="Escape")return;if(ev.type==="click"&&(m.contains(ev.target)||btn.contains(ev.target)))return;m.remove();btn.setAttribute("aria-expanded","false");removeEventListener("click",close,true);removeEventListener("keydown",close);if(ev.type==="keydown")btn.focus();};
 setTimeout(()=>{addEventListener("click",close,true);addEventListener("keydown",close);});
 m.querySelector("[data-ui-logout]").addEventListener("click",async()=>{try{await fetch("/v1/auth/logout",{method:"POST",credentials:"same-origin"});}catch{}location.href="/";});
}

/* ---------- ⌘K ---------- */
function palette(){
 if($(".cmdk"))return;
 const wrap=document.createElement("div");wrap.className="cmdk";wrap.setAttribute("role","dialog");wrap.setAttribute("aria-modal","true");wrap.setAttribute("aria-label","Search");
 wrap.innerHTML=`<div class="cmdk__panel"><div class="cmdk__in">${I.svg("search",18)}<input type="text" placeholder="Search a stock, insider or fund" aria-label="Search a stock, insider or fund" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmdk-list"><span class="kbd">esc</span></div>
 <div class="cmdk__list" id="cmdk-list" role="listbox"></div><div class="cmdk__foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> to move</span><span><span class="kbd">↵</span> to open</span></div></div>`;
 document.body.append(wrap);const panel=wrap.firstElementChild,input=$("input",wrap),list=$(".cmdk__list",wrap);
 if(M?.animate&&!reduce){M.animate(wrap,{opacity:[0,1]},{duration:.16});M.animate(panel,{opacity:[0,1],transform:["translateY(-8px) scale(.985)","none"]},{type:"spring",stiffness:420,damping:32});}
 const last=document.activeElement;
 const close=()=>{wrap.remove();removeEventListener("keydown",keys,true);last?.focus?.();};
 wrap.addEventListener("mousedown",e=>{if(e.target===wrap)close();});
 let items=[],sel=0,seq=0;
 const draw=(groups,q)=>{items=[];list.innerHTML=groups.filter(g=>g.items.length).map(g=>`<div class="cmdk__group">${g.label}</div>`+g.items.map(it=>{items.push(it);const i=items.length-1;
   return `<div class="cmdk__item" role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i===sel}">${it.html}</div>`;}).join("")).join("")||`<div class="cmdk__empty">${q?"Nothing found for “"+esc(q)+"”.":"Type a ticker like NVDA, a company or an insider's name."}</div>`;
  hydrateLogos(list);};
 const recent=()=>{let r=[];try{r=JSON.parse(localStorage.getItem("insidir:recent")||"[]");}catch{}return r.filter(x=>x&&x.href&&x.title).slice(0,5);};
 const remember=it=>{try{const r=recent().filter(x=>x.href!==it.href);r.unshift({href:it.href,title:it.title,kind:it.kind,t:it.t});localStorage.setItem("insidir:recent",JSON.stringify(r.slice(0,5)));}catch{}};
 const stock=(t,name,meta="Stock")=>({kind:"stock",t,title:t,href:"/company.html?ticker="+encodeURIComponent(t),html:`${logo(t,24,name)}<span class="tick">${esc(t)}</span><span>${esc(fmt.company(name))}</span><span class="meta">${meta}</span>`});
 const start=()=>{const r=recent();draw([{label:"Recent",items:r.map(x=>x.kind==="stock"?stock(x.t,x.title===x.t?"":x.title):{...x,html:`${monogram(x.title)}<span>${esc(x.title)}</span><span class="meta">${x.kind==="person"?"Insider":"Fund"}</span>`})},
  {label:"Go to",items:NAV.map(([k,l,i,h])=>({kind:"page",title:l,href:h,html:`<span class="logo logo--24">${I.svg(i,14)}</span><span>${l}</span>`}))}],"");};
 const search=async q=>{const my=++seq;sel=0;
  const ticker=q.toUpperCase().replace(/^\$/,"");
  const [co,people,funds]=await Promise.all([
   api("/v1/search?q="+encodeURIComponent(q)+"&limit=6").then(x=>x.items||[]).catch(()=>api("/v1/companies?q="+encodeURIComponent(q)).then(x=>x.items||[]).catch(()=>[])),
   api("/v1/insiders?q="+encodeURIComponent(q)+"&limit=5").then(x=>x.items||[]).catch(()=>[]),
   q.length>2?api("/v1/entities/search?limit=4&q="+encodeURIComponent(q)).then(x=>(x.items||[]).filter(e=>!e.ticker)).catch(()=>[]):[]]);
  if(my!==seq)return;
  const stocks=co.map(c=>stock(String(c.ticker||"").toUpperCase(),c.title||c.name||c.issuer_name||"")).filter(x=>TICK.test(x.t));
  if(TICK.test(ticker)&&!stocks.some(s=>s.t===ticker))stocks.unshift(stock(ticker,"","Open"));
  draw([{label:"Stocks",items:stocks.slice(0,6)},
   {label:"Insiders",items:people.map(p=>({kind:"person",title:fmt.person(p.owner_name),href:"/person.html?cik="+encodeURIComponent(p.owner_cik),html:`${monogram(p.owner_name)}<span>${esc(fmt.person(p.owner_name))}</span><span class="meta"><span class="tick">${esc(p.ticker||"")}</span></span>`}))},
   {label:"Funds and filers",items:funds.map(f=>({kind:"fund",title:fmt.company(f.name),href:"/entity.html?cik="+encodeURIComponent(f.cik),html:`${monogram(f.name)}<span>${esc(fmt.company(f.name))}</span><span class="meta">SEC filer</span>`}))}],q);};
 let deb=0;input.addEventListener("input",()=>{clearTimeout(deb);const q=input.value.trim();if(!q)return start();deb=setTimeout(()=>search(q),120);});
 const go=i=>{const it=items[i];if(!it)return;remember(it);location.href=it.href;};
 list.addEventListener("click",e=>{const el=e.target.closest(".cmdk__item");if(el)go(Number(el.dataset.i));});
 const mark=()=>{for(const el of $$(".cmdk__item",list))el.setAttribute("aria-selected",String(Number(el.dataset.i)===sel));input.setAttribute("aria-activedescendant","cmdk-"+sel);$(`#cmdk-${sel}`)?.scrollIntoView({block:"nearest"});};
 function keys(e){if(e.key==="Escape"){e.preventDefault();close();}else if(e.key==="ArrowDown"){e.preventDefault();sel=Math.min(items.length-1,sel+1);mark();}else if(e.key==="ArrowUp"){e.preventDefault();sel=Math.max(0,sel-1);mark();}else if(e.key==="Enter"){e.preventDefault();go(sel);}
  else if(e.key==="Tab"){e.preventDefault();input.focus();}}
 addEventListener("keydown",keys,true);start();input.focus();
}

window.InsidirUI=Object.freeze({api,filingHref,fmt,esc,logo,hydrateLogos,monogram,face,spark,ring,settle,roll,enter,palette,initials,reduce,big,trade,WORDMARK,icon:(n,s,c)=>I.svg(n,s,c)});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountShell);else mountShell();
})();
