import { migrate, pool } from "./db.mjs";
import { ingest } from "./ingest.mjs";
try{await migrate();const result=await ingest();console.log(JSON.stringify(result,null,2));if(!result.ok||result.failed)process.exitCode=1}catch(e){console.error("Ingestion failed:",e);process.exitCode=1}finally{await pool?.end()}
