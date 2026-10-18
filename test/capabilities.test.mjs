import test from "node:test";
import assert from "node:assert/strict";
import {
  MODES, BUILD_AUTHORIZED_MODES, REQUIRED_RECORD_FIELDS, authorizationRecord, modeActive, operatingMode,
  regulatedCapability, capabilityDecision, capabilitySummary, capabilityNotices, tradingHalted
} from "../src/capabilities.mjs";
import { createApiServer } from "../src/api.mjs";

/* Regulated capabilities (src/capabilities.mjs): research only by default; personalized advice and order
 * placement refused server-side whatever the client or a feature flag asks; emergency stops only close. */
const fullRecord = mode => Object.fromEntries(REQUIRED_RECORD_FIELDS[mode].map(f => [f, f === "mode" ? mode : f === "effectiveDate" ? "2026-01-01" : "x"]));

test("this build runs RESEARCH_ONLY; an environment flag alone never opens a regulated mode", () => {
  assert.deepEqual(BUILD_AUTHORIZED_MODES, [MODES.RESEARCH_ONLY], "no regulated mode is built in");
  for (const requested of ["ADVISORY_ENABLED", "TRADING_ENABLED", "ADVISORY_ENABLED,TRADING_ENABLED", "1", "true"]) {
    const env = { INSIDIR_OPERATING_MODE: requested };
    assert.equal(operatingMode({ env }), MODES.RESEARCH_ONLY, requested);
    // Even a complete authorization record does not override the build constant.
    const records = { [MODES.ADVISORY_ENABLED]: fullRecord(MODES.ADVISORY_ENABLED), [MODES.TRADING_ENABLED]: fullRecord(MODES.TRADING_ENABLED) };
    assert.equal(operatingMode({ env, records }), MODES.RESEARCH_ONLY, requested + " with records");
  }
  assert.equal(modeActive(MODES.RESEARCH_ONLY), true);
});

test("authorization records count only when complete, matching and in effect", () => {
  const mode = MODES.ADVISORY_ENABLED;
  const read = record => () => JSON.stringify(record);
  assert.equal(authorizationRecord(mode, { read: () => { throw new Error("ENOENT"); } }), null, "no file");
  assert.equal(authorizationRecord(mode, { read: () => "{not json" }), null);
  assert.ok(authorizationRecord(mode, { read: read(fullRecord(mode)), now: Date.parse("2026-06-01") }));
  for (const field of REQUIRED_RECORD_FIELDS[mode]) {
    const missing = { ...fullRecord(mode), [field]: "" };
    assert.equal(authorizationRecord(mode, { read: read(missing), now: Date.parse("2026-06-01") }), null, field);
  }
  assert.equal(authorizationRecord(mode, { read: read({ ...fullRecord(mode), mode: MODES.TRADING_ENABLED }), now: Date.parse("2026-06-01") }), null, "wrong mode");
  assert.equal(authorizationRecord(mode, { read: read({ ...fullRecord(mode), effectiveDate: "2027-01-01" }), now: Date.parse("2026-06-01") }), null, "not yet effective");
  // The repository ships no authorization records.
  assert.equal(authorizationRecord(MODES.ADVISORY_ENABLED), null);
  assert.equal(authorizationRecord(MODES.TRADING_ENABLED), null);
});

test("advice and trading paths are recognized however they are written", () => {
  for (const p of ["/v1/recommendations", "/v1/recommendation/AAPL", "/v1/advice", "/v1/ai/advice", "/v1/ai/recommend?t=1", "/V1/Recommendations/", "/v1/me/allocations", "/v1/me/rebalance", "/v1/signals", "/v1/%72ecommendations"])
    assert.equal(regulatedCapability(p), "advice", p);
  for (const p of ["/v1/orders", "/v1/order", "/v1/trades", "/v1/trading/session", "/v1/me/orders", "/v1/me/brokerage/orders", "/v1/me/brokerage/trade", "/v1/me/brokerage/execute",
    "/v1/positions/AAPL/sell", "/v1/me/auto-trade", "/v1/me/autotrading", "//v1//orders", "/v1\\orders"])
    assert.equal(regulatedCapability(p), "trading", p);
  for (const p of ["/v1/me/brokerage", "/v1/me/brokerage/status", "/v1/me/brokerage/portfolio"]) assert.equal(regulatedCapability(p), "brokerage", p);
  for (const p of ["/v1/transactions", "/v1/filings", "/v1/me/watchlist", "/v1/me/research-decisions", "/v1/me/manual-holdings", "/v1/people/1214156", "/v1/clusters", "/insider-trading"])
    assert.equal(regulatedCapability(p), null, p);
});

test("refusals: advice 403, trading 403 even when requested, the trading halt holds, brokerage halt keeps disconnect open", () => {
  const env = { INSIDIR_OPERATING_MODE: "TRADING_ENABLED" };
  assert.deepEqual(capabilityDecision({ pathname: "/v1/recommendations", env }).status, 403);
  const trade = capabilityDecision({ pathname: "/v1/me/brokerage/orders", method: "POST", env });
  assert.equal(trade.status, 403);
  assert.match(trade.body.error, /does not place, route or execute/);
  assert.equal(trade.body.mode, MODES.RESEARCH_ONLY);
  assert.equal(capabilityDecision({ pathname: "/v1/orders", env: { INSIDIR_TRADING_HALT: "1" } }).body.halted, true);
  assert.equal(tradingHalted({ INSIDIR_TRADING_HALT: "1" }), true);
  const halt = { INSIDIR_BROKERAGE_HALT: "1" };
  assert.equal(capabilityDecision({ pathname: "/v1/me/brokerage/portfolio", env: halt }).status, 503);
  assert.equal(capabilityDecision({ pathname: "/v1/me/brokerage/connect", method: "POST", env: halt }).status, 503);
  assert.equal(capabilityDecision({ pathname: "/v1/me/brokerage", method: "DELETE", env: halt }).allow, true, "disconnecting always works");
  assert.equal(capabilityDecision({ pathname: "/v1/me/brokerage/portfolio", env: {} }).allow, true, "read-only access when not halted");
});

test("the summary states what the deployment does, and requested-but-unauthorized modes are logged", () => {
  const s = capabilitySummary({ env: { INSIDIR_OPERATING_MODE: "ADVISORY_ENABLED" } });
  assert.equal(s.mode, MODES.RESEARCH_ONLY);
  assert.equal(s.requestedMode, "ADVISORY_ENABLED");
  assert.equal(s.personalizedAdvice, "disabled_pending_legal_authorization");
  assert.equal(s.trading, "disabled_pending_legal_authorization");
  assert.equal(s.aiGeneratedContent, "none");
  assert.match(s.statement, /Not a broker-dealer or registered investment adviser/);
  assert.match(capabilityNotices({ INSIDIR_OPERATING_MODE: "ADVISORY_ENABLED" }).join(" "), /not authorized for this build/);
  assert.match(capabilityNotices({ INSIDIR_OPERATING_MODE: "YOLO" }).join(" "), /not a known mode/);
});

async function withApi(env, fn, user = { id: "11111111-1111-4111-8111-111111111111", email: "paid@example.com", subscription_status: "active" }) {
  const server = createApiServer({ quiet: true, env: { INSIDIR_PAYWALL: "1", ...env }, currentUser: async () => user, query: async () => ({ rows: [] }) });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try { await fn("http://127.0.0.1:" + server.address().port); } finally { server.close(); }
}

test("over HTTP: regulated routes are refused before the paywall and any handler, for paying members too", async () => {
  await withApi({ INSIDIR_OPERATING_MODE: "ADVISORY_ENABLED,TRADING_ENABLED" }, async base => {
    for (const [method, path] of [["GET", "/v1/recommendations?ticker=AAPL"], ["POST", "/v1/ai/advice"], ["POST", "/v1/me/brokerage/orders"], ["POST", "/v1/orders"], ["DELETE", "/v1/orders/1"]]) {
      const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: base }, body: method === "POST" ? "{}" : undefined });
      assert.equal(r.status, 403, method + " " + path);
      const body = await r.json();
      assert.equal(body.mode, "RESEARCH_ONLY");
    }
    const caps = await fetch(base + "/v1/capabilities");
    assert.equal(caps.status, 200);
    assert.equal((await caps.json()).mode, "RESEARCH_ONLY");
  });
  // Signed out: the capabilities summary is public; refusals do not depend on a session.
  await withApi({}, async base => {
    assert.equal((await fetch(base + "/v1/capabilities")).status, 200);
    assert.equal((await fetch(base + "/v1/orders", { method: "POST", headers: { Origin: base } })).status, 403);
  }, null);
  await withApi({ INSIDIR_BROKERAGE_HALT: "1" }, async base => {
    assert.equal((await fetch(base + "/v1/me/brokerage/status")).status, 503);
  });
});
