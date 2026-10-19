import test from "node:test";
import assert from "node:assert/strict";
import {secAnnouncementEvents,publicBlueskyEvents,monitorSources,parseOfficial8KFeed} from "../src/intelligence-monitor.mjs";
import {parseHouseIndex,houseApproved} from "../src/house-disclosures.mjs";
import {validateSubscription,pushMessage} from "../src/push.mjs";
import {evidenceFromFiling} from "../src/ai-explain.mjs";
import {reviewGeneratedText} from "../src/compliance-guard.mjs";

const today=new Date().toISOString().slice(0,10);
test("Only verifiable and recent SEC 8-K/6-K entries become monitored events",()=>{
  const input={filings:{recent:{
    form:["8-K","4","6-K","8-K"],
    accessionNumber:["0000320193-26-000001","0000320193-26-000002","0000320193-26-000003","invalid"],
    primaryDocument:["report.htm","owner.xml","foreign.htm","junk"],
    filingDate:[today,today,today,today]
  }}};
  const events=secAnnouncementEvents(input,"AAPL","0000320193");
  assert.deepEqual(events.map(e=>e.metadata.form),["8-K","6-K"]);
  assert.ok(events.every(e=>e.source_url?.startsWith("https://www.sec.gov/Archives/edgar/data/")));
  assert.ok(events.every(e=>e.source_type==="sec_notice"));
});
test("Market-wide SEC Atom feed keeps only verified 8-K entries with original links",()=>{
 const a="000032019326000010",b="000032019326000011";
 const base="https://www.sec.gov/Archives/edgar/data/320193/";
 const atom='<feed>'+
  '<entry><title>8-K - APPLE INC.</title><updated>'+new Date().toISOString()+'</updated><link href="'+base+a+'/a-index.html"/></entry>'+
  '<entry><title>424B2 - OFFERING</title><updated>'+new Date().toISOString()+'</updated><link href="'+base+b+'/b-index.html"/></entry></feed>';
 const events=parseOfficial8KFeed(atom,{0:{cik_str:320193,ticker:"AAPL"}});
 assert.equal(events.length,1);
 assert.equal(events[0].metadata.ticker,"AAPL");
 assert.equal(events[0].event_key,"notice:"+a);
 assert.match(events[0].source_url,/sec.gov\/Archives/);
});
test("Public Bluesky feed keeps only attributed original authors",()=>{
 const d={feed:[
   {post:{uri:"at://did:plc:abc123/app.bsky.feed.post/3mab",author:{handle:"bloomberg.com"},record:{text:"Market research",createdAt:new Date().toISOString()}}},
   {post:{uri:"at://did:plc:def456/app.bsky.feed.post/3mac",author:{handle:"unrelated.test"},record:{text:"Not this account",createdAt:new Date().toISOString()}}}
 ]};
 const events=publicBlueskyEvents(d,"bloomberg.com");
 assert.equal(events.length,1);
 assert.match(events[0].source_url,/bsky\.app\/profile\/bloomberg\.com/);
});
test("House PTR index contains filing metadata, never an invented trade",()=>{
 const s="Prefix\tLast\tFirst\tSuffix\tFilingType\tStateDst\tYear\tFilingDate\tDocID\n\tDOE\tJANE\t\tP\tCA07\t2026\t10/16/2026\t2000123456\n\tDOE\tJANE\t\tO\tCA07\t2026\t10/16/2026\t2000123457";
 const events=parseHouseIndex(s,2026);
 assert.equal(events.length,1);
 assert.equal(events[0].subject,"JANE DOE");
 assert.ok(!("ticker" in events[0].metadata));
 assert.ok(!("estimated_value" in events[0].metadata));
});
test("Political source remains unlicensed and disabled by default",()=>{
 if(process.env.INSIDIR_HOUSE_DISCLOSURES_APPROVED==="1")return;
 assert.equal(houseApproved(),false);
 assert.match(monitorSources().senateFinancialDisclosures,/blocked/);
});
test("Push subscriptions refuse arbitrary URLs",()=>{
 const valid={endpoint:"https://fcm.googleapis.com/fcm/send/123456",keys:{p256dh:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno",auth:"abcdefghijklmnopqrstuv"}};
 assert.equal(validateSubscription(valid).endpoint,valid.endpoint);
 assert.throws(()=>validateSubscription({...valid,endpoint:"https://attacker.example/push"}),/Unsupported secure push endpoint/);
 assert.throws(()=>validateSubscription({...valid,endpoint:"http://fcm.googleapis.com/push"}),/Unsupported secure push endpoint/);
 const msg=pushMessage({ticker:"AAPL",form_type:"4",accession:"000032019326000001"});
 assert.equal(msg.url,"/company.html?ticker=AAPL");
 assert.doesNotMatch(msg.body,/you should buy|sell now/i);
});
test("AI source text includes filing evidence and guard blocks invented figures or advice",()=>{
 const input={form_type:"4",issuer_name:"Example, Inc.",ticker:"EXMP",published_at:today,period_of_report:today,source_url:"https://www.sec.gov/Archives/edgar/data/example"};
 const evidence=evidenceFromFiling(input,[{owner_name:"JANE DOE",category:"reported_sale",transaction_date:today,security_title:"Common Stock",estimated_value:"2500.00"}]);
 assert.match(evidence,/JANE DOE/);
 assert.match(evidence,/2500\.00/);
 const reviewed=reviewGeneratedText({text:"The filing reports a reported sale of 2500.00.",sources:[{text:evidence}],retrievedAt:new Date().toISOString()});
 assert.equal(reviewed.allowed,true);
 assert.equal(reviewGeneratedText({text:"You should buy EXMP now.",sources:[{text:evidence}],retrievedAt:new Date().toISOString()}).allowed,false);
});
