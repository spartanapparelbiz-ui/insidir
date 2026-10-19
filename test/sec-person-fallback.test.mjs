import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSecOwnerIndex, fetchSecOwnerHistory } from "../src/sec-person-fallback.mjs";

const sample = {
  cik:1214156,
  name:"COOK TIMOTHY D",
  entityType:"other",
  tickers:[],
  filings:{files:[{name:"CIK0001214156-submissions-001.json"}],recent:{
    form:["4","4/A","10-K","4","4"],
    accessionNumber:["0001214156-25-000011","0001214156-25-000009","0001214156-25-000008","invalid","0001214156-25-000011"],
    filingDate:["2025-10-03","2025-09-30","2025-09-28","2025-09-01","2025-10-03"],
    reportDate:["2025-10-01","2025-09-28","2025-09-28","2025-08-30","2025-10-01"]
  }}
};

test("Historical SEC person exists even when Insidir has imported no Form 4 lines",()=>{
 const row=normalizeSecOwnerIndex(sample,"0001214156");
 assert.equal(row.coverage,"sec_submissions_history_only");
 assert.deepEqual(row.person,{cik:"0001214156",name:"COOK TIMOTHY D",filed_names:["COOK TIMOTHY D"]});
 assert.deepEqual(row.sec_filing_index.map(x=>x.form_type),["4","4/A"]);
 assert.equal(row.sec_filing_index[0].filed_at,"2025-10-03");
 assert.equal(row.sec_filing_index[0].accession,"0001214156-25-000011");
 assert.equal(row.history_partial,true);
 assert.doesNotMatch(JSON.stringify(row),/purchases_value|shares_after|price_per_share/);
 assert.match(row.edgar_url,/CIK=0001214156/);
});
test("SEC source verifies CIK and rejects unrelated entities or invented filings",()=>{
 assert.equal(normalizeSecOwnerIndex(sample,"0001214157"),null);
 assert.equal(normalizeSecOwnerIndex({cik:1214156,filings:{recent:{form:["4"],accessionNumber:["x"],filingDate:["2025-10-03"]}}},"1214156"),null);
 assert.equal(normalizeSecOwnerIndex({...sample,filings:{recent:{form:["10-K"],accessionNumber:["0001214156-25-000011"],filingDate:["2025-10-03"]}}},"1214156"),null);
});
test("SEC source fetcher is the exact fixed data.sec.gov submissions endpoint",async()=>{
 const urls=[];
 const data=await fetchSecOwnerHistory("1214156",{fetcher:async(url,options)=>{urls.push([url,options]);return sample;}});
 assert.equal(data.person.name,"COOK TIMOTHY D");
 assert.deepEqual(urls,[["https://data.sec.gov/submissions/CIK0001214156.json",{json:true}]]);
 assert.equal(await fetchSecOwnerHistory("nope",{fetcher:async()=>{throw Error("Must not fetch");}}),null);
});
