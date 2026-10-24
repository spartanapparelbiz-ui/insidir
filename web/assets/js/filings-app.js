/* SEC filings (filings.html): the library of filings Insidir has imported, newest first (GET /v1/filings, 40 at a time,
   "Show older" up to the engine's offset cap). Search a company name or form (q) and filter by ticker (ticker); both
   live in the address (?q=, ?ticker=) so a filtered list can be shared or reloaded. Each row opens the filing inside
   Insidir (/filing.html?accession=, which links the original on SEC.gov); its ticker narrows the list to that stock. */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,filingHref,fmt,esc,logo,hydrateLogos,enter}=UI;
const $=s=>document.querySelector(s);
const form=$("[data-fx-form]"),qIn=$("#fx-q"),tIn=$("#fx-t"),clearBtn=$("[data-fx-clear]"),list=$("[data-fx-list]"),more=$("[data-fx-more]"),msgEl=$("[data-fx-msg]"),countEl=$("[data-fx-count]");
const PAGE=40,MAX_OFFSET=1000;
const clean=v=>{const t=String(v??"").trim().toUpperCase().replace(/^\$/,"");return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)?t:"";};
const say=t=>{msgEl.textContent=t||"";};
/* A filing is dated on the SEC's calendar day (Eastern): one accepted at 9:30 p.m. ET was filed that day. */
const DAY=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York"});
const WHEN=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York",timeZoneName:"short"});
const at=(f,v)=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?f.format(d):"";};
const formLabel=f=>{const t=String(f||"").trim();return !t?"Filing":/^form\b/i.test(t)?t:"Form "+t;};
let items=[],offset=0,full=false,gen=0,busy=false,shown=0;

function skeleton(){list.setAttribute("aria-busy","true");list.innerHTML=Array.from({length:4},()=>`<li class="row fx"><span class="skel" style="width:28px;height:28px;border-radius:8px"></span><span class="skel" style="width:60%;height:16px"></span><span class="skel" style="width:50%;height:14px"></span><span class="skel" style="width:84px;height:14px"></span><span></span></li>`).join("");}
function row(f){
 const t=clean(f.ticker),href=filingHref(f.source_url,f.accession),co=fmt.company(f.issuer_name)||t||"Reporting company";
 const label=formLabel(f.form_type||f.title),amended=f.is_amendment&&!/\/A$/i.test(String(f.form_type||""));
 const who=(Array.isArray(f.owner_names)?f.owner_names:[]).filter(Boolean).map(fmt.person);
 const day=at(DAY,f.published_at);
 return `<li class="row fx">${href?`<a class="hit" href="${esc(href)}" aria-label="${esc(label+(amended?" (amended)":"")+", "+co+(day?", published "+day:""))}"></a>`:""}
 ${logo(t,28,f.issuer_name)}
 <span class="fx__co"><span class="strong">${esc(co)}</span>${t?`<button type="button" class="fx__tick" data-tick="${esc(t)}" aria-label="Show only ${esc(t)} filings" title="Show only ${esc(t)} filings">${esc(t)}</button>`:""}</span>
 <span class="fx__what lx-two"><span class="t-label">${esc(label)}${amended?" (amended)":""}</span>${who.length?`<span class="t-label muted">${esc(who.join(", "))}</span>`:""}</span>
 <span class="fx__day t-label muted"${f.published_at?` title="Published ${esc(at(WHEN,f.published_at))}"`:""}>${esc(day||"Date not reported")}</span>
 <span class="lx-go" aria-hidden="true">${href?UI.icon("chevron-right"):""}</span></li>`;
}
function draw(){
 list.removeAttribute("aria-busy");
 const q=qIn.value.trim(),t=clean(tIn.value),n=items.length;
 countEl.textContent=n?`${n.toLocaleString("en-US")}${full?"+":""} ${n===1?"filing":"filings"}${t?" for "+t:""}, newest first`:"\u00a0";
 more.hidden=!full;
 if(!n){
  list.innerHTML=q||t?`<li class="empty" style="padding:16px 0"><h3>No filings match</h3><p>Insidir lists the filings it has read, not every filing at the SEC. Try another company name or ticker, or clear the search.</p><button class="btn btn--secondary" type="button" data-fx-reset>Clear search</button></li>`
   :`<li class="empty" style="padding:16px 0"><h3>No filings imported yet</h3><p>Filings appear here as Insidir reads them from SEC EDGAR.</p></li>`;
  list.querySelector("[data-fx-reset]")?.addEventListener("click",reset);return;}
 list.innerHTML=items.map(row).join("");
 hydrateLogos(list);enter([...list.querySelectorAll(".fx")].slice(shown));shown=n;
}
function sync(){
 const q=qIn.value.trim(),t=clean(tIn.value),p=new URLSearchParams();
 if(q)p.set("q",q);if(t)p.set("ticker",t);
 history.replaceState(null,"",location.pathname+(p.toString()?"?"+p:""));
 clearBtn.hidden=!q&&!t;
}
async function load(fresh=true){
 if(!fresh&&busy)return;
 const my=fresh?++gen:gen;busy=true;more.querySelector("button").disabled=true;
 if(fresh){items=[];offset=0;shown=0;skeleton();}
 const q=qIn.value.trim(),t=clean(tIn.value);
 try{
  const d=await api("/v1/filings?limit="+PAGE+"&offset="+offset+(q?"&q="+encodeURIComponent(q):"")+(t?"&ticker="+encodeURIComponent(t):""));
  if(my!==gen)return;
  const got=Array.isArray(d.items)?d.items:[];
  items=items.concat(got);offset+=got.length;full=got.length===PAGE&&offset<MAX_OFFSET;draw();
 }catch(e){
  if(my!==gen||e.status===401||e.status===402)return;
  if(fresh){list.removeAttribute("aria-busy");countEl.textContent="\u00a0";more.hidden=true;
   list.innerHTML=`<li class="err"><p>The filings didn't load.</p><button class="btn btn--secondary" type="button">Try again</button></li>`;list.querySelector("button").addEventListener("click",()=>load());}
  else say("Older filings didn't load. Try again.");
 }finally{if(my===gen){busy=false;more.querySelector("button").disabled=false;}}
}
function reset(){qIn.value="";tIn.value="";say("");sync();load();qIn.focus();}

form.addEventListener("submit",e=>{
 e.preventDefault();
 if(tIn.value.trim()&&!clean(tIn.value)){say("Enter a ticker symbol, like AAPL, or leave Ticker empty.");tIn.focus();return;}
 tIn.value=clean(tIn.value);say("");sync();load();
});
clearBtn.addEventListener("click",reset);
more.querySelector("button").addEventListener("click",()=>load(false));
list.addEventListener("click",e=>{
 const b=e.target.closest("[data-tick]");if(!b)return;e.preventDefault();
 tIn.value=b.dataset.tick;say("Showing "+b.dataset.tick+" filings.");sync();load();
});

const params=new URLSearchParams(location.search);
qIn.value=String(params.get("q")||"").slice(0,100);
tIn.value=clean(params.get("ticker"));
sync();load();
})();
