import test from "node:test";
import assert from "node:assert/strict";
import { pushConfigured,publicPushSettings,validateSubscription,statusFor,saveSubscription,
  removeSubscription,updatePreferences,queueFilingPush } from "../src/push.mjs";

const env={INSIDIR_VAPID_PUBLIC_KEY:"a".repeat(87),INSIDIR_VAPID_PRIVATE_KEY:"b".repeat(43),
  INSIDIR_VAPID_SUBJECT:"mailto:hello@aethric.llc"};
const subscription={endpoint:"https://fcm.googleapis.com/fcm/send/abcdef",
  keys:{p256dh:"A".repeat(87),auth:"B".repeat(22)}};
test("push remains disabled until both long-lived VAPID keys and contact are set",()=>{
 assert.equal(pushConfigured({}),false);
 assert.equal(publicPushSettings({}).publicKey,null);
 assert.equal(pushConfigured(env),true);
 assert.equal(publicPushSettings(env).publicKey,env.INSIDIR_VAPID_PUBLIC_KEY);
 assert.equal(pushConfigured({...env,INSIDIR_VAPID_SUBJECT:"not-an-email"}),false);
});
test("subscriptions require an HTTPS push-provider endpoint and browser encryption keys",()=>{
 assert.deepEqual(validateSubscription(subscription),{endpoint:subscription.endpoint,...subscription.keys});
 assert.throws(()=>validateSubscription({...subscription,endpoint:"http://localhost:5000/private"}),/Invalid/);
 assert.throws(()=>validateSubscription({...subscription,endpoint:"https://attacker.example/collect"}),/Invalid/);
 assert.throws(()=>validateSubscription({...subscription,keys:{p256dh:"",auth:"bad"}}),/Invalid/);
});
test("status exposes preferences and device count but no private browser credentials",async()=>{
 const calls=[];
 const run=async sql=>{calls.push(sql);return sql.includes("count(*)")
  ? {rows:[{count:2}]}:{rows:[{people:false,companies:true}]}};
 const result=await statusFor("abc",env,run);
 assert.equal(result.deviceCount,2);
 assert.deepEqual(result.preferences,{people:false,companies:true});
 assert.equal(JSON.stringify(result).includes(subscription.keys.auth),false);
 assert.equal(calls.length,2);
});
test("registering a subscription is user-scoped and initializes preferences",async()=>{
 const calls=[];
 const run=async(sql,args)=>{calls.push({sql,args});return {rowCount:1,rows:[{id:"generated"}]}};
 assert.deepEqual(await saveSubscription("user-id",subscription,run),{subscribed:true});
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/WHERE push_subscriptions.user_id=EXCLUDED.user_id/);
 assert.deepEqual(calls[0].args,["user-id",subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth]);
 await assert.rejects(()=>saveSubscription("another-user",subscription,async()=>({rowCount:0,rows:[]})),/another account/);
});
test("opt out only deletes the signed-in user's exact device endpoint",async()=>{
 let args;
 const run=async(sql,parameters)=>{assert.match(sql,/WHERE user_id=\$1 AND endpoint=\$2/);args=parameters;return {rowCount:1}};
 assert.deepEqual(await removeSubscription("user-id",{endpoint:subscription.endpoint},run),{subscribed:false});
 assert.deepEqual(args,["user-id",subscription.endpoint]);
});
test("filing queue is idempotent and restricted to recent SEC Form 4 records",async()=>{
 let captured;
 const run=async(sql,params)=>{captured={sql,params};return {rowCount:3}};
 assert.equal(await queueFilingPush("000032019326000001",run),3);
 assert.equal(captured.params[0],"000032019326000001");
 assert.match(captured.sql,/ON CONFLICT\(subscription_id,accession\) DO NOTHING/);
 assert.match(captured.sql,/f.published_at>=now\(\)-interval '3 days'/);
 assert.match(captured.sql,/fp.created_at<=f.retrieved_at/);
 assert.equal(await queueFilingPush("bad-accession",run),0);
});
test("preferences only accept explicit booleans",async()=>{
 let params;
 const run=async(sql,args)=>{params=args;return {rowCount:1}};
 await assert.rejects(()=>updatePreferences("u",{people:"false",companies:true},run),/Invalid/);
 const result=await updatePreferences("u",{people:false,companies:true},run);
 assert.deepEqual(params,["u",false,true]);
 assert.deepEqual(result.preferences,{people:false,companies:true});
});