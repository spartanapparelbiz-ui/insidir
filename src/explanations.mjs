/* Source-backed explanations of research events.
 *
 * Every explanation is built from an evidence pack: numbered items (E1, E2, ...) taken from the event's own stored
 * facts and the filings it links, each with its source address, accession and retrieval time. Two writers:
 *
 *   rules  (always available) deterministic sentences from the evidence, plus fixed context about what the form is
 *          and a list of what is missing, delayed or uncertain. No model is involved.
 *   model  (only with INSIDIR_AI_EXPLANATIONS=1 and Anthropic credentials) Claude writes {facts, interpretation,
 *          limitations} as JSON constrained by a schema, each statement citing evidence ids. The server then checks it
 *          (validateExplanation in compliance-guard.mjs): every citation must exist, every fact must cite evidence,
 *          every figure must appear in what it cites, and nothing may direct the reader, promise an outcome or
 *          present a motive or prediction as fact. Anything that fails is discarded and the rules version is served,
 *          with the reasons logged. Accepted answers are cached per event, evidence and (normalised) question; every
 *          call is logged with its cost in ai_usage_log, which the gateway's budget check reads together with its own
 *          ledger (src/ai-gateway.mjs checkBudget): the same global daily and monthly budgets, per-member hourly,
 *          daily and monthly limits and per-member monthly allowance stop a call here before it is made, with the
 *          most it could cost reserved against them. There is no default model: INSIDIR_AI_MODEL names one.
 *
 * Questions from members are screened first (screenQuestion): requests for personalized advice or attempts to
 * bypass the rules are answered with a refusal and never reach a model. No member data (holdings, watchlist, notes)
 * is ever sent to the model: only the public-record evidence of one event. */
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { validateExplanation, screenQuestion } from "./compliance-guard.mjs";
import { eventSummary, CAVEATS } from "./research-events.mjs";
import { checkBudget, withReservation } from "./ai-gateway.mjs";

export const PROMPT_VERSION = "2026-10-19.1";
const sha = s => createHash("sha256").update(s).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });

export function aiSettings(env = process.env) {
  const n = (v, d, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const requested = String(env.INSIDIR_AI_EXPLANATIONS || "").trim() === "1";
  const credentials = !!String(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || "").trim();
  const model = String(env.INSIDIR_AI_MODEL || "").trim().slice(0, 100);
  return Object.freeze({
    requested, enabled: requested && credentials && !!model, model,
    effort: ["low", "medium", "high"].includes(env.INSIDIR_AI_EFFORT) ? env.INSIDIR_AI_EFFORT : "medium",
    perUserDaily: Math.trunc(n(env.INSIDIR_AI_PER_USER_DAILY, 20, 0, 500)),
    // Output cap per request (thinking included). A response that reaches it is discarded for the rules version.
    maxTokens: Math.trunc(n(env.INSIDIR_AI_EVENT_MAX_TOKENS, 3000, 300, 8000)),
    // US dollars per million tokens for the budget and the cost ledger. Conservative defaults: set them to the
    // configured model's list prices.
    inputUsdPerMTok: n(env.INSIDIR_AI_INPUT_USD_PER_MTOK, 4, 0, 1000), outputUsdPerMTok: n(env.INSIDIR_AI_OUTPUT_USD_PER_MTOK, 20, 0, 1000),
    cacheDays: Math.trunc(n(env.INSIDIR_AI_CACHE_DAYS, 30, 1, 365))
  });
}

/* ---------- the evidence pack ---------- */
const iso = v => v == null ? null : v instanceof Date ? v.toISOString() : String(v);
const day = v => v == null ? null : v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : String(v).slice(0, 10);
const lineText = (l, owner) => `${owner ? owner + ": " : ""}transaction code ${l.code || "?"} (${l.acquiredDisposed === "A" ? "acquired" : l.acquiredDisposed === "D" ? "disposed" : "?"}), ${l.security || "security not named"}, trade date ${l.transactionDate || "not reported"}, shares ${l.shares ?? "not reported"}, price per share ${l.pricePerShare ?? "not reported"}, value as reported (shares x price) ${l.value ?? "not computed"}, ownership ${l.ownership === "D" ? "direct" : l.ownership === "I" ? "indirect" : "not stated"}.`;

export function evidenceFor(event) {
  const f = event.facts || {}, items = [];
  const add = (text, extra = {}) => items.push({ id: "E" + (items.length + 1), text, sourceUrl: extra.sourceUrl ?? event.source_urls?.[0] ?? null, accession: extra.accession ?? event.accessions?.[0] ?? null, retrievedAt: iso(event.ingested_at) });
  const company = `${event.issuer_name || "Issuer"}${event.ticker ? " (" + event.ticker + ")" : ""}, issuer CIK ${event.issuer_cik || "unknown"}`;
  if (event.event_type === "insider_purchase" || event.event_type === "insider_sale") {
    const owners = (f.owners || []).map(o => `${o.name}${o.cik ? " (CIK " + o.cik + ")" : ""}${o.roles?.length ? ", " + o.roles.join(", ") : ""}`).join("; ");
    add(`${f.amended ? "Amended Form 4" : "Form 4"} accession ${event.accessions?.[0]} for ${company}. Reporting owner(s): ${owners || event.owner_name || "not named"}. Published by the SEC ${iso(event.filing_date)}; retrieved by Insidir ${iso(event.ingested_at)}.`);
    for (const l of f.lines || []) add(lineText(l));
    add(`Totals across the ${f.lineCount} ${event.event_type === "insider_purchase" ? "open-market purchase (code P)" : "open-market sale (code S)"} line(s): shares ${f.totalShares ?? "not reported"}; value as reported ${f.totalValue ?? "not computed"}${f.valueComplete === false ? " (some lines have no price)" : ""}; prices per share from ${f.priceLow ?? "?"} to ${f.priceHigh ?? "?"}. Trade dates ${day(event.transaction_date)} to ${day(event.transaction_date_end)}; reported ${event.reporting_lag_days ?? "?"} calendar day(s) after the last trade date.`);
  } else if (event.event_type === "multi_insider_purchase") {
    add(`${f.distinctReportingOwners} distinct reporting owners filed open-market purchases (code P, non-derivative) of ${company} with trade dates from ${day(event.transaction_date)} to ${day(event.transaction_date_end)}. Method: ${f.method}`);
    for (const p of f.purchases || []) add(`Form 4 accession ${p.accession}: ${p.owner}, trade date ${p.transactionDate}, shares ${p.totalShares ?? "not reported"}, value as reported ${p.totalValue ?? "not computed"}, filed ${iso(p.filingDate)}.`, { accession: p.accession, sourceUrl: event.source_urls?.find(u => u.includes(p.accession)) ?? null });
    add(`Combined value as reported: ${f.totalValue ?? "not computed"}${f.valueComplete === false ? " (some purchases have no price)" : ""}.`);
  } else if (event.event_type === "form4_amendment") {
    add(`Form 4/A accession ${event.accessions?.[0]} for ${company}, filed ${iso(event.filing_date)}. ${f.originalInImport ? "Compared with the earlier filing accession " + f.amends + "." : "The filing it amends is not in Insidir's import."} Lines unchanged: ${f.unchanged}.`);
    for (const c of f.changed || []) add(`Changed line. Before: ${lineText(c.before)} After: ${lineText(c.after)}`);
    for (const l of f.added || []) add(`Line added by the amendment: ${lineText(l)}`);
    for (const l of f.removed || []) add(`Line in the earlier filing and not in the amendment: ${lineText(l)}`);
  } else if (event.event_type === "company_disclosure") {
    add(`${company} filed a ${f.form}${f.headline ? " (" + f.headline + ")" : ""} on ${f.filedAt}, accession ${event.accessions?.[0]}.${f.items?.length ? " 8-K items: " + f.items.map(i => i.code + " " + i.label).join("; ") + "." : ""} Insidir has the filing's index entry only, not its text.`);
  }
  if (event.status === "superseded") add(`This event was superseded by a later filing (${event.superseded_by}); the later filing's figures replace these.`);
  return items;
}

/* ---------- the rules writer: no model ---------- */
const FORM_CONTEXT = {
  insider_purchase: "A Form 4 is the public report an officer, director or owner of more than ten percent of a class of shares files after trading the company's securities. Code P marks an open-market or private purchase.",
  insider_sale: "A Form 4 is the public report an officer, director or owner of more than ten percent of a class of shares files after trading the company's securities. Code S marks an open-market or private sale; sales can be made under pre-arranged trading plans, which the form may or may not mention.",
  multi_insider_purchase: "This groups separate Form 4 purchase reports by different people at one company within a short window. Each person reported independently.",
  form4_amendment: "A Form 4/A corrects or completes an earlier Form 4. The amended figures are the ones on record.",
  company_disclosure: "This is an entry from the company's list of SEC filings. Its content is in the filing itself."
};
export function rulesExplanation(event, evidence) {
  const f = event.facts || {};
  const facts = [{ text: eventSummary(event), evidence_ids: evidence.map(e => e.id).slice(0, Math.max(1, evidence.length)) }];
  if (event.event_type === "insider_purchase" || event.event_type === "insider_sale") {
    if (event.reporting_lag_days != null) facts.push({ text: `The filing was published ${event.reporting_lag_days} calendar day(s) after the last trade date it reports.`, evidence_ids: [evidence.at(-1).id] });
    if (f.joint) facts.push({ text: `The filing lists ${f.owners.length} reporting owners together; the lines are reported once for all of them.`, evidence_ids: ["E1"] });
  }
  const limitations = [CAVEATS.notAdvice];
  if (event.event_type !== "company_disclosure") limitations.push(CAVEATS.form4);
  if (event.event_type === "multi_insider_purchase") limitations.push(CAVEATS.cluster, CAVEATS.coverage);
  if (f.valueComplete === false) limitations.push("Some lines report no price, so the value shown is incomplete.");
  if (event.event_type === "form4_amendment" && !f.originalInImport) limitations.push("The original filing is not in Insidir's import, so the changes cannot be shown.");
  if (event.status === "superseded") limitations.push("A later amendment changed this filing; see the newer event.");
  limitations.push("Prices and values are as reported by the filer and have not been checked against market data.");
  return { facts, interpretation: [{ text: FORM_CONTEXT[event.event_type] || "", evidence_ids: [] }].filter(i => i.text), limitations };
}

/* ---------- the model writer ---------- */
export const SCHEMA = {
  type: "object", additionalProperties: false, required: ["facts", "interpretation", "limitations"],
  properties: {
    facts: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "evidence_ids"], properties: { text: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } } } } },
    interpretation: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "evidence_ids"], properties: { text: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } } } } },
    limitations: { type: "array", items: { type: "string" } }
  }
};
export const SYSTEM_PROMPT = `You explain one public SEC record to a reader of a research product. You write only from the numbered evidence items you are given.

Write three parts:
- facts: what the evidence states, one short sentence each, citing the evidence ids each sentence relies on. Copy figures and dates exactly as they appear in the evidence; never round, convert or compute new figures.
- interpretation: general context that helps a reader understand the record (what the form or code means, what the record does not show). Keep it general and cite evidence ids where relevant. Never state or guess why anyone traded, what they know or expect, or what the price will do.
- limitations: what is missing, delayed, incomplete or uncertain in this evidence.

The reader may ask a question. Answer it only from the evidence; if the evidence does not answer it, say so in limitations. Never tell the reader to buy, sell, hold, short or allocate anything, never say what they should do, and never promise or predict returns. The product is research software, not an investment adviser.`;

export function anthropicWriter({ settings, client = null }) {
  const api = client || new Anthropic();
  return async ({ evidence, question }) => {
    const content = `Evidence items (JSON):\n${JSON.stringify(evidence.map(({ id, text, sourceUrl, accession, retrievedAt }) => ({ id, text, sourceUrl, accession, retrievedAt })))}\n\n` +
      (question ? `Reader's question: ${question}` : "Explain this record.");
    // Refusals on the primary model are retried server-side on the fallback chain ("default").
    const response = await api.beta.messages.create({
      model: settings.model, max_tokens: settings.maxTokens, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: SYSTEM_PROMPT, output_config: { effort: settings.effort, format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }]
    });
    const usage = { input: response.usage?.input_tokens || 0, output: response.usage?.output_tokens || 0 };
    if (response.stop_reason === "refusal") return { refused: true, usage, model: response.model };
    if (response.stop_reason === "max_tokens") return { error: "max_tokens", usage, model: response.model };
    const text = (response.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    let json = null;
    try { json = JSON.parse(text); } catch { return { error: "invalid_json", usage, model: response.model }; }
    return { json, usage, model: response.model };
  };
}

const costMicros = (usage, s) => Math.round((usage.input * s.inputUsdPerMTok + usage.output * s.outputUsdPerMTok));
async function logUsage(query, row) {
  await query("INSERT INTO ai_usage_log(user_id,event_id,model,input_tokens,output_tokens,cost_micros,outcome,reasons) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [row.userId ?? null, row.eventId ?? null, row.model, row.input || 0, row.output || 0, row.cost || 0, row.outcome, JSON.stringify(row.reasons || [])]).catch(e => console.error("ai_usage_log write failed", e?.message));
}
/* The shared budgets first (src/ai-gateway.mjs, both ledgers), with the most this call could cost reserved; then
   this service's own per-member daily allowance. Returns the name of the limit reached, or null. */
async function allowance(query, userId, s, env, reserveUsd) {
  try { await checkBudget(userId, { run: query, env, reserveUsd }); }
  catch (e) { if (e?.status === 429) return e.budget; throw e; }
  const r = (await query(`SELECT COUNT(*)::integer AS mine FROM ai_usage_log WHERE created_at>=date_trunc('day',now()) AND user_id=$1 AND outcome<>'question_refused'`, [userId])).rows[0];
  if (userId && r.mine >= s.perUserDaily) return "member_allowance";
  return null;
}
// The same question asked twice, in different case or spacing, is one cached answer.
export const normalizeQuestion = q => q ? String(q).toLowerCase().replace(/[\s?.!]+/g, " ").trim() : "";

function sourcesOf(event, evidence) {
  const seen = new Map();
  for (const e of evidence) if (e.sourceUrl && !seen.has(e.sourceUrl)) seen.set(e.sourceUrl, { url: e.sourceUrl, accession: e.accession, retrievedAt: e.retrievedAt });
  for (const u of event.source_urls || []) if (!seen.has(u)) seen.set(u, { url: u, accession: null, retrievedAt: iso(event.ingested_at) });
  return [...seen.values()];
}

/* The explanation of one event. writer is injectable (tests); question is optional. */
export async function explainEvent({ query, eventId, user = null, question = null, env = process.env, writer = null }) {
  const q = question == null ? null : String(question).trim().slice(0, 500);
  if (q) {
    const screen = screenQuestion(q);
    if (!screen.allowed) {
      await logUsage(query, { userId: user?.id, eventId, model: "none", outcome: "question_refused", reasons: [screen.reason] });
      return { refused: true, reason: screen.reason, reply: screen.reply };
    }
  }
  const event = (await query(`SELECT id,event_type,status,superseded_by,issuer_cik,ticker,issuer_name,owner_cik,owner_name,transaction_date,transaction_date_end,filing_date,ingested_at,
    detected_at,reporting_lag_days,accessions,source_urls,facts FROM sec_events WHERE id=$1`, [eventId])).rows[0];
  if (!event) throw fail(404, "Research event not found");
  const evidence = evidenceFor(event);
  const retrievedAt = iso(event.ingested_at) || iso(event.detected_at);
  const base = { eventId: Number(event.id), eventType: event.event_type, status: event.status, retrievedAt, filingDate: iso(event.filing_date),
    evidence, sources: sourcesOf(event, evidence), disclaimer: "Research from public records. Not investment advice; no recommendation to buy, sell or hold." };
  const rules = { ...base, writer: "rules", ...rulesExplanation(event, evidence), question: q, answeredQuestion: false };
  const rulesCheck = validateExplanation(rules, evidence, { retrievedAt });
  if (!rulesCheck.allowed) console.error(JSON.stringify({ event: "explanation.rules_failed_validation", eventId, problems: rulesCheck.problems }));
  const s = aiSettings(env);
  if (!s.enabled && !writer) return { ...rules, ai: s.requested ? "unavailable" : "off" };

  const key = sha([event.id, sha(JSON.stringify(evidence)), s.model, PROMPT_VERSION, normalizeQuestion(q)].join("|"));
  const cached = (await query("SELECT explanation FROM explanation_cache WHERE cache_key=$1 AND expires_at>now()", [key])).rows[0];
  if (cached) return { ...cached.explanation, cached: true };
  const reserve = (JSON.stringify(evidence).length / 3 * s.inputUsdPerMTok + s.maxTokens * s.outputUsdPerMTok) / 1e6;
  const blocked = await allowance(query, user?.id ?? null, s, env, reserve);
  if (blocked) return { ...rules, ai: blocked };
  let result;
  try { result = await withReservation(user?.id ?? null, reserve, () => (writer || anthropicWriter({ settings: s }))({ evidence, question: q })); }
  catch (e) {
    await logUsage(query, { userId: user?.id, eventId, model: s.model, outcome: "error", reasons: [String(e?.status || e?.name || "error")] });
    return { ...rules, ai: "error" };
  }
  const cost = costMicros(result.usage || { input: 0, output: 0 }, s);
  const usage = { userId: user?.id, eventId, model: result.model || s.model, input: result.usage?.input, output: result.usage?.output, cost };
  if (result.refused || result.error) {
    await logUsage(query, { ...usage, outcome: result.refused ? "refused" : "error", reasons: [result.error || "refusal"] });
    return { ...rules, ai: result.refused ? "refused" : "error" };
  }
  const check = validateExplanation(result.json, evidence, { retrievedAt });
  if (!check.allowed) {
    await logUsage(query, { ...usage, outcome: "rejected", reasons: check.problems });
    return { ...rules, ai: "rejected" };
  }
  const explanation = { ...base, writer: "model", model: result.model || s.model, promptVersion: PROMPT_VERSION, question: q, answeredQuestion: !!q,
    facts: result.json.facts, interpretation: result.json.interpretation, limitations: [...result.json.limitations, CAVEATS.notAdvice],
    label: "Written by an AI model from the numbered sources below, then checked automatically: every statement cites its source and every figure was matched to it. Read the original filing before relying on it.", ai: "accepted" };
  await logUsage(query, { ...usage, outcome: "accepted" });
  await query(`INSERT INTO explanation_cache(cache_key,event_id,model,prompt_version,explanation,expires_at) VALUES($1,$2,$3,$4,$5,now()+($6::integer*interval '1 day'))
    ON CONFLICT (cache_key) DO NOTHING`, [key, event.id, explanation.model, PROMPT_VERSION, JSON.stringify(explanation), s.cacheDays]);
  return explanation;
}
