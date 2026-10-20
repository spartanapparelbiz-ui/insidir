/* Cost and load simulation: node scripts/cost-simulate.mjs [--customers 100,1000,10000] [--json out.json]
 *
 * Runs Insidir's own code paths for N simulated paying customers against a DISPOSABLE database that holds imported
 * SEC filings (the script refuses any database whose name does not contain "sim"). Nothing here is a model of the
 * code: explanations go through explainFiling / cachedGeneration / callModel, questions through investigate and
 * synthesize, research-event explanations through explainEvent, briefings through intelligenceBriefing, and alerts
 * through buildResearchEvents and fanOut, with every spending limit in force. Only the AI provider is replaced: the
 * stub answers with token counts measured from the real prompt (characters / 4, the usual ratio for English text)
 * and an output length drawn from the request's own cap, fails 2% of requests with HTTP 502 (to exercise retries),
 * and is priced at the gateway's list prices, so every cost below is an ESTIMATE from list prices, labelled so.
 *
 * Per customer and month (flags override): 20 filing explanations opened, 4 research-event explanations and 1
 * question about an event, 12 research questions (60% about one followed company from six common phrasings, 20%
 * comparing two followed companies, 20% personal: since my last visit, the people I follow), 30 briefings.
 * Customers follow 3-8 companies and 0-3 reporting people, chosen by popularity (Zipf, s=1.1) from the imported data.
 * Time: the month's actions are spread at random over 456 one-hour slots (19 days × 24 hours); after each slot the
 * cost ledgers are moved back one hour, so the hourly, daily and monthly limits see the activity as it would arrive
 * (1.6 times faster than a 30-day month, which is conservative for the pacing limits; 19 days keeps it inside the
 * calendar month the monthly limits count). Every per-customer limit stays at its default. Two scenarios per scale:
 *   demand        the global daily and monthly dollar budgets raised to $500 / $10,000, to measure what customers ask for
 *   production    every limit at its production default (INSIDIR_AI_* unset), to show where the caps refuse */
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";

const arg = (name, d) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : d; };
const SCALES = String(arg("customers", "100,1000,10000")).split(",").map(Number).filter(n => n > 0);
const PER = { filingViews: Number(arg("filing-views", 20)), eventViews: Number(arg("event-views", 4)), eventQuestions: Number(arg("event-questions", 1)),
  questions: Number(arg("questions", 12)), briefingsPerMonth: 30 };
const CONCURRENCY = Number(arg("concurrency", 24));
if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL to a disposable database (its name must contain 'sim')"); process.exit(2); }

const SCENARIO = arg("scenario", "demand");
Object.assign(process.env, {
  INSIDIR_OPENROUTER_API_KEY: "simulation-only", INSIDIR_AI_EXPLANATIONS: "1", ANTHROPIC_API_KEY: "simulation-only",
  INSIDIR_AI_MODEL: process.env.INSIDIR_AI_MODEL || "event-explanations-model",
  ...(SCENARIO === "demand" ? { INSIDIR_AI_DAILY_BUDGET_USD: "500", INSIDIR_AI_MONTHLY_BUDGET_USD: "10000" } : {})
});
const SLOTS = 456;
const { query, pool, migrate } = await import("../src/db.mjs");
const { explainFiling } = await import("../src/ai-explain.mjs");
const { callModel, estimateCost, modelFor, aiLimits } = await import("../src/ai-gateway.mjs");
const { investigate, synthesize, buildDirectory, DIRECTORY_SQL } = await import("../src/intelligence-investigate.mjs");
const { explainEvent, aiSettings } = await import("../src/explanations.mjs");
const { intelligenceBriefing } = await import("../src/intelligence-briefing.mjs");
const { buildResearchEvents } = await import("../src/research-events.mjs");
const { fanOut } = await import("../src/notifications.mjs");

const dbName = (await query("SELECT current_database() AS d")).rows[0].d;
if (!/sim/i.test(dbName)) { console.error("Refusing to run against " + dbName + ": the database name must contain 'sim'."); process.exit(2); }
await migrate();

/* ---------- deterministic randomness ---------- */
let seed = 20261020;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function zipf(items, s = 1.1) {
  const cum = []; let total = 0;
  items.forEach((_, i) => { total += 1 / Math.pow(i + 1, s); cum.push(total); });
  return () => { const x = rnd() * total; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; } return items[lo]; };
}
const pickDistinct = (draw, n) => { const out = new Set(); for (let i = 0; i < n * 6 && out.size < n; i++) out.add(draw()); return [...out]; };

/* ---------- measured database access ---------- */
const db = { queries: 0, ms: 0 };
const run = async (sql, params) => { db.queries++; const t = performance.now(); try { return await query(sql, params); } finally { db.ms += performance.now() - t; } };

/* ---------- the provider stub (the only thing not Insidir's own code) ---------- */
const provider = { requests: 0, failures: 0 };
const fakeFetch = async (url, init) => {
  provider.requests++;
  const body = JSON.parse(init.body);
  if (rnd() < 0.02) { provider.failures++; return { ok: false, status: 502, json: async () => ({}) }; }
  const chars = body.messages.reduce((a, m) => a + String(m.content).length, 0);
  const synthesis = /\[n\]/.test(body.messages[0]?.content || "");
  return { ok: true, status: 200, json: async () => ({ model: body.model,
    choices: [{ message: { content: synthesis ? "The cited filings report the activity listed in the sources [1]." : "This filing reports the insider transactions listed. Read the original filing for every detail." } }],
    usage: { prompt_tokens: Math.ceil(chars / 4), completion_tokens: Math.round(body.max_tokens * (0.45 + rnd() * 0.35)) } }) };
};
const generate = opts => callModel({ ...opts, fetchImpl: fakeFetch });
const eventWriter = async ({ evidence, question }) => {
  provider.requests++;
  if (rnd() < 0.02) { provider.failures++; throw Object.assign(new Error("overloaded"), { status: 529 }); }
  const chars = JSON.stringify(evidence).length + (question ? question.length : 0) + 2600; // + the fixed system prompt
  const e = evidence.find(x => /shares/.test(x.text)) || evidence[0];
  return { json: { facts: [{ text: e.text, evidence_ids: [e.id] }], interpretation: [], limitations: ["Values are as reported by the filer."] },
    usage: { input: Math.ceil(chars / 4), output: Math.round(400 + rnd() * 800) }, model: process.env.INSIDIR_AI_MODEL };
};

/* ---------- the imported data the customers draw from ---------- */
const tickers = (await query(`SELECT ticker FROM sec_filings WHERE ingest_status='parsed' AND ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$' GROUP BY ticker ORDER BY count(*) DESC, ticker`)).rows.map(r => r.ticker);
const owners = (await query(`SELECT LTRIM(owner_cik,'0') AS cik FROM sec_filing_owners WHERE owner_cik ~ '^[0-9]+$' GROUP BY 1 ORDER BY count(*) DESC,1 LIMIT 3000`)).rows.map(r => r.cik);
const filingsByTicker = new Map();
for (const r of (await query(`SELECT ticker,accession FROM sec_filings WHERE ingest_status='parsed' AND ticker IS NOT NULL ORDER BY published_at DESC`)).rows) {
  if (!filingsByTicker.has(r.ticker)) filingsByTicker.set(r.ticker, []); filingsByTicker.get(r.ticker).push(r.accession);
}
const span = (await query(`SELECT count(*)::integer AS n, EXTRACT(EPOCH FROM max(published_at)-min(published_at))/86400 AS days FROM sec_filings WHERE ingest_status='parsed'`)).rows[0];
const directory = buildDirectory((await query(DIRECTORY_SQL)).rows, null);
const offline = async () => { throw new Error("EDGAR submissions are not fetched in the simulation"); };
const drawTicker = zipf(tickers), drawOwner = zipf(owners.length ? owners : ["1"]);

// Research events: built once from the filings, shared by every customer (the same job runs once per import in production).
let t0 = performance.now();
const before = db.queries;
let built = { created: 0 };
for (let i = 0; i < 40; i++) { const r = await buildResearchEvents({ query: run }); built.created += r.created; if (!r.filings) break; }
const eventBuild = { ms: Math.round(performance.now() - t0), queries: db.queries - before, events: (await query("SELECT count(*)::integer AS n FROM sec_events")).rows[0].n };
const eventsByTicker = new Map();
for (const r of (await query("SELECT id,ticker FROM sec_events WHERE ticker IS NOT NULL ORDER BY id DESC")).rows) { if (!eventsByTicker.has(r.ticker)) eventsByTicker.set(r.ticker, []); eventsByTicker.get(r.ticker).push(Number(r.id)); }

const PHRASINGS = ["What did insiders at $T report in the last 30 days?", "Show recent insider sales at $T", "Recent insider purchases at $T",
  "What SEC filings did $T insiders make this month?", "Who are the insiders at $T?", "$T insider activity this quarter"];
const EVENT_QUESTIONS = ["What does this filing show?", "What does transaction code S mean here?", "Was this made under a trading plan?", "Who filed this?"];

async function pool_(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

async function reset() {
  await query("DELETE FROM users WHERE email LIKE '%@sim.insidir.invalid'");
  for (const t of ["ai_explanations", "ai_usage", "ai_cache_daily", "ai_budget_refusals", "ai_usage_log", "explanation_cache"]) await query("DELETE FROM " + t);
  await query("DELETE FROM research_cursors WHERE name='notifications'");
}

async function simulate(N) {
  await reset();
  Object.assign(db, { queries: 0, ms: 0 }); Object.assign(provider, { requests: 0, failures: 0 });
  const users = (await query(`INSERT INTO users(email,password_hash,subscription_status) SELECT 'sim-'||g||'-'||$1||'@sim.insidir.invalid','x','active' FROM generate_series(1,$1::integer) g RETURNING id`, [N])).rows.map(r => r.id);
  const follows = users.map(id => ({ id, tickers: pickDistinct(drawTicker, 3 + Math.floor(rnd() * 6)), people: pickDistinct(drawOwner, Math.floor(rnd() * 4)) }));
  await query("INSERT INTO watchlist(user_id,ticker) SELECT * FROM unnest($1::uuid[],$2::text[]) ON CONFLICT DO NOTHING",
    [follows.flatMap(f => f.tickers.map(() => f.id)), follows.flatMap(f => f.tickers)]);
  await query("INSERT INTO followed_people(user_id,owner_cik) SELECT * FROM unnest($1::uuid[],$2::text[]) ON CONFLICT DO NOTHING",
    [follows.flatMap(f => f.people.map(() => f.id)), follows.flatMap(f => f.people)]);

  // Alerts: every imported event fanned out to its followers, twice (the second pass must create nothing).
  const tA = performance.now(), qA = db.queries;
  await query("INSERT INTO research_cursors(name,position,last_key) VALUES('notifications',now(),'0')");
  let fan = { notifications: 0 };
  for (let i = 0; i < 50; i++) { const r = await fanOut({ query: run, limit: 2000, maxAgeDays: 3650 }); fan.notifications += r.notifications || 0; if (!r.events) break; }
  const alertMs = performance.now() - tA, alertQueries = db.queries - qA;
  const notifications = (await query("SELECT count(*)::integer AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.email LIKE '%@sim.insidir.invalid'")).rows[0].n;
  // How many of those a follow on "Important updates" (the Follow button's default) would have received.
  const important = (await query(`SELECT count(*)::integer AS n FROM notifications n JOIN users u ON u.id=n.user_id JOIN sec_events e ON e.id=n.event_id
    WHERE u.email LIKE '%@sim.insidir.invalid' AND (e.event_type IN ('insider_purchase','multi_insider_purchase','company_disclosure')
      OR (e.event_type='insider_sale' AND COALESCE(NULLIF(e.facts->>'totalValue','')::numeric,0)>=1000000))`)).rows[0].n;
  await query("UPDATE research_cursors SET last_key='0' WHERE name='notifications'");
  for (let i = 0; i < 50; i++) { const r = await fanOut({ query: run, limit: 2000, maxAgeDays: 3650 }); if (!r.events) break; }
  const notificationsAfterReplay = (await query("SELECT count(*)::integer AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.email LIKE '%@sim.insidir.invalid'")).rows[0].n;

  // Customer activity for one month, each action in a random one-hour slot (see the header).
  const outcome = {}, count = k => { outcome[k] = (outcome[k] || 0) + 1; };
  const slots = Array.from({ length: SLOTS }, () => []);
  const at = fn => slots[Math.floor(rnd() * SLOTS)].push(fn);
  for (const f of follows) {
    const mine = f.tickers.flatMap(t => filingsByTicker.get(t) || []);
    const drawMine = mine.length ? zipf(mine, 0.9) : null;
    for (let i = 0; i < PER.filingViews && drawMine; i++) { const acc = drawMine(); at(async () => {
      try { const r = await explainFiling(acc, { run, userId: f.id, generate }); count(r.cached ? "filing:cached" : "filing:generated"); }
      catch (e) { count("filing:" + (e.status || "error")); } }); }
    const myEvents = f.tickers.flatMap(t => eventsByTicker.get(t) || []);
    const drawEvent = myEvents.length ? zipf(myEvents, 0.9) : null;
    for (let i = 0; i < PER.eventViews + PER.eventQuestions && drawEvent; i++) {
      const question = i >= PER.eventViews ? EVENT_QUESTIONS[Math.floor(rnd() * EVENT_QUESTIONS.length)] : null, eventId = drawEvent();
      at(async () => {
        try { const r = await explainEvent({ query: run, eventId, user: { id: f.id }, question, writer: eventWriter }); count("event:" + (r.cached ? "cached" : r.ai || r.writer)); }
        catch (e) { count("event:" + (e.status || "error")); } });
    }
    for (let i = 0; i < PER.questions; i++) {
      const x = rnd(), t = f.tickers[Math.floor(rnd() * f.tickers.length)];
      const q = x < 0.6 ? PHRASINGS[Math.floor(rnd() * PHRASINGS.length)].replace("$T", t)
        : x < 0.8 && f.tickers.length > 1 ? "Compare insider activity at " + f.tickers[0] + " and " + f.tickers[1] + " this month"
        : rnd() < 0.5 ? "What changed since my last visit?" : "What did the people I follow report this month?";
      at(async () => {
        try {
          const answer = await investigate(f.id, q, { run, directory, loadCompany: offline });
          const s = await synthesize(f.id, q, { run, directory, loadCompany: offline, answer, generate });
          count("question:" + s.status + (s.status === "ready" ? (s.cached ? ":cached" : ":generated") + ":" + s.tier : ""));
        } catch (e) { count("question:" + (e.status || "error")); } });
    }
  }
  const tB = performance.now(), qB = db.queries;
  for (const slot of slots) {
    await pool_(slot, CONCURRENCY, fn => fn());
    // One hour passes for the ledgers the limits read (shifting does not count as customer database load).
    await query("UPDATE ai_usage SET created_at=created_at-interval '1 hour'");
    await query("UPDATE ai_usage_log SET created_at=created_at-interval '1 hour'");
    await query("UPDATE ai_explanations SET updated_at=updated_at-interval '1 hour',lease_until=lease_until-interval '1 hour'");
  }
  const activityMs = performance.now() - tB, activityQueries = db.queries - qB;

  // Briefings: deterministic, no model. One per customer measured, then counted 30 times for the month.
  const tC = performance.now(), qC = db.queries, sample = follows.slice(0, Math.min(N, 500));
  await pool_(sample, CONCURRENCY, async f => { await intelligenceBriefing(f.id, { run, days: 7, trackVisit: false }); });
  const briefingQueriesEach = (db.queries - qC) / sample.length, briefingMsEach = (performance.now() - tC) / sample.length;

  const usage = (await query(`SELECT count(*)::integer AS calls, count(*) FILTER (WHERE status='ok')::integer AS ok, count(*) FILTER (WHERE status<>'ok')::integer AS failed,
      COALESCE(sum(input_tokens),0)::bigint AS input, COALESCE(sum(output_tokens),0)::bigint AS output, COALESCE(sum(cost_usd),0)::float8 AS cost,
      count(*) FILTER (WHERE tier='deep')::integer AS deep FROM ai_usage`)).rows[0];
  const byFeature = (await query(`SELECT feature,count(*)::integer AS calls,COALESCE(sum(cost_usd),0)::float8 AS cost FROM ai_usage GROUP BY 1 ORDER BY 1`)).rows;
  const events = (await query(`SELECT count(*)::integer AS calls, COALESCE(sum(input_tokens),0)::bigint AS input, COALESCE(sum(output_tokens),0)::bigint AS output,
      COALESCE(sum(cost_micros),0)::bigint AS micros, count(*) FILTER (WHERE outcome='error')::integer AS failed FROM ai_usage_log`)).rows[0];
  const cache = (await query(`SELECT COALESCE(sum(hits),0)::integer AS hits, COALESCE(sum(misses),0)::integer AS misses FROM ai_cache_daily`)).rows[0];
  const refusals = (await query("SELECT budget,n FROM ai_budget_refusals ORDER BY n DESC")).rows;
  const perUser = (await query(`SELECT percentile_cont(ARRAY[0.5,0.9,0.99]) WITHIN GROUP (ORDER BY c) AS p, max(c) AS max FROM (
      SELECT u.id, COALESCE((SELECT sum(cost_usd) FROM ai_usage a WHERE a.user_id=u.id),0)+COALESCE((SELECT sum(cost_micros)/1e6 FROM ai_usage_log l WHERE l.user_id=u.id),0) AS c
      FROM users u WHERE u.email LIKE '%@sim.insidir.invalid') x`)).rows[0];
  const eventCost = Number(events.micros) / 1e6, totalCost = Number(usage.cost) + eventCost;
  const activityCalls = Object.entries(outcome).reduce((a, [, v]) => a + v, 0);
  return {
    customers: N,
    ai: { modelCalls: Number(usage.calls) + Number(events.calls), gateway: { ...usage, byFeature }, eventExplanations: { ...events, costUsd: eventCost },
      inputTokens: Number(usage.input) + Number(events.input), outputTokens: Number(usage.output) + Number(events.output),
      estimatedCostUsd: totalCost, estimatedCostPerCustomerUsd: totalCost / N, perCustomerAttributed: { p50: perUser.p?.[0], p90: perUser.p?.[1], p99: perUser.p?.[2], max: Number(perUser.max) },
      providerRequests: provider.requests, providerFailures: provider.failures, refusals },
    requests: { total: activityCalls, outcomes: outcome, modelCallsPerRequest: (Number(usage.calls) + Number(events.calls)) / activityCalls },
    cache: { ...cache, hitRate: cache.hits + cache.misses ? cache.hits / (cache.hits + cache.misses) : null },
    database: { activityQueries, activityQueriesPerCustomer: activityQueries / N, activitySeconds: Math.round(activityMs / 1000),
      briefingQueriesEach: Math.round(briefingQueriesEach), briefingMsEach: Math.round(briefingMsEach), briefingQueriesPerCustomerMonth: Math.round(briefingQueriesEach * PER.briefingsPerMonth) },
    notifications: { created: notifications, importantOnly: important, perCustomer: notifications / N, importantPerCustomerMonth: important / N * (30 / Math.max(1, Number(span.days))), perCustomerMonth: notifications / N * (30 / Math.max(1, Number(span.days))),
      afterReplay: notificationsAfterReplay, duplicatesCreated: notificationsAfterReplay - notifications, alertQueries, alertSeconds: Math.round(alertMs / 1000) },
    background: { filingsImported: span.n, eventsBuiltOnce: eventBuild.events, eventBuildQueries: eventBuild.queries, note: "Built once from the filings; independent of the number of customers." }
  };
}

const results = [];
for (const N of SCALES) {
  const t = performance.now();
  const r = await simulate(N);
  r.seconds = Math.round((performance.now() - t) / 1000);
  results.push(r);
  console.log(`${String(N).padStart(6)} customers: ${r.ai.modelCalls} model calls for ${r.requests.total} requests (${(r.requests.modelCallsPerRequest * 100).toFixed(1)}%), ` +
    `cache hit rate ${(r.cache.hitRate * 100).toFixed(1)}%, est. $${r.ai.estimatedCostUsd.toFixed(2)} total, $${r.ai.estimatedCostPerCustomerUsd.toFixed(4)} per customer, ` +
    `${Math.round(r.database.activityQueriesPerCustomer)} queries per customer, ${r.notifications.perCustomer.toFixed(1)} alerts per customer (${r.notifications.duplicatesCreated} duplicates on replay), ${r.seconds}s`);
}
const L = aiLimits();
const out = { generatedAt: new Date().toISOString(), database: dbName, scenario: SCENARIO, slots: SLOTS, assumptionsPerCustomerMonth: PER,
  data: { filings: span.n, spanDays: Number(Number(span.days).toFixed(2)), tickers: tickers.length, reportingOwners: owners.length },
  models: { fast: modelFor("fast"), deep: modelFor("deep"), eventExplanations: aiSettings().model },
  prices: { fast: estimateCost(modelFor("fast"), 1e6, 0) + "/" + estimateCost(modelFor("fast"), 0, 1e6), deep: estimateCost(modelFor("deep"), 1e6, 0) + "/" + estimateCost(modelFor("deep"), 0, 1e6),
    eventExplanations: aiSettings().inputUsdPerMTok + "/" + aiSettings().outputUsdPerMTok, unit: "USD per million input/output tokens (list prices; estimates)" },
  limits: L,
  eventBuild, results };
if (arg("json")) writeFileSync(arg("json"), JSON.stringify(out, null, 1));
await query("DELETE FROM users WHERE email LIKE '%@sim.insidir.invalid'");
await pool.end();
