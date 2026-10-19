import test from "node:test";
import assert from "node:assert/strict";
import {brandedPushMessage,broadcastSettings,queueBroadcast,pushMessage} from "../src/push.mjs";

const campaign={
 INSIDIR_BROADCAST_ID:"features-2026-10-19",
 INSIDIR_BROADCAST_TITLE:"Insidir — New Features Available",
 INSIDIR_BROADCAST_BODY:"We've upgraded Insidir with financial intelligence alerts, expanded company research, and new market monitoring. Open Insidir to explore what's new.",
 INSIDIR_BROADCAST_URL:"/alerts.html",
 INSIDIR_BROADCAST_ISSUED_AT:"2026-10-19T11:58:10Z",
 INSIDIR_BROADCAST_EXPIRES_AT:"2026-10-20T11:58:10Z"
};
test("every outgoing notification has Insidir name and trusted icon",()=>{
 for(const p of [brandedPushMessage({title:"Research update"}),brandedPushMessage({title:"Insidir — New Features Available"}),brandedPushMessage(pushMessage({ticker:"AAPL",accession:"000032019326000001",form_type:"4"}))]){
  assert.match(p.title,/^Insidir · /);
  assert.equal(p.icon,"/assets/icons/favicon.svg");
  assert.equal(p.badge,"/assets/icons/favicon.svg");
  assert.ok(p.url.startsWith("/")&&!p.url.startsWith("//"));
  assert.doesNotMatch(p.title,/Insidir · Insidir/);
 }
});
test("one-time broadcast requires valid issue/expiry and explicitly configured payload",()=>{
 assert.equal(broadcastSettings({}),null);
 assert.equal(broadcastSettings({...campaign,INSIDIR_BROADCAST_ID:"../../etc"}),null);
 assert.equal(broadcastSettings({...campaign,INSIDIR_BROADCAST_URL:"https://untrusted.example"}),null);
 assert.equal(broadcastSettings({...campaign,INSIDIR_BROADCAST_EXPIRES_AT:"2026-10-18T11:58:10Z"}),null);
 assert.equal(broadcastSettings(campaign).id,"features-2026-10-19");
});
test("broadcast queue freezes recipients by subscription creation date and deduplicates",async()=>{
 const calls=[];
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.startsWith("INSERT INTO push_deliveries"))return {rowCount:3,rows:[]};
  if(sql.startsWith("SELECT COUNT(*)"))return {rows:[{eligible:3}],rowCount:1};
  return {rowCount:1,rows:[]};
 };
 const result=await queueBroadcast(query,campaign,Date.parse("2026-10-19T12:02:00Z"));
 assert.deepEqual({campaign:result.campaign,eligible:result.eligible,queued:result.queued},{campaign:"features-2026-10-19",eligible:3,queued:3});
 assert.match(calls[1].sql,/s\.created_at<=b\.issued_at/);
 assert.match(calls[1].sql,/ON CONFLICT DO NOTHING/);
 assert.equal(calls[1].args[0],"broadcast:features-2026-10-19");
 const expired=await queueBroadcast(query,campaign,Date.parse("2026-10-21T12:02:00Z"));
 assert.equal(expired.queued,0);
 assert.equal(calls.length,3);
});
