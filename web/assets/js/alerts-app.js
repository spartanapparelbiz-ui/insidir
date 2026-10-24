/* Alerts (alerts.html): an inbox of every alert (GET /v1/me/notifications?scores=1): an unread dot, the trade or
   filing in one sentence, its signal score and how long ago. Opening one marks it read (POST /v1/me/notifications/read)
   and goes to the stock; archiving (the Archive button, or a swipe left on a phone) hides it with an Undo
   (POST /v1/me/notifications/archive). Delivery: this device's notifications (/v1/me/push) and the Intelligence briefing frequency
   (/v1/me/intelligence/preferences). */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,fmt,esc,logo,hydrateLogos,enter}=UI;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const list=$("[data-al-list]");
let items=[],filter="all",unread=0,next=null;

const sentence=x=>x.sentence||`${x.event.headline}${x.event.ticker?" at "+x.event.ticker:""}.`;
const row=x=>{const e=x.event,t=e.ticker||"";const url=t?"/company.html?ticker="+encodeURIComponent(t):(e.sourceUrls||[])[0]||"#";
 return `<li class="row al${x.readAt?" is-read":""}" data-id="${esc(x.id)}">
 <a class="hit" href="${esc(url)}" data-open aria-label="${esc(sentence(x))}${x.readAt?"":" (unread)"}"></a>
 <span class="${x.readAt?"":"al__dot"}" aria-hidden="true"></span>${logo(t,32,e.issuerName)}
 <span class="al__text"><span class="t-body">${esc(sentence(x))}</span></span>
 <span class="al__score t-micro muted">${x.score?`Score ${x.score.score} · ${esc(x.score.band)}`:esc(e.headline||"")}</span>
 <span class="al__ago t-micro muted" title="${esc(fmt.date(e.filingDate||x.createdAt))}">${esc(fmt.ago(e.filingDate||x.createdAt))}</span>
 <button class="btn btn--ghost al__arch row__link" type="button" data-arch>Archive</button></li>`;};
function draw(){
 list.removeAttribute("aria-busy");
 const show=items.filter(x=>filter==="all"||!x.readAt);
 $("[data-al-count]").textContent=unread?`${unread} unread`:"All caught up";
 $("[data-al-readall]").hidden=!unread;
 if(!show.length){list.innerHTML=`<li class="empty" style="padding:16px 0"><h3>${filter==="unread"?"Nothing unread":"No alerts yet"}</h3><p>${filter==="unread"?"You've read every alert.":"When an insider at a stock you watch, or a person you follow, files a trade, it lands here and on your phone."}</p>${filter==="unread"?"":`<button class="btn btn--primary" type="button" data-add>Add a stock</button>`}</li>`;
  list.querySelector("[data-add]")?.addEventListener("click",()=>UI.palette());return;}
 list.innerHTML=show.map(row).join("")+(next&&filter==="all"?`<li class="inbox__more"><button class="btn btn--ghost" type="button" data-more>Show older</button></li>`:"");
 hydrateLogos(list);list.querySelector("[data-more]")?.addEventListener("click",more);
}
async function load(){
 try{const d=await api("/v1/me/notifications?limit=40&scores=1");items=d.items||[];unread=d.unread||0;next=d.next;draw();enter(list.querySelectorAll(".al"));}
 catch(e){if(e.status===401||e.status===402)return;list.removeAttribute("aria-busy");list.innerHTML=`<li class="err"><p>Your alerts didn't load.</p><button class="btn btn--secondary" type="button">Try again</button></li>`;list.querySelector("button").addEventListener("click",load);}
}
async function more(){try{const d=await api("/v1/me/notifications?limit=40&scores=1&before="+encodeURIComponent(next));items=items.concat(d.items||[]);next=d.next;draw();}catch{}}
$$("[data-al-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.alFilter;$$("[data-al-filter]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));draw();}));
$("[data-al-readall]").addEventListener("click",async()=>{try{await api("/v1/me/notifications/read",{method:"POST",body:{all:true}});for(const x of items)x.readAt=x.readAt||new Date().toISOString();unread=0;draw();}catch{}});

/* open = read; archive with undo */
list.addEventListener("click",e=>{
 const li=e.target.closest(".al");if(!li)return;const x=items.find(i=>i.id===li.dataset.id);if(!x)return;
 if(e.target.closest("[data-arch]")){e.preventDefault();archive(x);return;}
 if(e.target.closest("[data-open]")&&!x.readAt){x.readAt=new Date().toISOString();unread=Math.max(0,unread-1);api("/v1/me/notifications/read",{method:"POST",body:{ids:[x.id]}}).catch(()=>{});}
});
const toast=$("[data-toast]");let toastTimer=0;
async function archive(x){
 const li=list.querySelector(`[data-id="${CSS.escape(x.id)}"]`);
 const idx=items.indexOf(x);items.splice(idx,1);if(!x.readAt){unread=Math.max(0,unread-1);}
 const done=()=>{draw();};
 if(li&&window.Motion?.animate&&!UI.reduce)window.Motion.animate(li,{opacity:[1,0],transform:["translateX(0)","translateX(-24px)"]},{duration:.2}).then(done);else done();
 try{await api("/v1/me/notifications/archive",{method:"POST",body:{ids:[x.id]}});}catch{items.splice(idx,0,x);draw();return;}
 toast.innerHTML=`<span>Alert archived</span><button class="btn btn--secondary" type="button">Undo</button>`;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},5000);
 toast.querySelector("button").onclick=async()=>{toast.hidden=true;try{await api("/v1/me/notifications/archive",{method:"POST",body:{ids:[x.id],undo:true}});items.splice(Math.min(idx,items.length),0,x);draw();}catch{}};
}
/* swipe left to archive on touch screens */
let sw=null;
list.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse")return;const li=e.target.closest(".al");if(!li)return;sw={li,x:e.clientX,y:e.clientY,dx:0,on:false};});
list.addEventListener("pointermove",e=>{if(!sw)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y;
 if(!sw.on){if(Math.abs(dy)>10){sw=null;return;}if(dx<-10){sw.on=true;sw.li.classList.add("is-swiping");}}
 if(sw?.on){sw.dx=Math.min(0,dx);for(const c of sw.li.children)c.style.transform=`translateX(${sw.dx}px)`;}});
const endSwipe=()=>{if(!sw)return;const {li,dx,on}=sw;sw=null;if(!on)return;
 const x=items.find(i=>i.id===li.dataset.id);li.classList.remove("is-swiping");for(const c of li.children)c.style.transform="";
 if(dx<-li.clientWidth*.35&&x)archive(x);};
list.addEventListener("pointerup",endSwipe);list.addEventListener("pointercancel",endSwipe);
list.addEventListener("click",e=>{if(e.target.closest(".al.is-swiping"))e.preventDefault();},true);

/* ---------- delivery ---------- */
const msg=t=>{$("[data-prefs-msg]").textContent=t||"";};
const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const pushable="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window&&window.isSecureContext;
const b64=k=>{const s=(k+"=".repeat((4-k.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
async function pushSetup(){
 const btn=$("[data-push]"),txt=$("[data-push-text]");
 if(ios&&!standalone){txt.textContent="On iPhone, notifications work once Insidir is on your Home Screen: tap Share, then Add to Home Screen.";return;}
 if(!pushable){txt.textContent="This browser can't show notifications. Email alerts work everywhere.";return;}
 let s;try{s=await api("/v1/me/push");}catch{return;}
 if(!s.configured){txt.textContent="Notifications on this device aren't switched on for Insidir yet. Email alerts work now.";return;}
 const reg=await navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>null);const sub=await reg?.pushManager.getSubscription();
 const set=on=>{btn.hidden=false;btn.textContent=on?"Turn off":"Turn on";btn.dataset.on=on?"1":"";txt.textContent=on?"On. You'll get a notification the minute a filing matches.":"Opt in to device notifications to get one the minute a filing matches.";};
 set(!!sub);
 btn.addEventListener("click",async()=>{btn.disabled=true;msg("");
  try{const r=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   if(btn.dataset.on){const cur=await r.pushManager.getSubscription();if(cur){await api("/v1/me/push",{method:"DELETE",body:{endpoint:cur.endpoint}});await cur.unsubscribe();}set(false);}
   else{if(await Notification.requestPermission()!=="granted")throw Error("Notifications are blocked. Allow them in your browser settings, then try again.");
    const n=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(s.publicKey)});try{await api("/v1/me/push",{method:"POST",body:n.toJSON()});}catch(err){await n.unsubscribe();throw err;}set(true);}
  }catch(err){msg(err.message);}finally{btn.disabled=false;}});
}
async function briefSetup(){
 let p;try{p=await api("/v1/me/intelligence/preferences");}catch{return;}
 const mark=f=>$$("[data-brief]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.brief===f)));mark(p.frequency);
 $$("[data-brief]").forEach(b=>b.addEventListener("click",async()=>{try{const r=await api("/v1/me/intelligence/preferences",{method:"POST",body:{frequency:b.dataset.brief}});mark(r.frequency);msg("Saved.");}catch(err){msg(err.message);}}));
}

load();pushSetup();briefSetup();
if(location.hash==="#settings")setTimeout(()=>$("#settings")?.scrollIntoView(),300);
})();
