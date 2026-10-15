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
   The feed shows up to 8 rows at first; every other loaded line (up to 40) opens in place under "Show N more trades".
   Follow and unfollow happen in place, with nothing moving under the pointer: the button flips at once
   (optimistic, at a fixed width) and flips back with the reason if the server says no; a new person and their trades
   rise into the space the module already has (6 people, then "and N more"; the feed keeps its height and the rows
   on screen slide on the spring); an unfollowed person dims, with Undo for 6 seconds, and leaves on the next visit.
   Every name opens that person's file (person.html?cik=<owner CIK>, InsidirDesk.personHref), and every headshot tile is
   identified by the owner's CIK with their company's CIK for the logo standing in. A joint filing's line (several
   reporting owners, owner_cik null, owners listed) belongs to every followed person it lists: it is shown under them
   ("Stephen A. Schwarzman and 9 others"), counts in their "N new" and in Today, and dims when they are unfollowed.
   Every list renders once per load (or per "Try again"). */
(() => {"use strict";
const D=window.InsidirDesk;if(!D)return;
const $=id=>document.getElementById(id),E=D.E;
const FEED_MAX=8,LIST_MAX=6,RESERVE=3,SUGGEST_EMPTY=6,SUGGEST_MORE=4,UNDO_MS=6000,FIRST_ROWS=3;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const st={ok:false,people:[],items:[],following:0,followed:new Set(),dropped:new Set(),names:new Map(),feedRows:RESERVE,listSlots:RESERVE,suggestions:[],busy:new Set()};
const nameOf=cik=>st.names.get(cik)||"this person";
/* One form per person on this page: the 10-digit SEC CIK the API answers with ("1214156" and "0001214156" are one
   person), so the follow set, the buttons, the rows and the list always match. */
const canon=c=>{const b=D.bareCik(c);return b&&b.length<=10?b.padStart(10,"0"):"";};
/* The followed people a line belongs to (canonical CIKs, in filing order): its own owner, or for a joint filing
   (owner_cik null, owners listed) every listed owner the reader follows. The server sends a joint line once even when
   it lists two followed people, so it counts for each of them. */
function followedIn(x,set=st.followed){
 const own=canon(x?.owner_cik);
 if(own)return set.has(own)?[own]:[];
 const out=[];for(const o of D.owners(x)){const k=canon(o.cik);if(k&&set.has(k)&&!out.includes(k))out.push(k);}
 return out;
}
const follows=c=>st.followed.has(canon(c));
// A feed row dims when every followed person it belongs to was unfollowed in this visit.
const rowDropped=keys=>keys.length>0&&keys.every(k=>st.dropped.has(k));
const EMPTY_MSG="You are not following anyone yet. Follow an insider and every trade they file appears here, marked New until you have seen it.";

/* ================= Today ================= */
const line=(id,html)=>{const el=$(id);if(!el)return;el.innerHTML=html;el.classList.remove("is-skeleton");el.removeAttribute("aria-busy");rememberToday();};
/* Once all three lines are in, their heights at this width are kept for the next visit's skeleton (dashboard.html):
   each measured with the stylesheet's reserve (room for the longest usual sentence at this width) but without the height
   kept from earlier visits, and saved as the largest seen at this width. The sentence changes from visit to visit by
   design ("You follow 5 people…", then "Since your last visit…"), so a short one never shrinks the room a long one needs. */
let todayTimer=0;
function rememberToday(){
 clearTimeout(todayTimer);
 todayTimer=setTimeout(()=>D.later(9,()=>{
  const els=["rd-today-you","rd-today-market","rd-today-fresh"].map($);
  if(els.some(el=>!el||el.classList.contains("is-skeleton")))return;
  // Measured without the kept height, which is put back in the same frame (nothing paints in between).
  const kept=els.map(el=>[el.style.getPropertyValue("min-height"),el.style.getPropertyPriority("min-height")]);
  const h=els.map(el=>{el.style.removeProperty("min-height");return el.getBoundingClientRect().height;});
  els.forEach((el,i)=>{if(kept[i][0])el.style.setProperty("min-height",kept[i][0],kept[i][1]);});
  const prev=D.counts.today,same=prev&&typeof prev==="object"&&Math.abs(Number(prev.w)-innerWidth)<24,was=k=>same?Number(prev[k])||0:0;
  D.saveCount("today",{w:innerWidth,you:Math.max(Math.ceil(h[0]),was("you")),market:Math.max(Math.ceil(h[1]),was("market")),fresh:Math.max(Math.ceil(h[2]),was("fresh"))});
 }),200);
}
/* What changed for this reader. The watchlist part counts the companies whose row in 02 carries a New marker (its latest
   purchase or sale, after the same per-ticker lookups), so the sentence and the markers below always agree. */
let youToken=0;
function todayYou(r){
 const token=++youToken;
 return D.watchNew(r).then(w=>{
  if(token!==youToken)return;
  const W=w.watched,newWatch=w.fresh;
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
     // People counted by who they are (a joint line counts for every followed owner it lists), never by a null CIK.
     const set=new Set(people.map(p=>canon(p.owner_cik)).filter(Boolean));
     const fresh=items.filter(D.isNew),k=new Set(fresh.flatMap(x=>followedIn(x,set))).size;
     text=fresh.length?"Since your last visit on "+when+": "+D.plural(fresh.length,"new trade")+" from "+(F===1||!k?them:D.count(Math.min(k,F))+" of "+them)+"."+watchAdd
      :"Nothing new from "+them+" since your last visit on "+when+"."+watchAdd;
    }
   }
   else if(!W)text="Follow insiders or save companies below. This line will then tell you what they filed since your last visit.";
   else if(!seen)text="You watch "+D.plural(W,"company","companies")+". Trades filed there from now on are marked New.";
   else text=newWatch?"Since your last visit on "+when+": "+(newWatch===1?"1 company":D.count(newWatch)+" of the "+D.count(W)+" companies")+" on your watchlist "+(newWatch===1?"has":"have")+" new trades."
    :"Nothing new at the "+D.plural(W,"company","companies")+" on your watchlist since your last visit on "+when+".";
  }
  line("rd-today-you",E(text));
 });
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
 line("rd-today-fresh",'<span class="rd-seq">'+D.seq(parts.map((t,i)=>E(t+(i===parts.length-1?".":""))))+'</span>');
}
D.watch(["updates","watchlist","trades"],r=>D.now(()=>{void todayYou(r);}));
D.watch(["trades"],r=>D.now(()=>todayMarket(r)));
D.watch(["status","filing"],r=>D.now(()=>todayFresh(r)));

/* ================= 01 People you follow ================= */
const live=text=>{const el=$("v10-follow-live");if(el)el.textContent=text;};
const followBtn=(cik,name,on)=>'<button type="button" class="v10-follow-btn'+(on?" is-following":"")+'" data-follow="'+E(cik)+'" aria-pressed="'+on+'" aria-label="'+E((on?"Unfollow ":"Follow ")+name)+'">'+(on?"Following ✓":"Follow +")+'</button>';
const isFollowing=cik=>st.followed.has(cik)&&!st.dropped.has(cik);

/* A feed row: two lines of fixed height on wide screens, a four-line record on phones. Line 1 is the person, the badge
   (word and code) and the deal without a verb, since the badge says it: "Elon Musk [▲ Bought · P] 150,000 TSLA shares at
   $249.00 = $37,350,000 [New]". */
const keyOf=x=>String(x.id??[x.accession,x.owner_cik,x.transaction_date,x.transaction_code,x.shares,x.security_title].join("|"));
/* A joint filing's row is shown under the followed person it lists (their name first, their headshot, "and N others"
   for the rest), and data-owner lists every followed person it belongs to, so their New count, Today's count and the
   dimming after an unfollow all include it. */
function feedRow(x,i){
 const who=followedIn(x),t=D.tick(x.ticker),d=D.describe(x),v=D.valueText(x),lag=D.lagOf(x),fresh=D.isNew(x),opts={follows};
 const co=t?(x.issuer_name?D.companyName(x.issuer_name):t):D.companyName(x.issuer_name)||"Issuer not reported";
 const when=[D.validDate(x.transaction_date)?"traded "+D.date(x.transaction_date):"",D.validDate(x.published_at)?"filed "+D.filedDate(x.published_at)+(lag!==null&&!x.is_amendment?" ("+D.lagWords(lag)+")":""):""].filter(Boolean);
 return '<li class="rd-feed__row'+(rowDropped(who)?" is-dropped":"")+'" data-key="'+E(keyOf(x))+'" data-owner="'+E(who.join(" "))+'" style="--i:'+Math.min(i,8)+'" aria-label="'+E(D.sentence(x,fresh?"New since your last visit.":"",opts))+'">'+
  D.whoTile(x,"md",opts)+
  '<div class="rd-feed__body">'+
   '<p class="rd-feed__l1">'+D.personName(x,opts)+' '+D.badge(x)+' <span class="rd-feed__deal">'+E(d.short)+(v?' <span class="rd-nb">'+E(v)+'</span>':'')+'</span>'+(fresh?" "+D.NEW:"")+'</p>'+
   // Line 2 is a run of facts (.rd-seq): each fact after the first carries its " · " and wraps with it, so a wrapped line
   // never starts or ends on a separator (v13-dashboard.css). The text reads the same as plain " · " joins.
   '<p class="rd-feed__l2 rd-seq"><span class="rd-bit rd-bit--first"><span class="rd-ent rd-ent--inline">'+D.coTile(x,"sm")+'<span data-ent="company">'+E(co)+'</span></span></span>'+when.map(w=>'<span class="rd-bit"><span class="rd-sep"> · </span><span class="rd-nb">'+E(w)+'</span></span>').join("")+
    // Qualifiers in short form on the second line; the full wording is in the title and the row's label.
    D.qualifiers(x).map(q=>'<span class="rd-bit"><span class="rd-sep"> · </span><span class="rd-nb" title="'+E(q[1])+'">'+E(q[0])+'</span></span>').join("")+
    '<span class="rd-bit"><span class="rd-sep"> · </span><a class="rd-arrow rd-feed__filing" href="'+E(D.filingHref(x.accession))+'" data-hf-atom aria-label="'+E("Open the filing: "+D.ownerLabel(x,opts)+", "+(t||co)+", "+D.date(x.transaction_date))+'">Filing ↗</a></span></p>'+
  '</div>'+
 '</li>';
}
// The last 30 days as the parts of a " · " run (D.seq), so a wrapped line never ends on the separator.
const thirty=p=>{
 const n=Number(p.transactions_30d)||0,b=Number(p.purchases_30d_value)||0,s=Number(p.sales_30d_value)||0;
 if(!n)return ["No trades in 30 days",p.last_published_at?"last filed "+D.filedDate(p.last_published_at):""];
 // Grants, exercises and gifts carry no value: say so rather than "bought $0 · sold $0".
 if(!b&&!s)return ["30 days: "+D.plural(n,"trade")+", none a priced purchase or sale"];
 return ["30 days: bought "+D.money(b),"sold "+D.money(s)+" in "+D.plural(n,"trade")];
};
/* The company a followed person last filed for, by SEC CIK (the list row carries a ticker and a name only): from their
   newest loaded line, for the logo standing in for a missing headshot and for an issuer with no ticker. */
const issuerOf=(p,cik)=>D.cikOf(p.issuer_cik)||D.cikOf(p.last?.issuer_cik)||D.cikOf(st.items.find(x=>followedIn(x).includes(cik)&&(!D.tick(p.ticker)||D.tick(x.ticker)===D.tick(p.ticker)))?.issuer_cik);
function listItem(p,i){
 const cik=canon(p.owner_cik),name=D.shown(p.owner_name||"Reporting person"),t=D.tick(p.ticker),ic=issuerOf(p,cik);
 // Their new lines, joint filings included.
 const fresh=st.items.filter(x=>D.isNew(x)&&followedIn(x).includes(cik)).length;
 st.names.set(cik,name);
 const on=isFollowing(cik);
 return '<li class="rd-fl'+(st.dropped.has(cik)?" is-dropped":"")+'" data-owner="'+E(cik)+'" style="--i:'+Math.min(i,8)+'">'+
  D.personTile(p.owner_name,t,cik,"md",ic)+
  '<div class="rd-fl__body">'+
   '<p class="rd-fl__name"><a data-ent="person" href="'+E(D.personHref(p.owner_name,cik))+'">'+E(name)+'</a></p>'+
   '<p class="rd-fl__meta">'+(t?'<span class="rd-ent rd-ent--inline">'+D.companyTile(t,p.issuer_name,ic,"sm")+'<span data-ent="company">'+E(t)+'</span></span>':'SEC Form 4')+(fresh?' · <span class="rd-fl__new">'+E(D.count(fresh))+' new</span>':'')+'</p>'+
   '<p class="rd-fl__sum rd-seq">'+D.seq(thirty(p).filter(Boolean).map(t=>E(t)))+'</p>'+
   followBtn(cik,name,on)+
  '</div>'+
 '</li>';
}
/* Under the feed: every loaded line is reachable here. "Show N more trades" opens the rest in place, below the button. */
const FEED_LIMIT=40;
function feedMore(total,shown){
 const el=$("v10-follow-more");if(!el)return;
 el.innerHTML=total>shown?'<button type="button" class="rd-more-btn" data-feed-more data-hf-atom>Show '+E(D.plural(total-shown,"more trade"))+'</button>':
  total>=FEED_LIMIT&&shown>=total?E("These are the latest "+D.count(total)+" trades from the people you follow."):"";
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
/* Feed rows: the newest filings first (ISO timestamps compare as text, with no collator), at most the reserved number;
   people unfollowed in this visit stay, dimmed. */
const desc=(a,b)=>a>b?-1:a<b?1:0;
const feedItems=()=>st.items.slice().sort((a,b)=>desc(String(a.published_at||""),String(b.published_at||""))||desc(String(a.transaction_date||""),String(b.transaction_date||"")));
const rise=(el,i=0)=>{if(!el||D.reduce.matches)return;el.style.setProperty("--d",String(Math.min(i,8)));el.classList.add("rd-rise");setTimeout(()=>el.classList.remove("rd-rise"),1300+Math.min(i,8)*40);};
function drawFeed(animate){
 const host=$("v10-follow-feed");if(!host)return;
 const all=feedItems(),rows=all.slice(0,st.feedRows);
 let shown=rows.length;
 if(!st.followed.size&&!rows.length)host.innerHTML=""; // following nobody: the feed stays empty (and hidden) until a follow fills it
 else if(!rows.length)host.innerHTML='<li class="rd-feed__msg"><p class="rd-empty">None of the people you follow has filed a trade in the imported records yet.</p></li>';
 else if(animate&&host.querySelector(":scope>.rd-feed__row"))shown=reconcile(host,rows);
 else{
  host.innerHTML=rows.map(feedRow).join("");
  // The first follow from the empty state: the rows rise into the space opened below the suggestions, a beat apart.
  if(animate)[...host.children].forEach(rise);
 }
 feedMore(all.length,shown);
 D.hydrate(host);
}
/* After a follow: rows already on screen are kept (their pictures and New markers are not drawn again) and slide to
   their new places on the dots' spring; the new person's rows are inserted and rise in. The feed keeps the height it
   had, showing as many of the newest rows as fit, so nothing below it (the suggestion just pressed) moves; the rest
   are counted in "Show N more trades". */
function reconcile(host,rows){
 const lock=host.getBoundingClientRect().height,old=new Map(),before=new Map();
 for(const el of host.querySelectorAll(":scope>.rd-feed__row")){old.set(el.dataset.key,el);before.set(el.dataset.key,el.getBoundingClientRect().top);}
 host.querySelectorAll(":scope>:not(.rd-feed__row)").forEach(el=>el.remove());
 const want=new Set(rows.map(keyOf));
 for(const [k,el] of old)if(!want.has(k))el.remove();
 const tpl=document.createElement("template"),added=[];
 rows.forEach((x,i)=>{
  const k=keyOf(x);let el=old.get(k);
  if(el)el.classList.toggle("is-dropped",rowDropped(followedIn(x)));
  else{tpl.innerHTML=feedRow(x,i);el=tpl.content.firstElementChild;added.push(el);}
  if(host.children[i]!==el)host.insertBefore(el,host.children[i]||null);
 });
 host.style.setProperty("min-height",lock+"px","important");
 let shown=rows.length;
 while(shown>1&&host.getBoundingClientRect().height>lock+0.5){host.lastElementChild.remove();shown--;}
 if(D.reduce.matches)return shown;
 const moved=[];
 for(const el of host.children){
  const k=el.dataset.key;
  if(!before.has(k))continue;
  const dy=before.get(k)-el.getBoundingClientRect().top;
  if(Math.abs(dy)>=1)moved.push([el,dy]);
 }
 // Written with priority: the stylesheet's own transition (background, opacity) is !important too.
 for(const [el,dy] of moved){el.style.setProperty("transition","none","important");el.style.setProperty("translate","0 "+dy+"px","important");}
 added.filter(el=>el.isConnected).forEach((el,i)=>rise(el,i));
 if(moved.length)requestAnimationFrame(()=>requestAnimationFrame(()=>{
  for(const [el] of moved){el.style.setProperty("transition","translate var(--hf-spring-dur) var(--hf-spring)","important");el.style.removeProperty("translate");}
  setTimeout(()=>{for(const [el] of moved)el.style.removeProperty("transition");},1100);
 }));
 return shown;
}
/* "Show N more trades": the rest of the loaded lines, appended below the rows on screen; they rise a beat apart and
   keyboard focus continues at the first of them. */
function expandFeed(){
 const host=$("v10-follow-feed");if(!host)return;
 const all=feedItems(),from=host.querySelectorAll(":scope>.rd-feed__row").length;
 if(from>=all.length)return;
 st.feedRows=Math.max(st.feedRows,all.length);
 host.insertAdjacentHTML("beforeend",all.slice(from).map((x,i)=>feedRow(x,from+i)).join(""));
 const added=[...host.children].slice(from);
 added.forEach(rise);
 feedMore(all.length,all.length);
 D.hydrate(host);
 added[0]?.querySelector("a[href]")?.focus({preventScroll:true});
 live("Showing all "+D.plural(all.length,"latest trade")+" from the people you follow.");
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
 st.people=Array.isArray(v.people)?v.people.filter(p=>canon(p.owner_cik)):[];
 st.items=Array.isArray(v.items)?v.items:[];
 st.following=Number.isFinite(Number(v.following))?Number(v.following):st.people.length;
 st.followed=new Set(st.people.map(p=>canon(p.owner_cik)));
 st.dropped.clear();
 // Reserved space: the rows this visit shows first (one for the "nothing yet" line, at most eight), kept for the next
 // visit's skeleton. A follow made in place fills that space; anything past it opens under "Show N more trades".
 st.feedRows=st.following?clamp(st.items.length,1,FEED_MAX):0;
 $("rd-follow")?.classList.toggle("is-empty",!st.following);
 $("rd-follow")?.classList.remove("is-unknown","is-error");
 const empty=$("v10-follow-empty");if(empty&&!st.following){empty.style.removeProperty("min-height");empty.textContent=EMPTY_MSG;}
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
  const cik=canon(x.owner_cik);if(!cik||st.followed.has(cik))continue;
  const e=by.get(cik)||{owner_cik:cik,owner_name:x.owner_name,ticker:x.ticker,issuer_name:x.issuer_name,issuer_cik:x.issuer_cik,buy:0,sell:0,nb:0,ns:0,lines:0,last:x};
  const k=D.kind(x),v=D.valueOf(x);
  e.lines++;
  if(k==="buy"&&v>0){e.buy+=v;e.nb++;}else if(k==="sell"&&v>0){e.sell+=v;e.ns++;}
  if(String(x.transaction_date||"")>String(e.last.transaction_date||"")){e.last=x;e.ticker=x.ticker;e.issuer_name=x.issuer_name;e.issuer_cik=x.issuer_cik;e.owner_name=x.owner_name;}
  by.set(cik,e);
 }
 const ranked=[...by.values()].sort((a,b)=>(b.buy+b.sell)-(a.buy+a.sell)||b.lines-a.lines);
 // People in /v1/insiders who are not in the window fill the rest, most recently active first.
 for(const p of known||[]){const cik=canon(p.owner_cik);if(cik&&!st.followed.has(cik)&&!by.has(cik)){by.set(cik,1);ranked.push({owner_cik:cik,owner_name:p.owner_name,ticker:p.ticker,issuer_name:p.issuer_name,issuer_cik:p.issuer_cik,buy:0,sell:0,nb:0,ns:0,lines:0,filings:p.filings,lastDate:p.last_transaction_date});}}
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
  D.personTile(s.owner_name,t,cik,"md",s.issuer_cik)+
  '<div class="rd-sg__body">'+
   '<p class="rd-sg__name"><a data-ent="person" href="'+E(D.personHref(s.owner_name,cik))+'">'+E(name)+'</a></p>'+
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
 if(foot)foot.innerHTML='Following is private to your account. <a href="people.html">Find anyone by name →</a>';
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
/* The person's list entry dims or not; a feed row (data-owner lists every followed person it belongs to, so a joint
   filing's row too) dims only while all of them are unfollowed. Called after st.dropped has changed. */
const dim=(cik,on)=>{
 for(const el of document.querySelectorAll('#v10-follow-list [data-owner="'+CSS.escape(cik)+'"]'))el.classList.toggle("is-dropped",on);
 for(const el of document.querySelectorAll('#v10-follow-feed [data-owner~="'+CSS.escape(cik)+'"]'))el.classList.toggle("is-dropped",rowDropped(el.dataset.owner.split(" ").filter(Boolean)));
};
/* The message above the suggestions (a reader who followed nobody at load) says how many people they follow now, after
   every follow and unfollow; it keeps the height it had, so nothing below it moves. */
function updateEmpty(){
 const el=$("v10-follow-empty");if(!el||!$("rd-follow")?.classList.contains("is-empty"))return;
 D.keepHeight(el);
 el.textContent=st.following>0?"You follow "+D.plural(st.following,"person","people")+" now. Their trades appear under Latest trades, below, marked New until you have seen them."
  :"You are not following anyone now. Follow an insider and every trade they file appears here, marked New until you have seen it.";
}
/* After a follow: the new person takes a free reserved slot in the list (or counts in "and N more"), and the
   feed takes the refreshed rows inside the height it has, rows on screen sliding to their new places. */
async function refreshAfterFollow(cik,fallback){
 let v=null;
 try{v=await D.api("/v1/me/people/updates?limit=40");}catch{/* the follow itself succeeded */}
 if(v&&Array.isArray(v.people)){
  // Rows of people unfollowed in this visit stay (dimmed) until the next one; the server no longer sends them.
  const keep=st.items.filter(x=>followedIn(x).some(k=>st.dropped.has(k)));
  const fresh=Array.isArray(v.items)?v.items:[];
  const ids=new Set(fresh.map(keyOf));
  st.items=[...fresh,...keep.filter(x=>!ids.has(keyOf(x)))];
  const person=v.people.find(p=>canon(p.owner_cik)===cik);
  if(person&&!st.people.some(p=>canon(p.owner_cik)===cik))st.people.push(person);
  else if(person)st.people=st.people.map(p=>canon(p.owner_cik)===cik?person:p);
 }else if(fallback&&!st.people.some(p=>canon(p.owner_cik)===cik)){
  st.people.push({owner_cik:cik,owner_name:fallback.owner_name,ticker:fallback.ticker,issuer_name:fallback.issuer_name,issuer_cik:fallback.issuer_cik,transactions_30d:0});
 }
 st.following=st.followed.size-st.dropped.size;
 // The first follow from the empty state: the feed below the suggestions opens for this person's newest rows
 // (nothing above the pointer moves).
 if($("rd-follow")?.classList.contains("is-empty")&&!st.feedRows){st.feedRows=FIRST_ROWS;setReserve();}
 updateEmpty();
 insertListItem(cik);
 drawFeed(true);
 label();
}
function insertListItem(cik){
 const host=$("v10-follow-list");if(!host)return;
 if(host.querySelector('[data-owner="'+CSS.escape(cik)+'"]')){
  const i=st.people.findIndex(p=>canon(p.owner_cik)===cik),old=host.querySelector('[data-owner="'+CSS.escape(cik)+'"]');
  if(i>=0&&old){old.outerHTML=listItem(st.people[i],i);D.hydrate(host);}
  return;
 }
 const shown=host.querySelectorAll(".rd-fl").length,i=st.people.findIndex(p=>canon(p.owner_cik)===cik);
 if(i<0)return;
 if(shown<st.listSlots){
  host.querySelector(".rd-fl__msg")?.remove();
  host.insertAdjacentHTML("beforeend",listItem(st.people[i],shown));
  rise(host.lastElementChild);
  D.hydrate(host);
 }
 listMore(st.people.length,Math.min(st.people.length,st.listSlots));
}
const reason=e=>String(e?.message||"").replace(/\.$/,"");
async function follow(cik,{undo=false,near=null}={}){
 if(st.busy.has(cik))return;
 const name=nameOf(cik),wasDropped=st.dropped.has(cik);
 st.busy.add(cik);
 // Optimistic: the button flips at once (with the atom's press), and back if the server refuses.
 st.dropped.delete(cik);setButtons(cik,true);dim(cik,false);
 try{
  await D.api("/v1/me/people",{method:"POST",body:{owner_cik:cik}});
  const known=st.followed.has(cik);st.followed.add(cik);
  D.toast(E(undo?"Following "+D.endName(name)+" again.":"Following "+D.endName(name)+". Their trades now appear under Latest trades."),{near});
  if(!known)await refreshAfterFollow(cik,st.suggestions.find(s=>s.owner_cik===cik));
  else{st.following=st.followed.size-st.dropped.size;label();updateEmpty();}
 }catch(e){
  if(wasDropped){st.dropped.add(cik);dim(cik,true);}
  setButtons(cik,isFollowing(cik));
  D.toast(E("Could not follow "+name+": "+reason(e)+". Nothing was changed."),{error:true,near});
 }finally{st.busy.delete(cik);}
}
async function unfollow(cik,{near=null}={}){
 if(st.busy.has(cik))return;
 const name=nameOf(cik);
 st.busy.add(cik);
 // The person stays where they are, dimmed, until the next visit, so nothing moves under the pointer.
 st.dropped.add(cik);setButtons(cik,false);dim(cik,true);
 try{
  await D.api("/v1/me/people/"+encodeURIComponent(cik),{method:"DELETE"});
  st.following=st.followed.size-st.dropped.size;label();updateEmpty();
  // Undo stays for 6 s, and for as long as keyboard focus is on it.
  D.toast('Unfollowed '+E(D.endName(name))+'. <button type="button" class="rd-undo" data-undo="'+E(cik)+'" aria-label="'+E("Undo: follow "+name+" again")+'">Undo</button>',{ms:UNDO_MS,near});
 }catch(e){
  st.dropped.delete(cik);setButtons(cik,true);dim(cik,false);
  D.toast(E("Could not unfollow "+name+": "+reason(e)+". Nothing was changed."),{error:true,near});
 }finally{st.busy.delete(cik);}
}
document.addEventListener("click",e=>{
 if(e.target.closest?.("button[data-feed-more]")){expandFeed();return;}
 const u=e.target.closest?.("button[data-undo]");
 if(u){const cik=canon(u.dataset.undo);if(cik){const btn=document.querySelector('#v10-follow-list button[data-follow="'+CSS.escape(cik)+'"]')||document.querySelector('button[data-follow="'+CSS.escape(cik)+'"]');void follow(cik,{undo:true,near:btn}).then(()=>btn?.focus({preventScroll:true}));}return;}
 const b=e.target.closest?.("button[data-follow]");if(!b)return;
 const cik=canon(b.dataset.follow);if(!cik)return;
 if(!st.ok){D.toast(E("Following is unavailable until your followed people load. Use Try again above."),{error:true,near:b});return;}
 if(isFollowing(cik))void unfollow(cik,{near:b});else void follow(cik,{near:b});
});
})();
