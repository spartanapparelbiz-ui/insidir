import test from "node:test";
import assert from "node:assert/strict";
import {parseAtom,parseOwnership,allowedSecUrl} from "../src/sec.mjs";
import {clusterPurchases,sourceRegistry} from "../src/analysis.mjs";
import {hashPassword,verifyPassword} from "../src/auth.mjs";

const accession="000123456726000042",base="https://www.sec.gov/Archives/edgar/data/1234567/"+accession+"/";
const filing={accession,filerCik:"1234567",formType:"4",publishedAt:"2026-10-08T19:00:00Z",sourceUrl:base+"x-index.htm"};
const atom='<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">'+
  '<entry><title>4 - EXAMPLE CO</title><updated>2026-10-08T19:00:00Z</updated><link href="'+base+'x-index.htm" rel="alternate"/></entry>'+
  '<entry><title>duplicate</title><link href="'+base+'x-index.htm"/></entry>'+
  '<entry><title>other</title><link href="https://bad.example/Archives/edgar/data/1234567/'+accession+'/x-index.htm"/></entry></feed>';
const ownership='<?xml version="1.0" encoding="UTF-8"?>'+
'<ownershipDocument><documentType>4</documentType><periodOfReport>2026-10-07</periodOfReport>'+
'<issuer><issuerCik>0001234567</issuerCik><issuerName>Example Corp</issuerName><issuerTradingSymbol>EXMP</issuerTradingSymbol></issuer>'+
'<reportingOwner><reportingOwnerId><rptOwnerCik>0000000111</rptOwnerCik><rptOwnerName>JANE SAMPLE</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>0</isOfficer></reportingOwnerRelationship></reportingOwner>'+
'<nonDerivativeTable>'+
'<nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-10-07</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>100</value></transactionShares><transactionPricePerShare><value>42.50</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>'+
'<nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-10-07</value></transactionDate><transactionCoding><transactionCode>S</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>50</value></transactionShares><transactionPricePerShare><value>44.00</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>'+
'<nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-10-07</value></transactionDate><transactionCoding><transactionCode>A</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>200</value></transactionShares><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>'+
'</nonDerivativeTable><derivativeTable><derivativeTransaction><securityTitle><value>Option</value></securityTitle><transactionDate><value>2026-10-07</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></derivativeTransaction></derivativeTable></ownershipDocument>';

test("SEC Atom listings parse, deduplicate and reject untrusted hostnames",()=>{
  const x=parseAtom(atom);assert.equal(x.length,1);assert.equal(x[0].accession,accession);
  assert.equal(x[0].filerCik,"1234567");assert.equal(x[0].sourceUrl,filing.sourceUrl);
});
test("SEC Atom type=4 prefix matches 424B forms: importer must exclude prospectuses",()=>{
  const xml='<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">'+
   '<entry><title>424B2 - OFFERING</title><filing-type>424B2</filing-type><updated>2026-10-19T10:00:00Z</updated><link href="https://www.sec.gov/Archives/edgar/data/1234567/000123456726000043/x-index.htm"/></entry>'+
   '<entry><title>4 - STOCK TRANSACTION</title><filing-type>4</filing-type><updated>2026-10-19T10:01:00Z</updated><link href="https://www.sec.gov/Archives/edgar/data/1234567/000123456726000044/x-index.htm"/></entry>'+
   '<entry><title>4/A - AMENDMENT</title><updated>2026-10-19T10:02:00Z</updated><link href="https://www.sec.gov/Archives/edgar/data/1234567/000123456726000045/x-index.htm"/></entry>'+
   '<entry><title>UNKNOWN</title><updated>2026-10-19T10:03:00Z</updated><link href="https://www.sec.gov/Archives/edgar/data/1234567/000123456726000046/x-index.htm"/></entry></feed>';
  const filings=parseAtom(xml);
  assert.deepEqual(filings.map(x=>x.accession),["000123456726000044","000123456726000045"]);
  assert.deepEqual(filings.map(x=>x.formType),["4","4/A"]);
});

test("Form 4 parses transactions, not every filing as a purchase",()=>{
  const parsed=parseOwnership(ownership,filing);
  assert.equal(parsed.ticker,"EXMP");assert.equal(parsed.owners[0].name,"JANE SAMPLE");
  assert.equal(parsed.transactions.length,4);
  assert.deepEqual(parsed.transactions.map(x=>x.category),["reported_purchase","reported_sale","other","other"]);
  assert.equal(parsed.transactions[0].estimatedValue,4250);
  assert.equal(parsed.transactions[0].transactionDate,"2026-10-07");
  assert.equal(parsed.transactions[2].estimatedValue,null);assert.equal(parsed.transactions[3].derivative,true);
});
test("Cluster requires distinct reporting owners, excludes derivatives and out-of-window records",()=>{
  const baseRow={ticker:"EXMP",issuerCik:"1234567",category:"reported_purchase",derivative:false,transactionDate:"2026-10-07",estimatedValue:500,sourceUrl:filing.sourceUrl};
  const rows=[{...baseRow,ownerCik:"1"},{...baseRow,ownerCik:"1"},{...baseRow,ownerCik:"2"},
    {...baseRow,ownerCik:"3",derivative:true},{...baseRow,ownerCik:null},{...baseRow,ownerCik:"4",category:"reported_sale"}];
  const r=clusterPurchases(rows,{asOf:new Date("2026-10-09T00:00:00Z"),days:7,minOwners:2});
  assert.equal(r.length,1);assert.equal(r[0].distinctReportingOwners,2);
  assert.equal(r[0].transactionCount,3);assert.equal(r[0].estimatedReportedValue,1500);
  assert.equal(clusterPurchases(rows,{asOf:new Date("2026-10-30T00:00:00Z")}).length,0);
});
test("SEC URL scope blocks look-alike hosts, protocols and unrelated paths",()=>{
  assert.equal(allowedSecUrl(filing.sourceUrl),true);assert.equal(allowedSecUrl(base+"index.json"),true);
  assert.equal(allowedSecUrl("https://www.sec.gov.evil.test/Archives/edgar/data/1234567/"+accession+"/index.json"),false);
  assert.equal(allowedSecUrl("http://www.sec.gov/cgi-bin/browse-edgar"),false);
  assert.equal(allowedSecUrl("https://www.sec.gov/robots.txt"),false);
});
test("Politician, social and crypto sources remain disabled until cleared",()=>{
  assert.deepEqual(sourceRegistry.filter(s=>s.status==="enabled").map(s=>s.id),["sec-form4","wikimedia"]);
  assert.deepEqual(sourceRegistry.filter(s=>/^disabled/.test(s.status)).map(s=>s.id),["house-financial","senate-financial","political-social","digital-assets"],"restricted sources stay off");
});
test("Passwords use salted scrypt, not plaintext",async()=>{
  const a=await hashPassword("correct horse battery stable"),b=await hashPassword("correct horse battery stable");
  assert.notEqual(a,b);assert.equal(await verifyPassword("correct horse battery stable",a),true);
  assert.equal(await verifyPassword("incorrect password",a),false);
  await assert.rejects(()=>hashPassword("short"),/12/);
});

test("XML Schema dates with a time zone keep their calendar date (seen in a real Form 4: 2026-10-14-05:00)", async () => {
  const { parseOwnership, xmlDate } = await import("../src/sec.mjs");
  assert.equal(xmlDate("2026-10-14-05:00"), "2026-10-14"); assert.equal(xmlDate("2026-10-14Z"), "2026-10-14"); assert.equal(xmlDate("2026-10-14+09:00"), "2026-10-14");
  assert.equal(xmlDate("2026-10-14"), "2026-10-14"); assert.equal(xmlDate("2026-13-40"), null); assert.equal(xmlDate("14/10/2026"), null); assert.equal(xmlDate(null), null);
  const xml = `<ownershipDocument><documentType>4</documentType><periodOfReport>2026-10-14-05:00</periodOfReport><issuer><issuerCik>0000000001</issuerCik><issuerName>Synthetic</issuerName><issuerTradingSymbol>SYN</issuerTradingSymbol></issuer>
    <reportingOwner><reportingOwnerId><rptOwnerCik>0000000002</rptOwnerCik><rptOwnerName>Example Filer</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector></reportingOwnerRelationship></reportingOwner>
    <nonDerivativeTable><nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-10-14-05:00</value></transactionDate>
    <transactionCoding><transactionCode>S</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>22500</value></transactionShares><transactionPricePerShare><value>2.114</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;
  const doc = parseOwnership(xml, { accession: "000000000126000001", filerCik: "2", sourceUrl: "https://www.sec.gov/x", title: "4", formType: "4" });
  assert.equal(doc.periodOfReport, "2026-10-14");
  assert.equal(doc.transactions[0].transactionDate, "2026-10-14");
});
