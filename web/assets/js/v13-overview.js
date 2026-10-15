/* The top of the overview (dashboard.html): Today, and 01 People you follow.

   Today (#rd-today) says, in three sentences, what changed for this reader since the last visit (the people
   they follow and the companies they watch), what the latest imported trades add up to across the market
   (the same derive() result as 03 Across the market, so the figures match), and how fresh the import is.

   01 People you follow reads GET /v1/me/people/updates?limit=40 once:
     - Latest trades (#v10-follow-feed): the newest Form 4 lines the followed people filed, newest filing
       first, each a sentence from describe() with the person's headshot and the company's logo, marked New
       when it was imported after the last visit;
     - Following (#v10-follow-list): each followed person with their last 30 days (bought, sold, trades),
       how many of their lines are new, and a Following ✓ button;
     - suggestions (#v10-follow-suggest): the most active people in the latest 100 imported trades, ranked by
       priced value (shares × price), plus /v1/insiders when the reader follows fewer than 3 people, each with
       a Follow + button; six of them in place of the feed when the reader follows nobody yet, four otherwise.
   Follow and unfollow happen in place, with nothing moving under the pointer: the button flips at once
   (optimistic) and flips back with the reason if the server says no; a new person and their trades rise into
   space reserved for them (up to 8 feed rows and 6 people, then "and N more"); an unfollowed person dims, with
   Undo for 6 seconds, and leaves on the next visit. Every list renders once per load (or per "Try again"). */
(() => {"use strict";
const D=window.InsidirDesk;if(!D)return;
const $=id=>document.getElementById(id),E=D.E;
const FEED_MAX=8,LIST_MAX=6,RESERVE=3,SUGGEST_EMPTY=6,SUGGEST_MORE=4,UNDO_MS=6000,FIRST_ROWS=3;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const st={ok:false,people:[],items:[],following:0,followed:new Set(),dropped:new Set(),names:new Map(),feedRows:RESERVE,listSlots:RESERVE,suggestions:[],busy:new Set()};
const nameOf=cik=>st.names.get(cik)||"this person";
const EMPTY_MSG="You are not following anyone yet. Follow an insider and every trade they file appears here, marked New until you have seen it.";

/* ================= Today ================= */
const line=(id,html)=>{const el=$(id);if(!el)return;el.innerHTML=html;el.classList.remove("is-skeleton");el.removeAttribute("aria-busy");rememberToday();};
/* Once all three lines are in, their heights at this width are kept for the next visit's skeleton (dashboard.html),
   so a sentence that wraps to four lines on a phone has four lines' room before it arrives. */
let todayTimer=0;
function rememberToday(){
 clearTimeout(todayTimer);
 todayTimer=setTimeout(()=>D.later(9,()=>{
  const els=["rd-today-you","rd-today-market","rd-today-fresh"].map($);
  if(els.some(el=>!el||el.classList.contains("is-skeleton")))return;
  // Measured without the reserved minimum, then the minimum is put back (same frame: nothing paints in between).
  const kept=els.map(el=>[el.style.getPropertyValue("min-height"),el.style.getPropertyPriority("min-height")]);
  const h=els.map(el=>{el.style.setProperty("min-height","0px","important");return el.offsetHeight;});
  els.forEach((el,i)=>{if(kept[i][0])el.style.setProperty("min-height",kept[i][0],kept[i][1]);else el.style.removeProperty("min-height");});
  D.saveCount("today",{w:innerWidth,you:h[0],market:h[1],fresh:h[2]});
 }),200);
}
function todayYou(r){
 const watched=r.watchlist.ok?[...new Set(r.watchlist.value.map(x=>D.tick(x.ticker)).filter(Boolean))]:[];
 const trades=r.trades.ok?r.trades.value:[];
 const W=watched.length,newWatch=watched.filter(t=>trades.some(x=>D.tick(x.ticker)===t&&D.isNew(x))).length;
 const when=D.lastVisitText(),seen=D.lastSeen!==null;
 const watchAdd=newWatch?" "+(newWatch===1?"1 company on your watchlist has new trades.":D.count(newWatch)+" companies on your watchlist have new trades."):"";
 let text;
 if(!r.updates.ok)text="Updates from the people you follow could not be loaded."+watchAdd;
 else{
  const v=r.updates.value||{},people=Array.isArray(v.people)?v.people:[],F=Number.isFinite(Number(v.following))?Number(v.following):people.length;
  const items=Array.isArray(v.items)?v.items:[];
  const them=F===1?"the person you follow":"the "+D.plural(F,"person","people")+" you follow";
  if(F>0){
   if(!seen)text="You follow "+D.plural(F,"person","people")+". Trades they file from now on are marked New."+watchAdd;
   else{
    const fresh=items.filter(D.isNew),k=new Set(fresh.map(x=>x.owner_cik)).size;
    text=fresh.length?"Since your last visit on "+when+": "+D.plural(fresh.length,"new trade")+" from "+(F===1?them:D.count(k)+" of "+them)+"."+watchAdd
     :"Nothing new from "+them+" since your last visit on "+when+"."+watchAdd;
   }
  }
  else if(!W)text="Follow insiders or save companies below. This line will then tell you what they filed since your last visit.";
  else if(!seen)text="You watch "+D.plural(W,"company","companies")+". Trades filed there from now on are marked New.";
  else text=newWatch?"Since your last visit on "+when+": "+(newWatch===1?"1 company":D.count(newWatch)+" of the "+D.count(W)+" companies")+" on your watchlist "+(newWatch===1?"has":"have")+" new trades."
   :"Nothing new at the "+D.plural(W,"company","companies")+" on your watchlist since your last visit on "+when+".";
 }
 line("rd-today-you",E(text));
}
function todayMarket(r){
 if(!r.trades.ok){line("rd-today-market",E("The latest imported trades could not be loaded, so the market figures are missing below."));return;}
 const rows=r.trades.value;
 if(!rows.length){line("rd-today-market",E("No trades have been imported yet. The first SEC import fills this page."));return;}
 const f=D.derive(rows),n=rows.length;
 line("rd-today-market",E("Across "+(n>=100?"the latest "+D.count(n):"all "+D.count(n))+" trades imported from SEC filings ("+D.rangeText(f)+"), insiders bought ")+
  '<strong class="rd-nb">'+E(D.money(f.buyValue))+'</strong> and sold <strong class="rd-nb">'+E(D.money(f.sellValue))+'</strong>'+E(" of their own companies' stock."));
}
function todayFresh(r){
 const parts=[];
 if(r.status.ok){
  const s=r.status.value||{},run=s.lastIngest||null,when=run?(run.status==="running"?run.started_at:(run.finished_at||run.started_at)):s.lastIngestAt||null;
  parts.push(when?(run?.status==="running"?"Import running since ":"Last import ")+D.stamp(when):"No import recorded yet");
 }else parts.push("Import status unavailable");
 const first=r.filing.ok?r.filing.value:null,fallback=r.status.ok?r.status.value?.latest_published_at:null,pub=first?.published_at||fallback;
 parts.push(pub?"newest filing published "+D.filedDate(pub):r.filing.ok?"no filings imported yet":"newest filing unavailable");
 line("rd-today-fresh",E(parts.join(" · ")+"."));
}
D.watch(["updates","watchlist","trades"],r=>D.now(()=>todayYou(r)));
D.watch(["trades"],r=>D.now(()=>todayMarket(r)));
D.watch(["status","filing"],r=>D.now(()=>todayFresh(r)));

/* ================= 01 People you follow ================= */
const live=text=>{const el=$("v10-follow-live");if(el)el.textContent=text;};
/* The notice (#rd-toast, role=status) sits at the bottom of the screen, so it never moves the page. An Undo stays for 6 s;
   other notices leave after 6 s (8 s for an error). */
let undoTimer=0;
function status(html,{error=false,keep=false}={}){
 const el=$("rd-toast");if(!el)return;
 clearTimeout(undoTimer);
 el.innerHTML=html;el.classList.toggle("is-error",error);
 if(!keep)undoTimer=setTimeout(()=>{if(!el.contains(document.activeElement))el.textContent="";},error?8000:UNDO_MS);
}
const followBtn=(cik,name,on)=>'<button type="button" class="v10-follow-btn'+(on?" is-following":"")+'" data-follow="'+E(cik)+'" aria-pressed="'+on+'" aria-label="'+E((on?"Unfollow ":"Follow ")+name)+'">'+(on?"Following ✓":"Follow +")+'</button>';
const isFollowing=cik=>st.followed.has(cik)&&!st.dropped.has(cik);

/* A feed row: two lines of fixed height on wide screens, a four-line record on phones. */
function feedRow(x,i){
 const cik=D.cikOf(x.owner_cik),t=D.tick(x.ticker),d=D.describe(x),v=D.valueText(x),lag=D.lagOf(x),fresh=D.isNew(x);
 const co=t?(x.issuer_name?D.companyName(x.issuer_name):t):D.companyName(x.issuer_name)||"Issuer not reported";
 const when=[D.validDate(x.transaction_date)?"traded "+D.date(x.transaction_date):"",D.validDate(x.published_at)?"filed "+D.filedDate(x.published_at)+(lag!==null&&!x.is_amendment?" ("+D.lagWords(lag)+")":""):""].filter(Boolean);
 return '<li class="rd-feed__row'+(st.dropped.has(cik)?" is-dropped":"")+'" data-key="'+E(x.id||x.accession+":"+i)+'" data-owner="'+E(cik)+'" style="--i:'+Math.min(i,8)+'" aria-label="'+E(D.sentence(x,fresh?"New since your last visit.":""))+'">'+
  D.whoTile(x,"md")+
  '<div class="rd-feed__body">'+
   '<p class="rd-feed__l1">'+D.personName(x)+' '+D.badge(x)+' <span class="rd-feed__deal">'+E(d.text)+(v?' <span class="rd-nb">'+E(v)+'</span>':'')+'</span>'+(fresh?" "+D.NEW:"")+'</p>'+
   '<p class="rd-feed__l2"><span class="rd-ent rd-ent--inline">'+D.coTile(x,"sm")+'<span data-ent="company">'+E(co)+'</span></span>'+when.map(w=>' · <span class="rd-nb">'+E(w)+'</span>').join("")+
    // Qualifiers in short form on the second line; the full wording is in the title and the row's label.
    D.qualifiers(x).map(q=>' · <span class="rd-nb" title="'+E(q[1])+'">'+E(q[0])+'</span>').join("")+
    ' · <a class="rd-arrow rd-feed__filing" href="'+E(D.filingHref(x.accession))+'" data-hf-atom aria-label="'+E("Open the filing: "+D.shown(x.owner_name)+", "+(t||co)+", "+D.date(x.transaction_date))+'">Filing ↗</a></p>'+
  '</div>'+
 '</li>';
}
const thirty=p=>{
 const n=Number(p.transactions_30d)||0,b=Number(p.purchases_30d_value)||0,s=Number(p.sales_30d_value)||0;
 if(!n)return "No trades in 30 days"+(p.last_published_at?" · last filed "+D.filedDate(p.last_published_at):"");
 // Grants, exercises and gifts carry no value: say so rather than "bought $0 · sold $0".
 if(!b&&!s)return "30 days: "+D.plural(n,"trade")+", none a priced purchase or sale";
 return "30 days: bought "+D.money(b)+" · sold "+D.money(s)+" in "+D.plural(n,"trade");
};
function listItem(p,i){
 const cik=D.cikOf(p.owner_cik),name=D.shown(p.owner_name||"Reporting person"),t=D.tick(p.ticker);
 const fresh=st.items.filter(x=>D.cikOf(x.owner_cik)===cik&&D.isNew(x)).length;
 st.names.set(cik,name);
 const on=isFollowing(cik);
 return '<li class="rd-fl'+(st.dropped.has(cik)?" is-dropped":"")+'" data-owner="'+E(cik)+'" style="--i:'+Math.min(i,8)+'">'+
  D.personTile(p.owner_name,t,cik,"md")+
  '<div class="rd-fl__body">'+
   '<p class="rd-fl__name"><a data-ent="person" href="'+E(D.personHref(p.owner_name))+'">'+E(name)+'</a></p>'+
   '<p class="rd-fl__meta">'+(t?'<span class="rd-ent rd-ent--inline">'+D.companyTile(t,p.issuer_name,"","sm")+'<span data-ent="company">'+E(t)+'</span></span>':'SEC Form 4')+(fresh?' · <span class="rd-fl__new">'+E(D.count(fresh))+' new</span>':'')+'</p>'+
   '<p class="rd-fl__sum">'+E(thirty(p))+'</p>'+
   followBtn(cik,name,on)+
  '</div>'+
 '</li>';
}
function feedMore(total,shown){
 const el=$("v10-follow-more");if(!el)return;
 el.innerHTML=total>shown?'And '+E(D.plural(total-shown,"more recent trade"))+'. <a href="people.html#v10-follows-title">People you follow ↗</a>':"";
}
function listMore(total,shown){
 const el=$("v10-follow-list-more");if(!el)return;
 el.innerHTML=total>shown?'And '+E(D.plural(total-shown,"more person","more people"))+'. <a href="people.html#v10-follows-title">See everyone you follow ↗</a>':"";
}
const setReserve=()=>{
 const feed=$("v10-follow-feed"),list=$("v10-follow-list");
 feed?.style.setProperty("--rows",String(st.feedRows));
 list?.style.setProperty("--slots",String(st.listSlots));list?.style.setProperty("--slot-rows",String(Math.ceil(st.listSlots/3)));
};
/* Feed rows: the newest filings first, at most the reserved number; people unfollowed in this visit stay, dimmed. */
const feedItems=()=>st.items.slice().sort((a,b)=>String(b.published_at||"").localeCompare(String(a.published_at||""))||String(b.transaction_date||"").localeCompare(String(a.transaction_date||"")));
function drawFeed(animate){
 const host=$("v10-follow-feed");if(!host)return;
 const all=feedItems(),rows=all.slice(0,st.feedRows);
 let html;
 // Following nobody: the feed stays empty (and hidden) below the suggestions until a follow fills it.
 if(!st.followed.size&&!rows.length)html="";
 else if(!rows.length)html='<li class="rd-feed__msg"><p class="rd-empty">None of the people you follow has filed a trade in the imported records yet.</p></li>';
 else html=rows.map(feedRow).join("");
 if(animate)flip(host,()=>{host.innerHTML=html;});else host.innerHTML=html;
 feedMore(all.length,rows.length);
 D.hydrate(host);
}
function drawList(){
 const host=$("v10-follow-list");if(!host)return;
 const people=st.people.slice(0,st.listSlots);
 // Phones show the module's own empty message in the strip (one card, the strip's fixed height); wider screens a short note.
 host.innerHTML=people.length?people.map(listItem).join(""):'<li class="rd-fl__msg"><p class="rd-empty"><span class="rd-wide">Nobody yet. The people you follow appear here, with what they traded in the last 30 days.</span><span class="rd-narrow">'+E(EMPTY_MSG)+'</span></p></li>';
 listMore(st.people.length,people.length);
 label();
 D.hydrate(host);
}
const label=()=>{const l=$("rd-list-label");if(l)l.textContent="Following · "+D.count(Math.max(0,st.following));};

/* FLIP: rows that stay slide from where they were to where they are now, on the dots' spring; new rows rise in. */
function flip(host,render){
 if(D.reduce.matches){render();return;}
 const before=new Map([...host.children].map(el=>[el.dataset.key,el.getBoundingClientRect().top]));
 render();
 const moved=[];
 for(const el of host.children){
  const k=el.dataset.key;
  if(!k)continue;
  if(!before.has(k)){el.classList.add("rd-rise");setTimeout(()=>el.classList.remove("rd-rise"),1300);continue;}
  const dy=before.get(k)-el.getBoundingClientRect().top;
  if(Math.abs(dy)>=1)moved.push([el,dy]);
 }
 for(const [el,dy] of moved){el.style.transition="none";el.style.translate="0 "+Math.round(dy)+"px";}
 if(moved.length)requestAnimationFrame(()=>requestAnimationFrame(()=>{for(const [el] of moved){el.style.transition="translate var(--hf-spring-dur) var(--hf-spring)";el.style.translate="";}setTimeout(()=>{for(const [el] of moved)el.style.transition="";},1000);}));
}

function renderFollow(res){
 const feed=$("v10-follow-feed"),list=$("v10-follow-list");
 for(const el of [feed,list])D.ready(el);
 if(!res.ok){
  // Nothing to keep room for: the message takes the module's width and the reserves collapse.
  st.ok=false;st.feedRows=1;st.listSlots=0;setReserve();
  const box=$("rd-follow");box?.classList.remove("is-unknown","is-empty");box?.classList.add("is-error");
  const e=res.error,msg="Updates from the people you follow could not be loaded: "+String(e.message||"").replace(/\.$/,"")+".";
  if(feed)feed.innerHTML='<li class="rd-feed__msg"><p class="rd-empty rd-empty--error" role="alert">'+E(msg)+(D.canRetry(e)?D.retry("follow"):"")+'</p></li>';
  if(list)list.innerHTML="";
  feedMore(0,0);listMore(0,0);
  live(msg);
  return;
 }
 const v=res.value||{};
 st.ok=true;
 st.people=Array.isArray(v.people)?v.people.filter(p=>D.cikOf(p.owner_cik)):[];
 st.items=Array.isArray(v.items)?v.items:[];
 st.following=Number.isFinite(Number(v.following))?Number(v.following):st.people.length;
 st.followed=new Set(st.people.map(p=>D.cikOf(p.owner_cik)));
 st.dropped.clear();
 // Reserved space: the rows this visit shows (one for the "nothing yet" line, at most eight), kept for the next visit's
 // skeleton. A follow made in place fills that space; anything past it is counted in "and N more".
 st.feedRows=st.following?clamp(st.items.length,1,FEED_MAX):0;
 $("rd-follow")?.classList.toggle("is-empty",!st.following);
 $("rd-follow")?.classList.remove("is-unknown","is-error");
 const empty=$("v10-follow-empty");if(empty&&!st.following)empty.textContent=EMPTY_MSG;
 // The followed list keeps room for six people (three when following nobody), so a follow made here shows up in it.
 st.listSlots=st.following?LIST_MAX:RESERVE;
 D.saveCount("feed",st.feedRows);D.saveCount("list",st.listSlots);D.saveCount("follows",st.following);
 setReserve();
 drawFeed(false);drawList();
 D.arrive(feed);D.arrive(list);
 const fresh=st.items.filter(D.isNew).length;
 live(st.following?D.plural(Math.min(st.items.length,st.feedRows),"latest trade")+" from the "+D.plural(st.following,"person","people")+" you follow"+(fresh?", "+D.count(fresh)+" new since your last visit":"")+".":"You are not following anyone yet.");
}
D.watch(["updates"],r=>D.now(()=>renderFollow(r.updates)));

/* ---------- suggestions ---------- */
let insiders=null;
function rankPeople(trades,known){
 const by=new Map();
 for(const x of trades){
  const cik=D.cikOf(x.owner_cik);if(!cik||st.followed.has(cik))continue;
  const e=by.get(cik)||{owner_cik:cik,owner_name:x.owner_name,ticker:x.ticker,issuer_name:x.issuer_name,issuer_cik:x.issuer_cik,buy:0,sell:0,nb:0,ns:0,lines:0,last:x};
  const k=D.kind(x),v=D.valueOf(x);
  e.lines++;
  if(k==="buy"&&v>0){e.buy+=v;e.nb++;}else if(k==="sell"&&v>0){e.sell+=v;e.ns++;}
  if(String(x.transaction_date||"")>String(e.last.transaction_date||"")){e.last=x;e.ticker=x.ticker;e.issuer_name=x.issuer_name;e.issuer_cik=x.issuer_cik;e.owner_name=x.owner_name;}
  by.set(cik,e);
 }
 const ranked=[...by.values()].sort((a,b)=>(b.buy+b.sell)-(a.buy+a.sell)||b.lines-a.lines);
 // People in /v1/insiders who are not in the window fill the rest, most recently active first.
 for(const p of known||[]){const cik=D.cikOf(p.owner_cik);if(cik&&!st.followed.has(cik)&&!by.has(cik)){by.set(cik,1);ranked.push({owner_cik:cik,owner_name:p.owner_name,ticker:p.ticker,issuer_name:p.issuer_name,buy:0,sell:0,nb:0,ns:0,lines:0,filings:p.filings,lastDate:p.last_transaction_date});}}
 return ranked;
}
const suggestSum=s=>{
 const n=s.nb+s.ns;
 if(s.buy&&s.sell)return "Bought "+D.money(s.buy)+" and sold "+D.money(s.sell)+" in "+D.plural(n,"trade");
 if(s.buy)return "Bought "+D.money(s.buy)+" in "+D.plural(n,"trade");
 if(s.sell)return "Sold "+D.money(s.sell)+" in "+D.plural(n,"trade");
 if(s.lines)return D.plural(s.lines,"filing line")+" in the latest imports, none a priced purchase or sale";
 return (s.lastDate?"Last trade "+D.date(s.lastDate):"Reporting person")+(s.filings?" · "+D.plural(Number(s.filings),"filing")+" imported":"");
};
function suggestCard(s,i){
 const cik=s.owner_cik,name=D.shown(s.owner_name),t=D.tick(s.ticker);st.names.set(cik,name);
 return '<li class="rd-sg" data-owner="'+E(cik)+'" style="--i:'+Math.min(i,8)+'">'+
  D.personTile(s.owner_name,t,cik,"md")+
  '<div class="rd-sg__body">'+
   '<p class="rd-sg__name"><a data-ent="person" href="'+E(D.personHref(s.owner_name))+'">'+E(name)+'</a></p>'+
   '<p class="rd-sg__co">'+(t?'Files for <span class="rd-ent rd-ent--inline">'+D.companyTile(t,s.issuer_name,s.issuer_cik,"sm")+'<span data-ent="company">'+E(t)+'</span></span>'+(s.issuer_name?' · '+E(D.companyName(s.issuer_name)):''):E(s.issuer_name?"Files for "+D.companyName(s.issuer_name):"SEC reporting person"))+'</p>'+
   '<p class="rd-sg__sum">'+E(suggestSum(s))+'</p>'+
   followBtn(cik,name,isFollowing(cik))+
  '</div>'+
 '</li>';
}
function renderSuggest(r,known){
 const host=$("v10-follow-suggest-list"),head=$("v10-follow-suggest-title"),foot=$("v10-follow-suggest-foot"),box=$("v10-follow-suggest");if(!host)return;
 D.ready(host);
 if(!r.updates.ok){box?.classList.add("is-off");host.innerHTML="";if(head)head.textContent="";if(foot)foot.textContent="";return;}
 box?.classList.remove("is-off");
 const trades=r.trades.ok?r.trades.value:[];
 const want=st.following?SUGGEST_MORE:SUGGEST_EMPTY;
 st.suggestions=rankPeople(trades,known?.ok?known.value:null).slice(0,want);
 D.saveCount("suggest",st.suggestions.length);
 box?.classList.toggle("is-compact",!!st.following);
 if(head)head.textContent=st.following?"More people to follow · most active in the latest imports":"Most active in the latest imports";
 host.innerHTML=st.suggestions.length?st.suggestions.map(suggestCard).join(""):
  '<li class="rd-sg__msg"><p class="rd-empty">'+(r.trades.ok?"Nobody new to suggest from the latest imports. Find people by name on the people page.":"Suggestions are unavailable until the latest trades load.")+'</p></li>';
 if(foot)foot.innerHTML='Following is private to your account. <a href="people.html">Find anyone by name ↗</a>';
 D.hydrate(host);D.arrive(host);
}
D.watch(["updates","trades"],async r=>{
 // /v1/insiders only for readers following fewer than three people (one request, reused on retry).
 const F=r.updates.ok?(Number(r.updates.value?.following)||(r.updates.value?.people||[]).length):3;
 let known=null;
 if(F<3){insiders=insiders||D.load("insiders","/v1/insiders",D.items);known=await insiders;}
 D.now(()=>renderSuggest(r,known));
});

/* ---------- follow and unfollow, live ---------- */
function setButtons(cik,on){
 const name=nameOf(cik);
 for(const b of document.querySelectorAll('button[data-follow="'+CSS.escape(cik)+'"]')){
  b.classList.toggle("is-following",on);b.setAttribute("aria-pressed",String(on));b.setAttribute("aria-label",(on?"Unfollow ":"Follow ")+name);b.textContent=on?"Following ✓":"Follow +";
 }
}
const dim=(cik,on)=>{for(const el of document.querySelectorAll('#v10-follow-feed [data-owner="'+CSS.escape(cik)+'"],#v10-follow-list [data-owner="'+CSS.escape(cik)+'"]'))el.classList.toggle("is-dropped",on);};
/* After a follow: the new person takes a free reserved slot in the list (or counts in "and N more"), and the
   feed takes the refreshed rows inside its reserved height, existing rows sliding to their new places. */
async function refreshAfterFollow(cik,fallback){
 let v=null;
 try{v=await D.api("/v1/me/people/updates?limit=40");}catch{/* the follow itself succeeded */}
 if(v&&Array.isArray(v.people)){
  const keep=st.items.filter(x=>st.dropped.has(D.cikOf(x.owner_cik)));
  const fresh=Array.isArray(v.items)?v.items:[];
  const ids=new Set(fresh.map(x=>String(x.id)));
  st.items=[...fresh,...keep.filter(x=>!ids.has(String(x.id)))];
  const person=v.people.find(p=>D.cikOf(p.owner_cik)===cik);
  if(person&&!st.people.some(p=>D.cikOf(p.owner_cik)===cik))st.people.push(person);
  else if(person)st.people=st.people.map(p=>D.cikOf(p.owner_cik)===cik?person:p);
 }else if(fallback&&!st.people.some(p=>D.cikOf(p.owner_cik)===cik)){
  st.people.push({owner_cik:cik,owner_name:fallback.owner_name,ticker:fallback.ticker,issuer_name:fallback.issuer_name,transactions_30d:0});
 }
 st.following=st.followed.size-st.dropped.size;
 // The first follow from the empty state: the feed below the suggestions opens for this person's newest rows
 // (nothing above the pointer moves); the message above keeps its height and says what happened.
 const box=$("rd-follow");
 if(box?.classList.contains("is-empty")&&!st.feedRows){
  st.feedRows=FIRST_ROWS;setReserve();
  const empty=$("v10-follow-empty");
  if(empty){empty.style.minHeight=empty.offsetHeight+"px";empty.textContent="You follow "+D.plural(st.following,"person","people")+" now. Their trades appear under Latest trades, below, marked New until you have seen them.";}
 }
 insertListItem(cik);
 drawFeed(true);
 label();
}
function insertListItem(cik){
 const host=$("v10-follow-list");if(!host)return;
 if(host.querySelector('[data-owner="'+CSS.escape(cik)+'"]')){
  const i=st.people.findIndex(p=>D.cikOf(p.owner_cik)===cik),old=host.querySelector('[data-owner="'+CSS.escape(cik)+'"]');
  if(i>=0&&old){old.outerHTML=listItem(st.people[i],i);D.hydrate(host);}
  return;
 }
 const shown=host.querySelectorAll(".rd-fl").length,i=st.people.findIndex(p=>D.cikOf(p.owner_cik)===cik);
 if(i<0)return;
 if(shown<st.listSlots){
  host.querySelector(".rd-fl__msg")?.remove();
  host.insertAdjacentHTML("beforeend",listItem(st.people[i],shown));
  const el=host.lastElementChild;
  if(el&&!D.reduce.matches){el.classList.add("rd-rise");setTimeout(()=>el.classList.remove("rd-rise"),1300);}
  D.hydrate(host);
 }
 listMore(st.people.length,Math.min(st.people.length,st.listSlots));
}
async function follow(cik,{undo=false}={}){
 if(st.busy.has(cik))return;
 const name=nameOf(cik),wasDropped=st.dropped.has(cik);
 st.busy.add(cik);
 // Optimistic: the button flips at once (with the atom's press), and back if the server refuses.
 st.dropped.delete(cik);setButtons(cik,true);dim(cik,false);
 try{
  await D.api("/v1/me/people",{method:"POST",body:{owner_cik:cik}});
  const known=st.followed.has(cik);st.followed.add(cik);
  status(E(undo?"Following "+name+" again.":"Following "+name+". Their trades now appear under Latest trades."));
  if(!known)await refreshAfterFollow(cik,st.suggestions.find(s=>s.owner_cik===cik));
  else{st.following=st.followed.size-st.dropped.size;label();}
 }catch(e){
  if(wasDropped){st.dropped.add(cik);dim(cik,true);}
  setButtons(cik,isFollowing(cik));
  status(E("Could not follow "+name+": "+String(e.message||"").replace(/\.$/,"")+". Nothing was changed."),{error:true});
 }finally{st.busy.delete(cik);}
}
async function unfollow(cik){
 if(st.busy.has(cik))return;
 const name=nameOf(cik);
 st.busy.add(cik);
 // The person stays where they are, dimmed, until the next visit, so nothing moves under the pointer.
 st.dropped.add(cik);setButtons(cik,false);dim(cik,true);
 try{
  await D.api("/v1/me/people/"+encodeURIComponent(cik),{method:"DELETE"});
  st.following=st.followed.size-st.dropped.size;label();
  status('Unfollowed '+E(name)+'. <button type="button" class="rd-undo" data-undo="'+E(cik)+'" aria-label="'+E("Undo: follow "+name+" again")+'">Undo</button>',{keep:true});
  // Undo stays for 6 s; then the notice goes (focus on Undo returns to the person's button first).
  undoTimer=setTimeout(()=>{const el=$("rd-toast");if(el?.querySelector(`[data-undo="${CSS.escape(cik)}"]`)){const had=el.contains(document.activeElement);el.textContent="";if(had)document.querySelector('#v10-follow-list button[data-follow="'+CSS.escape(cik)+'"]')?.focus({preventScroll:true});}},UNDO_MS);
 }catch(e){
  st.dropped.delete(cik);setButtons(cik,true);dim(cik,false);
  status(E("Could not unfollow "+name+": "+String(e.message||"").replace(/\.$/,"")+". Nothing was changed."),{error:true});
 }finally{st.busy.delete(cik);}
}
document.addEventListener("click",e=>{
 const u=e.target.closest?.("button[data-undo]");
 if(u){const cik=D.cikOf(u.dataset.undo);if(cik){const btn=document.querySelector('#v10-follow-list button[data-follow="'+CSS.escape(cik)+'"]');void follow(cik,{undo:true}).then(()=>btn?.focus({preventScroll:true}));}return;}
 const b=e.target.closest?.("button[data-follow]");if(!b)return;
 const cik=D.cikOf(b.dataset.follow);if(!cik)return;
 if(!st.ok){status(E("Following is unavailable until your followed people load. Use Try again above."),{error:true});return;}
 if(isFollowing(cik))void unfollow(cik);else void follow(cik);
});
})();
