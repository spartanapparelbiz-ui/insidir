/* House Clerk Periodic Transaction Report INDEX monitor.
 * Not a transaction parser. The index has filing metadata, not individual trades.
 * Non-news commercial use of disclosed reports may be legally restricted:
 * this job is off until counsel confirms the basis for use. */
import {unzipSync,strFromU8} from "fflate";
import {query as queryDb} from "./db.mjs";
import {saveEvents} from "./intelligence-monitor.mjs";

export const houseApproved=()=>process.env.INSIDIR_HOUSE_DISCLOSURES_APPROVED==="1";
export function parseHouseIndex(tsv,year){
 const lines=String(tsv||"").replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
 if(lines.length<2)return [];
 const headers=lines.shift().split("\t").map(x=>x.trim().toLowerCase());
 const col=n=>headers.indexOf(n.toLowerCase());
 const type=col("FilingType"),last=col("Last"),first=col("First"),doc=col("DocID"),date=col("FilingDate"),district=col("StateDst");
 if([type,last,first,doc,date,district].some(x=>x<0))throw Error("Unexpected House Clerk index columns");
 const out=[],seen=new Set();
 for(const l of lines){
  const row=l.split("\t");
  if(row[type]?.trim()!=="P")continue;
  const id=String(row[doc]||"").trim();
  const name=String(row[first]||"").trim()+" "+String(row[last]||"").trim();
  const filed=String(row[date]||"").trim();
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(filed);
  if(!/^\d{5,12}$/.test(id)||m?.[3]!==String(year)||seen.has(id)||!name.trim())continue;
  const stamp=String(year)+"-"+m[1].padStart(2,"0")+"-"+m[2].padStart(2,"0");
  if(Number.isNaN(Date.parse(stamp)))continue;
  seen.add(id);
  out.push({event_key:"house-ptr:"+year+":"+id,source_type:"politician_disclosure",
    title:name.trim().slice(0,140)+" filed a House periodic transaction report",
    subject:name.trim().slice(0,140),
    source_url:"https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/"+year+"/"+id+".pdf",
    published_at:stamp+"T12:00:00Z",
    metadata:{docID:id,chamber:"US House",district:String(row[district]||"").trim(),
      reportType:"Periodic Transaction Report",coverage:"Official report index only. Individual transaction, asset and value not parsed.",source:"Office of the Clerk, U.S. House"}});
 }
 return out;
}
export async function pollHouse({year=new Date().getUTCFullYear(),fetcher=fetch,run=queryDb}={}){
 if(!houseApproved())return {enabled:false,reason:"Awaiting written legal review of commercial disclosure use"};
 if(!Number.isInteger(year)||year<2012||year>2100)throw Error("Invalid year");
 const url="https://disclosures-clerk.house.gov/public_disc/financial-pdfs/"+year+"FD.ZIP";
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetcher(url,{headers:{"User-Agent":"Insidir Research (hello@aethric.llc)","Accept":"application/zip"},signal:controller.signal,redirect:"error"});
  if(!response.ok)throw Error("House Clerk download HTTP "+response.status);
  const buf=new Uint8Array(await response.arrayBuffer());
  if(buf.length>3_000_000)throw Error("House Clerk ZIP larger than allowed");
  const entries=unzipSync(buf);
  const file=Object.entries(entries).find(([n])=>n.toLowerCase().endsWith(year+"fd.txt"));
  if(!file)throw Error("Official index TXT missing");
  if(file[1].byteLength>5_000_000)throw Error("House Clerk index larger than allowed");
  const records=parseHouseIndex(strFromU8(file[1]),year);
  const stored=await saveEvents(records.slice(-500),run);
  return {enabled:true,found:records.length,stored,coverage:"House PTR filings indexed only; no claimed trades",source:url};
 }finally{clearTimeout(timer)}
}
