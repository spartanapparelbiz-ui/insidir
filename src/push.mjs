/* Insidir Web Push: opt-in, source-linked SEC filing notifications. No third-party email
 * server, user-tracking SDK or subscription data exposed to another account.
 * The browser subscription endpoint is an authenticated credential: treat it as private.
 * Queue rows are unique per device and SEC accession. Only filings imported AFTER both
 * the follow and the subscription are eligible. Dispatch retries are bounded. */
import webPush from "web-push";
import { query } from "./db.mjs";

const PUBLIC=/^[A-Za-z0-9_-]{80,100}$/;
const PRIVATE=/^[A-Za-z0-9_-]{40,60}$/;
const KEY=/^[A-Za-z0-9_-]{8,200}$/;
const ENDPOINT_HOSTS=new Set(["fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com"]);
const safeEndpoint=value=>{
  if(typeof value!=="string"||value.length>2048)return false;
  try{
    const u=new URL(value);
    return u.protocol==="https:"&&!u.username&&!u.password&&!u.hash&&(
      ENDPOINT_HOSTS.has(u.hostname)||u.hostname.endsWith(".notify.windows.com")||
      u.hostname.endsWith(".push.apple.com")||u.hostname.endsWith(".push.services.mozilla.com"));
  }catch{return false}
};
export function pushConfigured(env=process.env){
  return PUBLIC.test(String(env.INSIDIR_VAPID_PUBLIC_KEY||"")) &&
    PRIVATE.test(String(env.INSIDIR_VAPID_PRIVATE_KEY||"")) &&
    /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(env.INSIDIR_VAPID_SUBJECT||""));
}
export function publicPushSettings(env=process.env){
  return {configured:pushConfigured(env),publicKey:pushConfigured(env)?env.INSIDIR_VAPID_PUBLIC_KEY:null,
    delivery:"browser_push",requiresPermission:true};
}
function setup(env=process.env){
  if(!pushConfigured(env))throw Object.assign(Error("Phone notifications have not been configured."),{status:503});
  webPush.setVapidDetails(env.INSIDIR_VAPID_SUBJECT,env.INSIDIR_VAPID_PUBLIC_KEY,env.INSIDIR_VAPID_PRIVATE_KEY);
}
export function validateSubscription(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||
    !safeEndpoint(value.endpoint)||!value.keys||typeof value.keys!=="object"||
    !KEY.test(String(value.keys.p256dh||""))||!KEY.test(String(value.keys.auth||"")))
    throw Object.assign(Error("Invalid push subscription"),{status:400});
  return {endpoint:value.endpoint,p256dh:value.keys.p256dh,auth:value.keys.auth};
}
export async function statusFor(userId,env=process.env,run=query){
  const [sub,pref]=await Promise.all([
    run("SELECT count(*)::int AS count FROM push_subscriptions WHERE user_id=$1",[userId]),
    run("SELECT people,companies FROM push_preferences WHERE user_id=$1",[userId])
  ]);
  return {...publicPushSettings(env),deviceCount:sub.rows[0]?.count||0,
    preferences:pref.rows[0]||{people:true,companies:true}};
}
export async function saveSubscription(userId,value,run=query){
  const s=validateSubscription(value);
  const inserted=await run("INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,last_seen_at=now() WHERE push_subscriptions.user_id=EXCLUDED.user_id RETURNING id",
    [userId,s.endpoint,s.p256dh,s.auth]);
  if(!inserted.rowCount)throw Object.assign(Error("This browser subscription belongs to another account. Disable and re-enable notifications in this browser."),{status:409});
  await run("INSERT INTO push_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING",[userId]);
  return {subscribed:true};
}
export async function removeSubscription(userId,value,run=query){
  if(!safeEndpoint(value?.endpoint))throw Object.assign(Error("Invalid push endpoint"),{status:400});
  await run("DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2",[userId,value.endpoint]);
  return {subscribed:false};
}
export async function updatePreferences(userId,value,run=query){
  if(typeof value?.people!=="boolean"||typeof value?.companies!=="boolean")
    throw Object.assign(Error("Invalid notification preferences"),{status:400});
  await run("INSERT INTO push_preferences(user_id,people,companies) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET people=EXCLUDED.people,companies=EXCLUDED.companies,updated_at=now()",
    [userId,value.people,value.companies]);
  return {preferences:{people:value.people,companies:value.companies}};
}
// Enqueue AFTER a newly parsed filing is committed. Repeated calls cannot duplicate alerts,
// and a historical import is not misrepresented as a real-time trade.
export async function queueFilingPush(accession,run=query){
  if(!/^[0-9-]{18,24}$/.test(String(accession||"")))return 0;
  const result=await run(
    "INSERT INTO push_deliveries(subscription_id,accession,title,body,url) "+
    "SELECT s.id,f.accession, "+
    "CASE WHEN person.owner_name IS NOT NULL THEN 'New filing: '||LEFT(person.owner_name,80) "+
    "ELSE 'New filing: '||COALESCE(f.ticker,LEFT(f.issuer_name,60),'Company you follow') END, "+
    "CASE WHEN person.owner_name IS NOT NULL THEN 'A person you follow appears in a newly imported public SEC Form 4'||COALESCE(' for '||f.ticker,'')||'.' "+
    "ELSE 'A new public SEC Form 4 was imported'||COALESCE(' for '||f.ticker,'')||'.' END, "+
    "'/filing.html?accession='||REPLACE(f.accession,'-','') "+
    "FROM sec_filings f JOIN push_subscriptions s ON s.created_at<=f.retrieved_at "+
    "LEFT JOIN push_preferences prefs ON prefs.user_id=s.user_id "+
    "LEFT JOIN LATERAL (SELECT o.owner_name FROM sec_filing_owners o "+
    "JOIN followed_people fp ON fp.user_id=s.user_id AND LTRIM(fp.owner_cik,'0')=LTRIM(o.owner_cik,'0') "+
    "AND fp.created_at<=f.retrieved_at WHERE o.accession=f.accession LIMIT 1) person ON TRUE "+
    "LEFT JOIN LATERAL (SELECT w.ticker FROM watchlist w WHERE w.user_id=s.user_id "+
    "AND w.ticker=f.ticker AND w.created_at<=f.retrieved_at LIMIT 1) watched ON TRUE "+
    "WHERE f.accession=$1 AND f.ingest_status='parsed' AND f.published_at>=now()-interval '3 days' "+
    "AND ((person.owner_name IS NOT NULL AND COALESCE(prefs.people,TRUE)) "+
    "OR (watched.ticker IS NOT NULL AND COALESCE(prefs.companies,TRUE))) "+
    "ON CONFLICT(subscription_id,accession) DO NOTHING",[accession]);
  return result.rowCount||0;
}
async function send(sub,payload,env=process.env){
  setup(env);
  const message=JSON.stringify(payload);
  // Sending is delegated to standard browser push services. No arbitrary HTTP endpoints.
  if(!safeEndpoint(sub.endpoint))throw Object.assign(Error("Unrecognized push service"),{statusCode:400});
  return webPush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},message,{TTL:3600,urgency:"normal"});
}
export async function sendTestPush(userId,env=process.env,run=query){
  setup(env);
  const records=await run("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=$1 LIMIT 8",[userId]);
  if(!records.rowCount)throw Object.assign(Error("Enable notifications on this device first."),{status:409});
  let delivered=0;
  for(const sub of records.rows){
    try{await send(sub,{title:"Insidir notifications are on",body:"You'll receive new public SEC filing alerts for the people and companies you follow.",url:"/alerts.html",tag:"insidir-test"},env);delivered++}
    catch(e){
      if([404,410].includes(Number(e.statusCode)))await run("DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2",[userId,sub.endpoint]);
    }
  }
  if(!delivered)throw Object.assign(Error("Push service did not accept the test. Check browser permission and try enabling again."),{status:503});
  return {accepted:delivered}; // Accepted by push service, not guaranteed displayed.
}
export async function dispatchPushBatch(env=process.env,run=query){
  if(!pushConfigured(env))return {disabled:true};
  const claimed=await run(
    "WITH claim AS (SELECT id FROM push_deliveries WHERE sent_at IS NULL AND attempts<5 "+
    "AND next_attempt_at<=now() ORDER BY id LIMIT 40 FOR UPDATE SKIP LOCKED), "+
    "updated AS (UPDATE push_deliveries d SET attempts=d.attempts+1, "+
    "next_attempt_at=now()+interval '5 minutes' FROM claim WHERE d.id=claim.id "+
    "RETURNING d.id,d.title,d.body,d.url,d.subscription_id) "+
    "SELECT updated.*,s.endpoint,s.p256dh,s.auth FROM updated "+
    "JOIN push_subscriptions s ON s.id=updated.subscription_id",[]);
  let sent=0,failed=0;
  for(const item of claimed.rows){
    try{
      await send(item,{title:item.title,body:item.body,url:item.url,tag:"insidir-form4-"+item.id},env);
      await run("UPDATE push_deliveries SET sent_at=now() WHERE id=$1",[item.id]);sent++;
    }catch(e){
      failed++;
      if([404,410].includes(Number(e.statusCode)))await run("DELETE FROM push_subscriptions WHERE id=$1",[item.subscription_id]);
      else console.warn(JSON.stringify({event:"push.failed",id:item.id,status:e.statusCode||null,attempt:"retry"}));
    }
  }
  return {claimed:claimed.rowCount,sent,failed};
}