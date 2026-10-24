/* The SEC filing inside Insidir (filing.html?accession=): the whole ownership form as filed, from
   GET /v1/filings/<accession>/document (src/filing-document.mjs: fetched from SEC.gov once, then kept), laid out in
   the form's own boxes and tables with every footnote; above it, the reported lines in plain words
   (GET /v1/filings/<accession>). The original on SEC.gov is always linked. Values are shown as filed: numbers get
   thousands separators and prices a "$", the way the SEC's own rendering shows them, and nothing else changes. */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,fmt,esc,logo,hydrateLogos}=UI;
const $=s=>document.querySelector(s);
const acc=new URLSearchParams(location.search).get("accession")||"";
const status=$("[data-fl-status]"),doc=$("[data-fl-doc]");

const FORM={"3":"Initial Statement of Beneficial Ownership of Securities","4":"Statement of Changes in Beneficial Ownership","5":"Annual Statement of Changes in Beneficial Ownership"};
// Form 4, General Instructions, Item 8: the transaction codes in plain words.
const CODE={P:"Bought on the open market or privately",S:"Sold on the open market or privately",A:"Received a grant or award",M:"Exercised or converted a derivative",
 C:"Converted a derivative",F:"Shares withheld for tax or the exercise price",G:"Gift",D:"Disposed of to the company",J:"Other (explained in a footnote)",
 X:"Exercised an in-the-money option",I:"Discretionary transaction",L:"Small acquisition",W:"By will or the laws of descent",Z:"Into or out of a voting trust",
 K:"Equity swap or similar",U:"Disposed of in a change of control",E:"Short derivative position expired",H:"Long derivative position expired or was cancelled",
 O:"Exercised an out-of-the-money derivative",V:"Reported voluntarily, earlier than required"};
// A reporting person's own file in Insidir, by owner CIK without leading zeros.
const personLink=(cik,name)=>{const c=String(cik??"").trim(),n=esc(name||"Not stated");return /^\d{1,10}$/.test(c)&&/[1-9]/.test(c)?`<a href="${"person.html?cik="+c.replace(/^0+/,"")}">${n}</a>`:n;};
const secUrl=u=>{try{const x=new URL(String(u));return x.protocol==="https:"&&x.hostname==="www.sec.gov"&&!x.username&&!x.password?x.toString():"";}catch{return "";}};

/* ---------- values as filed ---------- */
const num=s=>{const m=/^(-?)(\d+)(\.\d+)?$/.exec(String(s??"").trim());return m?m[1]+m[2].replace(/\B(?=(\d{3})+(?!\d))/g,",")+(m[3]||""):null;};
const day=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s??""));return m?`${m[2]}/${m[3]}/${m[1]}`:null;};
const fn=c=>(c?.fn||[]).map(id=>`<sup class="fl-fn"><a href="#fn-${esc(id)}" aria-label="Footnote ${esc(id.replace(/^F/i,""))}">(${esc(id.replace(/^F/i,""))})</a></sup>`).join("");
const show=(c,as="text")=>{if(!c)return "";const v=c.v==null?"":as==="num"?(num(c.v)??c.v):as==="price"?(num(c.v)!=null?"$"+num(c.v):c.v):as==="date"?(day(c.v)??c.v):c.v;return esc(v)+fn(c);};
const check=(on,label)=>`<li><span class="fl-check${on?" is-on":""}" aria-hidden="true">${on?"✓":""}</span><span>${esc(label)}</span><span class="sr-only">${on?" (checked)":" (not checked)"}</span></li>`;

function boxes(d,f){
 const owners=d.owners.length?d.owners:[{name:null,address:[]}];
 const who=owners.map(o=>`<p><strong>${personLink(o.cik,o.name)}</strong>${o.address.length?"<br>"+o.address.map(esc).join("<br>"):""}</p>`).join("");
 const rel=owners.map(o=>`<ul class="fl-checks">${check(o.director,"Director")}${check(o.tenPercentOwner,"10% Owner")}${check(o.officer,"Officer"+(o.officerTitle?": "+o.officerTitle:" (title below)"))}${check(o.other,"Other"+(o.otherText?": "+o.otherText:""))}</ul>`).join("");
 const form=d.form||f.form||"4";
 return `<div class="fl-boxes">
 <div class="fl-box"><p class="t-micro fl-box__label">1. Name and address of reporting person${owners.length>1?"s":""}</p>${who}</div>
 <div class="fl-box"><p class="t-micro fl-box__label">2. Issuer name and ticker or trading symbol</p><p><strong>${esc(d.issuer.name||f.issuerName||"")}</strong>${d.issuer.ticker?` [ ${esc(d.issuer.ticker)} ]`:""}</p></div>
 <div class="fl-box"><p class="t-micro fl-box__label">3. ${/^3/.test(form)?"Date of event requiring statement":/^5/.test(form)?"Statement for issuer's fiscal year ended":"Date of earliest transaction"} (month/day/year)</p><p>${esc(day(d.periodOfReport)||"Not stated")}</p></div>
 <div class="fl-box"><p class="t-micro fl-box__label">4. If amendment, date of original filed (month/day/year)</p><p>${esc(day(d.originalFiledOn)||(/A$/i.test(form)?"Not stated":"Not an amendment"))}</p></div>
 <div class="fl-box"><p class="t-micro fl-box__label">5. Relationship of reporting person${owners.length>1?"s":""} to issuer</p>${rel}</div>
 ${d.rule10b51!=null||d.notSubjectToSection16?`<div class="fl-box"><p class="t-micro fl-box__label">Boxes on the form</p><ul class="fl-checks">${d.rule10b51!=null?check(d.rule10b51,"Rule 10b5-1(c) transaction indication"):""}${check(d.notSubjectToSection16,"No longer subject to Section 16")}</ul></div>`:""}
 </div>`;
}

const TABLE1={wide:false,caption:"Table I. Non-derivative securities acquired, disposed of, or beneficially owned",
 head:`<tr><th rowspan="2">1. Title of security</th><th rowspan="2">2. Transaction date</th><th rowspan="2">2A. Deemed execution date, if any</th><th colspan="2">3. Transaction code</th><th colspan="3">4. Securities acquired (A) or disposed of (D)</th><th rowspan="2" class="r">5. Amount of securities beneficially owned following reported transaction(s)</th><th rowspan="2">6. Ownership form: direct (D) or indirect (I)</th><th rowspan="2">7. Nature of indirect beneficial ownership</th></tr>
 <tr><th class="sub">Code</th><th class="sub">V</th><th class="sub r">Amount</th><th class="sub">(A) or (D)</th><th class="sub r">Price</th></tr>`,
 cols:11,
 row:t=>`<td>${show(t.security)}</td><td>${show(t.date,"date")}</td><td>${show(t.deemedDate,"date")}</td><td>${show(t.code)}</td><td>${t.voluntary?"V":""}</td><td class="r">${show(t.shares,"num")}</td><td>${show(t.acquiredDisposed)}</td><td class="r">${show(t.price,"price")}</td><td class="r">${show(t.ownedAfter,"num")}</td><td>${show(t.ownership)}</td><td>${show(t.nature)}</td>`};
const TABLE2={wide:true,caption:"Table II. Derivative securities acquired, disposed of, or beneficially owned (e.g., puts, calls, warrants, options, convertible securities)",
 head:`<tr><th rowspan="2">1. Title of derivative security</th><th rowspan="2" class="r">2. Conversion or exercise price of derivative security</th><th rowspan="2">3. Transaction date</th><th rowspan="2">3A. Deemed execution date, if any</th><th colspan="2">4. Transaction code</th><th colspan="2">5. Number of derivative securities acquired (A) or disposed of (D)</th><th colspan="2">6. Date exercisable and expiration date</th><th colspan="2">7. Title and amount of securities underlying derivative security</th><th rowspan="2" class="r">8. Price of derivative security</th><th rowspan="2" class="r">9. Number of derivative securities beneficially owned following reported transaction(s)</th><th rowspan="2">10. Ownership form: direct (D) or indirect (I)</th><th rowspan="2">11. Nature of indirect beneficial ownership</th></tr>
 <tr><th class="sub">Code</th><th class="sub">V</th><th class="sub r">(A)</th><th class="sub r">(D)</th><th class="sub">Date exercisable</th><th class="sub">Expiration date</th><th class="sub">Title</th><th class="sub r">Amount or number of shares</th></tr>`,
 cols:16,
 row:t=>{const a=/^A$/i.test(t.acquiredDisposed?.v||""),dd=/^D$/i.test(t.acquiredDisposed?.v||"");const amt=show(t.shares,"num")+(t.acquiredDisposed?.fn?.length?fn(t.acquiredDisposed):"");
  return `<td>${show(t.security)}</td><td class="r">${show(t.exercisePrice,"price")}</td><td>${show(t.date,"date")}</td><td>${show(t.deemedDate,"date")}</td><td>${show(t.code)}</td><td>${t.voluntary?"V":""}</td><td class="r">${a?amt:""}</td><td class="r">${dd?amt:""}</td><td>${show(t.exerciseDate,"date")}</td><td>${show(t.expirationDate,"date")}</td><td>${show(t.underlyingTitle)}</td><td class="r">${show(t.underlyingShares,"num")}</td><td class="r">${show(t.price,"price")}</td><td class="r">${show(t.ownedAfter,"num")}</td><td>${show(t.ownership)}</td><td>${show(t.nature)}</td>`;}};
const table=(T,rows)=>`<div class="fl-part"><h3 class="t-label" aria-hidden="true">${esc(T.caption)}</h3><div class="fl-table-wrap" tabindex="0" role="region" aria-label="${esc(T.caption)}"><table class="fl-table${T.wide?" fl-table--wide":""}"><caption class="sr-only">${esc(T.caption)}</caption><thead>${T.head}</thead><tbody>${rows.length?rows.map(t=>`<tr>${T.row(t)}</tr>`).join(""):`<tr><td class="empty" colspan="${T.cols}">Nothing reported in this table.</td></tr>`}</tbody></table></div></div>`;

function render(r){
 const d=r.document,f=r.filing,form=d.form||f.form||"4";
 doc.innerHTML=`<header class="fl-form"><div><p class="fl-form__name">Form ${esc(form)}</p><p class="fl-form__title">${esc(FORM[form.replace(/\/A$/i,"")]||"Ownership report")}${/\/A$/i.test(form)?" (amendment)":""}</p></div>
 <p class="t-micro muted fl-form__law">Filed pursuant to Section 16(a) of the Securities Exchange Act of 1934 or Section 30(h) of the Investment Company Act of 1940. U.S. Securities and Exchange Commission, Washington, D.C. 20549.</p></header>
 ${boxes(d,f)}
 ${table(TABLE1,d.nonDerivative)}
 ${table(TABLE2,d.derivative)}
 <div class="fl-part"><h3 class="t-label">Explanation of responses</h3>${d.footnotes.length?`<ol class="fl-notes">${d.footnotes.map(n=>`<li id="fn-${esc(n.id)}"><span class="t-label muted">(${esc(n.id.replace(/^F/i,""))})</span><span class="t-label">${esc(n.text)}</span></li>`).join("")}</ol>`:`<p class="t-label muted">No footnotes.</p>`}</div>
 ${d.remarks?`<div class="fl-part"><h3 class="t-label">Remarks</h3><p class="t-label">${esc(d.remarks)}</p></div>`:""}
 <div class="fl-part"><h3 class="t-label">Signature${d.signatures.length>1?"s":""}</h3><div class="fl-sign">${d.signatures.length?d.signatures.map(s=>`<p class="t-label">${esc(s.name||"")}<br><span class="muted">${esc(day(s.date)||s.date||"")}</span></p>`).join(""):`<p class="t-label muted">No signature recorded in the filing's data.</p>`}</div>
 <p class="t-micro muted">** Signature of reporting person. Date.</p></div>`;
 doc.setAttribute("aria-busy","false");
}

/* ---------- the reported lines in plain words ---------- */
function lines(items){
 const el=$("[data-fl-lines]");if(!items.length)return;
 el.innerHTML=items.map(t=>{const code=String(t.transaction_code||"").toUpperCase();
  const what=(CODE[code]||"Other transaction")+(t.derivative?" (derivative)":"");
  const qty=t.shares!=null?fmt.shares(t.shares)+" "+(t.security_title||"shares"):"";
  const px=Number(t.price_per_share)>0?" at $"+Number(t.price_per_share).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:6}):""; // the price as filed, not rounded
  return `<li class="row fl-line"><span><span class="t-body">${personLink(t.owner_cik,fmt.person(t.owner_name))}: ${esc(what)}</span><span class="t-label muted">${esc(qty+px)}${t.transaction_date?" · "+esc(fmt.date(t.transaction_date)):""}</span></span><span class="fl-line__v t-body">${Number(t.estimated_value)>0?esc(fmt.money(t.estimated_value)):""}</span></li>`;}).join("");
 $("[data-fl-summary]").hidden=false;
}

function original(url,index){
 const a=$("[data-fl-original]"),u=secUrl(url);if(u){a.href=u;a.hidden=false;}
 const i=$("[data-fl-index]"),x=secUrl(index);if(x){i.href=x;i.hidden=false;}
 return u;
}

async function load(){
 if(!/^(\d{18}|\d{10}-\d{2}-\d{6})$/.test(acc)){status.textContent="No filing selected. Open one from a stock, an alert or Today.";doc.hidden=true;return;}
 const [base,full]=await Promise.allSettled([api("/v1/filings/"+encodeURIComponent(acc)),api("/v1/filings/"+encodeURIComponent(acc)+"/document")]);
 const f=base.value?.filing,r=full.value;
 if(!f&&!r){status.textContent=base.reason?.message||"This filing could not be loaded.";doc.hidden=true;return;}
 const ticker=f?.ticker||r?.filing?.ticker||"",name=f?.issuer_name||r?.filing?.issuerName||"";
 $("[data-fl-logo]").innerHTML=logo(ticker,40,name);hydrateLogos($(".fl-head"));
 const title=(fmt.company(name)||ticker||"SEC filing")+(ticker?` (${ticker})`:"");
 $("[data-fl-title]").textContent=title;document.title=title+" · Form "+(f?.form_type||r?.filing?.form||"4")+" — Insidir";
 const published=f?.published_at||r?.filing?.publishedAt;
 $("[data-fl-sub]").textContent="Form "+(f?.form_type||r?.filing?.form||"4")+(published?" · filed "+fmt.date(published):"")+" · accession "+acc;
 const url=original(r?.sourceUrl||f?.source_url,r?.indexUrl);
 lines(base.value?.transactions||[]);
 if(r?.document){render(r);return;}
 doc.setAttribute("aria-busy","false");
 doc.innerHTML=`<p class="t-body">The full filing could not be shown here right now${full.reason?.message?": "+esc(full.reason.message):""}.</p>${url?`<p class="t-body"><a class="btn btn--secondary" href="${esc(url)}" target="_blank" rel="noopener">Read it on SEC.gov <span aria-hidden="true">↗</span></a></p>`:""}`;
}
load().catch(e=>{status.textContent=e.message||"This filing could not be loaded.";});
})();
