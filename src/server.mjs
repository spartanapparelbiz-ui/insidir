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
import { queueTrialReminders } from "./billing-notices.mjs";
import { buildResearchEvents, retryFailedFilings, pollCompanyDisclosures } from "./research-events.mjs";
import { loadOwnership } from "./sec.mjs";
import { persistFiling } from "./db.mjs";
import { secReady } from "./config.mjs";
import { fanOut, sendImmediate, sendDigests } from "./notifications.mjs";
import { initPush, pushTick } from "./push.mjs";
import { aiTick } from "./ai-explain.mjs";
import { monitorTick } from "./intelligence-monitor.mjs";
import { pollHouse } from "./house-disclosures.mjs";
import { syncCompanyDirectory, indexFilingParticipants, recountParticipation, refreshProfiles } from "./sec-directory.mjs";
import { secBacklogMs } from "./sec.mjs";
import { syncDailyIndexes, drainIngestQueue, markImported, queueReparse } from "./coverage-ingest.mjs";

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
import { form13fTick } from "./form13f.mjs";

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
      // Research events for what was just imported (the research-events job below also catches up on its own).
      const events = result?.parsed ? await buildResearchEvents({ query }) : null;
      if (events) await fanOut({ query }).catch(e => console.error("Alert fan-out failed", e?.message || e));
      return { ok: result?.ok, discovered: result?.discovered, parsed: result?.parsed, failed: result?.failed, deferred: result?.deferred || 0, reason: result?.reason, events };
    });
  }
  // Research events (src/research-events.mjs): incremental, idempotent; also covers imports started by /v1/internal/ingest.
  if (workers) every("research-events", 15 * 60 * 1000, 90 * 1000, () => buildResearchEvents({ query }));
  // Alerts (src/notifications.mjs): new events to the members watching them every 5 minutes; immediate emails every
  // 5 minutes and daily digests hourly (each member at their digest hour). Emails wait in the outbox for delivery.
  if (workers) {
    every("notifications", 5 * 60 * 1000, 2 * 60 * 1000, () => fanOut({ query }));
    every("alert-emails", 5 * 60 * 1000, 3 * 60 * 1000, () => sendImmediate({ query, connect }));
    every("daily-digests", 60 * 60 * 1000, 7 * 60 * 1000, () => sendDigests({ query, connect }));
  }
  // Failed Form 4 imports, retried with backoff after they leave EDGAR's current feed; watched companies' other
  // SEC filings. Both use the shared SEC client (declared User-Agent, throttle) and stop on a 403.
  if (workers && secReady()) {
    every("filing-retry", 30 * 60 * 1000, 4 * 60 * 1000, () => retryFailedFilings({ query, load: loadOwnership, persist: persistFiling }));
    every("company-disclosures", 30 * 60 * 1000, 6 * 60 * 1000, () => pollCompanyDisclosures({ query }));
  }
  // Coverage (src/sec-directory.mjs, src/coverage-ingest.mjs). The SEC company ticker list daily; EDGAR's daily form
  // indexes hourly, a few days per run, until the coverage window is read (then the last three days are re-read);
  // queued Form 4 accessions every five minutes, a bounded batch that yields to people waiting on the SEC throttle;
  // issuers and reporting owners of everything imported into the entity directory every ten minutes.
  if (workers && secReady() && process.env.INSIDIR_COVERAGE !== "0") {
    every("company-directory", 24 * 60 * 60 * 1000, 3 * 60 * 1000, async () => { const r = await syncCompanyDirectory({ run: query }); await recountParticipation(query); return r; });
    every("daily-index", 60 * 60 * 1000, 5 * 60 * 1000, async () => ({ ...await syncDailyIndexes({ run: query, maxDays: 8 }), reparseQueued: await queueReparse({ run: query }) }));
    every("ingest-queue", 5 * 60 * 1000, 8 * 60 * 1000, async () => {
      const marked = await markImported(query);
      const r = await drainIngestQueue({ run: query, budget: 150, deadlineMs: 4 * 60 * 1000 });
      if (r.imported) await buildResearchEvents({ query }).catch(e => console.error("Research events after queue import failed", e?.message || e));
      return { ...r, marked };
    });
  }
  // EDGAR submissions (former names, SIC, entity type) for every indexed company and owner, 200 per ten minutes.
  if (workers && secReady() && process.env.INSIDIR_COVERAGE !== "0") every("entity-profiles", 10 * 60 * 1000, 12 * 60 * 1000, () => refreshProfiles({ run: query, budget: 200, backlog: secBacklogMs }));
  if (workers) every("filing-participants", 10 * 60 * 1000, 4 * 60 * 1000, () => indexFilingParticipants({ run: query }));
  // Web Push to installed apps and browsers (src/push.mjs), when VAPID keys are configured.
  if (workers && initPush()) every("web-push", 3 * 60 * 1000, 30 * 1000, () => pushTick(query));
  else if (workers) console.warn("Insidir Web Push disabled: VAPID settings incomplete");
  // AI filing summaries (src/ai-explain.mjs; validated, spend-limited) and the public-source monitor (src/intelligence-monitor.mjs).
  if (workers) {
    every("ai-filing-research", 15 * 60 * 1000, 45 * 1000, () => aiTick(query));
    every("public-monitor", 15 * 60 * 1000, 90 * 1000, () => monitorTick(query));
    // Form 13F holdings are quarterly: the tracked managers' EDGAR filings twice a day (src/form13f.mjs; off unless enabled there).
    every("form-13f", 12 * 60 * 60 * 1000, 5 * 60 * 1000, () => form13fTick({ run: query }));
  }
  // Official House PTR index: only after explicit legal approval.
  if (workers && process.env.INSIDIR_HOUSE_DISCLOSURES_APPROVED === "1") every("house-disclosures", 6 * 60 * 60 * 1000, 2 * 60 * 1000, () => pollHouse({ run: query }));
  // Billing reconciliation (see billing.mjs): a minute after start, then every six hours, when Stripe is configured.
  if (workers && billingSettings().enabled) every("billing-reconcile", 6 * 60 * 60 * 1000, 60 * 1000, () => reconcileLapsed({ stripe: createStripeClient() }));
  // Trial-ending reminders (a backstop for Stripe's trial_will_end), hourly; each subscription is reminded once.
  if (workers && billingSettings().enabled) every("trial-reminders", 60 * 60 * 1000, 5 * 60 * 1000, () => queueTrialReminders(query));
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
    securityEvents: await purgeSecurityEvents(query), emailBodies: await purgeEmailBodies(query),
    // Funnel measurement is kept for 13 months (src/funnel.mjs, privacy.html).
    funnelEvents: (await query("DELETE FROM funnel_events WHERE created_at<now()-interval '13 months'")).rowCount || 0
  }));
  const shutdown = async () => { console.log("Shutting down Insidir API"); server.close(); await pool?.end(); process.exit(0); };
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}
main().catch(e => { console.error("Startup failed", e); process.exit(1); });
