/* Insidir UI runtime (web/assets/css/ui.css): the app shell and the small pieces every screen shares.
   window.InsidirUI:
     api(path, opts)        same-origin JSON; 401 → sign in, 402 → subscribe, other failures throw {status, message}
     fmt                    one money format ($1.2M), one price ($78.60), one date (Oct 23, 2026), percent, time ago
     logo(t,size,name)      a rounded square: the company's real logo from the media pipeline (GET /v1/media, cached),
                            a monogram on surface 2 until one exists; hydrateLogos(root) fills them in
     monogram(name)         insiders get initials, never photos
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

/* ---------- data ---------- */
async function api(path,{method="GET",body}={}){
 const res=await fetch(path,{method,credentials:"same-origin",headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
 if(res.status===401){location.href="/signin.html?next="+encodeURIComponent(location.pathname.replace(/^\//,"")+location.search);throw Object.assign(Error("Sign in required"),{status:401});}
 if(res.status===402){location.href="/subscribe.html";throw Object.assign(Error("Subscription required"),{status:402});}
 let data=null;try{data=await res.json();}catch{}
 if(!res.ok)throw Object.assign(Error(data?.error||"Something went wrong"),{status:res.status});
 return data;
}

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
const initials=name=>{const w=fmt.person(name).replace(/[^A-Za-z .-]/g,"").split(/\s+/).filter(Boolean);return ((w[0]?.[0]||"")+(w.length>1?w.at(-1)[0]:"")).toUpperCase()||"·";};

/* ---------- logos ---------- */
const MEDIA=/^\/v1\/media\/[a-f0-9]{64}\.(png|webp|jpeg|svg)$/;
const KEY="insidir:logos:v1";let store={};try{store=JSON.parse(sessionStorage.getItem(KEY)||"{}")||{};}catch{store={};}
const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify(store));}catch{}};
function logo(t,size=28,name=""){const T=String(t||"").toUpperCase();const label=fmt.company(name)||T;
 const mono=(T||label).replace(/[^A-Z0-9]/gi,"").slice(0,T.length>3?2:Math.min(2,T.length||2)).toUpperCase()||"·";
 const src=store[T];
 return `<span class="logo logo--${size}${src?" has-img":""}" data-logo="${esc(T)}" aria-hidden="true"><span class="logo__mono">${esc(mono)}</span>${src?`<img alt="" src="${esc(src)}" loading="lazy" decoding="async">`:""}</span>`;}
const pending=new Set();let timer=0,tries=0;
function hydrateLogos(root=document){
 for(const el of $$("[data-logo]",root)){const t=el.dataset.logo;if(!TICK.test(t))continue;if(store[t])paint(el,store[t]);else if(store[t]!==null)pending.add(t);}
 clearTimeout(timer);timer=setTimeout(askLogos,60);
}
function paint(el,src){if(el.querySelector("img"))return;const img=new Image();img.alt="";img.decoding="async";img.onload=()=>el.classList.add("has-img");img.src=src;el.append(img);}
async function askLogos(){
 const list=[...pending].slice(0,40);if(!list.length)return;
 try{const r=await fetch("/v1/media?tickers="+list.join(","),{credentials:"same-origin",headers:{Accept:"application/json"}});if(!r.ok)throw 0;const b=await r.json();
  for(const [k,v] of Object.entries(b.logos||{})){const t=String(k).toUpperCase();if(v&&MEDIA.test(String(v.src))){store[t]=v.src;pending.delete(t);for(const el of $$(`[data-logo="${CSS.escape(t)}"]`))paint(el,v.src);}else if(v===null){store[t]=null;pending.delete(t);}}
  save();
  const waiting=(b.pending?.logos||[]).length;if(waiting&&tries++<5)setTimeout(askLogos,1000*Math.min(8,2**tries));
 }catch{/* the monogram stays */}
}

/* ---------- small pictures ---------- */
const monogram=(name,size=24)=>`<span class="mono${size===32?" mono--32":""}" aria-hidden="true">${esc(initials(name))}</span>`;
function spark(values,{w=96,h=28}={}){const v=(values||[]).map(Number).filter(Number.isFinite);if(v.length<2)return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true"></svg>`;
 const lo=Math.min(...v),hi=Math.max(...v),span=hi-lo||1,step=w/(v.length-1);
 const d=v.map((x,i)=>(i?"L":"M")+(i*step).toFixed(1)+" "+(h-2-(x-lo)/span*(h-4)).toFixed(1)).join("");
 const cls=v.at(-1)>=v[0]?"var(--up)":"var(--down)";
 return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" stroke="${cls}"/></svg>`;}
function ring(score,{size=56,label}={}){const s=Math.max(0,Math.min(100,Number(score)||0)),r=size/2-3,c=2*Math.PI*r;
 return `<span class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(label||"Signal score "+s+" of 100")}"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="ring__track" cx="${size/2}" cy="${size/2}" r="${r}"/><circle class="ring__val" cx="${size/2}" cy="${size/2}" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-ring="${(c*(1-s/100)).toFixed(2)}"/></svg><b data-roll="${s}">${reduce?s:0}</b></span>`;}
function settle(root=document){
 for(const c of $$("[data-ring]",root)){requestAnimationFrame(()=>{c.style.strokeDashoffset=c.dataset.ring;});}
 for(const el of $$("[data-roll]",root))roll(el,Number(el.dataset.roll),x=>String(Math.round(x)));
}
function roll(el,to,format=String){
 if(reduce||!M?.animate||!Number.isFinite(to)){el.textContent=format(to);return;}
 M.animate(0,to,{type:"spring",stiffness:180,damping:26,duration:.4,onUpdate:v=>{el.textContent=format(v);}});
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
 <div class="side__top"><a class="wordmark" href="/dashboard.html" aria-label="Insidir, Today">insidir.</a><button class="btn btn--ghost btn--icon" type="button" data-ui-collapse aria-label="Collapse sidebar">${I.svg("panel-left")}</button></div>
 <nav class="side__nav">${NAV.slice(0,5).map(([k,l,i,h])=>`<a class="nav-i" href="${h}"${k===here?' aria-current="page"':""} title="${l}">${I.svg(i)}<span>${l}</span>${k==="alerts"?'<b class="badge" data-ui-unread hidden></b>':""}</a>`).join("")}</nav>
 <div class="side__foot">${NAV.slice(5).map(([k,l,i,h])=>`<a class="nav-i" href="${h}"${k===here?' aria-current="page"':""} title="${l}">${I.svg(i)}<span>${l}</span></a>`).join("")}</div></aside>`;
 const top=`<header class="top" data-ui-top>
 <a class="top__mark wordmark" href="/dashboard.html" aria-label="Insidir, Today">insidir.</a>
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
 api("/v1/me/notifications?limit=1&unread=1").then(x=>{const u=Number(x?.unread)||0;const b=$("[data-ui-unread]");if(u){b.hidden=false;b.textContent=u>99?"99+":u;$("[data-ui-unread-dot]").hidden=false;}}).catch(()=>{});
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

window.InsidirUI=Object.freeze({api,fmt,esc,logo,hydrateLogos,monogram,spark,ring,settle,roll,enter,palette,initials,reduce,icon:(n,s,c)=>I.svg(n,s,c)});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountShell);else mountShell();
})();
