import webpush from "web-push";
import {query as queryDb} from "./db.mjs";
const failure=(status,message)=>Object.assign(new Error(message),{status});
const allowedHost=h=>["fcm.googleapis.com","updates.push.services.mozilla.com","push.services.mozilla.com","web.push.apple.com","wns.windows.com"].includes(h)||h.endsWith(".push.apple.com")||h.endsWith(".notify.windows.com");
export function validateSubscription(raw){
 let u;
 try{u=new URL(raw?.endpoint)}catch{throw failure(400,"Invalid push endpoint")}
 if(u.protocol!=="https:"||u.port||u.username||u.password||!allowedHost(u.hostname)||u.href.length>2048)throw failure(400,"Unsupported secure push endpoint");
 const valid=s=>typeof s==="string"&&/^[A-Za-z0-9_-]{10,180}$/.test(s);
 if(!valid(raw?.keys?.p256dh)||!valid(raw?.keys?.auth))throw failure(400,"Invalid browser encryption keys");
 return {endpoint:u.href,p256dh:raw.keys.p256dh,auth:raw.keys.auth};
}
export const pushReady=()=>Boolean(process.env.INSIDIR_VAPID_PUBLIC_KEY&&process.env.INSIDIR_VAPID_PRIVATE_KEY&&/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.INSIDIR_PUSH_CONTACT||""));
export function initPush(){
 if(!pushReady())return false;
 webpush.setVapidDetails(process.env.INSIDIR_PUSH_CONTACT,process.env.INSIDIR_VAPID_PUBLIC_KEY,process.env.INSIDIR_VAPID_PRIVATE_KEY);
 return true;
}
export async function subscribePush(userId,raw,run=queryDb){
 if(!pushReady())throw failure(503,"Push notifications are not configured");
 const s=validateSubscription(raw);
 await run("INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth_key) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth_key=EXCLUDED.auth_key",[userId,s.endpoint,s.p256dh,s.auth]);
 return {ok:true};
}
export async function unsubscribePush(userId,endpoint,run=queryDb){
 if(typeof endpoint!=="string"||endpoint.length>2048||!endpoint)throw failure(400,"Invalid endpoint");
 const r=await run("DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2",[userId,endpoint]);
 return {ok:true,removed:r.rowCount||0};
}
export async function pushStatus(userId,run=queryDb){
 const r=await run("SELECT id,created_at,last_success_at FROM push_subscriptions WHERE user_id=$1 ORDER BY created_at DESC",[userId]);
 return {configured:pushReady(),publicKey:pushReady()?process.env.INSIDIR_VAPID_PUBLIC_KEY:null,devices:r.rows,delivery:"user_opt_in"};
}
export const MATCH_SQL=[
 "SELECT DISTINCT ON (x.subscription_id,x.accession) x.* FROM (",
 "SELECT s.id AS subscription_id,f.accession,f.ticker,f.form_type FROM push_subscriptions s",
 "JOIN watchlist w ON w.user_id=s.user_id JOIN sec_filings f ON f.ticker=w.ticker",
 "WHERE f.ingest_status='parsed' AND f.retrieved_at>=s.created_at AND f.retrieved_at>=now()-interval '36 hours'",
 "UNION ALL SELECT s.id,f.accession,f.ticker,f.form_type FROM push_subscriptions s",
 "JOIN followed_people p ON p.user_id=s.user_id JOIN sec_filing_owners o ON LTRIM(o.owner_cik,'0')=LTRIM(p.owner_cik,'0')",
 "JOIN sec_filings f ON f.accession=o.accession",
 "WHERE f.ingest_status='parsed' AND f.retrieved_at>=s.created_at AND f.retrieved_at>=now()-interval '36 hours'",
 ") x ORDER BY x.subscription_id,x.accession LIMIT 400"
].join(" ");
export const PUBLIC_EVENT_MATCH_SQL=[
 "SELECT DISTINCT s.id AS subscription_id,r.event_key FROM research_events r",
 "JOIN watchlist w ON w.ticker=r.subject JOIN push_subscriptions s ON s.user_id=w.user_id",
 "WHERE r.source_type='sec_notice' AND r.verified=true",
 "AND r.observed_at>=s.created_at AND r.observed_at>=now()-interval '36 hours'",
 "LIMIT 200"
].join(" ");
export async function queueNotifications(run=queryDb){
 const r=await run(MATCH_SQL);let queued=0;
 for(const x of r.rows){
   const inserted=await run("INSERT INTO push_deliveries(subscription_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",[x.subscription_id,"sec:"+x.accession]);
   queued+=inserted.rowCount||0;
 }
 const eventRows=(await run(PUBLIC_EVENT_MATCH_SQL)).rows;
 for(const event of eventRows){
  const inserted=await run("INSERT INTO push_deliveries(subscription_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",[event.subscription_id,"intel:"+event.event_key]);
  queued+=inserted.rowCount||0;
 }
 return {matched:r.rows.length+eventRows.length,queued};
}
export function pushMessage(f){
 const symbol=String(f.ticker||"").toUpperCase();
 const valid=/^[A-Z0-9.-]{1,15}$/.test(symbol);
 return {title:"Insidir · New SEC disclosure",body:"A new Form "+String(f.form_type||"4")+" was imported for "+(valid?symbol:"a reporting person you follow")+". Review the SEC source in Insidir.",tag:"insidir-"+String(f.accession||"").slice(0,26),url:valid?"/company.html?ticker="+encodeURIComponent(symbol):"/alerts.html"};
}
const CLAIM_SQL=[
 "UPDATE push_deliveries d SET attempts=d.attempts+1,last_attempt_at=now()",
 "FROM (SELECT id FROM push_deliveries WHERE status='pending' AND attempts<5",
 "AND (last_attempt_at IS NULL OR last_attempt_at<now()-interval '10 minutes')",
 "ORDER BY id LIMIT 30 FOR UPDATE SKIP LOCKED) jobs WHERE d.id=jobs.id",
 "RETURNING d.id,d.subscription_id,d.event_key,d.attempts"
].join(" ");
export async function sendNotifications({run=queryDb,send=(...args)=>webpush.sendNotification(...args)}={}){
 if(!pushReady())return {enabled:false,sent:0};
 const jobs=(await run(CLAIM_SQL)).rows;
 let sent=0,failed=0;
 for(const job of jobs){
  const sub=(await run("SELECT endpoint,p256dh,auth_key FROM push_subscriptions WHERE id=$1",[job.subscription_id])).rows[0];
  if(!sub)continue;
  const eventKey=String(job.event_key||"");
  let message;
  if(eventKey.startsWith("sec:")){
   const accession=eventKey.slice(4);
   const filing=(await run("SELECT accession,ticker,form_type FROM sec_filings WHERE accession=$1 AND ingest_status='parsed'",[accession])).rows[0];
   if(filing)message=pushMessage(filing);
  }else if(eventKey.startsWith("intel:")){
   const event=(await run("SELECT event_key,title,subject,source_type FROM research_events WHERE event_key=$1 AND source_type='sec_notice' AND verified=true",[eventKey.slice(6)])).rows[0];
   if(event)message={title:"Insidir · SEC company announcement",body:String(event.title||"New company report").slice(0,160)+". Review the original filing in Insidir.",tag:"insidir-intel-"+String(event.event_key).slice(0,45),url:"/alerts.html"};
  }
  if(!message){await run("UPDATE push_deliveries SET status='failed',last_error='Source absent' WHERE id=$1",[job.id]);continue}
  try{
   await send({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},JSON.stringify(message),{TTL:3600,urgency:"normal"});
   await run("UPDATE push_deliveries SET status='sent',sent_at=now(),last_error=NULL WHERE id=$1",[job.id]);
   await run("UPDATE push_subscriptions SET last_success_at=now() WHERE id=$1",[job.subscription_id]);sent++;
  }catch(e){
   if([404,410].includes(Number(e?.statusCode)))await run("DELETE FROM push_subscriptions WHERE id=$1",[job.subscription_id]);
   else await run("UPDATE push_deliveries SET last_error=$2,status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END WHERE id=$1",[job.id,String(e?.message||e).slice(0,200)]);
   failed++;
  }
 }
 return {enabled:true,sent,failed};
}
let busy=false;
export async function pushTick(run=queryDb){
 if(!pushReady()||busy)return {enabled:pushReady(),skipped:true};
 busy=true;
 try{return {...await queueNotifications(run),...await sendNotifications({run})}}finally{busy=false}
}
