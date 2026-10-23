/* Operational diagnostics: worker heartbeats and one snapshot of what the engine is doing, for operators
 * (GET /v1/admin/ops, behind admin token + one-time code; web/ops.html renders it).
 *
 * Every background job runs through runWorker(), which records its start, finish, outcome and last error in
 * worker_heartbeats (sql/013) and takes a PostgreSQL advisory lock so two instances never run the same job at once.
 * The snapshot reads only counts and timestamps; it contains no member emails, passwords or tokens. */
import { createHash } from "node:crypto";
import { secHealth } from "./sec.mjs";
import { capabilitySummary } from "./capabilities.mjs";
import { sourceRegistry } from "./analysis.mjs";
import { billingSettings, emailSettings, verificationRequired, trialSettings, TRIAL_DAYS } from "./config.mjs";

const lockId = name => Number.parseInt(createHash("sha256").update("insidir-worker:" + name).digest("hex").slice(0, 8), 16) | 0;

/* Runs fn() as worker `name`: skipped (not failed) when another instance holds the lock. `client` must be a
 * dedicated connection for the advisory lock (pool.connect()); without one the lock is not taken (tests). */
export async function runWorker(name, fn, { query, connect = null, log = console } = {}) {
  let client = null;
  if (connect) {
    client = await connect();
    const got = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [lockId(name)]);
    if (!got.rows[0]?.ok) { client.release(); return { skipped: "locked" }; }
  }
  try {
    await query(`INSERT INTO worker_heartbeats(name,last_started_at,runs) VALUES($1,now(),1)
      ON CONFLICT(name) DO UPDATE SET last_started_at=now(),runs=worker_heartbeats.runs+1`, [name]).catch(() => {});
    try {
      const result = await fn();
      await query("UPDATE worker_heartbeats SET last_finished_at=now(),last_ok_at=now(),last_result=$2 WHERE name=$1", [name, JSON.stringify(result ?? null)]).catch(() => {});
      return result;
    } catch (e) {
      const message = String(e?.message || e).slice(0, 500);
      await query("UPDATE worker_heartbeats SET last_finished_at=now(),last_error=$2,last_error_at=now(),failures=failures+1 WHERE name=$1", [name, message]).catch(() => {});
      log.error?.(JSON.stringify({ event: "worker.failed", worker: name, error: message }));
      return { ok: false, error: message };
    }
  } finally {
    if (client) { try { await client.query("SELECT pg_advisory_unlock($1)", [lockId(name)]); } finally { client.release(); } }
  }
}

/* Spend alerts: 80% of a budget is a warning, the whole budget is a stop (new model text is refused until it resets;
   cached explanations and every deterministic answer keep working). Refusals are reported as they happen. */
export function spendAlerts(ai) {
  if (!ai || ai.unavailable || ai.dailyBudgetUsd == null) return [];
  const out = [], usd = v => "$" + Number(v).toFixed(2);
  for (const [spent, budget, label] of [[ai.spentTodayUsd, ai.dailyBudgetUsd, "today"], [ai.spentMonthUsd, ai.monthlyBudgetUsd, "this month"]]) {
    if (spent >= budget) out.push({ area: "ai-spend", level: "warning", detail: `AI budget for ${label} reached: ${usd(spent)} of ${usd(budget)}; new model text is refused until it resets` });
    else if (spent >= 0.8 * budget) out.push({ area: "ai-spend", level: "warning", detail: `AI spend ${label} at ${Math.round(spent / budget * 100)}% of budget (${usd(spent)} of ${usd(budget)})` });
  }
  const refused = (ai.refusalsToday || []).reduce((a, r) => a + Number(r.n || 0), 0);
  if (refused) out.push({ area: "ai-spend", level: "warning", detail: `${refused} AI request(s) refused by spending limits today (${ai.refusalsToday.map(r => r.budget + " " + r.n).join(", ")})` });
  return out;
}

const minutesSince = d => d ? Math.round((Date.now() - new Date(d).getTime()) / 60000) : null;

/* Ingestion freshness. EDGAR publishes Form 4s on business days, so a quiet weekend is not a failure: the newest
 * filing is "stale" only after 4 days, a warning after 26 hours. The scheduled run is stale after 45 minutes
 * when AUTO_INGEST=1 (it runs every 15). */
export function ingestStaleness({ lastSuccessAt, newestFilingAt, autoIngest }) {
  const reasons = [];
  let status = "ok";
  const runAge = minutesSince(lastSuccessAt), filingAge = minutesSince(newestFilingAt);
  if (autoIngest && (runAge == null || runAge > 45)) { status = "stale"; reasons.push(runAge == null ? "no successful ingestion run recorded" : `last successful ingestion ${runAge} minutes ago`); }
  if (filingAge == null) { status = "stale"; reasons.push("no parsed filings"); }
  else if (filingAge > 4 * 1440) { status = "stale"; reasons.push(`newest parsed filing ${Math.round(filingAge / 60)} hours old`); }
  else if (filingAge > 26 * 60 && status === "ok") { status = "warning"; reasons.push(`newest parsed filing ${Math.round(filingAge / 60)} hours old`); }
  return { status, reasons, lastSuccessMinutesAgo: runAge, newestFilingMinutesAgo: filingAge };
}

const safe = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return { unavailable: String(e?.code || e?.message || e).slice(0, 120), ...(fallback || {}) }; } };
const rows = async (query, sql, params = []) => (await query(sql, params)).rows;

export async function opsSnapshot({ query, env = process.env, autoIngest = env.AUTO_INGEST === "1" }) {
  const ingestion = await safe(async () => {
    const [last] = await rows(query, "SELECT id,started_at,finished_at,status,discovered,parsed,failed,skipped,error_message FROM ingest_runs ORDER BY id DESC LIMIT 1");
    const [ok] = await rows(query, "SELECT max(finished_at) AS at FROM ingest_runs WHERE status IN ('success','partial')");
    const [counts] = await rows(query, `SELECT count(*) FILTER (WHERE started_at>now()-interval '24 hours')::integer AS runs_24h,
      count(*) FILTER (WHERE started_at>now()-interval '24 hours' AND status='error')::integer AS failed_runs_24h,
      count(*) FILTER (WHERE status='running' AND started_at<now()-interval '30 minutes')::integer AS stuck_runs FROM ingest_runs`);
    const [filings] = await rows(query, `SELECT max(published_at) FILTER (WHERE ingest_status='parsed') AS newest,
      count(*) FILTER (WHERE ingest_status='parsed')::integer AS parsed, count(*) FILTER (WHERE ingest_status='error')::integer AS errors,
      count(*) FILTER (WHERE ingest_status='error' AND updated_at>now()-interval '24 hours')::integer AS errors_24h FROM sec_filings`);
    const recentErrors = await rows(query, "SELECT accession,form_type,error_message,updated_at FROM sec_filings WHERE ingest_status='error' ORDER BY updated_at DESC LIMIT 10");
    return { lastRun: last || null, lastSuccessAt: ok?.at || null, ...counts, filings, recentErrors,
      staleness: ingestStaleness({ lastSuccessAt: ok?.at, newestFilingAt: filings?.newest, autoIngest }) };
  });
  const researchEvents = await safe(async () => {
    const [r] = await rows(query, `SELECT count(*)::integer AS total, max(detected_at) AS newest_detected,
      count(*) FILTER (WHERE detected_at>now()-interval '24 hours')::integer AS detected_24h FROM sec_events`);
    const byType = await rows(query, "SELECT event_type,count(*)::integer AS n FROM sec_events GROUP BY event_type ORDER BY n DESC");
    // Builder lag: parsed filings retrieved after the builder's cursor are not yet events.
    const [lag] = await rows(query, `SELECT (SELECT position FROM research_cursors WHERE name='form4') AS cursor,
      (SELECT count(*)::integer FROM sec_filings f WHERE f.ingest_status='parsed' AND f.retrieved_at>COALESCE((SELECT position FROM research_cursors WHERE name='form4'),'epoch')) AS pending_filings`);
    const [retry] = await rows(query, "SELECT count(*) FILTER (WHERE attempts<5)::integer AS retrying, count(*) FILTER (WHERE attempts>=5)::integer AS gave_up FROM sec_filings WHERE ingest_status='error'");
    const [disc] = await rows(query, "SELECT count(*)::integer AS companies, count(*) FILTER (WHERE failures>0)::integer AS failing, max(last_ok_at) AS last_ok_at FROM disclosure_sources");
    return { ...r, byType, builder: lag, failedImports: retry, disclosureSources: disc };
  });
  const email = await safe(async () => {
    const [r] = await rows(query, `SELECT count(*) FILTER (WHERE status='queued')::integer AS queued, count(*) FILTER (WHERE status='sending')::integer AS sending,
      count(*) FILTER (WHERE status='sent' AND sent_at>now()-interval '24 hours')::integer AS sent_24h,
      count(*) FILTER (WHERE status='failed' AND created_at>now()-interval '24 hours')::integer AS failed_24h,
      count(*) FILTER (WHERE status='suppressed' AND created_at>now()-interval '24 hours')::integer AS suppressed_24h,
      count(*) FILTER (WHERE delivery_status IN ('bounced','complained') AND delivery_updated_at>now()-interval '7 days')::integer AS bounced_7d,
      min(created_at) FILTER (WHERE status='queued') AS oldest_queued FROM email_outbox`);
    const [s] = await rows(query, "SELECT count(*)::integer AS n FROM email_suppressions");
    const lastErrors = await rows(query, "SELECT kind,category,last_error,attempts,created_at FROM email_outbox WHERE last_error IS NOT NULL ORDER BY id DESC LIMIT 5");
    const settings = emailSettings(env);
    return { provider: settings.provider, requested: settings.requested, verificationRequired: verificationRequired(env), ...r,
      oldestQueuedMinutes: minutesSince(r?.oldest_queued), suppressions: s?.n ?? 0, lastErrors };
  });
  const notifications = await safe(async () => {
    const [r] = await rows(query, `SELECT count(*) FILTER (WHERE created_at>now()-interval '24 hours')::integer AS created_24h,
      count(*) FILTER (WHERE read_at IS NULL)::integer AS unread FROM notifications`);
    const [p] = await rows(query, `SELECT count(*) FILTER (WHERE email_alerts<>'off')::integer AS email_on, count(*)::integer AS total FROM notification_preferences`);
    return { ...r, preferences: p };
  });
  // AI spend against the budgets, from both ledgers (src/ai-gateway.mjs BUDGET_SQL), and today's refusals by limit.
  const ai = await safe(async () => {
    const { BUDGET_SQL, aiLimits, aiConfigured } = await import("./ai-gateway.mjs");
    const [b] = await rows(query, BUDGET_SQL, [null]);
    const refusals = await rows(query, "SELECT budget,n FROM ai_budget_refusals WHERE day=current_date ORDER BY n DESC");
    const L = aiLimits(env);
    return { configured: aiConfigured(env), eventExplanations: String(env.INSIDIR_AI_EXPLANATIONS || "") === "1", requestsToday: b?.day ?? 0,
      spentTodayUsd: Number(b?.day_cost || 0), spentMonthUsd: Number(b?.month_cost || 0), dailyBudgetUsd: L.dailyBudgetUsd, monthlyBudgetUsd: L.monthlyBudgetUsd,
      userMonthlyBudgetUsd: L.userMonthlyBudgetUsd, refusalsToday: refusals };
  });
  const billing = await safe(async () => {
    const [w] = await rows(query, "SELECT max(processed_at) AS last_webhook_at, count(*) FILTER (WHERE processed_at>now()-interval '24 hours')::integer AS webhooks_24h FROM stripe_events");
    const events = await rows(query, "SELECT kind,count(*)::integer AS n FROM billing_events WHERE created_at>now()-interval '7 days' GROUP BY kind ORDER BY kind");
    const statuses = await rows(query, "SELECT COALESCE(subscription_status,'none') AS status,count(*)::integer AS n FROM users GROUP BY 1 ORDER BY 1");
    return { enabled: billingSettings(env).enabled, lastWebhookAt: w?.last_webhook_at || null, webhookMinutesAgo: minutesSince(w?.last_webhook_at), webhooks24h: w?.webhooks_24h ?? 0, events7d: events, accountsByStatus: statuses };
  });
  const security = await safe(async () => (await rows(query, `SELECT kind,count(*)::integer AS n FROM security_events WHERE created_at>now()-interval '24 hours' GROUP BY kind ORDER BY kind`)));
  const workers = await safe(async () => rows(query, "SELECT name,last_started_at,last_finished_at,last_ok_at,last_error,last_error_at,last_result,runs,failures FROM worker_heartbeats ORDER BY name"));
  // Coverage (src/coverage-ingest.mjs): the measured report and the data-quality counts with example rows.
  const coverage = await safe(async () => {
    const { coverageReport, qualityChecks } = await import("./coverage-ingest.mjs");
    return { report: await coverageReport({ run: query }), quality: await qualityChecks({ run: query }) };
  });
  const alerts = [];
  if (coverage && !coverage.unavailable) {
    const q = coverage.report.queue, b = coverage.report.backfill;
    if (q.failed > 0) alerts.push({ area: "coverage", level: "warning", detail: `${q.failed} Form 4 accession(s) failed every import attempt (kept in sec_ingest_queue with their errors)` });
    if (b.indexDayErrors > 0) alerts.push({ area: "coverage", level: "warning", detail: `${b.indexDayErrors} EDGAR daily index(es) could not be read` });
    const lastDir = coverage.report.lastSuccessfulSync["company-directory"];
    if (!lastDir || Date.now() - new Date(lastDir).getTime() > 3 * 86400_000) alerts.push({ area: "coverage", level: "warning", detail: "SEC company ticker list not synced in the last 3 days" });
    const stale = coverage.quality.find(c => c.key === "stale_filings");
    if (stale?.stale) alerts.push({ area: "coverage", level: "stale", detail: "No new Form 4 imported for more than 4 days" });
  }
  const trial = trialSettings(env);
  if (trial.enabled && trial.days !== TRIAL_DAYS) alerts.push({ area: "billing", level: "warning", detail: `INSIDIR_TRIAL_DAYS gives new checkouts a ${trial.days}-day trial, but the site, terms and emails promise ${TRIAL_DAYS} days` });
  for (const alert of spendAlerts(ai)) alerts.push(alert);
  if (ingestion?.staleness && ingestion.staleness.status !== "ok") alerts.push({ area: "ingestion", level: ingestion.staleness.status, detail: ingestion.staleness.reasons.join("; ") });
  if (researchEvents?.builder?.pending_filings > 500) alerts.push({ area: "research-events", level: "warning", detail: `${researchEvents.builder.pending_filings} parsed filings not yet turned into events` });
  if (researchEvents?.failedImports?.gave_up) alerts.push({ area: "ingestion", level: "warning", detail: `${researchEvents.failedImports.gave_up} filing(s) failed to import after 5 attempts` });
  if (ingestion?.stuck_runs) alerts.push({ area: "ingestion", level: "warning", detail: ingestion.stuck_runs + " ingestion run(s) still 'running' after 30 minutes" });
  const sec = secHealth();
  if (sec.blocked) alerts.push({ area: "sec", level: "stale", detail: "SEC answered 403 to this process; pause and check SEC_USER_AGENT and request rates" });
  if (email && !email.unavailable && email.provider === "none" && (email.queued || 0) > 0) alerts.push({ area: "email", level: "warning", detail: `${email.queued} message(s) queued and no email provider configured` });
  if (email?.oldestQueuedMinutes > 30 && email.provider !== "none") alerts.push({ area: "email", level: "warning", detail: `oldest queued message waiting ${email.oldestQueuedMinutes} minutes` });
  if (notifications?.preferences?.email_on > 0 && !String(env.INSIDIR_POSTAL_ADDRESS || "").trim()) alerts.push({ area: "email", level: "warning", detail: "alert emails are on for some members but INSIDIR_POSTAL_ADDRESS is not set (see ATTORNEY-REVIEW.md C-1)" });
  if (billing?.enabled && billing.webhookMinutesAgo == null) alerts.push({ area: "billing", level: "warning", detail: "billing enabled but no Stripe webhook has ever been processed" });
  for (const w of Array.isArray(workers) ? workers : []) if (w.last_error_at && (!w.last_ok_at || new Date(w.last_error_at) > new Date(w.last_ok_at))) alerts.push({ area: "worker:" + w.name, level: "warning", detail: String(w.last_error || "").slice(0, 160) });
  return { generatedAt: new Date().toISOString(), status: alerts.some(a => a.level === "stale") ? "degraded" : alerts.length ? "warning" : "ok", alerts,
    ingestion, sec, researchEvents, notifications, email, billing, ai, security, workers, coverage,
    capabilities: capabilitySummary({ env }), sources: sourceRegistry.map(s => ({ id: s.id, status: s.status })) };
}
