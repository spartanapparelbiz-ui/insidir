import { config, secReady } from "./config.mjs";
import { requireDb, query, isParsed, persistFiling, persistFailure } from "./db.mjs";
import { recentForm4Filings, loadOwnership } from "./sec.mjs";

export async function ingest({maxFilings=config.maxPerRun}={}) {
  if (!secReady()) throw new Error("SEC_USER_AGENT requires a monitored operator email");
  const client=await requireDb().connect();
  const lock=await client.query("SELECT pg_try_advisory_lock(813076522) AS locked");
  if (!lock.rows[0]?.locked) {client.release();return {ok:false,reason:"already_running"};}
  let runId,stats={ok:true,discovered:0,parsed:0,skipped:0,failed:0,errors:[]};
  try {
    const started=await client.query("INSERT INTO ingest_runs(status) VALUES('running') RETURNING id");
    runId=started.rows[0].id;
    const filings=(await recentForm4Filings()).slice(0,Math.min(100,Math.max(1,maxFilings)));
    stats.discovered=filings.length;
    for(const f of filings) {
      try {
        if(await isParsed(f.accession)){stats.skipped++;continue}
        const data=await loadOwnership(f);
        await persistFiling(data);
        stats.parsed++;
      }catch(err){
        stats.failed++;
        stats.errors.push({accession:f.accession,reason:String(err?.message||err).slice(0,180)});
        try {await persistFailure(f,err)}catch(persistError){console.error("Failed to persist ingestion failure",persistError?.message)}
      }
    }
    await query("UPDATE ingest_runs SET finished_at=now(),status=$2,discovered=$3,parsed=$4,skipped=$5,failed=$6 WHERE id=$1",
      [runId,stats.failed?"partial":"success",stats.discovered,stats.parsed,stats.skipped,stats.failed]);
    return stats;
  }catch(err){
    if(runId)await query("UPDATE ingest_runs SET finished_at=now(),status='error',error_message=$2 WHERE id=$1",[runId,String(err?.message||err).slice(0,500)]).catch(()=>{});
    throw err;
  }finally{
    try {await client.query("SELECT pg_advisory_unlock(813076522)")}finally{client.release()}
  }
}
