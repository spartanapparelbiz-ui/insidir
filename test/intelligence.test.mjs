import test from "node:test";
import assert from "node:assert/strict";
import { allowedSecUrl } from "../src/sec.mjs";
import { secFilingUrl,tickerRecord,extractFilings,extractFinancialFacts,buildEvidenceBrief,getCompanyIntelligence } from "../src/intelligence.mjs";
const CIK="0000320193";
const ACCESSION="0000320193-26-000077";
test("SEC URL allowlist permits fixed API paths but refuses arbitrary hosts and paths",()=>{
  const allowed=[
    "https://www.sec.gov/files/company_tickers.json",
    "https://data.sec.gov/submissions/CIK0000320193.json",
    "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json"
  ];
  allowed.forEach(url=>assert.equal(allowedSecUrl(url),true,url));
  [
    "http://data.sec.gov/submissions/CIK0000320193.json",
    "https://data.sec.gov.evil.com/submissions/CIK0000320193.json",
    "https://data.sec.gov/submissions/CIK0000320193.json?q=secret",
    "https://data.sec.gov/api/xbrl/companyconcept/CIK0000320193.json",
    "https://www.sec.gov/files/private.json",
    "https://www.sec.gov@evil.com/files/company_tickers.json"
  ].forEach(url=>assert.equal(allowedSecUrl(url),false,url));
});
test("ticker lookup uses SEC CIK values and never fuzzy matches company names",()=>{
  const input={"0":{ticker:"AAPL",cik_str:320193,title:"APPLE INC"},"1":{ticker:"NVDA",cik_str:1045810,title:"NVIDIA CORP"}};
  assert.deepEqual(tickerRecord(input,"AAPL"),{ticker:"AAPL",cik:CIK,name:"APPLE INC"});
  assert.equal(tickerRecord(input,"APPL"),null);
  assert.equal(tickerRecord(input,"AAPL/../"),null);
});
test("SEC filing URLs are constructed safely from exact identifiers",()=>{
  const link=secFilingUrl(CIK,ACCESSION,"aapl-report.htm");
  assert.equal(link,"https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-report.htm");
  assert.ok(secFilingUrl(CIK,ACCESSION,"../private").endsWith(ACCESSION+"-index.html"));
  assert.equal(secFilingUrl(CIK,"invalid","report.htm"),null);
});
test("company submissions preserve forms, amendments, dates, and direct SEC documents",()=>{
  const submissions={filings:{recent:{form:["8-K","10-Q","4","8-K/A"],
    accessionNumber:[ACCESSION,"0000320193-26-000076","0000320193-26-000075","0000320193-26-000074"],
    filingDate:["2026-10-11","2026-10-10","2026-10-09","2026-10-08"],
    reportDate:["2026-10-10","2026-09-30","2026-10-08","2026-10-07"],
    primaryDocument:["report.htm","quarterly.htm","insider.htm","amendment.htm"]}}};
  const results=extractFilings(submissions,CIK);
  assert.equal(results.length,3);
  assert.deepEqual(results.map(x=>x.form),["8-K","10-Q","8-K/A"]);
  assert.equal(results[0].filedAt,"2026-10-11");
  assert.match(results[2].sourceUrl,/amendment\.htm$/);
});
test("XBRL fundamentals preserve actual financial periods and filing evidence",()=>{
  const facts={facts:{"us-gaap":{
    RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[
      {val:120000000,form:"10-K",filed:"2026-03-01",end:"2025-12-31",start:"2025-01-01",accn:ACCESSION,fy:2025,fp:"FY"},
      {val:32000000,form:"10-Q",filed:"2026-09-02",end:"2026-06-30",start:"2026-04-01",accn:ACCESSION,fy:2026,fp:"Q2"}
    ]}},
    NetIncomeLoss:{units:{USD:[{val:-7000000,form:"10-Q",filed:"2026-09-02",end:"2026-06-30",start:"2026-04-01",accn:ACCESSION}]}},
    Assets:{units:{USD:[{val:55000000,form:"10-Q",filed:"2026-09-02",end:"2026-06-30",accn:ACCESSION}]}}
  }}};
  const results=extractFinancialFacts(facts,CIK);
  assert.equal(results.length,3);
  assert.equal(results.find(x=>x.id==="revenue")?.value,32000000);
  assert.equal(results.find(x=>x.id==="revenue")?.start,"2026-04-01");
  assert.equal(results.find(x=>x.id==="netIncome")?.value,-7000000);
  assert.equal(results.find(x=>x.id==="assets")?.source,"SEC XBRL company facts");
  assert.ok(results.every(x=>x.sourceUrl.startsWith("https://www.sec.gov/Archives/edgar/data/")));
});
test("evidence brief does not imply trades caused filings, and handles PostgreSQL Date objects",()=>{
  const company={ticker:"AAPL",name:"APPLE INC"};
  const result=buildEvidenceBrief({company,
    filings:[{accession:ACCESSION,form:"8-K",headline:"Company current report",filedAt:"2026-10-11",
      source:"SEC EDGAR submissions",sourceUrl:"https://www.sec.gov/filing"}],
    facts:[],transactions:[{id:"tx:1",owner_name:"A person",category:"reported_purchase",
      transaction_date:new Date("2026-10-08T00:00:00.000Z"),published_at:new Date("2026-10-10T00:00:00.000Z"),
      source_url:"https://www.sec.gov/ownership"}]});
  assert.equal(result.findings.length,2);
  assert.equal(result.findings[1].reportedAt,"2026-10-10");
  assert.match(result.summary,/not evidence that events caused one another/);
  assert.doesNotMatch(result.summary,/guaranteed profit/i);
});
test("intelligence combines SEC map, submissions and facts while excluding mismatched CIKs",async()=>{
  const responses=new Map([
    ["https://www.sec.gov/files/company_tickers.json",{"0":{ticker:"ZXYZ",cik_str:320193,title:"ZXYZ Inc."}}],
    ["https://data.sec.gov/submissions/CIK0000320193.json",{name:"ZXYZ Incorporated",filings:{recent:{form:["8-K"],accessionNumber:[ACCESSION],filingDate:["2026-10-11"],primaryDocument:["report.htm"]}}}],
    ["https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",{facts:{}}]
  ]);
  const calls=[];
  const fetcher=async(url)=>{calls.push(url);if(!responses.has(url))throw Error("Unexpected URL");return responses.get(url);};
  const result=await getCompanyIntelligence("ZXYZ",[
    {id:"good",issuer_cik:"320193",owner_name:"A person",published_at:"2026-10-11",source_url:"https://www.sec.gov/a"},
    {id:"different-company",issuer_cik:"999999",owner_name:"Someone",published_at:"2026-10-11"}
  ],fetcher);
  assert.equal(result.company.cik,CIK);
  assert.equal(result.company.name,"ZXYZ Incorporated");
  assert.equal(result.brief.findings.length,2);
  assert.match(result.warnings.join(" "),/excluded/);
  assert.equal(calls.length,3);
  const again=await getCompanyIntelligence("ZXYZ",[],fetcher);
  assert.equal(again.company.ticker,"ZXYZ");
  assert.equal(calls.length,3,"cached SEC fetches should prevent duplicate calls");
});
