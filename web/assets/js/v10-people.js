/* Real SEC reporting people; saved follows use authenticated account API. */
(()=>{"use strict";
const $=id=>document.getElementById(id),media=window.InsidirMedia;
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;',"'" :"&#39;"}[c]));
const cik=x=>/^\d{1,12}$/.test(String(x||""))?String(x):"";
const ticker=x=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(x||"").toUpperCase())?String(x).toUpperCase():"";
const day=x=>{let d=new Date(x);return x&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d):"Not reported"};
const link=t=>t?"company.html?ticker="+encodeURIComponent(t):"filings.html";
const host=$("v10-people-results"),preview=$("v10-people-preview"),followingHost=$("v10-followed-results"),status=$("v10-people-status");
let records=[],following=new Set(),signedIn=false;
const say=x=>{if(status)status.textContent=x};
async function request(path,options={}){const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},...options});let j={};try{j=await r.json()}catch{throw Error("Unable to read the research service")};if(!r.ok){let e=Error(j.error||"Request failed");e.status=r.status;throw e}return j}
function card(p){
 const name=p.owner_name||"Reporting person",t=ticker(p.ticker),id=cik(p.owner_cik),saved=following.has(id);
 const photo=media?.portrait(name,t,"lg")||"";
 return '<article class="v10-person-card"><div class="v10-person-card__avatar">'+photo+'<span class="v10-person-card__avatar-note">'+(photo.includes("data-real-image")?"Published portrait":"Source-linked SEC identity")+'</span></div>'+
 '<div class="v10-person-card__identity"><div><strong>'+esc(name)+'</strong><small>'+(t?esc(t)+" · ":"")+"SEC reporting person</small></div><a href="'+esc(link(t))+'" aria-label="Research '+esc(name)+'">↗</a></div>'+
 '<p class="v10-person-card__meta">Latest reported transaction · '+esc(day(p.last_transaction_date))+'</p>'+
 (id?'<button type="button" class="v10-follow-btn'+(saved?" is-following":"")+'" data-person-follow="'+esc(id)+'" aria-pressed="'+saved+'">'+(saved?"Following ✓":"Follow person +")+'</button>':"")+'</article>';
}
function draw(){
 if(preview){preview.innerHTML=records.length?records.slice(0,4).map(card).join(""):'<p class="v3-empty">No reporting-person records in the current import. <a href="filings.html">Browse filings ↗</a></p>';media?.hydrate(preview)}
 if(host){host.innerHTML=records.length?records.map(card).join(""):'<p class="v10-people-empty">No SEC reporting people matched that name in the current import.</p>';media?.hydrate(host);if($("v10-people-count"))$("v10-people-count").textContent=records.length+" reporting "+(records.length===1?"person":"people")}
}
function drawFollowing(items){
 if(!followingHost)return;
 followingHost.innerHTML=items.length?items.map(p=>{
 const t=ticker(p.ticker),id=cik(p.owner_cik);
 return '<div class="v10-follow-row">'+(media?.portrait(p.owner_name,t,"md")||"")+
 '<div><strong>'+esc(p.owner_name||"Reporting person")+'</strong><small>'+esc(t||"SEC Form 4")+' · Saved '+esc(day(p.created_at))+'</small></div>'+
 '<a href="'+esc(link(t))+'">Research ↗</a><button type="button" data-person-follow="'+esc(id)+'">Unfollow</button></div>';
 }).join(""):'<p class="v10-people-empty">You have not followed any reporting people yet. Start from the directory below.</p>';
 media?.hydrate(followingHost);
}
async function getFollowing(){
 try{const x=await request("/v1/me/people");signedIn=true;following=new Set((x.items||[]).map(p=>cik(p.owner_cik)));drawFollowing(x.items||[]);draw()}
 catch(e){signedIn=false;following=new Set();if(followingHost)followingHost.innerHTML=e.status===401?'<p class="v10-people-empty"><a href="signin.html">Sign in</a> to save reporting people across sessions.</p>':'<p class="v10-people-empty">Saved people are currently unavailable.</p>';draw()}
}
async function load(query=""){
 say("Retrieving real SEC reporting people…");
 try{const x=await request("/v1/insiders"+(query?"?q="+encodeURIComponent(query):""));records=(Array.isArray(x.items)?x.items:[]).filter(p=>cik(p.owner_cik));draw();say("Profiles come from imported SEC Form 4 records. Portraits are displayed only for verified identity matches.");}
 catch(e){records=[];draw();say("The reporting-person directory is unavailable: "+e.message)}
}
document.addEventListener("DOMContentLoaded",()=>{
 if(!host&&!preview&&!followingHost)return;
 const form=$("v10-people-search"),input=$("v10-person-query"),q=new URLSearchParams(location.search).get("q")||"";
 if(input)input.value=q;
 form?.addEventListener("submit",e=>{e.preventDefault();const query=String(input.value||"").trim().slice(0,80);history.replaceState(null,"",location.pathname+(query?"?q="+encodeURIComponent(query):""));void load(query)});
 document.addEventListener("click",async e=>{
  const btn=e.target.closest("button[data-person-follow]");if(!btn)return;
  const id=cik(btn.dataset.personFollow);if(!id)return;
  if(!signedIn){say("Sign in to follow someone and save your choices to your account.");location.href="signin.html";return}
  const remove=following.has(id);btn.disabled=true;
  try{if(remove)await request("/v1/me/people/"+encodeURIComponent(id),{method:"DELETE"});
  else await request("/v1/me/people",{method:"POST",body:JSON.stringify({owner_cik:id})});
  await getFollowing();say(remove?"Removed from followed people.":"Reporting person saved to your account.");}
  catch(error){btn.disabled=false;say("Could not update following: "+error.message)}
 });
 void Promise.allSettled([load(q),getFollowing()]);
});
})();