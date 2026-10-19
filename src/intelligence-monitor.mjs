/* Public source monitoring: official SEC issuer announcements (8-K / 6-K)
 * and expressly configured public Bluesky authors. Store metadata + source link
 * rather than copyrighted news articles or unverified political claims. */
import {query as queryDb} from "./db.mjs";
import {secFetch} from "./sec.mjs";
import {tickerIndex,tickerRecord,secFilingUrl} from "./intelligence.mjs";
import {externalFetch} from "./external.mjs";
import {XMLParser} from "fast-xml-parser";

export const monitorSources=()=>({
 secCompanyReports:"enabled",
 blueskyPublicPosts:(process.env.INSIDIR_BLUESKY_HANDLES||"").trim()?"configured":"no_accounts_configured",
 houseFinancialDisclosures:process.env.INSIDIR_HOUSE_DISCLOSURES_APPROVED==="1"?"pending_feed_check":"blocked_pending_legal_approval",
 senateFinancialDisclosures:"blocked_pending_legal_approval_and_access",
 licensedBreakingNews:"not_licensed"
});
/* SEC's market-wide current-form Atom feed: all accessible issuers, not merely
 * the tickers already on someone's watchlist. Type=8-K is a prefix match, so
 * verify the form exactly. Ticker assignment only comes from the SEC index. */
const atomParser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",parseTagValue:false});
const arrayOf=x=>x==null?[]:Array.isArray(x)?x:[x];
const atomText=x=>typeof x==="string"?x:typeof x==="object"&&x!=null?String(x["#text"]||""):String(x||"");
export function parseOfficial8KFeed(xml,index={},now=Date.now()){
 let parsed;
 try{parsed=atomParser.parse(String(xml||"")).feed}catch{return []}
 const byCik=new Map();
 for(const item of Object.values(index||{})){
  const cik=String(item?.cik_str||"").replace(/^0+/,"");
  const t=String(item?.ticker||"").toUpperCase();
  if(/^\d{1,10}$/.test(cik)&&/^[A-Z0-9.-]{1,15}$/.test(t)&&!byCik.has(cik))byCik.set(cik,t);
 }
 const out=[],seen=new Set();
 for(const entry of arrayOf(parsed?.entry)){
  const title=atomText(entry.title);
  const type=atomText(entry["filing-type"]||entry["form-type"]||/^\s*(8-K(?:\/A)?)\s*[-:–—]/i.exec(title)?.[1]).toUpperCase();
  if(type!=="8-K"&&type!=="8-K/A")continue;
  const urlText=arrayOf(entry.link).map(x=>String(x?.["@_href"]||"")).find(x=>x.includes("/Archives/edgar/data/"));
  let url;try{url=new URL(urlText)}catch{continue}
  if(url.protocol!=="https:"||url.hostname!=="www.sec.gov")continue;
  const match=/^\/Archives\/edgar\/data\/(\d{1,10})\/(\d{18})\//.exec(url.pathname);
  if(!match)continue;
  const cik=match[1].replace(/^0+/,""),acc=match[2],when=Date.parse(atomText(entry.updated||entry.published));
  if(!Number.isFinite(when)||when<now-30*86400_000||when>now+86400_000||seen.has(acc))continue;
  seen.add(acc);
  const ticker=byCik.get(cik)||null,issuer=title.replace(/^\s*8-K(?:\/A)?\s*[-:–—]\s*/i,"").trim().slice(0,140);
  out.push({event_key:"notice:"+acc,source_type:"sec_notice",
   title:(issuer||ticker||"Public company")+" filed "+type+" with the SEC",
   subject:ticker||issuer||"Issuer CIK "+cik,
   source_url:url.href,published_at:new Date(when).toISOString(),
   metadata:{cik,accession:acc,ticker,form:type,issuerName:issuer,source:"SEC EDGAR current-filings feed"}});
 }
 return out;
}
export async function monitorMarketWideSEC({run=queryDb,fetcher=secFetch,loadIndex=tickerIndex}={}){
 const [xml,index]=await Promise.all([
  fetcher("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom&count=100"),
  loadIndex()
 ]);
 const events=parseOfficial8KFeed(xml,index);
 return {checked:events.length,newEvents:await saveEvents(events,run),source:"SEC current 8-K Atom"};
}
export function secAnnouncementEvents(submissions,ticker,cik){
 const recent=submissions?.filings?.recent;
 if(!Array.isArray(recent?.form))return [];
 const rows=[],seen=new Set();
 for(let i=0;i<recent.form.length&&rows.length<12;i++){
  const form=String(recent.form[i]||"");
  if(!["8-K","8-K/A","6-K"].includes(form))continue;
  const accession=String(recent.accessionNumber?.[i]||"");
  const doc=String(recent.primaryDocument?.[i]||"");
  const filed=String(recent.filingDate?.[i]||"");
  if(!/^\d{10}-\d{2}-\d{6}$/.test(accession)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/.test(doc)||
   !/^\d{4}-\d{2}-\d{2}$/.test(filed)||seen.has(accession))continue;
  if(Date.parse(filed+"T00:00:00Z")<Date.now()-30*86400_000)continue;
  seen.add(accession);
  rows.push({event_key:"notice:"+accession,source_type:"sec_notice",subject:ticker,
   title:ticker+" filed "+form+" with the SEC",
   source_url:secFilingUrl(cik,accession,doc),
   published_at:filed+"T12:00:00Z",
   metadata:{ticker,form,accession,source:"SEC EDGAR company submissions",filingDate:filed}});
 }
 return rows;
}
export function publicBlueskyEvents(feed,handle){
 if(!Array.isArray(feed?.feed))return [];
 const out=[];
 for(const entry of feed.feed.slice(0,30)){
  if(entry.reason||!entry.post?.record||entry.post.author?.handle?.toLowerCase()!==handle.toLowerCase())continue;
  const uri=String(entry.post.uri||"");
  const m=/^at:\/\/did:[a-z0-9:%._-]+\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)$/.exec(uri);
  if(!m)continue;
  const text=String(entry.post.record.text||"").replace(/\s+/g," ").trim();
  if(!text)continue;
  const date=String(entry.post.record.createdAt||"");
  if(!Number.isFinite(Date.parse(date)))continue;
  out.push({event_key:"bluesky:"+uri,source_type:"bluesky_post",subject:"@"+handle,
    title:("@"+handle+": "+text).slice(0,220),
    source_url:"https://bsky.app/profile/"+encodeURIComponent(handle)+"/post/"+encodeURIComponent(m[1]),
    published_at:new Date(date).toISOString(),
    metadata:{handle,source:"Bluesky public API; handle is configured, not independently identity-verified"}});
 }
 return out;
}
export const WRITE_EVENT_SQL=[
 "INSERT INTO research_events(event_key,source_type,title,source_url,subject,published_at,verified,metadata)",
 "VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(event_key) DO NOTHING"
].join(" ");
export async function saveEvents(events,run=queryDb){
 let stored=0;
 for(const e of events){
  if(!/^https:\/\//.test(e.source_url)||e.title.length>220)continue;
  const r=await run(WRITE_EVENT_SQL,[e.event_key,e.source_type,e.title,e.source_url,e.subject,e.published_at,true,JSON.stringify(e.metadata||{})]);
  stored+=r.rowCount||0;
 }
 return stored;
}
export async function monitorOfficialCompanyNews({run=queryDb,loadIndex=tickerIndex,fetcher=secFetch}={}){
 const symbols=(await run("SELECT DISTINCT ticker FROM watchlist ORDER BY ticker LIMIT 30")).rows.map(x=>x.ticker);
 if(!symbols.length)return {checked:0,newEvents:0};
 const index=await loadIndex();
 let checked=0,newEvents=0,failed=0;
 for(const symbol of symbols){
  const info=tickerRecord(index,symbol);if(!info)continue;
  const id=String(info.cik||"").replace(/^0+/,"");if(!/^\d{1,10}$/.test(id))continue;
  try{
   const data=await fetcher("https://data.sec.gov/submissions/CIK"+id.padStart(10,"0")+".json",{json:true});
   newEvents+=await saveEvents(secAnnouncementEvents(data,symbol,id),run);checked++;
  }catch(e){failed++;}
 }
 return {checked,newEvents,failed};
}
export async function monitorBluesky({run=queryDb,fetcher=externalFetch}={}){
 const handles=[...new Set((process.env.INSIDIR_BLUESKY_HANDLES||"").split(",").map(h=>h.trim().toLowerCase()).filter(h=>/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(h)))].slice(0,25);
 let checked=0,newEvents=0,failed=0;
 for(const handle of handles){
  try{
   const apiUrl="https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor="+encodeURIComponent(handle)+"&limit=30&filter=posts_no_replies";
   const data=await fetcher(apiUrl,{json:true,maxBytes:600_000,timeoutMs:9000});
   newEvents+=await saveEvents(publicBlueskyEvents(data,handle),run);checked++;
  }catch(e){failed++;}
 }
 return {checked,newEvents,failed};
}
// Only poll the broad market feed every 15 minutes; refresh individual issuer
// submissions less frequently, since every ticker is already covered by shared
// event storage and per-user watches must never cause duplicate SEC requests.
let lastIssuerPoll=0;
const issuerIntervalMs=60*60*1000;
let busy=false;
export async function monitorTick(run=queryDb){
 if(busy)return {skipped:true};
 busy=true;
 try{
  const pollIssuers=Date.now()-lastIssuerPoll>=issuerIntervalMs;
  if(pollIssuers)lastIssuerPoll=Date.now();
  const [market,news,social]=await Promise.allSettled([monitorMarketWideSEC({run}),pollIssuers?monitorOfficialCompanyNews({run}):Promise.resolve({skipped:"shared_hourly_poll"}),monitorBluesky({run})]);
  return {marketWideSEC:market.status==="fulfilled"?market.value:{error:String(market.reason?.message||market.reason)},
   officialSEC:news.status==="fulfilled"?news.value:{error:String(news.reason?.message||news.reason)},
   social:social.status==="fulfilled"?social.value:{error:String(social.reason?.message||social.reason)}};
 }finally{busy=false}
}
