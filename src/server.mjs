import { config } from "./config.mjs";
import { migrate, pool, query } from "./db.mjs";
import { ingest } from "./ingest.mjs";
import { createApiServer } from "./api.mjs";
import { warmAfterIngest } from "./media-warm.mjs";
import { reconcileLapsed, createStripeClient } from "./billing.mjs";
import { billingSettings } from "./config.mjs";
import {initPush,pushTick} from "./push.mjs";

async function main() {
  if(!config.databaseUrl)throw new Error("DATABASE_URL is required for the Insidir engine");
  await migrate();
  const server=createApiServer();
  server.listen(config.port,"0.0.0.0",()=>console.log("Insidir backend listening on",config.port));
  if(config.autoIngest){
    async function tick(){
      try{
        const result=await ingest();console.log("Ingestion result",JSON.stringify(result));
        // Logos and roster photos for what was just filed, in the background at low priority.
        if(result?.ok&&result.parsed)warmAfterIngest(query).then(w=>console.log("Media warm-up",JSON.stringify(w)),e=>console.warn("Media warm-up failed",e?.message||e));
      }
      catch(e){console.error("SEC ingestion failed",e?.message||e);}
    }
    setTimeout(tick,2000).unref();
    setInterval(tick,15*60*1000).unref();
  }
  if(initPush()){
    const send=async()=>{try{const report=await pushTick(query);if(report.sent||report.failed)console.log("Push delivery",JSON.stringify(report));}catch(e){console.error("Push delivery failed",e?.message||e)}};
    setTimeout(send,30*1000).unref();
    setInterval(send,3*60*1000).unref();
  }else console.warn("Insidir Web Push disabled: VAPID settings incomplete");
  // Billing reconciliation (see billing.mjs): a minute after start, then every six hours, when Stripe is configured.
  if(billingSettings().enabled){
    const reconcile=async()=>{
      try{console.log(JSON.stringify({event:"billing.reconcile",...await reconcileLapsed({stripe:createStripeClient()})}))}
      catch(e){console.error(JSON.stringify({event:"billing.reconcile_error",error:String(e?.message||e)}))}
    };
    setTimeout(reconcile,60*1000).unref();
    setInterval(reconcile,6*60*60*1000).unref();
  }
  // Expired sign-in sessions are already refused at lookup; this removes their rows (hourly, after a minute).
  const purgeSessions=async()=>{
    try{const r=await query("DELETE FROM sessions WHERE expires_at<now()");if(r.rowCount)console.log(JSON.stringify({event:"sessions.purged",count:r.rowCount}))}
    catch(e){console.error(JSON.stringify({event:"sessions.purge_failed",error:String(e?.message||e)}))}
  };
  setTimeout(purgeSessions,60*1000).unref();
  setInterval(purgeSessions,60*60*1000).unref();
  const shutdown=async()=>{console.log("Shutting down Insidir API");server.close();await pool?.end();process.exit(0)};
  process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
}
main().catch(e=>{console.error("Startup failed",e);process.exit(1)});
