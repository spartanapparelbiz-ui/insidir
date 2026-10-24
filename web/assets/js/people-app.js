/* People (people.html): the people the member follows (GET /v1/me/people), and the directory of SEC reporting people in
   Insidir's imported Form 4 filings (GET /v1/insiders?q=&limit=100&offset=), searched by a name in any order or an
   SEC CIK, 24 shown at a time and the next server page on demand. Below the matches, the other SEC reporting owners
   EDGAR knows (GET /v1/entities/search?kind=owner), minus the people already listed. Follow and Unfollow go through
   POST /v1/me/people and DELETE /v1/me/people/<cik>. Every name opens person.html?cik=<CIK without leading zeros>;
   insiders get their photo from the media pipeline (UI.face), initials when none.
   Arriving with ?q= (a page that knows only a name) runs that search and brings the directory into view, with focus on
   its status line. ui.js api() sends 401 to sign in and 402 to subscribe. */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,fmt,esc,logo,hydrateLogos,face,enter}=UI;
const $=s=>document.querySelector(s);
const PAGE=24;
const cik=x=>{const s=String(x??"").trim();return /^\d{1,12}$/.test(s)&&/[1-9]/.test(s)?s.replace(/^0+/,""):"";};
const tick=x=>{const s=String(x||"").trim().toUpperCase();return /^[A-Z][A-Z0-9.-]{0,9}$/.test(s)&&s!=="NONE"&&s!=="NA"?s:"";};
const personHref=id=>"/person.html?cik="+id;
const coHref=t=>"/company.html?ticker="+encodeURIComponent(t);
const day=v=>fmt.date(v)||"";
const plural=(n,one,many)=>Number(n).toLocaleString("en-US")+" "+(Number(n)===1?one:(many||one+"s"));

const list=$("[data-pd-results]"),more=$("[data-pd-more]"),status=$("[data-pd-status]"),count=$("[data-pd-count]");
const followHost=$("[data-pd-following]");
const input=$("#pd-q"),form=$("[data-pd-form]");
const say=t=>{status.textContent=t;};
let records=[],visible=PAGE,current="",seq=0,serverOffset=0,moreFromServer=false,loadingNext=false,loadError=null;
let following=new Set(),followState="loading";

/* ---------- rows ---------- */
function followBtn(id){
 if(!id)return "<span></span>";
 const on=following.has(id),ready=followState==="ready";
 return `<button class="btn ${on?"btn--ghost":"btn--secondary"}" type="button" data-follow="${esc(id)}" aria-pressed="${on}"${ready?"":" disabled"}>${on?"Following":"Follow"}</button>`;
}
const coCell=(t,issuer)=>t?`<a class="pp-co pd-row__co" href="${coHref(t)}">${logo(t,24,issuer)}<span><span class="tick">${esc(t)}</span>${issuer?` <span class="t-label muted">${esc(fmt.company(issuer))}</span>`:""}</span></a>`
 :`<span class="pd-row__co t-label muted">${esc(fmt.company(issuer)||"SEC reporting person")}</span>`;
function row(p){
 const raw=p.owner_name||"Reporting person",id=cik(p.owner_cik),t=tick(p.ticker),n=Number(p.filings);
 return `<li class="row pd-row">${face(raw,{cik:id,ticker:t,issuerCik:p.issuer_cik})}
  <span class="pd-row__who"><a class="strong pp-link" href="${personHref(id)}">${esc(fmt.person(raw))}</a>${Number.isFinite(n)&&n>0?`<span class="t-micro muted">${esc(plural(n,"filing")+" in Insidir")}</span>`:""}</span>
  ${coCell(t,p.issuer_name)}
  <span class="pd-row__facts t-micro muted">${p.last_transaction_date?"Latest trade "+esc(day(p.last_transaction_date)):"Trade date not reported"}</span>
  ${followBtn(id)}</li>`;
}
function draw(){
 list.removeAttribute("aria-busy");
 if(loadError){list.innerHTML=`<li class="err"><p>The directory didn't load: ${esc(loadError)}.</p><button class="btn btn--secondary" type="button" data-retry>Try again</button></li>`;more.innerHTML="";count.textContent="";
  list.querySelector("[data-retry]").addEventListener("click",e=>{e.currentTarget.disabled=true;e.currentTarget.textContent="Loading…";load(current);});return;}
 if(!records.length){list.innerHTML=`<li class="empty"><h3>${current?"No reporting person matches “"+esc(current)+"”":"No reporting people yet"}</h3><p>Insidir lists the people in the Form 4 filings it has imported. Someone without a recent Form 4 may be missing; the SEC's filer lookup covers everyone.</p><a class="btn btn--secondary" href="https://www.sec.gov/search-filings/cik-lookup" target="_blank" rel="noopener noreferrer">SEC filer lookup <span aria-hidden="true">↗</span></a></li>`;more.innerHTML="";count.textContent="";return;}
 list.innerHTML=records.slice(0,visible).map(row).join("");
 const left=records.length-visible;
 more.innerHTML=left>0?`<button class="btn btn--ghost" type="button" data-more>Show ${Math.min(PAGE,left)} more</button>`:moreFromServer?`<button class="btn btn--ghost" type="button" data-more>Load more people</button>`:"";
 more.querySelector("[data-more]")?.addEventListener("click",showMore);
 const n=records.length;
 count.textContent=(moreFromServer?"At least ":"")+plural(n,"person","people")+(n>visible?" · "+visible+" shown":"");
 hydrateLogos(list);
}
async function showMore(){
 if(loadingNext)return;const from=visible;
 if(visible<records.length)visible=Math.min(records.length,visible+PAGE);
 else if(moreFromServer){
  loadingNext=true;const b=more.querySelector("[data-more]");if(b){b.disabled=true;b.textContent="Loading…";}
  try{const d=await api(path(current,serverOffset));const batch=(d.items||[]).filter(p=>cik(p.owner_cik));records.push(...batch);serverOffset+=batch.length;moreFromServer=!!d.hasMore&&batch.length>0;visible=Math.min(records.length,visible+PAGE);}
  catch(e){if(e.status!==401&&e.status!==402)say("The next people didn't load: "+e.message+". Try again.");if(b){b.disabled=false;b.textContent="Load more people";}return;}
  finally{loadingNext=false;}
 }else return;
 draw();enter([...list.children].slice(from));
 list.children[from]?.querySelector("a")?.focus({preventScroll:true});
 say("Showing "+visible+" of "+(moreFromServer?"at least ":"")+records.length+" people"+(current?" for “"+current+"”":"")+".");
}
const path=(q,offset=0)=>"/v1/insiders?limit=100&offset="+Math.max(0,offset)+(q?"&q="+encodeURIComponent(q):"");
async function load(q="",pending){
 const mine=++seq;current=q;visible=PAGE;serverOffset=0;moreFromServer=false;
 say(q?"Searching for “"+q+"”…":"Loading SEC reporting people…");
 try{const d=await (pending||api(path(q)));if(mine!==seq)return;
  loadError=null;records=(d.items||[]).filter(p=>cik(p.owner_cik));serverOffset=records.length;moreFromServer=!!d.hasMore;draw();enter(list.children);
  say(q?(records.length+(moreFromServer?"+":"")+" "+(records.length===1?"match":"matches")+" for “"+q+"” among imported Form 4 reporting people."):"The latest people to report trades. Search a first or last name in any order, or an SEC CIK.");
  loadEdgar(q,mine);}
 catch(e){if(mine!==seq||e.status===401||e.status===402)return;records=[];loadError=String(e.message||"").replace(/\.$/,"");draw();say("");loadEdgar("",mine);}
}

/* ---------- following ---------- */
function drawFollowing(items){
 followHost.removeAttribute("aria-busy");
 if(!items.length){followHost.innerHTML=`<li class="empty"><h3>You're not following anyone yet</h3><p>Follow an insider from the directory below or from their page. Their new filings show in Alerts.</p></li>`;return;}
 followHost.innerHTML=items.map(p=>{const raw=p.owner_name||"Reporting person",id=cik(p.owner_cik),t=tick(p.ticker);
  return `<li class="row pd-row">${face(raw,{cik:id,ticker:t})}
   <span class="pd-row__who"><a class="strong pp-link" href="${personHref(id)}">${esc(fmt.person(raw))}</a><span class="t-micro muted">${p.created_at?"Followed "+esc(day(p.created_at)):""}</span></span>
   ${coCell(t,"")}
   <span class="pd-row__facts t-micro muted">${p.last_transaction_date?"Latest trade "+esc(day(p.last_transaction_date)):"No trades imported yet"}</span>
   <button class="btn btn--ghost" type="button" data-follow="${esc(id)}" aria-pressed="true">Unfollow</button></li>`;}).join("");
 hydrateLogos(followHost);
}
async function getFollowing(pending){
 try{const d=await (pending||api("/v1/me/people"));const items=(d?.items||[]).filter(p=>cik(p.owner_cik));followState="ready";following=new Set(items.map(p=>cik(p.owner_cik)));drawFollowing(items);}
 catch(e){if(e.status===401||e.status===402)return;followState="error";following=new Set();followHost.removeAttribute("aria-busy");
  followHost.innerHTML=`<li class="err"><p>The people you follow didn't load.</p><button class="btn btn--secondary" type="button" data-refollow>Try again</button></li>`;followHost.querySelector("[data-refollow]").addEventListener("click",()=>getFollowing());}
 if(records.length&&!loadError)draw();
 if(edgarItems.length)drawEdgar();
}

/* ---------- other SEC reporting owners (EDGAR) ---------- */
const edgarBox=$("[data-pd-edgar]"),edgarList=$("[data-pd-edgar-results]"),edgarMore=$("[data-pd-edgar-more]"),edgarStatus=$("[data-pd-edgar-status]");
let edgarItems=[],edgarOffset=0,edgarTotal=0,edgarQuery="",edgarState="";
const KIND={organization:"Fund or firm",person:"Person",company:"Company that also owns shares in others"};
function edgarRow(e){
 const id=cik(e.cik),role=e.latestRole,imported=Number(e.importedFilings?.asOwner)||0;
 const meta=[KIND[e.kind]||"Files with the SEC","SEC CIK "+id];
 if(e.displayName&&e.displayName!==e.name)meta.push("listed as "+e.name);
 if(e.matched?.name)meta.push((e.matched.as==="former name"?"formerly ":"also listed as ")+e.matched.name);
 const where=role?esc(role.role||"Shareholder")+(role.issuerName?" · "+esc(fmt.company(role.issuerName)):""):"";
 return `<li class="row pd-row">${face(e.displayName||e.name,{cik:id})}
  <span class="pd-row__who"><a class="strong pp-link" href="${personHref(id)}">${esc(e.displayName||fmt.person(e.name))}</a><span class="t-micro muted">${esc(meta.join(" · "))}</span></span>
  <span class="pd-row__co t-label muted">${where}</span>
  <span class="pd-row__facts t-micro muted">${imported?esc(plural(imported,"filing")+" in Insidir"):"No trades in Insidir yet"}</span>
  <span class="pd-row__btns"><a class="btn btn--ghost" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=${esc(String(e.cik))}&amp;type=4&amp;owner=include&amp;count=40" target="_blank" rel="noopener noreferrer" aria-label="${esc((e.displayName||e.name)+" on SEC EDGAR")}">EDGAR <span aria-hidden="true">↗</span></a>${e.isReportingOwner?followBtn(id):""}</span></li>`;
}
function drawEdgar(){
 edgarBox.hidden=!edgarQuery;if(!edgarQuery)return;
 edgarList.innerHTML=edgarItems.length?edgarItems.map(edgarRow).join(""):`<li class="empty"><p>${edgarState==="source_unavailable"?"SEC EDGAR couldn't be reached just now, so only Insidir's stored records were searched. Try again shortly.":edgarState==="error"?"The SEC filer search is unavailable right now.":"No other SEC reporting owner matches “"+esc(edgarQuery)+"”."}</p></li>`;
 const left=edgarTotal-edgarOffset;
 hydrateLogos(edgarList);
 edgarMore.innerHTML=edgarItems.length&&left>0?`<button class="btn btn--ghost" type="button">Show more</button>`:"";
 edgarMore.querySelector("button")?.addEventListener("click",()=>loadEdgar(edgarQuery,seq,true));
}
async function loadEdgar(q,mine,append=false){
 edgarQuery=q;
 if(!q){edgarItems=[];drawEdgar();return;}
 if(!append){edgarItems=[];edgarOffset=0;edgarStatus.textContent="Searching SEC EDGAR for other reporting owners…";}
 const from=edgarItems.length;
 try{const x=await api("/v1/entities/search?kind=owner&limit=24&offset="+edgarOffset+"&q="+encodeURIComponent(q));if(mine!==seq)return;
  const listed=new Set(records.map(p=>cik(p.owner_cik))),got=x.items||[],fresh=got.filter(e=>cik(e.cik)&&!listed.has(cik(e.cik)));
  edgarItems.push(...fresh);edgarOffset+=got.length;edgarTotal=Number(x.total)||edgarOffset;edgarState=x.state||"";drawEdgar();
  edgarStatus.textContent=edgarTotal?plural(edgarTotal,"SEC reporting owner")+" "+(edgarTotal===1?"matches":"match")+" “"+q+"”"+(fresh.length<got.length?"; those listed above are not repeated.":"."):"";
  if(append)edgarList.children[from]?.querySelector("a")?.focus({preventScroll:true});}
 catch(e){if(mine!==seq||e.status===401||e.status===402)return;edgarState="error";drawEdgar();edgarStatus.textContent="";}
}

/* ---------- follow / unfollow ---------- */
const toastEl=$("[data-pp-toast]");let toastTimer=0;
const toast=t=>{toastEl.textContent=t;toastEl.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toastEl.hidden=true;},5000);};
document.addEventListener("click",async e=>{
 const b=e.target.closest?.("button[data-follow]");if(!b)return;
 const id=cik(b.dataset.follow);if(!id)return;
 if(followState!=="ready"){toast("Following is unavailable right now. Reload the page to try again.");return;}
 const remove=following.has(id),where=b.closest("ul")?.dataset;const key=where?Object.keys(where)[0]:"";b.disabled=true;
 try{if(remove)await api("/v1/me/people/"+encodeURIComponent(id),{method:"DELETE"});else await api("/v1/me/people",{method:"POST",body:{owner_cik:id,mode:"important"}});
  await getFollowing();toast(remove?"Removed from the people you follow.":"Following. Their new filings will show in Alerts.");
  // The lists were redrawn: keep keyboard focus on the same person's button.
  const again=(key&&document.querySelector(`ul[data-${key.replace(/[A-Z]/g,c=>"-"+c.toLowerCase())}] button[data-follow="${id}"]`))||document.querySelector(`button[data-follow="${id}"]`);again?.focus({preventScroll:true});}
 catch(err){b.disabled=false;if(err.status!==401&&err.status!==402)toast("Couldn't update following: "+String(err.message||"").replace(/\.$/,"")+".");}
});

/* ---------- familiar names: each opens that person's page ---------- */
const TRY=[["Tim Cook","1214156","AAPL"],["Satya Nadella","1513142","MSFT"],["Jensen Huang","1197649","NVDA"],["Elon Musk","1494730","TSLA"]];
const tryBox=$("[data-pd-try]");
tryBox.innerHTML=`<span class="t-label muted">Try</span>`+TRY.map(([n,c,t])=>`<a class="btn btn--secondary" href="${personHref(c)}">${face(n,{cik:c,ticker:t})}${esc(n)}<span class="muted">${t}</span></a>`).join("");
hydrateLogos(tryBox);

/* ---------- search ---------- */
function reveal(){
 const dir=$("#v10-directory");if(!dir)return;
 dir.scrollIntoView({block:"start",behavior:UI.reduce?"auto":"smooth"});status.focus({preventScroll:true});
}
const q=(new URLSearchParams(location.search).get("q")||"").trim().slice(0,80);
input.value=q;
form.addEventListener("submit",e=>{e.preventDefault();const v=String(input.value||"").trim().slice(0,80);
 history.replaceState(null,"",location.pathname+(v?"?q="+encodeURIComponent(v):""));load(v);});
// First load: both lists draw once both answers are in (2 s at most), so nothing above the directory moves afterwards.
const dir=api(path(q)),mine=api("/v1/me/people");dir.catch(()=>{});mine.catch(()=>{});
const both=Promise.race([Promise.allSettled([dir,mine]),new Promise(ok=>setTimeout(ok,2000))]);
Promise.allSettled([getFollowing(both.then(()=>mine)),load(q,both.then(()=>dir))]).then(()=>{if(q)reveal();});
})();
