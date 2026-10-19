/* Regulated capabilities: the one server-side switchboard for anything that could be investment advice
 * or securities trading. Insidir runs in RESEARCH_ONLY mode: public-record research, watchlists, factual
 * alerts and a private journal. Personalized recommendations (ADVISORY) and order placement (TRADING)
 * are blocked here, before any handler runs, whatever the client sends and whatever a feature flag says.
 *
 * Two independent locks must both open before a regulated mode can ever be active:
 *   1. BUILD_AUTHORIZED_MODES, a constant in this file. Changing it is a reviewed code change.
 *   2. A signed-off authorization record in docs/authorizations/<mode>.json naming the registration or
 *      registered-adviser / broker-dealer arrangement, the attorney review, the responsible supervisory
 *      and compliance people and the effective date (see REQUIRED_RECORD_FIELDS). Missing or incomplete
 *      records keep the mode off.
 * An environment variable (INSIDIR_OPERATING_MODE) can only ask for a mode; it never grants one. A
 * feature flag is not a registration, and nothing here treats it as one.
 *
 * Emergency stops (INSIDIR_TRADING_HALT=1, INSIDIR_BROKERAGE_HALT=1) only ever close things: they block
 * trading even in an authorized build, and block brokerage connections and reads (a member can always
 * disconnect). See docs/COMPLIANCE.md. */
import { readFileSync } from "node:fs";

export const MODES = Object.freeze({ RESEARCH_ONLY: "RESEARCH_ONLY", ADVISORY_ENABLED: "ADVISORY_ENABLED", TRADING_ENABLED: "TRADING_ENABLED" });

// The modes this build may run. Only a reviewed code change, made after the records below exist, adds to it.
export const BUILD_AUTHORIZED_MODES = Object.freeze([MODES.RESEARCH_ONLY]);

export const REQUIRED_RECORD_FIELDS = Object.freeze({
  [MODES.ADVISORY_ENABLED]: ["mode", "legalEntity", "registrationType", "registrationNumber", "attorneyName", "attorneyReviewDate",
    "chiefComplianceOfficer", "supervisoryPrincipal", "advisoryAgreementVersion", "formAdvOrDisclosureUrl", "modelValidationReportUrl", "effectiveDate"],
  [MODES.TRADING_ENABLED]: ["mode", "legalEntity", "brokerPartner", "brokerPartnerAgreementDate", "brokerDealerCrd", "attorneyName", "attorneyReviewDate",
    "chiefComplianceOfficer", "supervisoryPrincipal", "customerAuthorizationVersion", "riskControlsReviewUrl", "effectiveDate"]
});
const RECORD_FILES = Object.freeze({ [MODES.ADVISORY_ENABLED]: "advisory.json", [MODES.TRADING_ENABLED]: "trading.json" });

/* The authorization record for a regulated mode, or null. A record counts only when every required field
 * is a non-empty string, its mode matches, and its effective date has arrived. read(file) is injectable. */
export function authorizationRecord(mode, { read = file => readFileSync(new URL("../docs/authorizations/" + file, import.meta.url), "utf8"), now = Date.now() } = {}) {
  const file = RECORD_FILES[mode];
  if (!file) return null;
  let record;
  try { record = JSON.parse(read(file)); } catch { return null; }
  if (!record || typeof record !== "object" || record.mode !== mode) return null;
  for (const field of REQUIRED_RECORD_FIELDS[mode]) if (typeof record[field] !== "string" || !record[field].trim()) return null;
  const effective = Date.parse(record.effectiveDate);
  if (!Number.isFinite(effective) || effective > now) return null;
  return record;
}

const flag = (env, name) => String(env?.[name] ?? "").trim() === "1";
export const tradingHalted = (env = process.env) => flag(env, "INSIDIR_TRADING_HALT");
export const brokerageHalted = (env = process.env) => flag(env, "INSIDIR_BROKERAGE_HALT");

/* Whether a regulated mode is active: built in AND on record AND requested. */
export function modeActive(mode, { env = process.env, records = {} } = {}) {
  if (mode === MODES.RESEARCH_ONLY) return true;
  if (!BUILD_AUTHORIZED_MODES.includes(mode)) return false;
  const requested = String(env.INSIDIR_OPERATING_MODE || "").split(",").map(s => s.trim());
  if (!requested.includes(mode)) return false;
  const record = mode in records ? records[mode] : authorizationRecord(mode);
  return !!record;
}

export function operatingMode(deps = {}) {
  return modeActive(MODES.TRADING_ENABLED, deps) ? MODES.TRADING_ENABLED
    : modeActive(MODES.ADVISORY_ENABLED, deps) ? MODES.ADVISORY_ENABLED : MODES.RESEARCH_ONLY;
}

/* Paths that would be regulated functionality. They are refused in RESEARCH_ONLY whether or not any
 * handler exists, so adding one later cannot switch it on by accident. Matching is case-insensitive and
 * ignores trailing slashes and encoded separators, which only ever widens what is blocked. */
const ADVICE_PATHS = [/^\/v1\/(advice|advisory|recommendations?|suggestions?|signals?|portfolio-advice|allocations?)(\/|$)/,
  /^\/v1\/ai\/(advice|recommend|allocate|picks?)(\/|$)/, /^\/v1\/me\/(advice|recommendations?|allocations?|rebalance)(\/|$)/];
const TRADING_PATHS = [/^\/v1\/(orders?|trades?|trading|execution|executions|positions\/[^/]+\/(close|sell|buy))(\/|$)/,
  /^\/v1\/me\/(orders?|trades?|trading|auto-?trad(e|ing)|brokerage\/(orders?|trades?|trade|execute|positions\/[^/]+\/(close|sell|buy)))(\/|$)/];
const BROKERAGE_PATHS = /^\/v1\/me\/brokerage(\/|$)/;

function normalized(pathname) {
  let p = String(pathname || "").split(/[?#]/)[0];
  try { p = decodeURIComponent(p); } catch { /* keep raw */ }
  return p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
}

/* 'advice' | 'trading' | 'brokerage' | null: the regulated capability a request would use. */
export function regulatedCapability(pathname) {
  const p = normalized(pathname);
  if (ADVICE_PATHS.some(r => r.test(p))) return "advice";
  if (TRADING_PATHS.some(r => r.test(p))) return "trading";
  if (BROKERAGE_PATHS.test(p)) return "brokerage";
  return null;
}

export const REFUSALS = Object.freeze({
  advice: "Insidir is research software operating in research-only mode. It does not provide personalized buy, sell, hold or allocation recommendations.",
  trading: "Insidir does not place, route or execute securities orders. Trading is not available.",
  halted: "Brokerage connections are temporarily suspended."
});

/* The decision for one request: { allow: true } or { allow: false, status, body }. */
export function capabilityDecision({ pathname, method = "GET", env = process.env, records } = {}) {
  const capability = regulatedCapability(pathname);
  if (!capability) return { allow: true };
  const mode = operatingMode({ env, records });
  if (capability === "advice") {
    if (mode === MODES.ADVISORY_ENABLED || mode === MODES.TRADING_ENABLED) return { allow: true, capability };
    return { allow: false, status: 403, body: { error: REFUSALS.advice, capability, mode } };
  }
  if (capability === "trading") {
    if (mode === MODES.TRADING_ENABLED && !tradingHalted(env)) return { allow: true, capability };
    return { allow: false, status: 403, body: { error: REFUSALS.trading, capability, mode, halted: tradingHalted(env) } };
  }
  // Read-only brokerage connections (src/brokerage.mjs, scope "read") are research data, not trading. The emergency
  // stop blocks them, except disconnecting, which must always work.
  if (brokerageHalted(env) && !(String(method).toUpperCase() === "DELETE" && normalized(pathname) === "/v1/me/brokerage"))
    return { allow: false, status: 503, body: { error: REFUSALS.halted, capability, mode } };
  return { allow: true, capability };
}

/* GET /v1/capabilities: what this deployment does and does not do, for the UI and for audits. */
export function capabilitySummary({ env = process.env, records } = {}) {
  const mode = operatingMode({ env, records });
  const requested = String(env.INSIDIR_OPERATING_MODE || "").trim() || null;
  return {
    mode,
    requestedMode: requested,
    research: true,
    personalizedAdvice: mode !== MODES.RESEARCH_ONLY ? "enabled" : "disabled_pending_legal_authorization",
    trading: mode === MODES.TRADING_ENABLED && !tradingHalted(env) ? "enabled" : "disabled_pending_legal_authorization",
    tradingHalted: tradingHalted(env),
    brokerageAccess: brokerageHalted(env) ? "halted" : "read_only",
    // Source-backed explanations of public filings only (src/explanations.mjs); off unless switched on with credentials.
    aiGeneratedContent: String(env.INSIDIR_AI_EXPLANATIONS || "").trim() === "1" && !!String(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || "").trim() ? "source_backed_explanations_only" : "none",
    politicalDisclosures: "disabled_pending_legal_and_licensing_review",
    statement: "Research software. Not a broker-dealer or registered investment adviser; no personalized investment advice; no order execution."
  };
}

/* Startup warnings: a request for a mode this build cannot run is logged, never honoured. */
export function capabilityNotices(env = process.env, deps = {}) {
  const notices = [];
  for (const mode of String(env.INSIDIR_OPERATING_MODE || "").split(",").map(s => s.trim()).filter(Boolean)) {
    if (!Object.values(MODES).includes(mode)) notices.push(`INSIDIR_OPERATING_MODE=${mode} is not a known mode; running RESEARCH_ONLY.`);
    else if (mode !== MODES.RESEARCH_ONLY && !modeActive(mode, { env, ...deps }))
      notices.push(`${mode} was requested but is not authorized for this build (see docs/COMPLIANCE.md); running RESEARCH_ONLY.`);
  }
  if (tradingHalted(env)) notices.push("INSIDIR_TRADING_HALT=1: trading is halted.");
  if (brokerageHalted(env)) notices.push("INSIDIR_BROKERAGE_HALT=1: brokerage connections and reads are suspended.");
  return notices;
}
