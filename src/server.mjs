import { config, billingSettings, emailSettings } from "./config.mjs";
import { migrate, pool, query } from "./db.mjs";
import { ingest } from "./ingest.mjs";
import { createApiServer } from "./api.mjs";
import { warmAfterIngest } from "./media-warm.mjs";
import { reconcileLapsed, createStripeClient } from "./billing.mjs";
import { runWorker } from "./ops.mjs";
import { deliverDue, transportFor, purgeEmailBodies } from "./email.mjs";
import { purgeRateLimits } from "./rate-limit.mjs";
import { purgeSecurityEvents } from "./security-events.mjs";
import { purgeUserTokens } from "./account-security.mjs";
import { purgeAdminAuth } from "./admin-auth.mjs";

/* Background work. Every job runs through runWorker (src/ops.mjs): a PostgreSQL advisory lock per job, so several
 * instances never run the same job at once, and a heartbeat row operators can read on the ops page.
 * INSIDIR_BACKGROUND_WORKERS=0 switches them all off (integration tests; a web-only instance). */
const log = (event, data) => console.log(JSON.stringify({ event, ...data }));
const connect = () => pool.connect();
function every(name, intervalMs, firstMs, fn) {
  const run = () => runWorker(name, fn, { query, connect }).then(r => { if (r && (r.skipped || Object.values(r).some(v => typeof v === "number" && v > 0) || r.ok === false)) log("worker." + name, r); },
    e => console.error(JSON.stringify({ event: "worker.crashed", worker: name, error: String(e?.message || e) })));
  setTimeout(run, firstMs).unref();
  setInterval(run, intervalMs).unref();
}

async function main() {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for the Insidir engine");
  await migrate();
  const server = createApiServer();
  server.listen(config.port, "0.0.0.0", () => console.log("Insidir backend listening on", config.port));
  const workers = process.env.INSIDIR_BACKGROUND_WORKERS !== "0";
  if (workers && config.autoIngest) {
    every("sec-ingest", 15 * 60 * 1000, 2000, async () => {
      const result = await ingest();
      console.log("Ingestion result", JSON.stringify(result));
      // Logos and roster photos for what was just filed, in the background at low priority.
      if (result?.ok && result.parsed) warmAfterIngest(query).then(w => console.log("Media warm-up", JSON.stringify(w)), e => console.warn("Media warm-up failed", e?.message || e));
      return { ok: result?.ok, discovered: result?.discovered, parsed: result?.parsed, failed: result?.failed, deferred: result?.deferred || 0, reason: result?.reason };
    });
  }
  // Billing reconciliation (see billing.mjs): a minute after start, then every six hours, when Stripe is configured.
  if (workers && billingSettings().enabled) every("billing-reconcile", 6 * 60 * 60 * 1000, 60 * 1000, () => reconcileLapsed({ stripe: createStripeClient() }));
  // Email delivery: every minute when a provider is configured; otherwise messages wait in the outbox.
  const email = emailSettings();
  if (workers && email.enabled) {
    const transport = transportFor(email);
    every("email-delivery", 60 * 1000, 15 * 1000, () => deliverDue({ query, transport, settings: email }));
  }
  // Hourly maintenance: expired sessions, rate-limit windows, used tokens, admin sessions, old security events and
  // the bodies of abandoned messages.
  if (workers) every("maintenance", 60 * 60 * 1000, 60 * 1000, async () => ({
    sessions: (await query("DELETE FROM sessions WHERE expires_at<now()")).rowCount || 0,
    rateLimits: await purgeRateLimits(query), tokens: await purgeUserTokens(query), adminAuth: await purgeAdminAuth(query),
    securityEvents: await purgeSecurityEvents(query), emailBodies: await purgeEmailBodies(query)
  }));
  const shutdown = async () => { console.log("Shutting down Insidir API"); server.close(); await pool?.end(); process.exit(0); };
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}
main().catch(e => { console.error("Startup failed", e); process.exit(1); });
