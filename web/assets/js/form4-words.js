/* Insidir Form 4 wording and exact figures (window.InsidirForm4), shared by the overview (v3-dashboard.js, and
   through window.InsidirDesk v4-dashboard.js and v13-overview.js) and the personnel file (person.js), so a trade
   reads the same sentence with the same figures on both pages. Loaded before either script; no requests, no DOM.

   Figures are written from their digits as filed, never through floating-point arithmetic: a pg NUMERIC string
   (transaction lines) is used as it is, a JSON number by its shortest round-trip digits. Shares and prices keep
   every significant digit up to the column's 8 decimals (NUMERIC(30,8)); only trailing zeros go. Dollar values
   are cents as stored (NUMERIC(30,2)): $1,132,000 or $3,147,051.58, never rounded to the dollar. Sums are added
   in whole cents (BigInt). Grouped by thousands; trade dates in UTC, SEC filing dates on the Eastern calendar day.
   Nothing here uses Intl: its first use loads ICU's locale data (about 20 ms of main thread on a desktop, four
   times that on a phone), so figures and dates are written out exactly as en-US Intl would.

   describe(x, opts) is one plain-English sentence for every Form 4 transaction code, always led by a verb so it
   can follow a person's name ("sold 12,500 AAPL shares at $26.00"); `short` is the same deal without the verb,
   for a line where a badge already says it. An option exercise or conversion files two lines, the units given
   up (Table II, derivative) and the common shares received (Table I): each is described as what it is.

   restated(rows) is the amendments rule of GET /v1/people/<cik> (src/person-profile.mjs SAME_LINE): a line is
   left out of totals when a Form 4/A published after its own filing repeats it (same person, issuer, trade
   date, code, acquired/disposed, derivative flag and shares), so a sale restated by two 4/As is one sale. */
(()=>{"use strict";
if(window.InsidirForm4)return;

/* ---------- digits ---------- */
const MONTHS="Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const MINUS="−",SCALE=8;
const group=s=>s.replace(/\B(?=(\d{3})+(?!\d))/g,",");
// "1.23e-7" -> "0.000000123", digit for digit.
function expand(s){
 const m=/^([-+]?)(\d+)(?:\.(\d*))?e([-+]?\d+)$/i.exec(s);if(!m)return s;
 const d=m[2]+(m[3]||""),p=m[2].length+Number(m[4]);
 return m[1]+(p<=0?"0."+"0".repeat(-p)+d:p>=d.length?d+"0".repeat(p-d.length):d.slice(0,p)+"."+d.slice(p));
}
// The decimal digits of a figure, as a string ("-1000.12345678"), or null when there is no figure.
function digits(x){
 if(typeof x==="number")return Number.isFinite(x)?expand(String(x)):null;
 if(typeof x==="bigint")return String(x);
 if(typeof x!=="string")return null;
 const s=x.trim();
 if(/^[-+]?\d+(\.\d*)?$/.test(s))return s;
 const n=Number(s);return s&&Number.isFinite(n)?expand(String(n)):null;
}
// Past `max` decimals (only a figure finer than its column could get there) round half away from zero.
function roundDigits(i,f,max){
 if(f.length<=max)return [i,f];
 const keep=f.slice(0,max);
 if(f.charCodeAt(max)-48<5)return [i,keep];
 const d=(i+keep).split("").map(Number);let k=d.length-1;
 while(k>=0){if(d[k]<9){d[k]++;break;}d[k]=0;k--;}
 if(k<0)d.unshift(1);
 const all=d.join(""),cut=all.length-keep.length;
 return [all.slice(0,cut)||"0",all.slice(cut)];
}
// Grouped, at least `min` and at most `max` decimals, trailing zeros dropped down to `min`.
function decimal(x,min,max){
 const s=digits(x);if(s===null)return "";
 const neg=s.charAt(0)==="-",[i0,f0=""]=s.replace(/^[-+]/,"").split(".");
 const [i,f]=roundDigits(i0||"0",f0,max);let g=f.replace(/0+$/,"");while(g.length<min)g+="0";
 const out=group(i.replace(/^0+(?=\d)/,""))+(g?"."+g:"");
 return (neg&&/[1-9]/.test(out)?"-":"")+out;
}
const cash=(x,min,max)=>{const s=decimal(x,min,max);return s.charAt(0)==="-"?MINUS+"$"+s.slice(1):"$"+s;};
// Whole cents as a BigInt ("41532.10" -> 4153210n), so sums and differences of dollar values stay exact.
function cents(x){
 const s=digits(x);if(s===null)return null;
 const neg=s.charAt(0)==="-",[i,f=""]=s.replace(/^[-+]/,"").split(".");
 const [ri,rf]=roundDigits(i||"0",f,2);
 const v=BigInt(ri)*100n+BigInt((rf+"00").slice(0,2));return neg?-v:v;
}
const fromCents=v=>{const a=v<0n?-v:v;return (v<0n?"-":"")+(a/100n)+"."+String(a%100n).padStart(2,"0");};
// A figure in units of 1e-8 (the NUMERIC(30,8) scale), as a BigInt.
function scaled(x){
 const s=digits(x);if(s===null)return null;
 const neg=s.charAt(0)==="-",[i,f=""]=s.replace(/^[-+]/,"").split(".");
 const [ri,rf]=roundDigits(i||"0",f,SCALE);
 const v=BigInt(ri)*10n**BigInt(SCALE)+BigInt((rf+"0".repeat(SCALE)).slice(0,SCALE));return neg?-v:v;
}
const fromScaled=v=>{const a=v<0n?-v:v,u=10n**BigInt(SCALE);return (v<0n?"-":"")+(a/u)+"."+String(a%u).padStart(SCALE,"0");};
const num=x=>{if(x===null||x===undefined||x==="")return null;const n=Number(x);return Number.isFinite(n)?n:null;};

/* ---------- figures in words ---------- */
// Dollar values to the cent when there are cents ($1,132,000 or $41,532.10): nothing is rounded away.
const moneyCents=c=>c===null||c===undefined?"Not reported":cash(fromCents(c),c%100n!==0n?2:0,2);
const money=x=>moneyCents(cents(x));
// "+$1,200", "−$285,000", "$0": the sign from the exact cents.
const signedCents=c=>c>0n?"+"+moneyCents(c):c<0n?moneyCents(c):"$0";
const signedMoney=x=>{const c=cents(x);return c===null?"Not reported":signedCents(c);};
// Prices as filed: every decimal the filing gives ($41.5321, $0.000123), at least the cents.
const price=x=>digits(x)===null?"Not reported":cash(x,2,SCALE);
// Share counts and other counts as filed (fractional shares keep every decimal: 1,000.12345678).
const count=n=>decimal(n,0,SCALE);
const qty=x=>digits(x)===null?"Not reported":count(x);
const plural=(n,one,many)=>count(n)+" "+(Number(n)===1?one:(many||one+"s"));

/* ---------- dates ---------- */
const validDate=x=>{if(!x)return null;const d=new Date(x);return Number.isNaN(d.getTime())?null:d;};
/* US Eastern calendar day of an instant (SEC filing dates): EDT from the second Sunday of March 2:00 to the first Sunday of
   November 2:00 since 2007; from the first Sunday of April to the last Sunday of October before. */
function eastern(d){
 const y=d.getUTCFullYear(),sun=(m,n)=>{const w=new Date(Date.UTC(y,m,1)).getUTCDay();return 1+(7-w)%7+7*(n-1);},lastSun=m=>{const l=new Date(Date.UTC(y,m+1,0));return l.getUTCDate()-l.getUTCDay();};
 const [a,b]=y>=2007?[Date.UTC(y,2,sun(2,2),7),Date.UTC(y,10,sun(10,1),6)]:[Date.UTC(y,3,sun(3,1),7),Date.UTC(y,9,lastSun(9),6)];
 const t=d.getTime(),e=new Date(t+(t>=a&&t<b?-4:-5)*3600000);
 return {y:e.getUTCFullYear(),m:e.getUTCMonth(),d:e.getUTCDate()};
}
const utcDay=d=>({y:d.getUTCFullYear(),m:d.getUTCMonth(),d:d.getUTCDate()});
const dayText=(p,year=true)=>MONTHS[p.m]+" "+p.d+(year?", "+p.y:"");
const isoOf=p=>p.y+"-"+String(p.m+1).padStart(2,"0")+"-"+String(p.d).padStart(2,"0");
// Trade dates are date-only values and stay in UTC; filing dates are the SEC's (Eastern) calendar day: a Form 4
// accepted at 9:30 p.m. ET is filed that day, though it is past midnight UTC.
const date=x=>{const d=validDate(x);return d?dayText(utcDay(d)):"Not reported";};
const filedDate=x=>{const d=validDate(x);return d?dayText(eastern(d)):"Not reported";};
const tradeIso=x=>{const d=validDate(x);return d?isoOf(utcDay(d)):"";};
const filedIso=x=>{const d=validDate(x);return d?isoOf(eastern(d)):"";};
/* Calendar days from the trade date to the SEC filing date (the Eastern calendar day of publication). */
const lagOf=x=>{const t=validDate(x?.transaction_date),p=validDate(x?.published_at);if(!t||!p)return null;const d=Math.round((Date.parse(filedIso(x.published_at))-Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate()))/86400000);return d>=0?d:null;};
const lagWords=n=>n===null?"":n===0?"same day":n===1?"1 day later":count(n)+" days later";

/* ---------- Form 4 codes ---------- */
// "NONE" and "NA" are placeholders some filers put in the ticker field; they are not symbols.
const tick=x=>{const s=String(x||"").trim().toUpperCase();return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(s)&&s!=="NONE"&&s!=="NA"?s:"";};
/* The SEC's own wording (Form 4 general instructions), shown in a badge's title. */
const CODES=Object.freeze({
 P:"Open market or private purchase",S:"Open market or private sale",V:"Transaction voluntarily reported earlier than required",
 A:"Grant, award or other acquisition from the issuer",D:"Disposition to the issuer",F:"Payment of exercise price or tax liability by delivering or withholding securities",
 I:"Discretionary transaction",M:"Exercise or conversion of an exempt derivative security",C:"Conversion of a derivative security",
 E:"Expiration of a short derivative position",H:"Expiration or cancellation of a long derivative position with value received",
 O:"Exercise of an out-of-the-money derivative security",X:"Exercise of an in-the-money or at-the-money derivative security",
 G:"Bona fide gift",L:"Small acquisition under Rule 16a-6",W:"Acquisition or disposition by will or the laws of descent and distribution",
 Z:"Deposit into or withdrawal from a voting trust",J:"Other acquisition or disposition (described in the filing)",K:"Equity swap or similar instrument",
 U:"Disposition from a tender of shares in a change of control"});
/* Nouns for "Also filed since: option exercise by …" and the "not a purchase or sale" counts. [one, many] */
const NOUN=Object.freeze({A:["grant","grants"],M:["option exercise","option exercises"],X:["option exercise","option exercises"],O:["option exercise","option exercises"],
 C:["conversion","conversions"],F:["tax withholding","tax withholdings"],G:["gift","gifts"],D:["return to the company","returns to the company"],
 E:["expiration","expirations"],H:["expiration","expirations"],I:["discretionary trade","discretionary trades"],J:["other transaction","other transactions"],
 K:["equity swap","equity swaps"],L:["small acquisition","small acquisitions"],W:["will or inheritance","wills or inheritances"],Z:["voting trust change","voting trust changes"],
 U:["tender in a change of control","tenders in a change of control"],V:["early voluntary report","early voluntary reports"],
 "P derivative":["derivative purchase","derivative purchases"],"S derivative":["derivative sale","derivative sales"]});
const code=x=>String(x?.transaction_code||"").replace(/[^A-Z]/gi,"").slice(0,1).toUpperCase();
const codeMeaning=c=>CODES[c]||"";
const nounKey=x=>{const c=code(x);return (c==="P"||c==="S")&&x?.derivative?c+" derivative":c;};
const noun=(x,n=1)=>{const k=typeof x==="string"?x:nounKey(x),w=NOUN[k];return w?w[Number(n)===1?0:1]:"Form 4 code "+String(k).slice(0,1);};
/* buy | sell | other, from the engine's category (non-derivative P acquired / S disposed). */
const kind=x=>x?.category==="reported_purchase"?"buy":x?.category==="reported_sale"?"sell":"other";
const rawPrice=x=>x?.price_per_share??x?.price;
// Shares as filed, without the sign (the verb or the +/− carries the direction); null when not reported.
const sharesText=x=>{const s=digits(x?.shares);return s===null?null:count(s.replace(/^[-+]/,""));};
const ownership=x=>{const o=String(x?.direct_ownership||"").toUpperCase();return o==="D"?"Direct":o==="I"?"Indirect":"";};
// "Common Stock", "Class A Ordinary Shares" read as "shares"; anything else (units, options, notes) keeps its title.
const isPlainShares=t=>!t||/^(class [a-z0-9]+ )?(common|ordinary)( stock| shares)?( ?,? ?(class [a-z0-9]+|par value.*))?$|^(common )?shares$/i.test(String(t).trim());
const security=x=>{const t=String(x?.security_title||"").replace(/\s+/g," ").trim().slice(0,60);return isPlainShares(t)?"":t;};
/* The line's value in cents: the stored estimated_value (shares x price, to the cent, as imported); only when it is
   missing, shares x price worked out exactly here and rounded half away from zero to the cent. */
function valueCents(x){
 const v=cents(x?.estimated_value);if(v!==null)return v;
 const s=scaled(x?.shares),p=scaled(rawPrice(x));
 if(s===null||p===null||s<0n||p<=0n)return null;
 const q=s*p,unit=10n**BigInt(2*SCALE-2);return (q+unit/2n)/unit;
}

/* describe(x, opts): {word, cls, c, text, short, suffix, valued, value, priced, tiny}. `word` and `cls` make the badge
   ("Sold", red), `text` is the sentence after the person's name, `short` the same deal without the verb, `value` the
   dollar value in cents (BigInt) counted for purchases and sales (null when nothing is counted), `suffix` the
   qualifiers in words. opts.ticker:false leaves the symbol out; opts.as:"name" uses the company's name instead
   ("150,000 Tesla, Inc. shares"); opts.companyName formats that name. */
const an=w=>(/^[aeiou]/i.test(w)?"an ":"a ")+w;
function describe(x,opts={}){
 const c=code(x),k=kind(x),p=digits(rawPrice(x)),v=valueCents(x),T=tick(x?.ticker),ad=String(x?.acquired_disposed||"").toUpperCase();
 const sh=sharesText(x)??"an unreported number of";
 const nameOf=opts.companyName||(s=>s);
 const company=opts.as==="name"&&x?.issuer_name?nameOf(x.issuer_name):T;
 const tk=opts.ticker===false||!company?"":company+" ";
 const sec=security(x),units=sec||(tk+"shares").trim(),dunits=sec||(tk+"derivative securities").trim();
 // A Table II line, or (when the engine sent no flag) a title that is not plain shares.
 const deriv=x?.derivative===true||((x?.derivative===undefined||x?.derivative===null)&&!!sec);
 const verb=ad==="A"?"acquired":ad==="D"?"disposed of":"reported";
 let word,cls="other",text,short,valued=false;
 const at=p!==null?" at "+price(p):" (no price reported)";
 if(k==="buy"){word="Bought";cls="buy";short=sh+" "+tk+"shares"+at;text="bought "+short;valued=true;}
 else if(k==="sell"){word="Sold";cls="sell";short=sh+" "+tk+"shares"+at;text="sold "+short;valued=true;}
 else switch(c){
  case "P":word="Bought";short=sh+" "+dunits;text="bought "+short;break;
  case "S":word="Sold";short=sh+" "+dunits;text="sold "+short;break;
  case "A":word="Grant";short=sh+" "+tk+(sec||"shares");text="received "+short+" as a grant or award";break;
  // The derivative side of an exercise is the option or unit given up; the plain-shares side is the stock it became.
  case "M":case "X":case "O":word="Option exercise";
   if(!deriv&&!sec){short=sh+" "+tk+"shares "+(ad==="D"?"given up":"received");text=(ad==="D"?"disposed of ":"acquired ")+sh+" "+tk+"shares by exercising or converting derivative securities";}
   else{short=sh+" "+dunits;text="exercised or converted "+short;}
   break;
  case "C":word="Conversion";
   if(deriv){short=sh+" "+(sec||"derivative securities")+" into "+(T?T+" ":"")+"shares";text="converted "+short;}
   else if(ad==="D"){short=sh+" "+units+" given up";text="disposed of "+sh+" "+units+" in a conversion";}
   else{short=sh+" "+units+" received";text="acquired "+sh+" "+units+" by converting a derivative security";}
   break;
  case "F":word="Tax withholding";short=sh+" "+tk+"shares withheld for tax or the exercise price";text="had "+sh+" "+tk+"shares withheld to pay tax or the exercise price";break;
  case "G":word="Gift";short=sh+" "+tk+"shares "+(ad==="A"?"received":"given");text=(ad==="A"?"received ":"gave ")+sh+" "+tk+"shares as a gift";break;
  case "D":word="Returned";short=sh+" shares returned to "+(T||"the company");text="returned "+sh+" shares to "+(T||"the company");break;
  case "E":word="Expired";short=sh+" "+dunits+" expired";text="let "+an((sec||"derivative")+" position")+" of "+sh+" expire";break;
  case "H":word="Expired";short=sh+" "+dunits+" expired or cancelled";text="had "+an((sec||"derivative")+" position")+" of "+sh+" expire or be cancelled, with value received";break;
  case "I":word="Discretionary";short=sh+" "+units+" "+verb;text=verb+" "+sh+" "+units+" in a discretionary trade";break;
  case "J":word="Other";short=sh+" "+units+" "+verb+" (see the filing)";text=verb+" "+sh+" "+units+" in another kind of transaction, described in the filing";break;
  case "K":word="Equity swap";short=sh+" "+units+" "+verb;text=verb+" "+sh+" "+units+" through an equity swap";break;
  case "L":word="Small acquisition";short=sh+" "+units+" acquired";text="made a small acquisition of "+sh+" "+units;break;
  case "W":word="Will or inheritance";short=sh+" "+units+" "+verb;text=verb+" "+sh+" "+units+" by will or inheritance";break;
  case "Z":word="Voting trust";short=sh+" "+units+(ad==="D"?" withdrawn from":" deposited into")+" a voting trust";text=(ad==="D"?"withdrew ":"deposited ")+sh+" "+units+(ad==="D"?" from":" into")+" a voting trust";break;
  case "U":word="Tender";short=sh+" "+units+" tendered";text="tendered "+sh+" "+units+" in a change of control";break;
  case "V":word="Voluntary";short=sh+" "+units+" "+verb;text=verb+" "+sh+" "+units;break;
  default:word=c?"Code "+c:"Other";short=sh+" "+units+" "+verb;text=verb+" "+sh+" "+units;
 }
 const suffix=[c==="V"?"(reported early, voluntarily)":"",x?.is_amendment?"· amended filing (4/A)":"",ownership(x)==="Indirect"?"· held indirectly (by a trust or family member, for example)":""].filter(Boolean).join(" ");
 // A stored value of $0.00 on a priced line with shares is a value under half a cent, not nothing.
 const tiny=valued&&v===0n&&(scaled(x?.shares)??0n)>0n&&(scaled(rawPrice(x))??0n)>0n;
 return {word,cls,c,text,short,suffix,valued,value:valued&&v!==null&&v>0n?v:null,priced:p!==null,tiny};
}
/* "= $37,350,000", or the reason there is no value: "= $0" only for a price filed as $0.00 on a known share count. */
function valueText(x){
 const d=describe(x);if(!d.valued)return "";
 if(d.value!==null)return "= "+moneyCents(d.value);
 if(d.tiny)return "= under $0.01";
 return scaled(rawPrice(x))===0n&&sharesText(x)!==null?"= $0":"value not reported";
}
/* The qualifiers in short form for tight lines, each with its full wording as a sentence: [short, full]. */
const qualifiers=x=>[code(x)==="V"?["reported early","Reported early, voluntarily"]:null,
 x?.is_amendment?["amended filing (4/A)","An amended filing (Form 4/A) restating an earlier one"]:null,
 x?.superseded===true?["restated by a later 4/A, not counted","A later Form 4/A repeats this line; totals count it once, from the latest filing"]:null,
 ownership(x)==="Indirect"?["held indirectly","Held indirectly (by a trust or family member, for example)"]:null].filter(Boolean);

/* ---------- amendments ---------- */
const plainCik=x=>{const s=String(x??"").trim();return /^\d{1,12}$/.test(s)?s.replace(/^0+(?=\d)/,""):"";};
// The line's identity across an original Form 4 and the 4/As that restate it (src/person-profile.mjs SAME_LINE, plus
// the reporting person, because the overview mixes everyone's lines).
const sameLine=x=>[plainCik(x?.owner_cik)||String(x?.owner_name||"").trim().toUpperCase(),plainCik(x?.issuer_cik)||tick(x?.ticker),tradeIso(x?.transaction_date),code(x),
 String(x?.acquired_disposed||"").toUpperCase(),x?.derivative?"d":"",String(scaled(x?.shares)??"")].join("|");
/* The rows a Form 4/A published after their own filing repeats (originals and earlier 4/As alike): listed, never counted. */
function restated(rows){
 const latest=new Map();
 for(const x of rows)if(x?.is_amendment){const p=validDate(x.published_at),k=sameLine(x);if(p&&(!latest.has(k)||p>latest.get(k)))latest.set(k,p);}
 const out=new Set();if(!latest.size)return out;
 for(const x of rows){const a=latest.get(sameLine(x)),p=validDate(x?.published_at);if(a&&(!p||a>p))out.add(x);}
 return out;
}

window.InsidirForm4=Object.freeze({MONTHS,MINUS,SCALE,group,expand,digits,roundDigits,decimal,cash,cents,fromCents,scaled,fromScaled,num,
 money,moneyCents,signedMoney,signedCents,price,count,qty,plural,
 validDate,eastern,utcDay,dayText,isoOf,date,filedDate,tradeIso,filedIso,lagOf,lagWords,
 tick,CODES,NOUN,code,codeMeaning,nounKey,noun,kind,rawPrice,sharesText,ownership,isPlainShares,security,valueCents,
 describe,valueText,qualifiers,sameLine,restated});
})();
