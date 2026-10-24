/* An insider's page (person.html?cik=<SEC CIK>, with or without leading zeros). Built only from public SEC records:
   GET /v1/people/<cik>?limit=500 (src/person-profile.mjs): the person as filed, the companies they report for with the
   role in their latest Form 4 there, every imported line (joint filings name their co-owners), the filings, and the
   other issuers EDGAR lists. A CIK with no imported Form 4 answers with the SEC's own filing index
   (coverage "sec_submissions_history_only"), shown as a list.

   The header is the stock page's: their photo from the media pipeline (UI.face, initials when none), the name, the role at each company (each linked to its
   stock page), Follow and the SEC EDGAR record. Then the totals, and tabs that load when first opened:
     Trades        every line in plain English (form4-words.js describe()), each amount linked to its filing
     Track record  GET /v1/people/<cik>/track-record (src/track-record.mjs): returns 1, 3 and 6 months after each buy and sale
     Companies     the issuers, the other issuers EDGAR lists, and the people they filed jointly with
     Filings       the Form 4s, each opening in the in-app filing view
     Changes       GET /v1/entities/<cik>/changes?days= (src/changes.mjs)
     Connections   GET /v1/entities/<cik>/connections as the radial graph (graph.js)
   Follow: GET /v1/me/people (is this person followed), POST /v1/me/people, DELETE /v1/me/people/<cik> (every stored form),
   with Undo; once followed, their alert mode and pause (GET /v1/me/follows, POST /v1/me/follows/settings).
   ui.js api() sends 401 to sign in and 402 to subscribe. */
(()=>{"use strict";
const UI=window.InsidirUI,F=window.InsidirForm4;if(!UI||!F)return;
const {api,filingHref,fmt,esc,logo,hydrateLogos,face,enter}=UI;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const PAGE=25,LIMIT=500;

/* ---------- identifiers and links ---------- */
const cikOf=x=>{const s=String(x??"").trim();return /^\d{1,10}$/.test(s)&&/[1-9]/.test(s)?s:"";};
const bare=c=>String(c??"").replace(/^0+/,"");
const pad10=c=>bare(c).padStart(10,"0");
const sameCik=(a,b)=>!!cikOf(a)&&!!cikOf(b)&&Number(a)===Number(b);
const tick=F.tick;
const accOf=x=>{const s=String(x||"").replace(/-/g,"");return /^\d{18}$/.test(s)?s:"";};
const secUrl=v=>{try{const u=new URL(String(v||""));return u.protocol==="https:"&&!u.username&&(u.hostname==="sec.gov"||u.hostname.endsWith(".sec.gov"))?u.href:"";}catch{return "";}};
// A filing: the in-app view by accession, else its own SEC.gov address; "" when neither is known.
const fileHref=(url,acc)=>filingHref(secUrl(url),accOf(acc));
const coHref=t=>"/company.html?ticker="+encodeURIComponent(t);
const personHref=(cik,name)=>cikOf(cik)?"/person.html?cik="+bare(cik):"/people.html?q="+encodeURIComponent(String(name||"").replace(/\s+/g," ").trim().slice(0,80))+"#v10-directory";
const ext=(href,text,cls="pp-link")=>`<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text} <span aria-hidden="true">↗</span></a>`;
const plural=(n,one,many)=>Number(n).toLocaleString("en-US")+" "+(Number(n)===1?one:(many||one+"s"));
const cap=s=>String(s||"").charAt(0).toUpperCase()+String(s||"").slice(1);
const dayOf=v=>fmt.date(v)||"";
const failed=(el,what,retry)=>{el.innerHTML=`<div class="err"><p>${esc(what)} didn't load.</p>${retry?'<button class="btn btn--secondary" type="button">Try again</button>':""}</div>`;el.querySelector("button")?.addEventListener("click",retry);};
const quiet=(el,h,p)=>{el.innerHTML=`<div class="empty"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;};

const rawCik=(new URLSearchParams(location.search).get("cik")||"").trim();
const askedCik=cikOf(rawCik);
let file=null,personCik=askedCik,personName="this person",rows=[],filings=[],companies=[];

/* ---------- states ---------- */
function showState(kind,message){
 const box=$("[data-pp-state]"),cik=askedCik?bare(askedCik):"";
 const people=`<a class="btn btn--secondary" href="/people.html">Search people</a>`;
 let h,p,extra="";
 if(kind==="badcik"){h="No insider in this address";p=rawCik?`“${rawCik.slice(0,40)}” is not an SEC CIK. An insider's page opens by their SEC CIK, up to 10 digits.`:"An insider's page opens by their SEC CIK, up to 10 digits. Search for a name instead.";extra=people;}
 else if(kind==="missing"){
  const why=String(message||"").trim();
  h="No imported filings for CIK "+cik;
  p=(/joint/i.test(why)?why.replace(/\.?$/,". "):"")+"Insidir builds this page from the Form 4 filings it has imported. SEC EDGAR lists every filing under this CIK.";
  extra=people+ext("https://www.sec.gov/cgi-bin/own-disp?action=getowner&CIK="+pad10(cik),"Look up on SEC EDGAR","btn btn--ghost");}
 else{h="This page didn't load";p=String(message||"Something went wrong").replace(/\.?$/,".");extra='<button class="btn btn--primary" type="button" data-pp-retry>Try again</button>'+people;}
 box.innerHTML=`<h1 class="t-title">${esc(h)}</h1><p class="t-body muted">${esc(p)}</p><div class="pp-state__acts">${extra}</div>`;
 box.hidden=false;$("[data-pp]").hidden=true;
 box.querySelector("[data-pp-retry]")?.addEventListener("click",e=>{e.currentTarget.disabled=true;e.currentTarget.textContent="Loading…";load();});
 if(kind!=="error")document.title="No insider found — Insidir";
}

/* ---------- joint filings ---------- */
const isJoint=x=>x&&(x.owner_cik===null||x.owner_cik===undefined||x.owner_cik==="");
const myNames=()=>new Set([file?.person?.name,...(Array.isArray(file?.person?.filed_names)?file.person.filed_names:[])].map(n=>String(n||"").replace(/\s+/g," ").trim().toUpperCase()).filter(Boolean));
// The other reporting owners of a joint line: owners [{cik,name}] when the engine sends them, else the names filed on it.
function jointWith(x){
 if(Array.isArray(x.owners)&&x.owners.length)return x.owners.filter(o=>o&&!sameCik(o.cik,personCik)&&!(o.name&&!cikOf(o.cik)&&myNames().has(String(o.name).replace(/\s+/g," ").trim().toUpperCase()))).map(o=>({name:String(o.name||"").trim(),cik:cikOf(o.cik)})).filter(o=>o.name||o.cik);
 const mine=myNames(),all=String(x.owner_name||"").split(/\s*,\s*/).map(n=>n.replace(/\s+/g," ").trim()).filter(Boolean);
 const others=all.filter(n=>!mine.has(n.toUpperCase()));
 return (others.length<all.length?others:[]).map(name=>({name,cik:""}));
}
const ownerLink=o=>`<a class="pp-link" href="${esc(personHref(o.cik,o.name))}">${esc(o.name?fmt.person(o.name):"CIK "+bare(o.cik))}</a>`;

/* ---------- the header ---------- */
const roleList=r=>{const a=Array.isArray(r)?r:String(r||"").split(/\s*[·;]\s*/);return [...new Set(a.map(s=>String(s||"").replace(/\s+/g," ").trim().slice(0,80)).filter(Boolean))];};
let latestForm=new Map();
const issuerKeys=o=>[cikOf(o?.issuer_cik)?"c:"+Number(o.issuer_cik):"",tick(o?.ticker)?"t:"+tick(o.ticker):""].filter(Boolean);
function indexFilings(){
 latestForm=new Map();
 const byPub=[...rows].sort((a,b)=>String(b.published_at||"").localeCompare(String(a.published_at||"")));
 for(const f of [...filings,...byPub]){const a=accOf(f.accession);if(a)for(const k of issuerKeys(f))if(!latestForm.has(k))latestForm.set(k,{acc:a,url:f.source_url});}
}
const latestOf=c=>{for(const k of issuerKeys(c)){const a=latestForm.get(k);if(a)return a;}return null;};
const coName=c=>fmt.company(c?.issuer_name)||tick(c?.ticker)||"Issuer CIK "+bare(c?.issuer_cik||"");
// The role as filed; when the answer has none, the latest Form 4 there states it.
function rolesHtml(c){
 const r=roleList(c?.roles);if(r.length)return esc(r.join(", "));
 const l=latestOf(c),h=l?fileHref(l.url,l.acc):"";
 return h?`Role stated in <a class="pp-link" href="${esc(h)}">their latest Form 4</a>`:"Reports insider trades";
}
const coLink=c=>{const t=tick(c.ticker),inner=`${logo(t,24,c.issuer_name)}<span>${esc(coName(c))}</span>`;return t?`<a class="pp-co" href="${coHref(t)}">${inner}</a>`:`<span class="pp-co">${inner}</span>`;};
const HEAD_COMPANIES=3;
function renderHead(d){
 const p=d.person||{},raw=String(p.name||rows[0]?.owner_name||"").replace(/\s+/g," ").trim()||"Reporting person";
 personName=fmt.person(raw);
 document.title=personName+" — Insidir";
 const lead=companies.find(c=>tick(c.ticker))||companies[0];
 $("[data-pp-mono]").innerHTML=face(raw,{cik:personCik,ticker:tick(lead?.ticker),issuerCik:lead?.issuer_cik,size:96});
 $("[data-pp-name]").textContent=personName;
 const filed=[...new Set([raw,...(Array.isArray(p.filed_names)?p.filed_names:[])].map(n=>String(n||"").replace(/\s+/g," ").trim()).filter(Boolean))];
 $("[data-pp-sub]").innerHTML=`<span>As filed: ${esc(filed[0])}${filed.length>1?", also as "+filed.slice(1,4).map(esc).join(", "):""}</span><span>SEC CIK ${esc(bare(personCik))}</span>`;
 $("[data-pp-edgar]").href=secUrl(d.edgar_url)||"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK="+pad10(personCik)+"&type=4&dateb=&owner=include&count=40";
 const more=companies.length-HEAD_COMPANIES;
 $("[data-pp-roles]").innerHTML=companies.slice(0,HEAD_COMPANIES).map(c=>`<li>${coLink(c)}<span class="t-label muted">${rolesHtml(c)}</span></li>`).join("")+
  (more>0?`<li><button class="btn btn--ghost" type="button" data-go="companies">${esc("+"+more+" more "+(more===1?"company":"companies"))}</button></li>`:"");
 $("[data-pp-roles]").querySelector("[data-go]")?.addEventListener("click",()=>show("companies",true));
 hydrateLogos($("[data-pp-roles]"));hydrateLogos($("[data-pp-mono]"));
}

/* ---------- totals ---------- */
function totalsOf(list){
 const own=list.filter(x=>x.superseded!==true),part=cat=>{const r=own.filter(x=>x.category===cat);return {count:r.length,shares:r.reduce((a,x)=>a+(Number(x.shares)||0),0),value:r.reduce((a,x)=>a+(Number(x.estimated_value)||0),0)};};
 const dates=own.map(x=>F.tradeIso(x.transaction_date)).filter(Boolean).sort(),pub=list.map(x=>x.published_at).filter(x=>F.validDate(x)).sort();
 return {transactions:own.length,superseded:list.length-own.length,filings:new Set(list.map(x=>x.accession)).size,purchases:part("reported_purchase"),sales:part("reported_sale"),
  other:{count:own.filter(x=>F.kind(x)==="other").length},first_transaction_date:dates[0]||null,last_transaction_date:dates.at(-1)||null,last_published_at:pub.at(-1)||null};
}
function medianLag(list){
 const l=list.filter(x=>!x.is_amendment).map(F.lagOf).filter(n=>n!==null).sort((a,b)=>a-b);if(!l.length)return null;
 const m=l.length>>1;return {v:l.length%2?l[m]:(l[m-1]+l[m])/2,n:l.length};
}
const cell=(label,value,sub,cls="")=>`<div class="pp-stat"><p class="t-label muted">${esc(label)}</p><p class="t-section${cls?" "+cls:""}">${value}</p><p class="t-micro muted">${sub}</p></div>`;
function renderStats(d){
 const all=d.totals?.all||totalsOf(rows);
 const since=Date.now()-30*864e5,recent=rows.filter(x=>{const p=F.validDate(x.published_at);return p&&p.getTime()>=since;});
 const d30=d.totals?.d30||totalsOf(recent);
 const b=Number(all.purchases?.value)||0,s=Number(all.sales?.value)||0,nb=Number(all.purchases?.count)||0,ns=Number(all.sales?.count)||0;
 const side=(t,n,noun)=>n?`in ${plural(n,noun)}${Number(t?.shares)?" · "+fmt.shares(t.shares)+" shares":""}`:`No ${noun}s on file`;
 const net=b-s,lag=medianLag(rows);
 const b30=Number(d30.purchases?.value)||0,s30=Number(d30.sales?.value)||0,n30=Number(d30.transactions)||0;
 const span=all.first_transaction_date?"Since "+dayOf(all.first_transaction_date):"Trade dates not reported";
 $("[data-pp-stats]").innerHTML=
  cell("Bought",nb?esc(fmt.money(b)):"None",esc(side(all.purchases,nb,"purchase")),nb?"up":"muted")+
  cell("Sold",ns?esc(fmt.money(s)):"None",esc(side(all.sales,ns,"sale")),ns?"down":"muted")+
  cell("Net",nb||ns?esc((net>0?"+":"")+fmt.money(net)):"None",esc(nb||ns?(net>0?"More bought than sold":net<0?"More sold than bought":"Bought and sold the same"):"No purchases or sales"),nb||ns?(net>0?"up":net<0?"down":""):"muted")+
  cell("Filed in the last 30 days",esc(n30?plural(n30,"line"):"Nothing"),n30?[b30?`<span class="up">bought ${esc(fmt.money(b30))}</span>`:"",s30?`<span class="down">sold ${esc(fmt.money(s30))}</span>`:""].filter(Boolean).join(" · ")||"No purchases or sales":"No new Form 4 lines")+
  cell("Median filing delay",lag?esc(lag.v===1?"1 day":lag.v.toLocaleString("en-US")+" days"):"—",esc(lag?"Trade date to filing date, over "+plural(lag.n,"line"):"No dated lines"))+
  cell("On file",esc(plural(Number(all.filings)||filings.length,"filing")),esc(plural(Number(all.transactions)||rows.length,"line")+" · "+span));
}

/* ---------- Trades ---------- */
let tradeFilter="all",tradesShown=0;
const tone=(d,x)=>d.cls==="buy"?"up":d.cls==="sell"?(x.rule_10b5_1===true?"plan":"down"):"muted";
function amountCell(x,d){
 const h=fileHref(x.source_url,x.accession),v=d.value!==null?fmt.money(Number(F.fromCents(d.value))):d.tiny?"<$0.01":"";
 const text=v||"Form "+(x.is_amendment?"4/A":"4");
 const label=(v?v+", ":"")+"Form "+(x.is_amendment?"4/A":"4")+" filed "+(F.validDate(x.published_at)?F.filedDate(x.published_at):"");
 return h?`<a class="pp-amt row__link ${v?tone(d,x):"muted"}" href="${esc(h)}" aria-label="${esc(label)}">${esc(text)}</a>`:`<span class="pp-amt ${v?tone(d,x):"muted"}">${esc(text)}</span>`;
}
function tradeRow(x){
 const d=F.describe(x,{companyName:fmt.company}),t=tick(x.ticker),lag=F.lagOf(x);
 const notes=F.qualifiers(x).map(q=>`<span title="${esc(q[1])}">${esc(q[0])}</span>`);
 if(isJoint(x)){const w=jointWith(x);notes.push(w.length?`<span>Joint filing with ${w.slice(0,3).map(ownerLink).join(", ")}${w.length>3?" and "+(w.length-3)+" more":""}</span>`:"<span>Joint filing</span>");}
 const filed=F.validDate(x.published_at)?"Filed "+F.filedDate(x.published_at)+(lag!==null&&!x.is_amendment?" ("+F.lagWords(lag)+")":""):"";
 return `<li class="row pp-trade${x.superseded===true?" is-restated":""}">
  <span class="pp-trade__date t-label muted"><time datetime="${esc(F.tradeIso(x.transaction_date))}">${esc(F.validDate(x.transaction_date)?F.date(x.transaction_date):"No date")}</time></span>
  ${t?`<a class="pp-trade__co row__link" href="${coHref(t)}" aria-label="${esc(t+" stock page")}">${logo(t,24,x.issuer_name)}<span class="tick">${esc(t)}</span></a>`:`<span class="pp-trade__co">${logo("",24,x.issuer_name)}<span class="t-label muted">${esc(fmt.company(x.issuer_name)||"Issuer")}</span></span>`}
  <span class="pp-trade__what"><span class="t-body">${esc(cap(d.text))}</span><span class="t-micro muted pp-notes">${[filed?`<span>${esc(filed)}</span>`:"",...notes].filter(Boolean).join("")}</span></span>
  ${amountCell(x,d)}</li>`;
}
const tradeList=()=>tradeFilter==="all"?rows:rows.filter(x=>F.kind(x)!=="other");
function renderTrades(){
 const el=$("[data-pan=trades]");
 if(!rows.length){quiet(el,"No transactions in the imported filings","Their Form 4 filings are listed under Filings, and SEC EDGAR holds every one.");return;}
 const list=tradeList(),open=rows.filter(x=>F.kind(x)!=="other").length;
 tradesShown=Math.min(list.length,PAGE);
 const total=Number(file?.totals?.all?.transactions)||0,counted=rows.filter(x=>x.superseded!==true).length,repeated=rows.length-counted;
 el.innerHTML=`<div class="pp-panel__head"><div class="seg" role="group" aria-label="Show"><button type="button" data-tf="all" aria-pressed="${tradeFilter==="all"}">All ${rows.length.toLocaleString("en-US")}</button><button type="button" data-tf="open" aria-pressed="${tradeFilter==="open"}">Buys and sales ${open.toLocaleString("en-US")}</button></div></div>
  ${list.length?`<ul class="rows" data-trades>${list.slice(0,tradesShown).map(tradeRow).join("")}</ul>`:`<div class="empty"><h3>No open-market buys or sales</h3><p>Every line on file is a grant, an option exercise, a tax withholding, a gift or another kind of transaction. Show all to see them.</p></div>`}
  <div class="pp-more" data-trades-more></div>
  <p class="t-label muted pp-note">${esc((total>counted?"The newest "+rows.length.toLocaleString("en-US")+" of "+plural(total,"line")+"; the filings and SEC EDGAR hold the rest. ":"")+"Buys and sales are open-market or private trades (codes P and S); grants, exercises, gifts and the rest are other transactions."+(repeated?" "+plural(repeated,"line")+" repeated by a later Form 4/A "+(repeated===1?"is":"are")+" marked and counted once.":""))}</p>`;
 el.querySelectorAll("[data-tf]").forEach(b=>b.addEventListener("click",()=>{tradeFilter=b.dataset.tf;renderTrades();el.querySelector(`[data-tf="${tradeFilter}"]`)?.focus();}));
 moreButton(el.querySelector("[data-trades-more]"),list.length-tradesShown,()=>{const ul=el.querySelector("[data-trades]"),from=tradesShown;tradesShown=Math.min(list.length,from+PAGE);ul.insertAdjacentHTML("beforeend",list.slice(from,tradesShown).map(tradeRow).join(""));hydrateLogos(ul);ul.children[from]?.querySelector("a")?.focus();return list.length-tradesShown;});
 hydrateLogos(el);
}
function moreButton(host,left,next){
 if(!host)return;
 const draw=n=>{host.innerHTML=n>0?`<button class="btn btn--ghost" type="button">Show ${Math.min(PAGE,n)} more</button>`:"";host.querySelector("button")?.addEventListener("click",()=>draw(next()));};
 draw(left);
}

/* ---------- Track record ---------- */
const H_DEFAULT=[{key:"1m",days:30,words:"1 month"},{key:"3m",days:91,words:"3 months"},{key:"6m",days:182,words:"6 months"}];
const pctCell=(t,h)=>{
 if(t.pending?.[h.key])return `<span class="muted" title="${esc("The "+h.words+" mark is "+dayOf(new Date(Date.parse(t.trade_date+"T00:00:00Z")+h.days*864e5).toISOString()))}">Pending</span>`;
 const r=t.returns?.[h.key];if(r==null)return `<span class="muted" title="No close within a week of the date">No close</span>`;
 return `<span class="${r>0?"up":r<0?"down":"muted"}">${esc(fmt.pct(r))}</span><span class="sr-only">${t.hits?.[h.key]?" (a hit)":" (not a hit)"}</span>`;
};
async function trackRecord(){
 const el=$("[data-pan=track-record]");
 let d;try{d=await api("/v1/people/"+encodeURIComponent(bare(personCik))+"/track-record");}catch(e){if(e.status===401||e.status===402)return;loaded.delete("track-record");failed(el,"The track record",trackRecord);return;}
 const H=Array.isArray(d.horizons)&&d.horizons.length?d.horizons:H_DEFAULT,trades=Array.isArray(d.trades)?d.trades:[];
 if(!trades.length){quiet(el,"No open-market buys or sales on file","A track record follows the stock after each open-market buy and sale. Awards, gifts, option exercises and tax withholding are not trades they chose to make, so they have none.");return;}
 const side=(title,s,code)=>s?.count?`<tr><th scope="row">${esc(title)} <span class="t-micro muted">${esc(s.count+" on record")}</span></th>${H.map(h=>{const x=s[h.key]||{n:0};return `<td>${x.n?`<span class="strong">${esc(x.hits+" of "+x.n)}</span> <span class="t-micro muted">${code==="P"?"up":"fell after"}</span>${x.avg!=null?`<br><span class="t-micro ${x.avg>0?"up":x.avg<0?"down":"muted"}">avg ${esc(fmt.pct(x.avg))}</span>`:""}`:'<span class="muted">No result yet</span>'}</td>`;}).join("")}</tr>`:"";
 const sentences=[d.overall?.sentences?.buys,d.overall?.sentences?.sells].filter(Boolean);
 const cos=(Array.isArray(d.companies)?d.companies:[]).filter(c=>c.card);
 el.innerHTML=`<div class="pp-scroll"><table class="table pp-hits"><caption class="sr-only">Hit rates: how often the stock moved their way after each open-market buy and sale</caption>
   <thead><tr><th scope="col">Trades</th>${H.map(h=>`<th scope="col">After ${esc(h.words)}</th>`).join("")}</tr></thead><tbody>${side("Buys",d.overall?.buys,"P")}${side("Sales",d.overall?.sells,"S")}</tbody></table></div>
  ${sentences.length?`<div class="pp-sentences">${sentences.map(s=>`<p class="t-body">${esc(s)}</p>`).join("")}</div>`:""}
  ${cos.length>1?`<ul class="rows pp-trcos">${cos.map(c=>`<li class="row"><span class="pp-co">${logo(c.ticker||"",24)}<span class="tick">${esc(c.ticker||"CIK "+bare(c.issuer_cik))}</span></span><span class="t-label muted">${esc(c.card)}</span></li>`).join("")}</ul>`:""}
  <div class="pp-scroll"><table class="table pp-tr"><caption class="sr-only">Every open-market trade and how the stock did afterwards</caption>
   <thead><tr><th scope="col">Traded</th><th scope="col">Company</th><th scope="col" class="r">Trade</th><th scope="col" class="r">Price</th>${H.map(h=>`<th scope="col" class="r">${esc(h.words)}</th>`).join("")}</tr></thead>
   <tbody>${trades.map(t=>{const h=fileHref(t.filing_url||t.evidence?.url,t.accession),buy=t.code==="P",word=(buy?"Bought ":"Sold ")+fmt.money(t.value);
    return `<tr><td class="t-label">${esc(dayOf(t.trade_date))}</td><td>${t.ticker?`<a class="pp-co" href="${coHref(t.ticker)}">${logo(t.ticker,24)}<span class="tick">${esc(t.ticker)}</span></a>`:esc("CIK "+bare(t.issuer_cik))}</td>
     <td class="r">${h?`<a class="pp-amt ${buy?"up":t.pre_scheduled?"plan":"down"}" href="${esc(h)}" aria-label="${esc(word+", Form 4")}">${esc(word)}</a>`:`<span class="${buy?"up":"down"}">${esc(word)}</span>`}${t.pre_scheduled?'<br><span class="t-micro muted">10b5-1 plan</span>':""}</td>
     <td class="r" title="${esc(t.price_source==="form4"?"Price per share as filed on the Form 4":"Close on the trade date: the Form 4 price was missing, or a split since makes it incomparable")}">${esc(fmt.price(t.price))}${t.price_source==="close"?"*":""}</td>
     ${H.map(x=>`<td class="r">${pctCell(t,x)}</td>`).join("")}</tr>`;}).join("")}</tbody></table></div>
  <p class="t-label muted pp-note">${esc(d.methodology||"")} * The close on the trade date stands in for the filed price. Prices: ${esc(d.priceSource?.name||"market data")}, delayed. ${esc(d.disclaimer||"Research, not investment advice.")}</p>`;
 hydrateLogos(el);
}

/* ---------- Companies (and the people they filed jointly with) ---------- */
function companiesTab(){
 const el=$("[data-pan=companies]");
 const rowsHtml=companies.map(c=>{
  const n=Number(c.transactions)||0,b=Number(c.purchases_value)||0,s=Number(c.sales_value)||0,l=latestOf(c),lh=l?fileHref(l.url,l.acc):"";
  const traded=F.validDate(c.first_transaction_date)?dayOf(c.first_transaction_date)+(c.last_transaction_date&&F.tradeIso(c.last_transaction_date)!==F.tradeIso(c.first_transaction_date)?" – "+dayOf(c.last_transaction_date):""):"";
  return `<li class="row pp-corow">${coLink(c)}
   <span class="pp-corow__role t-label">${rolesHtml(c)}<span class="t-micro muted">${esc([plural(n,"line"),traded?"traded "+traded:""].filter(Boolean).join(" · "))}</span></span>
   <span class="pp-corow__sum t-label">${b?`<span class="up">Bought ${esc(fmt.money(b))}</span>`:""}${s?`<span class="down">Sold ${esc(fmt.money(s))}</span>`:""}${!b&&!s?'<span class="muted">No buys or sales</span>':""}</span>
   <span class="pp-corow__last t-micro muted">${F.validDate(c.last_published_at)?(lh?`<a class="pp-link" href="${esc(lh)}">Last filed ${esc(F.filedDate(c.last_published_at))}</a>`:"Last filed "+esc(F.filedDate(c.last_published_at))):""}</span></li>`;}).join("");
 // Issuers SEC EDGAR lists for the same CIK that are not in the import.
 const seen=new Set(),others=(Array.isArray(file.other_issuers)?file.other_issuers:[]).filter(o=>o&&(cikOf(o.cik)||tick(o.ticker))&&!companies.some(c=>sameCik(c.issuer_cik,o.cik)||(tick(o.ticker)&&tick(o.ticker)===tick(c.ticker))))
  .filter(o=>{const k=cikOf(o.cik)?Number(o.cik):tick(o.ticker);if(seen.has(k))return false;seen.add(k);return true;}).slice(0,24);
 const also=others.map(o=>{const t=tick(o.ticker),name=fmt.company(o.name)||t||"Issuer CIK "+bare(o.cik),meta=[t,o.relation?String(o.relation).slice(0,60):"",F.validDate(o.last_transaction_date)?"last traded "+dayOf(o.last_transaction_date):""].filter(Boolean).join(" · ");
  return `<li class="row pp-alsorow">${t?`<a class="pp-co" href="${coHref(t)}">${logo(t,24,o.name)}<span>${esc(name)}</span></a>`:`<span class="pp-co">${logo("",24,o.name)}<span>${esc(name)}</span></span>`}<span class="t-micro muted">${esc(meta)}</span>${cikOf(o.cik)?ext("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK="+pad10(o.cik)+"&type=4","SEC EDGAR","pp-link t-micro"):"<span></span>"}</li>`;}).join("");
 // Co-owners: everyone named on their joint lines, with how many joint filings and where.
 const co=new Map();
 for(const x of rows){if(!isJoint(x))continue;for(const o of jointWith(x)){const k=o.cik?"c"+Number(o.cik):"n"+o.name.toUpperCase();const e=co.get(k)||{...o,acc:new Set(),tickers:new Set()};e.acc.add(x.accession);if(tick(x.ticker))e.tickers.add(tick(x.ticker));if(!e.cik&&o.cik)e.cik=o.cik;co.set(k,e);}}
 const joint=[...co.values()].sort((a,b)=>b.acc.size-a.acc.size).map(o=>`<li class="row pp-jointrow">${face(o.name||"",{cik:o.cik,ticker:[...o.tickers][0],size:24})}<a class="pp-link strong" href="${esc(personHref(o.cik,o.name))}">${esc(o.name?fmt.person(o.name):"CIK "+bare(o.cik))}</a><span class="t-micro muted">${esc(plural(o.acc.size,"joint filing")+([...o.tickers].length?" · "+[...o.tickers].slice(0,4).join(", "):""))}</span></li>`).join("");
 el.innerHTML=(rowsHtml?`<ul class="rows">${rowsHtml}</ul>`:`<div class="empty"><h3>No company named in the imported filings</h3><p>SEC EDGAR lists every filing under this CIK.</p></div>`)+
  (also?`<div class="pp-sub"><h2 class="t-section">Also reports for</h2><p class="t-label muted">Other issuers SEC EDGAR lists for CIK ${esc(bare(personCik))}. Their filings are not in Insidir's imports yet.</p><ul class="rows">${also}</ul></div>`:"")+
  `<div class="pp-sub"><h2 class="t-section">Filed jointly with</h2>${joint?`<p class="t-label muted">The other reporting owners on the Form 4s they filed together.</p><ul class="rows">${joint}</ul>`:`<p class="t-label muted">No joint filings among the imported lines.</p>`}</div>`;
 hydrateLogos(el);
}

/* ---------- Filings ---------- */
const FORM_WORDS={"3":"First ownership report","3/A":"First ownership report, corrected","4":"Insider trade","4/A":"Insider trade, corrected","5":"Yearly insider report","5/A":"Yearly insider report, corrected"};
let filingsShown=0;
function filingRow(f){
 const a=accOf(f.accession),h=fileHref(f.source_url,a),t=tick(f.ticker),form=String(f.form_type||"4").slice(0,8),lines=Number(f.lines),src=secUrl(f.source_url);
 return `<li class="row pp-filing">${h?`<a class="hit" href="${esc(h)}" aria-label="${esc("Form "+form+(t?" for "+t:"")+", filed "+F.filedDate(f.published_at))}"></a>`:""}
  <span class="pp-filing__form"><span class="strong">Form ${esc(form)}</span><span class="t-micro muted">${esc(FORM_WORDS[form.toUpperCase()]||"")}</span></span>
  <span class="pp-co">${logo(t,24,f.issuer_name)}<span class="t-label">${esc(t||fmt.company(f.issuer_name)||"Issuer")}</span></span>
  <span class="t-label muted">${esc(F.validDate(f.published_at)?"Filed "+F.filedDate(f.published_at):"")}</span>
  <span class="t-micro muted pp-filing__lines">${Number.isFinite(lines)&&lines>0?esc(plural(lines,"line")):""}</span>
  ${src?`<a class="pp-link t-micro row__link" href="${esc(src)}" target="_blank" rel="noopener noreferrer" aria-label="${esc("Form "+form+" on SEC.gov")}">SEC.gov <span aria-hidden="true">↗</span></a>`:"<span></span>"}</li>`;
}
function filingsTab(){
 const el=$("[data-pan=filings]");
 if(!filings.length){quiet(el,"No Form 4 filings in the imported records","SEC EDGAR lists every filing under this CIK.");return;}
 filingsShown=Math.min(filings.length,PAGE);
 const total=Number(file?.totals?.all?.filings)||filings.length;
 el.innerHTML=`<ul class="rows" data-filings>${filings.slice(0,filingsShown).map(filingRow).join("")}</ul><div class="pp-more" data-filings-more></div>
  <p class="t-label muted pp-note">${esc(total>filings.length?"The newest "+filings.length+" of "+plural(total,"filing")+". Each opens inside Insidir, with the original on SEC.gov.":"Each filing opens inside Insidir, with the original on SEC.gov.")}</p>`;
 moreButton(el.querySelector("[data-filings-more]"),filings.length-filingsShown,()=>{const ul=el.querySelector("[data-filings]"),from=filingsShown;filingsShown=Math.min(filings.length,from+PAGE);ul.insertAdjacentHTML("beforeend",filings.slice(from,filingsShown).map(filingRow).join(""));hydrateLogos(ul);ul.children[from]?.querySelector("a")?.focus();return filings.length-filingsShown;});
 hydrateLogos(el);
}

/* ---------- Changes ---------- */
const KIND={form4:"Insider trade",form4_amendment:"Correction",role_change:"Role change",first_seen:"New insider",financial_fact:"Results",sec_filing:"Company filing",holdings_13f:"Fund holdings"};
let days=90,aiOn=null;
const ai=()=>aiOn||(aiOn=api("/v1/ai/status").then(d=>!!d?.configured).catch(()=>false));
async function changes(){
 const el=$("[data-pan=changes]");
 if(!el.querySelector("[data-days]"))el.innerHTML=`<div class="pp-panel__head"><div class="seg" role="group" aria-label="Window">${[[30,"30 days"],[90,"90 days"],[180,"180 days"],[365,"1 year"]].map(([v,l])=>`<button type="button" data-days="${v}" aria-pressed="${v===days}">${l}</button>`).join("")}</div></div><div data-changes aria-live="polite"></div>`;
 el.querySelectorAll("[data-days]").forEach(b=>{b.onclick=()=>{days=Number(b.dataset.days);el.querySelectorAll("[data-days]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));changes();};});
 const box=el.querySelector("[data-changes]");
 box.innerHTML=`<span class="skel" style="display:block;height:160px"></span>`;
 let d;try{d=await api("/v1/entities/"+pad10(personCik)+"/changes?days="+days);}catch(e){if(e.status===401||e.status===402)return;if(e.status===404){quiet(box,"No changes on record","Insidir has no imported SEC records for this filer yet.");return;}failed(box,"The changes",changes);return;}
 const items=Array.isArray(d?.items)?d.items:[],explain=await ai();
 if(!items.length){quiet(box,"No changes in this window","Nothing new in the records Insidir holds for the last "+(days===365?"year":days+" days")+".");return;}
 box.innerHTML=`<ul class="rows">${items.map((it,i)=>{const src=(it.evidence||[]).find(e=>e&&e.url),h=src||it.accession?fileHref(src?.url,it.accession):"";
  return `<li class="row pp-change"><span class="t-label muted">${esc(dayOf(it.date))}</span>
   <span class="pp-change__text"><span class="t-micro muted">${esc(KIND[it.kind]||it.kind||"")}</span><span class="t-body strong">${esc(it.headline||it.title||"")}</span><span class="t-label muted">${esc(it.summary||it.detail||"")}</span>
    ${explain&&it.explainable&&it.accession?`<button class="btn btn--ghost pp-explain" type="button" data-explain="${esc(it.accession)}" data-i="${i}">Explain this filing</button><span class="t-label pp-explain__out" data-out="${i}" hidden></span>`:""}</span>
   ${h?`<a class="pp-link t-micro" href="${esc(h)}">Filing</a>`:"<span></span>"}</li>`;}).join("")}</ul>
  ${(d.gaps||[]).length||d.method?`<p class="t-label muted pp-note">${esc([...(d.gaps||[]),d.method||""].filter(Boolean).join(" "))}</p>`:""}`;
 box.querySelectorAll("[data-explain]").forEach(b=>b.addEventListener("click",async()=>{
  const out=box.querySelector(`[data-out="${b.dataset.i}"]`);out.hidden=false;out.textContent="Writing a summary from this filing…";b.disabled=true;
  try{const x=await api("/v1/ai/explain?accession="+encodeURIComponent(b.dataset.explain));out.innerHTML=`${esc(x.explanation)}<br><span class="t-micro muted">An automated summary of this filing only, checked against it. Read the filing before relying on it.</span>`;}
  catch(e){out.textContent=e.message;}finally{b.disabled=false;}
 }));
}

/* ---------- Connections ---------- */
async function connections(){
 const el=$("[data-pan=connections]");
 el.innerHTML=`<span class="skel" style="display:block;height:360px"></span>`;
 let d;try{d=await api("/v1/entities/"+pad10(personCik)+"/connections?limit=40");}catch(e){if(e.status===401||e.status===402)return;if(e.status===404){quiet(el,"No connections yet","Companies and people tied to "+personName+" by Form 4 filings appear here.");return;}loaded.delete("connections");failed(el,"The connections",connections);return;}
 if(!(d?.edges||[]).length||!d.subject?.id){quiet(el,"No connections yet","Companies and people tied to "+personName+" by Form 4 filings appear here.");return;}
 el.innerHTML=`<div data-graph></div><p class="t-label muted pp-note">Ties from Form 4 filings: the companies ${esc(personName)} reports at, and the people who file there or filed jointly with them. Hover a name to follow its path; each opens its own page.</p>`;
 window.InsidirGraph?.mount(el.querySelector("[data-graph]"),d,{cap:25});
}

/* ---------- tabs ---------- */
const TABS=["trades","track-record","companies","filings","changes","connections"];
const loaded=new Set();let current=(location.hash||"").slice(1);if(!TABS.includes(current))current="trades";
function show(k,focus){current=k;for(const b of $$("[role=tab]")){const on=b.getAttribute("aria-controls")==="pan-"+k;b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus();}
 for(const p of $$("[data-pan]"))p.hidden=p.dataset.pan!==k;history.replaceState(null,"",location.pathname+location.search+(k==="trades"?"":"#"+k));loadTab(k);}
$$("[role=tab]").forEach((b,i,all)=>{b.addEventListener("click",()=>show(b.getAttribute("aria-controls").slice(4)));
 b.addEventListener("keydown",e=>{if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft")return;e.preventDefault();const n=all[(i+(e.key==="ArrowRight"?1:all.length-1))%all.length];show(n.getAttribute("aria-controls").slice(4),true);});});
function loadTab(k){if(!file||loaded.has(k))return;loaded.add(k);({trades:renderTrades,"track-record":trackRecord,companies:companiesTab,filings:filingsTab,changes,connections})[k]();}

/* ---------- SEC filing index only (no imported Form 4 yet) ---------- */
function renderHistory(d){
 const name=String(d.person?.name||"SEC reporting filer");
 personName=fmt.person(name);document.title=personName+" — Insidir";
 $("[data-pp-mono]").innerHTML=face(name,{cik:personCik,size:96});hydrateLogos($("[data-pp-mono]"));
 $("[data-pp-name]").textContent=personName;
 $("[data-pp-sub]").innerHTML=`<span>Files with the SEC</span><span>SEC CIK ${esc(bare(personCik))}</span>`;
 $("[data-pp-edgar]").href=secUrl(d.edgar_url)||"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK="+pad10(personCik)+"&type=4&dateb=&owner=include&count=40";
 $("[data-pp-roles]").hidden=true;$("[data-pp-stats]").hidden=true;$("[data-pp-tabs]").hidden=true;$$("[data-pan]").forEach(p=>p.hidden=true);
 const entries=(Array.isArray(d.sec_filing_index)?d.sec_filing_index:[]).filter(x=>accOf(x.accession));
 const box=$("[data-pp-history]");box.hidden=false;
 box.innerHTML=`<div class="sec__head"><h2 class="t-section" id="pp-history-h">Their SEC filings</h2></div>
  <div class="card pp-panel"><p class="t-body">${esc(plural(entries.length,"ownership filing")+" on record at the SEC. "+(d.queued_for_import?"Insidir is reading "+plural(d.queued_for_import,"of their filings","of their filings")+" now; their trades appear here within minutes. Until then it shows no totals rather than guess.":"Insidir has not read the trades inside these filings yet, so it shows no totals rather than guess."))}</p>
  <ul class="rows">${entries.map(x=>{const form=/^(3|4|5)(\/A)?$/.test(String(x.form_type||""))?x.form_type:"4",h=fileHref("",x.accession);
   return `<li class="row pp-filing">${h?`<a class="hit" href="${esc(h)}" aria-label="${esc("Form "+form+", filed "+dayOf(x.filed_at))}"></a>`:""}<span class="pp-filing__form"><span class="strong">Form ${esc(form)}</span><span class="t-micro muted">${esc(FORM_WORDS[form]||"")}</span></span>
    <span class="t-label muted">${esc(x.filed_at?"Filed "+dayOf(x.filed_at):"Filing date unavailable")}</span><span class="t-micro muted">${esc(x.report_date?"Period "+dayOf(x.report_date):"")}</span><span class="t-micro muted">${esc(String(x.accession))}</span><span></span></li>`;}).join("")}</ul>
  <p class="t-label muted pp-note">${esc(d.history_partial?"Their most recent filings; older ones are on SEC EDGAR.":"Every ownership report the SEC lists for them.")} ${d.disclaimer?esc(d.disclaimer):""}</p></div>`;
}

/* ---------- Follow, with Undo, and its alert settings ---------- */
const fbtn=$("[data-pp-follow]");
let following=null,followedAs=[],busy=false;
function setFollow(){
 fbtn.disabled=!file;fbtn.setAttribute("aria-pressed",String(following===true));fbtn.setAttribute("aria-busy",String(busy));
 fbtn.textContent=following===true?"Following":"Follow";fbtn.className="btn "+(following===true?"btn--secondary":"btn--primary");
}
// POST stores the 10-digit form; DELETE every form the list holds, so the person is really off it.
const followCik=()=>cikOf(file?.person?.cik)||pad10(personCik);
const toastEl=$("[data-pp-toast]");let toastTimer=0;
function toast(html,ms=5000){toastEl.innerHTML=html;toastEl.hidden=false;clearTimeout(toastTimer);
 const hide=()=>{if(toastEl.contains(document.activeElement)){toastTimer=setTimeout(hide,1500);return;}toastEl.hidden=true;};toastTimer=setTimeout(hide,ms);}
async function follow(again=false){
 if(busy)return;busy=true;const was=following;following=true;setFollow();
 try{const r=await api("/v1/me/people",{method:"POST",body:{owner_cik:followCik(),mode:"important"}});const c=String(r?.owner_cik||followCik());if(!followedAs.includes(c))followedAs.push(c);
  toast(`<span>${esc((again?"Following "+personName+" again.":"Following "+personName+".")+" Their new filings will show in Alerts.")}</span>`);}
 catch(e){following=was;if(e.status!==401&&e.status!==402)toast(`<span>${esc("Could not follow "+personName+": "+String(e.message||"").replace(/\.$/,"")+". Nothing changed.")}</span>`,8000);}
 finally{busy=false;setFollow();mountAuto();}
}
async function unfollow(){
 if(busy)return;busy=true;following=false;setFollow();
 const forms=followedAs.length?[...followedAs]:[followCik()];let removed=0;
 try{for(const c of forms){await api("/v1/me/people/"+encodeURIComponent(c),{method:"DELETE"});followedAs=followedAs.filter(x=>x!==c);removed++;}
  toast(`<span>${esc("Unfollowed "+personName+".")}</span><button class="btn btn--secondary" type="button" data-undo aria-label="${esc("Undo: follow "+personName+" again")}">Undo</button>`,6000);
  toastEl.querySelector("[data-undo]").addEventListener("click",()=>{toastEl.hidden=true;fbtn.focus();follow(true);});}
 catch(e){following=removed<forms.length;if(e.status!==401&&e.status!==402)toast(`<span>${esc("Could not unfollow "+personName+": "+String(e.message||"").replace(/\.$/,"")+".")}</span>`,8000);}
 finally{busy=false;setFollow();mountAuto();}
}
fbtn.addEventListener("click",()=>{if(following===true)unfollow();else follow();});
async function loadFollowing(){
 try{const x=await api("/v1/me/people");followedAs=[...new Set((x?.items||[]).map(p=>String(p?.owner_cik??"").trim()).filter(c=>sameCik(c,askedCik)))];following=followedAs.length>0;}
 catch(e){following=null;followedAs=[];}
 setFollow();if(following)mountAuto();
}
const MODES=[["important","Important"],["all","All filings"],["daily","Daily"],["weekly","Weekly"],["off","Off"]];
async function mountAuto(){
 const host=$("[data-pp-auto]");
 if(following!==true){host.hidden=true;host.innerHTML="";return;}
 let f,note="";
 try{const d=await api("/v1/me/follows");note=d?.note||"";f=(d?.items||[]).find(x=>x.kind==="person"&&sameCik(x.cik||x.id,personCik));}catch{host.hidden=true;return;}
 if(!f||following!==true){host.hidden=true;host.innerHTML="";return;}
 host.hidden=false;
 host.innerHTML=`<div class="pp-auto__row"><div><p class="strong">Alerts for ${esc(personName)}</p><p class="t-label muted">${esc(note||"Important updates are purchases, clustered purchases, sales of $1,000,000 or more as filed, and company disclosures.")}</p></div>
  <div class="pp-auto__ctl"><div class="seg" role="group" aria-label="Alerts for this person">${MODES.map(([v,l])=>`<button type="button" data-mode="${v}" aria-pressed="${v===f.mode}">${l}</button>`).join("")}</div>
  <button class="btn btn--ghost" type="button" data-pause aria-pressed="${!!f.paused}">${f.paused?"Resume":"Pause"}</button></div></div><p class="t-micro muted" data-saved role="status" aria-live="polite"></p>`;
 const saved=host.querySelector("[data-saved]");
 const save=async change=>{try{const r=await api("/v1/me/follows/settings",{method:"POST",body:{kind:"person",id:followCik(),...change}});f.mode=r.mode;f.paused=r.paused;
   host.querySelectorAll("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===r.mode)));
   const p=host.querySelector("[data-pause]");p.textContent=r.paused?"Resume":"Pause";p.setAttribute("aria-pressed",String(r.paused));saved.textContent=r.paused?"Paused":"Saved";}
  catch(e){if(e.status!==401&&e.status!==402)saved.textContent=e.message;}};
 host.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>save({mode:b.dataset.mode})));
 host.querySelector("[data-pause]").addEventListener("click",()=>save({paused:!f.paused}));
}

/* ---------- load ---------- */
function render(d){
 companies=(Array.isArray(d.companies)?d.companies:[]).filter(c=>c&&typeof c==="object").sort((a,b)=>String(b.last_published_at||"").localeCompare(String(a.last_published_at||""))||String(b.last_transaction_date||"").localeCompare(String(a.last_transaction_date||"")));
 rows=(Array.isArray(d.transactions)?d.transactions:[]).filter(x=>x&&typeof x==="object").sort((a,b)=>String(F.tradeIso(b.transaction_date)).localeCompare(String(F.tradeIso(a.transaction_date)))||String(b.published_at||"").localeCompare(String(a.published_at||"")));
 filings=(Array.isArray(d.filings)?d.filings:[]).filter(f=>f&&typeof f==="object").sort((a,b)=>String(b.published_at||"").localeCompare(String(a.published_at||"")));
 indexFilings();
 renderHead(d);renderStats(d);
 loaded.clear();show(current);
 enter($$(".pp-stat"));
}
async function load(){
 $("[data-pp-state]").hidden=true;
 try{file=await api("/v1/people/"+encodeURIComponent(askedCik)+"?limit="+LIMIT);}
 catch(e){if(e.status===401||e.status===402)return;showState(e.status===404?"missing":e.status===400?"badcik":"error",e.message);return;}
 personCik=cikOf(file?.person?.cik)||askedCik;
 $("[data-pp]").hidden=false;$("[data-pp]").removeAttribute("aria-busy");
 if(file?.coverage==="sec_submissions_history_only")renderHistory(file);else render(file);
 setFollow();
}
if(!askedCik)showState("badcik");
else{loadFollowing();load();}
})();
