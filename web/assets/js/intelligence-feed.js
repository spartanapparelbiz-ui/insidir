/* Source-attributed SEC company announcements and configured public social posts. */
(()=>{"use strict";
const host=document.getElementById("insidir-intelligence-feed");if(!host)return;
const status=host.querySelector("[data-source-status]"),list=host.querySelector("[data-source-items]");
const label={sec_notice:"SEC COMPANY FILING",bluesky_post:"PUBLIC SOCIAL POST",politician_disclosure:"OFFICIAL DISCLOSURE INDEX"};
const time=t=>{let d=new Date(t);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(d):"Date unavailable"};
async function read(path){const r=await fetch(path,{credentials:"same-origin",headers:{"Accept":"application/json"}});const data=await r.json();if(!r.ok)throw Error(data.error||"Feed unavailable");return data;}
function card(x){
 const item=document.createElement("article");
 item.className="cx-feed__item";
 const meta=document.createElement("p");meta.className="cx-label";
 meta.textContent=(label[x.source_type]||"PUBLIC SOURCE")+" / "+time(x.published_at||x.observed_at);
 const title=document.createElement("p");title.className="cx-feed__title";
 title.textContent=String(x.title||"Public source update").slice(0,220);
 const link=document.createElement("a");link.textContent="Open original source ↗";link.className="cx-link";
 const url=(()=>{try{let u=new URL(String(x.source_url||""));return u.protocol==="https:"&&["www.sec.gov","disclosures-clerk.house.gov","bsky.app"].includes(u.hostname)?u.href:null;}catch{return null;}})();
 if(url){link.href=url;link.target="_blank";link.rel="noopener noreferrer";}
 else{link.textContent="Source unavailable";link.removeAttribute("href");}
 item.append(meta,title,link);return item;
}
async function refresh(){
 status.textContent="Loading official sources…";
 try{
  const [events,coverage]=await Promise.all([read("/v1/intelligence/events?limit=60"),read("/v1/intelligence/sources")]);
  list.replaceChildren();
  for(const x of events.items||[])list.append(card(x));
  const s=coverage.sources||{};
  const states=["SEC announcements: "+(s.secCompanyReports||"unknown"),
    "Selected social accounts: "+(s.blueskyPublicPosts||"not configured"),
    "House disclosures: "+(s.houseFinancialDisclosures||"not active"),
    "Senate disclosures: "+(s.senateFinancialDisclosures||"not active")];
  status.textContent=states.join(" · ");
  if(!list.children.length){const p=document.createElement("p");p.className="cx-empty";p.textContent="No indexed public-source updates yet. Research coverage begins after the next source check.";list.append(p);}
 }catch(e){status.textContent="Source feed unavailable: "+String(e.message||e);}
}
void refresh();
})();