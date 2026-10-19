/* Internal cost dashboard (GET /v1/admin/costs): AI spend and usage, cache effectiveness, background work,
 * failures, notification delivery, query timings, and gross margin where the inputs are real.
 *
 * Every figure says where it came from:
 *   measured          read from Insidir's own ledgers, or from Stripe's balance transactions
 *   provider_reported the AI provider's own cost for a call
 *   estimated         computed from configured list prices (never added to measured cost)
 *   operator_entered  typed into configuration (e.g. a hosting bill), not read from a billing system
 *   unavailable       the source is not connected; no number is shown
 * Admin access: INSIDIR_ADMIN_TOKEN (Bearer) or a signed-in account listed in INSIDIR_ADMIN_EMAILS. */
import { createHash, timingSafeEqual } from "node:crypto";
import { query as queryDb } from "./db.mjs";
import { aiLimits, modelFor, aiConfigured } from "./ai-gateway.mjs";
import { billingSettings } from "./config.mjs";
import { PLAN_CENTS } from "./billing.mjs";

const fail = (status, message) => Object.assign(new Error(message), { status });

/* ---------- In-process query timings for the Intelligence routes ---------- */
const timings = new Map();
export async function timed(label, fn) {
  const started = performance.now();
  try { return await fn(); }
  finally {
    const ms = performance.now() - started;
    if (!timings.has(label)) timings.set(label, { count: 0, samples: [] });
    const t = timings.get(label); t.count++; t.samples.push(ms); if (t.samples.length > 200) t.samples.shift();
  }
}
export function timingSummary() {
  return [...timings.entries()].map(([label, t]) => {
    const s = [...t.samples].sort((a, b) => a - b), pick = q => s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : null;
    return { label, count: t.count, p50Ms: pick(0.5), p95Ms: pick(0.95), maxMs: s.length ? Math.round(s.at(-1)) : null, window: s.length };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

/* ---------- Admin check ---------- */
export function adminIdentity(req, user, env = process.env) {
  const token = String(env.INSIDIR_ADMIN_TOKEN || "");
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token.length >= 32 && supplied && supplied.length === token.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(token)))
    return "token:" + createHash("sha256").update(supplied).digest("hex").slice(0, 12);
  const emails = new Set(String(env.INSIDIR_ADMIN_EMAILS || "").split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
  if (user?.email && emails.has(String(user.email).toLowerCase())) return "user:" + user.id;
  return null;
}

/* ---------- Stripe: authoritative revenue and processing fees ---------- */
export async function stripeLast30Days(stripe, now = Date.now()) {
  const since = Math.floor((now - 30 * 86400_000) / 1000);
  let starting_after = null, pages = 0;
  const sum = { gross: 0, fees: 0, refunds: 0, disputes: 0, transactions: 0, currency: null, truncated: false };
  do {
    const params = { limit: "100", "created[gte]": String(since) };
    if (starting_after) params.starting_after = starting_after;
    const page = await stripe.get("/balance_transactions", params);
    for (const t of page.data || []) {
      sum.transactions++; sum.currency = sum.currency || t.currency;
      sum.fees += Number(t.fee) || 0;
      if (t.type === "charge" || t.type === "payment") sum.gross += Number(t.amount) || 0;
      else if (t.type === "refund" || t.type === "payment_refund") sum.refunds += -(Number(t.amount) || 0);
      else if (/dispute/.test(String(t.type))) sum.disputes += -(Number(t.amount) || 0);
    }
    starting_after = page.has_more && page.data?.length ? page.data.at(-1).id : null;
    pages++;
  } while (starting_after && pages < 10);
  if (starting_after) sum.truncated = true;
  return { source: "measured", provider: "stripe_balance_transactions", currency: sum.currency, grossUsd: sum.gross / 100, feesUsd: sum.fees / 100, refundsUsd: sum.refunds / 100, disputesUsd: sum.disputes / 100,
    netRevenueUsd: (sum.gross - sum.refunds - sum.disputes) / 100, transactions: sum.transactions, truncated: sum.truncated };
}

const n = v => v == null ? 0 : Number(v);
let cache = { at: 0, value: null };
export async function costReport({ run = queryDb, env = process.env, stripe = null, now = Date.now(), maxAgeMs = 60_000 } = {}) {
  if (cache.value && now - cache.at < maxAgeMs) return { ...cache.value, cached: true };
  const q = async (sql, params = []) => (await run(sql, params)).rows;
  const [daily, totals, byFeature, byModel, cacheDays, explanations, jobs, jobStatus, ingest, pushes, subs, users, perUser] = await Promise.all([
    q(`SELECT date_trunc('day',created_at)::date AS day,count(*)::integer AS requests,count(*) FILTER (WHERE status='ok')::integer AS ok,
        count(*) FILTER (WHERE status<>'ok')::integer AS failed,sum(input_tokens)::bigint AS input_tokens,sum(output_tokens)::bigint AS output_tokens,
        COALESCE(sum(cost_usd) FILTER (WHERE cost_source='provider_reported'),0)::float8 AS measured,
        COALESCE(sum(cost_usd) FILTER (WHERE cost_source='estimated'),0)::float8 AS estimated
      FROM ai_usage WHERE created_at>=now()-interval '30 days' GROUP BY 1 ORDER BY 1 DESC`),
    q(`SELECT
        count(*) FILTER (WHERE created_at>=date_trunc('month',now()))::integer AS month_requests,
        COALESCE(sum(cost_usd) FILTER (WHERE created_at>=date_trunc('month',now()) AND cost_source='provider_reported'),0)::float8 AS month_measured,
        COALESCE(sum(cost_usd) FILTER (WHERE created_at>=date_trunc('month',now()) AND cost_source='estimated'),0)::float8 AS month_estimated,
        count(*) FILTER (WHERE created_at>=date_trunc('day',now()))::integer AS today_requests,
        COALESCE(sum(cost_usd) FILTER (WHERE created_at>=date_trunc('day',now()) AND cost_source='provider_reported'),0)::float8 AS today_measured,
        COALESCE(sum(cost_usd) FILTER (WHERE created_at>=date_trunc('day',now()) AND cost_source='estimated'),0)::float8 AS today_estimated,
        COALESCE(sum(cost_usd) FILTER (WHERE created_at>=now()-interval '30 days' AND cost_source='provider_reported'),0)::float8 AS d30_measured,
        COALESCE(sum(cost_usd) FILTER (WHERE created_at>=now()-interval '30 days' AND cost_source='estimated'),0)::float8 AS d30_estimated,
        count(*) FILTER (WHERE created_at>=now()-interval '30 days')::integer AS d30_requests,
        count(*) FILTER (WHERE created_at>=now()-interval '30 days' AND status='ok')::integer AS d30_ok,
        COALESCE(sum(input_tokens) FILTER (WHERE created_at>=now()-interval '30 days'),0)::bigint AS d30_input,
        COALESCE(sum(output_tokens) FILTER (WHERE created_at>=now()-interval '30 days'),0)::bigint AS d30_output,
        count(DISTINCT user_id) FILTER (WHERE created_at>=now()-interval '30 days')::integer AS d30_users
      FROM ai_usage WHERE created_at>=LEAST(date_trunc('month',now()),now()-interval '30 days')`),
    q(`SELECT feature,count(*)::integer AS requests,COALESCE(sum(cost_usd),0)::float8 AS cost,
        count(*) FILTER (WHERE status='ok')::integer AS ok,count(*) FILTER (WHERE status='rejected')::integer AS rejected
      FROM ai_usage WHERE created_at>=now()-interval '30 days' GROUP BY feature ORDER BY requests DESC`),
    q(`SELECT model,tier,count(*)::integer AS requests,sum(input_tokens)::bigint AS input_tokens,sum(output_tokens)::bigint AS output_tokens,COALESCE(sum(cost_usd),0)::float8 AS cost,
        round(avg(latency_ms))::integer AS avg_latency_ms
      FROM ai_usage WHERE created_at>=now()-interval '30 days' GROUP BY model,tier ORDER BY requests DESC`),
    q(`SELECT COALESCE(sum(hits),0)::integer AS hits,COALESCE(sum(misses),0)::integer AS misses FROM ai_cache_daily WHERE day>=current_date-30`),
    q(`SELECT source_type,status,count(*)::integer AS n,COALESCE(sum(hits),0)::integer AS hits FROM ai_explanations GROUP BY 1,2 ORDER BY 1,2`),
    q(`SELECT job,started_at,finished_at,status,detail,error FROM intelligence_jobs ORDER BY started_at DESC LIMIT 20`),
    q(`SELECT job,count(*) FILTER (WHERE status='ok')::integer AS ok,count(*) FILTER (WHERE status='failed')::integer AS failed,max(started_at) AS last_run
      FROM intelligence_jobs WHERE started_at>=now()-interval '7 days' GROUP BY job`),
    q(`SELECT started_at,finished_at,status,discovered,parsed,failed,skipped FROM ingest_runs ORDER BY id DESC LIMIT 12`),
    q(`SELECT count(*) FILTER (WHERE status='sent' AND sent_at>=now()-interval '7 days')::integer AS sent,
        count(*) FILTER (WHERE status='failed' AND last_attempt_at>=now()-interval '7 days')::integer AS failed,
        count(*) FILTER (WHERE status='pending')::integer AS pending,
        count(*) FILTER (WHERE status='pending' AND attempts>0)::integer AS retrying
      FROM push_deliveries`),
    q(`SELECT count(*) FILTER (WHERE subscription_status IN ('active','trialing'))::integer AS paying,
        count(*) FILTER (WHERE subscription_status='trialing')::integer AS trialing,count(*)::integer AS accounts FROM users`),
    q(`SELECT count(*)::integer AS n FROM users`),
    q(`SELECT count(*)::integer AS requests FROM ai_usage WHERE created_at>=now()-interval '30 days' AND user_id IS NOT NULL GROUP BY user_id ORDER BY 1 DESC LIMIT 5`)
  ]);
  void users;
  const t = totals[0] || {}, c = cacheDays[0] || {}, s = subs[0] || {};
  let pgStats = null;
  try {
    pgStats = (await run(`SELECT left(regexp_replace(query,'\\s+',' ','g'),140) AS query,calls::bigint AS calls,round(mean_exec_time::numeric,1)::float8 AS mean_ms,round(max_exec_time::numeric,1)::float8 AS max_ms
      FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 8`)).rows;
  } catch { pgStats = null; }
  let stripeData = { source: "unavailable", reason: "Stripe billing is not configured on this deployment." };
  if (stripe && billingSettings(env).enabled) {
    try { stripeData = await stripeLast30Days(stripe, now); }
    catch (e) { stripeData = { source: "unavailable", reason: "Stripe did not answer: " + String(e?.message || e).slice(0, 120) }; }
  }
  const infraEntered = Number(env.INSIDIR_INFRA_MONTHLY_USD);
  const infra = Number.isFinite(infraEntered) && String(env.INSIDIR_INFRA_MONTHLY_USD || "").trim() !== ""
    ? { source: "operator_entered", monthlyUsd: infraEntered, note: "Entered in INSIDIR_INFRA_MONTHLY_USD; not read from Railway billing." }
    : { source: "unavailable", reason: "Railway billing is not connected; set INSIDIR_INFRA_MONTHLY_USD to include an entered figure." };
  const aiMeasured30 = n(t.d30_measured), aiEstimated30 = n(t.d30_estimated);
  const paying = n(s.paying);
  let margin = { source: "unavailable", reason: "Gross margin needs measured revenue from Stripe." };
  if (stripeData.source === "measured") {
    const revenue = stripeData.netRevenueUsd;
    const costs = stripeData.feesUsd + aiMeasured30 + (infra.source === "operator_entered" ? infra.monthlyUsd : 0);
    margin = { source: infra.source === "operator_entered" ? "measured_with_operator_entered_infra" : "measured_excluding_infrastructure", revenueUsd: revenue,
      costsUsd: Math.round(costs * 100) / 100, components: { stripeFeesUsd: stripeData.feesUsd, aiMeasuredUsd: aiMeasured30, infraUsd: infra.source === "operator_entered" ? infra.monthlyUsd : null },
      grossMargin: revenue > 0 ? (revenue - costs) / revenue : null,
      excluded: [...(aiEstimated30 ? ["AI cost estimated from list prices: $" + aiEstimated30.toFixed(4) + " (not provider-reported)"] : []), ...(infra.source !== "operator_entered" ? ["Hosting (Railway) cost"] : [])] };
  }
  const L = aiLimits(env), hits = n(c.hits), misses = n(c.misses);
  const report = {
    generatedAt: new Date(now).toISOString(), window: "Last 30 days unless stated",
    ai: {
      configured: aiConfigured(env), models: { fast: modelFor("fast", env), deep: modelFor("deep", env) }, limits: L,
      today: { requests: n(t.today_requests), measuredUsd: n(t.today_measured), estimatedUsd: n(t.today_estimated) },
      month: { requests: n(t.month_requests), measuredUsd: n(t.month_measured), estimatedUsd: n(t.month_estimated) },
      last30: { requests: n(t.d30_requests), ok: n(t.d30_ok), inputTokens: n(t.d30_input), outputTokens: n(t.d30_output), measuredUsd: aiMeasured30, estimatedUsd: aiEstimated30,
        customersUsingAi: n(t.d30_users), requestsPerActiveCustomer: n(t.d30_users) ? n(t.d30_requests) / n(t.d30_users) : null,
        averageMeasuredCostPerExplanation: n(t.d30_ok) && aiMeasured30 ? aiMeasured30 / n(t.d30_ok) : null,
        measuredCostPerPayingSubscriber: paying ? aiMeasured30 / paying : null, targetPerSubscriberUsd: 0.05 },
      topCustomerRequests: perUser.map(r => r.requests),
      byFeature, byModel, daily: daily.map(d => ({ ...d, day: d.day instanceof Date ? d.day.toISOString().slice(0, 10) : d.day }))
    },
    cache: { hits, misses, hitRate: hits + misses ? hits / (hits + misses) : null, explanations },
    subscribers: { source: "measured", paying, trialing: n(s.trialing), accounts: n(s.accounts), listPriceUsd: PLAN_CENTS / 100,
      note: "From subscription status stored by the Stripe webhook; complimentary accounts are not counted." },
    background: { jobs, jobStatus, ingest },
    failures: { jobs: jobs.filter(j => j.status === "failed"), ingest: ingest.filter(r => r.status && !/^(ok|completed|success)/i.test(r.status) && r.status !== "running"),
      explanationsFailed: explanations.filter(e => e.status === "failed").reduce((s2, e) => s2 + e.n, 0), notifications: pushes[0] || {} },
    notifications: pushes[0] || {},
    database: { appTimings: timingSummary(), pgStatStatements: pgStats ?? "pg_stat_statements is not installed; showing in-process timings only." },
    stripe: stripeData, infrastructure: infra, grossMargin: margin
  };
  cache = { at: now, value: report };
  return report;
}
export const resetCostCache = () => { cache = { at: 0, value: null }; };
