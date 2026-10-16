/* Real SEC reporting people (from /v1/insiders) and the reader's followed people (/v1/me/people), on people.html
   (directory + following). The overview's own "People you follow" module is v13-overview.js.
   Every person gets a tile from entity-media.js identified by their SEC CIK (with their company's CIK for the logo
   standing in): a headshot, the issuer's logo standing in for one, or initials only when neither exists. Every
   name opens that person's own file, person.html?cik=<owner CIK without leading zeros>.

   Arriving with ?q= (a person link from a page that knows only a name, such as a joint filing) runs that search
   and brings the directory into view, with focus on its status line, so the result is on screen
   instead of three screens below the hero. The directory shows 24 people at a time. */
(()=>{"use strict";
const $=id=>document.getElementById(id),media=window.InsidirMedia;
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;");
const cik=x=>/^\d{1,12}$/.test(String(x||""))?String(x):"";
const ticker=x=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(x||"").toUpperCase())?String(x).toUpperCase():"";
const day=x=>{let d=new Date(x);return x&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d):"Not reported"};
const shown=n=>media?.displayName?media.displayName(n):String(n||"Reporting person");
/* Issuer names as people write them ("NVIDIA Corp", not "NVIDIA CORP"), as on the overview (entity-media.js). */
const companyName=n=>media?.companyName?media.companyName(n):String(n||"");
const companyHref=t=>t?"company.html?ticker="+encodeURIComponent(t):"filings.html";
/* A person's file whenever the SEC CIK is known; else the directory's search for the name. */
const personHref=(n,id)=>{const c=String(id??"").trim();return /^\d{1,10}$/.test(c)&&/[1-9]/.test(c)?"person.html?cik="+c.replace(/^0+/,""):"people.html?q="+encodeURIComponent(String(n||"").trim().slice(0,80))+"#v10-directory";};
const nameLink=(raw,id)=>'<a class="v10-person-link" href="'+esc(personHref(raw,id))+'">'+esc(shown(raw))+'</a>';
const host=$("v10-people-results"),followingHost=$("v10-followed-results"),status=$("v10-people-status");
const PAGE=24;
let records=[],following=new Set(),followState="loading",loadError=null,visible=PAGE,current="",seq=0;
const say=x=>{if(status)status.textContent=x};
const retryButton='<button type="button" class="rd-retry" data-people-retry>Try again</button>';
async function request(path,options={}){
 let r;try{r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},...options});}
 catch{throw Object.assign(Error("could not reach the research service"),{status:0})}
 let j={};try{j=await r.json()}catch{if(r.ok)throw Error("unreadable response from the research service")}
 if(!r.ok)throw Object.assign(Error(r.status>=500?"the research service is unavailable (HTTP "+r.status+")":j.error||"request failed (HTTP "+r.status+")"),{status:r.status});
 return j;
}
function followButton(id,compact){
 if(!id)return "";
 const saved=following.has(id),ready=followState==="ready";
 return '<button type="button" class="v10-follow-btn'+(saved?" is-following":"")+'" data-person-follow="'+esc(id)+'" aria-pressed="'+saved+'"'+(ready?"":" disabled")+'>'+(saved?"Following ✓":compact?"Follow +":"Follow person +")+'</button>';
}
/* The company a person files for, named with its own logo tile (aria-hidden; the ticker says it). */
/* A run of facts joined by " · " that wraps as whole facts, so no line starts or ends on a separator (.rd-seq in
   v13-app.css); the text reads exactly as the plain join. */
const factRun=parts=>parts.filter(Boolean).map((x,i)=>i?'<span class="rd-bit"><span class="rd-sep"> · </span>'+x+'</span>':'<span class="rd-bit rd-bit--first">'+x+'</span>').join("");
const companyWithLogo=(t,issuer,issuerCik)=>t?'<span class="ins-inline">'+(media?.logo(t,"xs",{cik:cik(issuerCik),name:issuer?String(issuer).slice(0,60):""})||"")+'<span>'+esc(t)+'</span></span>':"";
function card(p){
 const raw=p.owner_name||"Reporting person",t=ticker(p.ticker),id=cik(p.owner_cik),ic=cik(p.issuer_cik);
 const issuer=p.issuer_name?companyName(p.issuer_name).slice(0,60):"";
 const facts=['<div><dt>Latest transaction</dt><dd>'+esc(day(p.last_transaction_date))+'</dd></div>'];
 if(Number.isFinite(Number(p.filings))&&Number(p.filings)>0)facts.push('<div><dt>Filings imported</dt><dd>'+esc(Number(p.filings))+'</dd></div>');
 const where=t?companyWithLogo(t,issuer,ic)+(issuer?" · "+esc(issuer):""):esc(issuer||"SEC reporting person");
 return '<article class="v10-person-card">'+
  '<div class="v10-person-card__head">'+(media?.portrait(raw,t,"md",{cik:id,issuerCik:ic})||"")+'<div class="v10-person-card__identity"><strong>'+nameLink(raw,id)+'</strong><small>'+where+'</small></div></div>'+
  '<dl class="v10-person-card__facts">'+facts.join("")+'</dl>'+
  '<div class="v10-person-card__actions">'+(t?'<a href="'+esc(companyHref(t))+'">'+esc(t)+' report ↗</a>':'<a href="filings.html">Filings ↗</a>')+followButton(id,false)+'</div></article>';
}
const moreButton=()=>{const left=records.length-visible;return left>0?'<div class="v10-people-more"><button type="button" data-people-more data-hf-atom>Show more people <span>· '+left+' more</span></button></div>':""};
function countLabel(){
 if(loadError)return "Unavailable";
 const n=records.length,base=(n>=100?"The first 100":String(n))+" reporting "+(n===1?"person":"people");
 return n>visible?base+" · "+visible+" shown":base;
}
function draw(){
 if(host){
  host.innerHTML=loadError?'<p class="v10-people-empty" role="alert">The reporting-person directory could not be loaded. '+retryButton+'</p>':
   records.length?records.slice(0,visible).map(p=>card(p)).join("")+moreButton():'<p class="v10-people-empty">No SEC reporting people matched that name in the current import. Try a last name, as filed with the SEC.</p>';
  media?.hydrate(host);
  const n=$("v10-people-count");if(n)n.textContent=countLabel();
 }
}
/* Show the next page of cards without redrawing the ones already on screen, then move focus to
   the first new card so keyboard users continue where the new people start. */
function showMore(){
 if(!host)return;
 const from=visible;visible=Math.min(records.length,visible+PAGE);
 host.querySelector(".v10-people-more")?.remove();
 host.insertAdjacentHTML("beforeend",records.slice(from,visible).map(p=>card(p)).join("")+moreButton());
 media?.hydrate(host);
 const n=$("v10-people-count");if(n)n.textContent=countLabel();
 host.querySelectorAll(".v10-person-card")[from]?.querySelector("a,button:not([disabled])")?.focus({preventScroll:true});
 say("Showing "+visible+" of "+(records.length>=100?"the first 100":records.length)+" reporting people"+(current?" for “"+current+"”":"")+".");
}
function drawFollowing(items){
 if(!followingHost)return;
 followingHost.innerHTML=items.length?items.map(p=>{
  const raw=p.owner_name||"Reporting person",t=ticker(p.ticker),id=cik(p.owner_cik),ic=cik(p.issuer_cik);
  return '<div class="v10-follow-row">'+(media?.portrait(raw,t,"md",{cik:id,issuerCik:ic})||"")+
  '<div><strong>'+nameLink(raw,id)+'</strong><small class="rd-seq">'+factRun([t?companyWithLogo(t,p.issuer_name,ic):"SEC Form 4","Latest transaction "+esc(day(p.last_transaction_date)),"Followed "+esc(day(p.created_at))])+'</small></div>'+
  (t?'<a href="'+esc(companyHref(t))+'" data-hf-atom>'+esc(t)+' report ↗</a>':'<span></span>')+(id?'<button type="button" data-person-follow="'+esc(id)+'" aria-pressed="true" data-hf-atom>Unfollow</button>':"")+'</div>';
 }).join(""):'<p class="v10-people-empty">You are not following anyone yet. Use “Follow person +” in the directory below; followed people are saved to your account.</p>';
 media?.hydrate(followingHost);
}
// pending: an answer already asked for (the first load hands both lists theirs, see below).
async function getFollowing(pending){
 try{const x=await (pending||request("/v1/me/people"));const list=Array.isArray(x.items)?x.items:[];followState="ready";following=new Set(list.map(p=>cik(p.owner_cik)).filter(Boolean));drawFollowing(list);}
 catch(e){followState="error";following=new Set();if(followingHost)followingHost.innerHTML='<p class="v10-people-empty" role="alert">Your followed people could not be loaded: '+esc(e.message)+'. Reload the page to try again.</p>';}
 draw();
}
const directoryPath=query=>"/v1/insiders"+(query?"?q="+encodeURIComponent(query):"");
async function load(query="",pending){
 const mine=++seq;current=query;visible=PAGE;
 say(query?"Searching SEC reporting people for “"+query+"”…":"Loading SEC reporting people…");
 try{
  const x=await (pending||request(directoryPath(query)));
  if(mine!==seq)return;
  loadError=null;records=(Array.isArray(x.items)?x.items:[]).filter(p=>cik(p.owner_cik));draw();
  say(query?records.length+" result"+(records.length===1?"":"s")+" for “"+query+"” in imported SEC Form 4 records.":"Most recently active reporting people in imported SEC Form 4 records. Portraits appear only for verified name and company matches.");
 }catch(e){
  if(mine!==seq)return;
  records=[];loadError=e.message;draw();say("The reporting-person directory is unavailable: "+e.message+".");
 }
}
/* Bring the directory to the top of the screen and put focus on its status line. */
function reveal(){
 const dir=$("v10-directory");if(!dir)return;
 const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
 dir.scrollIntoView({block:"start",behavior:reduce?"auto":"smooth"});
 status?.focus({preventScroll:true});
}
document.addEventListener("DOMContentLoaded",()=>{
 if(!host&&!followingHost)return;
 const form=$("v10-people-search"),input=$("v10-person-query"),q=(new URLSearchParams(location.search).get("q")||"").trim().slice(0,80);
 if(input)input.value=q;
 // show: scroll to the directory now (one smooth scroll; the results render below its heading,
 // so loading them does not move the target).
 const search=(query,{show=false}={})=>{
  history.replaceState(null,"",location.pathname+(query?"?q="+encodeURIComponent(query):"")+(show&&query?"#v10-directory":""));
  if(show)reveal();
  return load(query);
 };
 form?.addEventListener("submit",e=>{e.preventDefault();void search(String(input.value||"").trim().slice(0,80));});
 document.querySelector("[data-focus-search]")?.addEventListener("click",()=>{if(!input)return;input.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});input.focus({preventScroll:true});});
 document.addEventListener("click",async e=>{
  if(e.target.closest?.("button[data-people-more]")){showMore();return;}
  const again=e.target.closest?.("button[data-people-retry]");
  if(again){again.disabled=true;again.textContent="Loading…";void load(current);return;}
  const btn=e.target.closest?.("button[data-person-follow]");if(!btn)return;
  const id=cik(btn.dataset.personFollow);if(!id)return;
  if(followState!=="ready"){say("Following is unavailable right now. Reload the page to try again.");return}
  const remove=following.has(id),where=btn.closest("[id]")?.id;btn.disabled=true;
  try{if(remove)await request("/v1/me/people/"+encodeURIComponent(id),{method:"DELETE"});
  else await request("/v1/me/people",{method:"POST",body:JSON.stringify({owner_cik:id})});
  await getFollowing();say(remove?"Removed from the people you follow.":"Saved to the people you follow.");
  // The lists were redrawn: keep keyboard focus on the same person's button.
  (where&&document.querySelector("#"+CSS.escape(where)+' button[data-person-follow="'+id+'"]'))?.focus({preventScroll:true});}
  catch(error){btn.disabled=false;say("Could not update following: "+error.message+".")}
 });
 // First load: both lists draw in the same task once both answers are in (2 s at most, so a slow one never
 // holds the other back). Their pictures then go to the engine in one /v1/media request, and nothing above
 // the directory changes height afterwards. Reveal once both have drawn.
 const dir=request(directoryPath(q)),mine=request("/v1/me/people");
 const both=Promise.race([Promise.allSettled([dir,mine]),new Promise(ok=>setTimeout(ok,2000))]);
 void Promise.allSettled([load(q,both.then(()=>dir)),getFollowing(both.then(()=>mine))]).then(()=>{if(q&&host)reveal();});
});
})();
