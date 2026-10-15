import { config } from "./config.mjs";
import { migrate, pool, query } from "./db.mjs";
import { ingest } from "./ingest.mjs";
import { createApiServer } from "./api.mjs";
import { warmAfterIngest } from "./media-warm.mjs";

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
  const shutdown=async()=>{console.log("Shutting down Insidir API");server.close();await pool?.end();process.exit(0)};
  process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
}
main().catch(e=>{console.error("Startup failed",e);process.exit(1)});
