/* Insidir Intelligence on PostgreSQL: cross-user isolation, briefing selection, citations, shared AI cache
 * under concurrency, digests and notification eligibility, 13F storage and dedup, paywall and auth on the
 * real routes. Runs only when INSIDIR_TEST_DATABASE_URL points at a database it may create a schema in;
 * everything happens inside a throwaway schema that is dropped at the end. No network: SEC and the AI
 * provider are replaced by in-process fakes. */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { FIXTURE_13F } from "./fixtures/form13f.mjs";

const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "intel_test_" + process.pid;
const skip = !PG_URL && "set INSIDIR_TEST_DATABASE_URL";
if (PG_URL) {
  process.env.DATABASE_URL = PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA);
  process.env.ALLOWED_ORIGINS = "https://insidir.test";
  process.env.COOKIE_SECURE = "0";
  process.env.SEC_USER_AGENT = "Insidir Test test@example.com";
}

let db, api, admin, server, base, users = {};
const sha = s => createHash("sha256").update(s).digest("hex");
const hoursAgo = h => new Date(Date.now() - h * 3600_000).toISOString();

async function seed(q) {
  for (const [name, status] of [["a", "active"], ["b", "trialing"], ["c", null]]) {
    const token = randomBytes(32).toString("hex");
    const id = (await q("INSERT INTO users(email,password_hash,subscription_status,current_period_end) VALUES($1,'x',$2,now()+interval '20 days') RETURNING id", [name + "@insidir.test", status])).rows[0].id;
    await q("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [sha(token), id]);
    users[name] = { id, cookie: "insidir_sid=" + token };
  }
  const filing = (acc, ticker, issuer, cik, published, amend = false) => q(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,published_at,is_amendment,source_url,ingest_status,retrieved_at)
    VALUES($1,$2,$2,$3,$4,'Form 4',$5,$6,$7,$8,'parsed',$6)`, [acc, cik, issuer, ticker, amend ? "4/A" : "4", published, amend, "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + acc + "/form4.xml"]);
  const line = (acc, i, ticker, cik, ownerCik, owner, date, code, cat, shares, price) => q(`INSERT INTO sec_transactions(id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,source_url,security_title)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,$12,$13,$14,'Common Stock')`, [acc + ":N:" + i, acc, cik, ticker, ownerCik, owner, date, code, cat === "reported_purchase" ? "A" : "D", cat, shares, price, price == null ? null : shares * price, "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + acc + "/form4.xml"]);
  const owner = (acc, cik, name, title) => q("INSERT INTO sec_filing_owners(accession,owner_cik,owner_name,is_officer,officer_title) VALUES($1,$2,$3,$4,$5)", [acc, cik, name, !!title, title]);
  await filing("000104581026000001", "NVDA", "NVIDIA CORP", "1045810", hoursAgo(5));
  await line("000104581026000001", 0, "NVDA", "1045810", "0001197649", "HUANG JEN HSUN", "2026-10-15", "S", "reported_sale", 1000, 180.5);
  await line("000104581026000001", 1, "NVDA", "1045810", "0001197649", "HUANG JEN HSUN", "2026-10-15", "F", "other", 50, null);
  await owner("000104581026000001", "0001197649", "HUANG JEN HSUN", "President and CEO");
  await filing("000104581026000002", "NVDA", "NVIDIA CORP", "1045810", hoursAgo(6));
  await line("000104581026000002", 0, "NVDA", "1045810", "0001234567", "KRESS COLETTE", "2026-10-16", "S", "reported_sale", 200, 181);
  await owner("000104581026000002", "0001234567", "KRESS COLETTE", "EVP and CFO");
  await filing("000078901926000003", "MSFT", "MICROSOFT CORP", "789019", hoursAgo(30));
  await line("000078901926000003", 0, "MSFT", "789019", "0001513142", "NADELLA SATYA", "2026-10-14", "P", "reported_purchase", 10, 400);
  await owner("000078901926000003", "0001513142", "NADELLA SATYA", "CEO");
  await filing("000032019326000004", "AAPL", "Apple Inc.", "320193", hoursAgo(10));
  await line("000032019326000004", 0, "AAPL", "320193", "0001214156", "COOK TIMOTHY D", "2026-10-15", "S", "reported_sale", 300, 250);
  await owner("000032019326000004", "0001214156", "COOK TIMOTHY D", "CEO");
  await filing("000131860526000005", "TSLA", "Tesla, Inc.", "1318605", hoursAgo(12));
  await line("000131860526000005", 0, "TSLA", "1318605", "0001494730", "MUSK ELON", "2026-10-15", "S", "reported_sale", 5, 400);
  await q("INSERT INTO watchlist(user_id,ticker) VALUES($1,'NVDA'),($1,'MSFT'),($2,'AAPL'),($2,'TSLA')", [users.a.id, users.b.id]);
  await q("INSERT INTO followed_people(user_id,owner_cik) VALUES($1,'0001214156')", [users.a.id]);
  await q(`INSERT INTO research_events(event_key,source_type,title,source_url,subject,published_at,observed_at,verified,metadata)
    VALUES('notice:000104581026000099','sec_notice','NVDA filed 8-K with the SEC','https://www.sec.gov/Archives/edgar/data/1045810/000104581026000099/a.htm','NVDA',now()-interval '20 hours',now()-interval '19 hours',true,
    '{"form":"8-K","items":["2.02","9.01"],"reportDate":"2026-10-17","accession":"000104581026000099","ticker":"NVDA"}')`);
}

test("Intelligence on PostgreSQL", { skip }, async t => {
  const admin0 = new pg.Client({ connectionString: PG_URL });
  await admin0.connect();
  await admin0.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  admin = admin0;
  try {
  db = await import("../src/db.mjs");
  await db.migrate();
  await db.migrate();
  const q = (sql, params) => db.query(sql, params);
  await seed(q);
  const { createApiServer } = await import("../src/api.mjs");
  // Admin access is the token AND a one-time code (src/admin-auth.mjs); an admin e-mail address alone is not enough.
  const { generateTotpSecret, totpCode, base32Decode, stepAt } = await import("../src/totp.mjs");
  const ADMIN_TOKEN = "intelligence-admin-token-".padEnd(40, "x"), TOTP = generateTotpSecret();
  const env = { ...process.env, INSIDIR_PAYWALL: "1", INSIDIR_ADMIN_TOKEN: ADMIN_TOKEN, INSIDIR_ADMIN_TOTP_SECRET: TOTP, INSIDIR_OPENROUTER_API_KEY: "" };
  server = createApiServer({ quiet: true, env });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
  const get = (path, who) => fetch(base + path, { headers: who ? { cookie: users[who].cookie } : {} });
  const post = (path, who, payload, origin = "https://insidir.test") => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...(who ? { cookie: users[who].cookie } : {}) }, body: JSON.stringify(payload) });
  const { resetDirectoryCache } = await import("../src/intelligence-investigate.mjs");
  resetDirectoryCache();

    await t.test("authentication and subscription are enforced on every Intelligence route", async () => {
      for (const path of ["/v1/me/intelligence/briefing", "/v1/intelligence/mirror/managers", "/v1/intelligence/mirror/simulate?cik=1&budget=5", "/v1/me/intelligence/preferences"]) {
        assert.equal((await get(path)).status, 401, path + " signed out");
        assert.equal((await get(path, "c")).status, 402, path + " without a subscription");
      }
      assert.equal((await post("/v1/me/intelligence/investigate", null, { question: "NVDA" })).status, 401);
      assert.equal((await post("/v1/me/intelligence/investigate", "c", { question: "NVDA" })).status, 402);
      assert.equal((await post("/v1/me/intelligence/investigate", "a", { question: "NVDA" }, null)).status, 403, "cross-site POST without Origin");
      assert.equal((await post("/v1/me/intelligence/investigate", "a", { question: "NVDA" }, "https://evil.example")).status, 403);
      assert.equal((await get("/v1/me/intelligence/briefing", "b")).status, 200, "trialing counts as access");
      const page = await fetch(base + "/intelligence.html", { redirect: "manual", headers: { cookie: users.c.cookie } });
      assert.equal(page.status, 302); assert.match(page.headers.get("location"), /subscribe/);
    });

    await t.test("briefing selects by watchlist and follows, groups filings, and never shows another member's data", async () => {
      const a = await (await get("/v1/me/intelligence/briefing", "a")).json();
      const tick = a.stories.map(s => s.ticker);
      assert.ok(tick.includes("NVDA") && tick.includes("MSFT") && tick.includes("AAPL"), JSON.stringify(tick));
      assert.ok(!tick.includes("TSLA"), "TSLA is only on member B's watchlist");
      const nv = a.stories.find(s => s.kind === "insider_filings" && s.ticker === "NVDA");
      assert.equal(nv.filingsCount, 2, "same-day filings at one company are one story");
      assert.equal(nv.stats.sales, 2); assert.equal(nv.stats.saleValue, 180500 + 36200);
      assert.ok(nv.people.some(p => p.role === "President and CEO"));
      const aapl = a.stories.find(s => s.ticker === "AAPL");
      assert.ok(aapl.why.some(w => w.kind === "followed_person"), "AAPL appears because A follows Tim Cook");
      assert.ok(a.stories.some(s => s.kind === "company_report" && /Results of operations/.test(s.facts[0])));
      for (const s of a.stories) for (const src of s.sources) assert.match(src.url, /^https:\/\/www\.sec\.gov\//);
      assert.equal(a.preferences.frequency, "immediate");
      const b = await (await get("/v1/me/intelligence/briefing", "b")).json();
      assert.deepEqual([...new Set(b.stories.map(s => s.ticker))].sort(), ["AAPL", "TSLA"]);
      assert.ok(!JSON.stringify(b).includes("NVIDIA") && !JSON.stringify(b).includes("Nadella"), "nothing of A's leaks to B");
      const pref = await (await post("/v1/me/intelligence/preferences", "b", { frequency: "daily" })).json();
      assert.equal(pref.frequency, "daily");
      assert.equal((await post("/v1/me/intelligence/preferences", "b", { frequency: "hourly" })).status, 400);
      assert.equal((await (await get("/v1/me/intelligence/preferences", "a")).json()).frequency, "immediate", "B's choice does not touch A");
    });

    await t.test("investigations retrieve the right records and every citation points at the record it supports", async () => {
      const r = await (await post("/v1/me/intelligence/investigate", "a", { question: "Show me recent insider sales at Nvidia" })).json();
      assert.equal(r.status, "answered"); assert.deepEqual(r.plan.tickers, ["NVDA"]); assert.deepEqual(r.plan.categories, ["reported_sale"]);
      const ids = new Set(r.citations.map(c => c.id));
      const section = r.sections.find(s => s.ticker === "NVDA");
      for (const f of [...r.summary, ...section.facts]) for (const c of f.cites || []) assert.ok(ids.has(c), "cited id exists: " + c);
      for (const rec of section.records) {
        const c = r.citations.find(x => x.id === rec.citation);
        assert.ok(c.url.includes(c.accession), "citation URL is the filing's own document");
        const row = (await q("SELECT source_url FROM sec_transactions t WHERE t.accession=$1 LIMIT 1", [c.accession])).rows[0];
        assert.equal(c.url, row.source_url);
      }
      assert.match(section.facts.map(f => f.text).join(" "), /\$216,700/, "sale value is the sum of the stored values");
      assert.ok(section.records.every(x => x.category === "reported_sale"), "only sales when sales were asked for");
      assert.ok(r.gaps.length >= 1);
      const people = await (await post("/v1/me/intelligence/investigate", "a", { question: "What companies have the executives I follow disclosed transactions in?" })).json();
      assert.equal(people.plan.scope, "followed_people"); assert.deepEqual(people.sections.map(s => s.ticker), ["AAPL"]);
      const none = await (await post("/v1/me/intelligence/investigate", "b", { question: "What companies have the executives I follow disclosed transactions in?" })).json();
      assert.equal(none.status, "no_data", "B follows nobody: says so instead of borrowing A's follows");
      const cmp = await (await post("/v1/me/intelligence/investigate", "a", { question: "Compare Nvidia with Microsoft this month" })).json();
      assert.equal(cmp.sections[0].kind, "comparison"); assert.deepEqual(cmp.sections[0].rows.map(x => x.ticker), ["NVDA", "MSFT"]);
      const unknown = await (await post("/v1/me/intelligence/investigate", "a", { question: "insider sales at Foobar Dynamics" })).json();
      assert.equal(unknown.status, "unresolved"); assert.match(unknown.gaps.join(" "), /Foobar Dynamics/);
      const advice = await (await post("/v1/me/intelligence/investigate", "a", { question: "Should I sell my Tesla shares?" })).json();
      assert.equal(advice.status, "refused");
      const since = await (await post("/v1/me/intelligence/investigate", "a", { question: "What changed since my last visit?" })).json();
      assert.equal(since.plan.intent, "changes_since_visit");
      assert.equal((await post("/v1/me/intelligence/investigate", "a", { question: 42 })).status, 400);
      const legacy = await get("/v1/me/intelligence/investigate?ticker=NV%27DA", "a");
      assert.equal(legacy.status, 400, "invalid ticker");
      const synth = await (await post("/v1/me/intelligence/synthesize", "a", { question: "Show me recent insider sales at Nvidia" })).json();
      assert.equal(synth.status, "unavailable", "no provider key: the factual answer stands alone");
    });

    await t.test("the shared AI cache generates once under concurrency, reuses across members and invalidates on change", async () => {
      const { cachedGeneration } = await import("../src/ai-gateway.mjs");
      const env = { INSIDIR_OPENROUTER_API_KEY: "test" };
      let calls = 0;
      const generate = async () => { calls++; await new Promise(r => setTimeout(r, 300)); return { text: "Two sales were reported [1].", inputTokens: 10, outputTokens: 5, cost: 0, costSource: "none" }; };
      const job = (userId, content = "evidence v1") => cachedGeneration({ sourceType: "sec_filing", sourceId: "000104581026000001", content, explanationType: "filing_summary", promptVersion: "t1",
        userId, run: q, env, generate, build: () => [], verify: () => ({ allowed: true, problems: [] }), pollMs: 50, waitMs: 5000 });
      const results = await Promise.all([users.a.id, users.b.id, users.a.id, null, users.b.id, users.a.id].map(u => job(u)));
      assert.equal(calls, 1, "six concurrent requests, one generation");
      assert.ok(results.every(r => r.status === "ready" && r.text === "Two sales were reported [1]."), JSON.stringify(results.map(r => r.status)));
      assert.equal(results.filter(r => r.cached === false).length, 1);
      const again = await job(users.b.id);
      assert.equal(again.cached, true); assert.equal(calls, 1);
      await job(users.a.id, "evidence v2 (amended)");
      assert.equal(calls, 2, "changed source content is a new explanation");
      const stats = (await q("SELECT sum(hits)::int AS hits,sum(misses)::int AS misses FROM ai_cache_daily")).rows[0];
      assert.ok(stats.hits >= 6 && stats.misses === 2, JSON.stringify(stats));
      // Provider failure: recorded as failed, not retried immediately, never served as text.
      const failing = await cachedGeneration({ sourceType: "sec_filing", sourceId: "x", content: "c", explanationType: "filing_summary", promptVersion: "t1", run: q, env,
        generate: async () => { throw Object.assign(new Error("The AI provider is unavailable right now."), { status: 503 }); }, build: () => [], verify: () => ({ allowed: true, problems: [] }) });
      assert.equal(failing.status, "failed");
      let retried = false;
      const second = await cachedGeneration({ sourceType: "sec_filing", sourceId: "x", content: "c", explanationType: "filing_summary", promptVersion: "t1", run: q, env, waitMs: 200,
        generate: async () => { retried = true; return { text: "x" }; }, build: () => [], verify: () => ({ allowed: true, problems: [] }) });
      assert.equal(retried, false, "a recent failure is not retried at once"); assert.equal(second.status, "failed");
      // Verification failure: cached as blocked, never shown.
      const blocked = await cachedGeneration({ sourceType: "sec_filing", sourceId: "y", content: "c", explanationType: "filing_summary", promptVersion: "t1", run: q, env,
        generate: async () => ({ text: "You should buy now." }), build: () => [], verify: () => ({ allowed: false, problems: [{ kind: "directive" }] }) });
      assert.equal(blocked.status, "blocked"); assert.equal(blocked.text, undefined);
      // Budget: a member over the hourly limit is refused before the provider is called.
      const { callModel } = await import("../src/ai-gateway.mjs");
      for (let i = 0; i < 3; i++) await q("INSERT INTO ai_usage(user_id,feature,model,status) VALUES($1,'t','m','ok')", [users.b.id]);
      let fetched = false;
      await assert.rejects(callModel({ messages: [{ role: "user", content: "x" }], userId: users.b.id, run: q, env: { ...env, INSIDIR_AI_USER_HOURLY_LIMIT: "3" }, fetchImpl: async () => { fetched = true; } }), e => e.status === 429);
      assert.equal(fetched, false);
    });

    await t.test("notification eligibility follows each member's frequency; digests are queued once", async () => {
      const { MATCH_SQL, queueDigests, digestMessage } = await import("../src/push.mjs");
      const sub = async (who, n) => (await q("INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth_key,created_at) VALUES($1,$2,'k'||repeat('a',20),'a'||repeat('b',20),now()-interval '2 days') RETURNING id", [users[who].id, "https://fcm.googleapis.com/fcm/send/" + who + n])).rows[0].id;
      const sa = await sub("a", 1), sb = await sub("b", 1);
      const matched = (await q(MATCH_SQL)).rows;
      assert.ok(matched.some(r => r.subscription_id === sa), "immediate member A is matched");
      assert.ok(!matched.some(r => r.subscription_id === sb), "daily member B is not sent immediate alerts");
      await q("UPDATE intelligence_preferences SET last_digest_at=now()-interval '25 hours' WHERE user_id=$1", [users.b.id]);
      const first = await queueDigests(q);
      assert.equal(first.queued, 1, JSON.stringify(first));
      const second = await queueDigests(q);
      assert.equal(second.queued, 0, "the period is claimed; no duplicate digest");
      const key = (await q("SELECT event_key FROM push_deliveries WHERE subscription_id=$1", [sb])).rows[0].event_key;
      assert.match(digestMessage(key).body, /^2 new public records/, "AAPL and TSLA filings since the baseline");
      const brief = await (await get("/v1/me/intelligence/briefing", "b")).json();
      assert.equal(brief.delivery.devices, 1); assert.equal(brief.delivery.sent7d, 0, "queued is not reported as delivered");
    });

    await t.test("13F filings are stored once, values normalised, coverage recorded, and Mirror simulates from them", async () => {
      const { ingestManager } = await import("../src/form13f.mjs");
      const acc = "0000950123-26-000777", nodash = acc.replace(/-/g, "");
      const subs = { name: "EXAMPLE CAPITAL LLC", filings: { recent: { form: ["13F-HR"], accessionNumber: [acc], filingDate: ["2026-08-14"], reportDate: ["2026-06-30"] } } };
      let fetches = 0;
      const fetcher = async url => { fetches++;
        if (url.endsWith("CIK0009999999.json")) return subs;
        if (url.endsWith("/index.json")) return { directory: { item: [{ name: "primary_doc.xml" }, { name: "infotable.xml" }] } };
        if (url.endsWith("primary_doc.xml")) return FIXTURE_13F.PRIMARY;
        if (url.endsWith("infotable.xml")) return FIXTURE_13F.TABLE;
        throw new Error("unexpected " + url); };
      const r1 = await ingestManager("9999999", { run: q, fetcher });
      assert.equal(r1.stored, 1, JSON.stringify(r1));
      const before = fetches;
      const r2 = await ingestManager("9999999", { run: q, fetcher });
      assert.equal(r2.stored, 0); assert.equal(fetches - before, 1, "a stored filing is not downloaded again");
      const row = (await q("SELECT completeness,parsed_entries,value_unit FROM form13f_filings WHERE accession=$1", [nodash])).rows[0];
      assert.deepEqual(row, { completeness: "complete", parsed_entries: 3, value_unit: "dollars" });
      const list = await (await get("/v1/intelligence/mirror/managers", "a")).json();
      assert.equal(list.available, true); assert.equal(list.managers[0].filedName, "EXAMPLE CAPITAL LLC", "the name EDGAR gave"); assert.equal(list.managers[0].name, "Example Capital LLC");
      const sim = await (await get("/v1/intelligence/mirror/simulate?cik=9999999&budget=500", "a")).json();
      assert.equal(sim.allocated, 500); assert.equal(sim.executed, false);
      assert.deepEqual(sim.allocations.map(x => [x.issuer, x.dollars]), [["APPLE INC", 428.57], ["BANK AMER CORP", 71.43]]);
      assert.equal(sim.excluded[0].putCall, "PUT");
      assert.equal((await get("/v1/intelligence/mirror/simulate?cik=9999999&budget=0", "a")).status, 400);
      assert.equal((await get("/v1/intelligence/mirror/simulate?cik=123&budget=50", "a")).status, 404);
      const detail = await (await get("/v1/intelligence/mirror/managers/9999999", "a")).json();
      assert.equal(detail.positionsTotal, 3); assert.equal(detail.changes, null, "one quarter: no history to compare");
      assert.ok(detail.notes.some(n => /not the manager's complete portfolio/.test(n)));
      // An incomplete filing is flagged, not hidden.
      const acc2 = "0000950123-26-000778";
      const short = FIXTURE_13F.TABLE.replace(/<ns1:infoTable><ns1:nameOfIssuer>BANK[\s\S]*?<\/ns1:infoTable>/, "");
      subs.filings.recent = { form: ["13F-HR", "13F-HR"], accessionNumber: [acc2, acc], filingDate: ["2026-11-14", "2026-08-14"], reportDate: ["2026-09-30", "2026-06-30"] };
      const fetcher2 = async url => url.endsWith("infotable.xml") ? short : url.endsWith("primary_doc.xml") ? FIXTURE_13F.PRIMARY.replace(/06-30-2026/g, "09-30-2026") : fetcher(url);
      await ingestManager("9999999", { run: q, fetcher: fetcher2 });
      const d2 = await (await get("/v1/intelligence/mirror/managers/9999999", "a")).json();
      assert.equal(d2.current.completeness, "totals_mismatch");
      assert.ok(d2.notes.some(n => /do not match the totals/.test(n)));
      assert.equal(d2.changes.comparable, false); assert.deepEqual(d2.changes.exited.map(x => x.issuer), ["BANK AMER CORP"]);
    });

    await t.test("public events are stored once by their stable key", async () => {
      const { saveEvents } = await import("../src/intelligence-monitor.mjs");
      const e = { event_key: "notice:000032019326000123", source_type: "sec_notice", title: "AAPL filed 8-K with the SEC", subject: "AAPL", source_url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000123/a.htm", published_at: new Date().toISOString(), metadata: {} };
      assert.equal(await saveEvents([e, e], q), 1);
      assert.equal(await saveEvents([e], q), 0);
    });

    await t.test("instrument, event tape and capital structure read real records and keep members apart", async () => {
      const { resetInstrumentCache } = await import("../src/intelligence-instrument.mjs");
      resetInstrumentCache();
      for (const path of ["/v1/me/intelligence/instrument", "/v1/intelligence/tape", "/v1/intelligence/structure?ticker=NVDA"]) {
        assert.equal((await get(path)).status, 401, path); assert.equal((await get(path, "c")).status, 402, path);
      }
      const a = await (await get("/v1/me/intelligence/instrument", "a")).json(), b = await (await get("/v1/me/intelligence/instrument", "b")).json();
      const dot = (r, id) => r.mark.find(d => d.id === id);
      assert.equal(a.mark.length, 10);
      assert.equal(dot(a, "sales").count, 4, "NVDA ×2, AAPL, TSLA sale lines in the window");
      assert.equal(dot(a, "purchases").count, 1);
      assert.deepEqual(dot(a, "watchlist").records.map(r => r.ticker).sort(), ["MSFT", "NVDA"]);
      assert.deepEqual(dot(b, "watchlist").records.map(r => r.ticker).sort(), ["AAPL", "TSLA"], "B sees only B's watchlist");
      assert.equal(dot(b, "people").count, 0); assert.equal(dot(a, "people").count, 1);
      assert.equal(dot(a, "sales").count, dot(b, "sales").count, "the market layer is shared");
      for (const d of a.mark) for (const r of d.records) if (r.external) assert.match(r.href, /^https:\/\/www\.sec\.gov\//);
      const tape = await (await get("/v1/intelligence/tape?days=7", "a")).json();
      assert.ok(tape.events.length >= 5);
      const dates = tape.events.map(e => e.filedAt); assert.deepEqual(dates, [...dates].sort().reverse(), "chronological, newest first");
      assert.ok(tape.events.every(e => typeof e.new === "boolean"));
      const nv = await (await get("/v1/intelligence/tape?days=7&ticker=NVDA&form=4", "a")).json();
      assert.ok(nv.events.length >= 2 && nv.events.every(e => e.ticker === "NVDA" && e.kind === "form4"));
      assert.equal(nv.events.find(e => e.id === "f4:000104581026000001").amount, 180500);
      const cook = await (await get("/v1/intelligence/tape?days=7&person=cook", "a")).json();
      assert.deepEqual(cook.events.map(e => e.ticker), ["AAPL"]);
      assert.equal((await get("/v1/intelligence/tape?ticker=NV%27DA", "a")).status, 400);
      const st = await (await get("/v1/intelligence/structure?ticker=NVDA", "a")).json();
      assert.deepEqual(st.people.map(p => p.relationships[0]).sort(), ["Officer: EVP and CFO", "Officer: President and CEO"]);
      assert.equal(st.securities[0].name, "Common Stock"); assert.ok(st.edges.length >= 2); assert.equal(st.periods.length, 12);
      assert.match(st.labels.personSecurity, /not a statement of how much they hold/);
      assert.equal((await get("/v1/intelligence/structure?ticker=ZZZZ", "a")).status, 404);
    });

    await t.test("streamed investigations report each stage as it completes, in order, then the answer", async () => {
      const r = await post("/v1/me/intelligence/investigate?stream=1", "a", { question: "Show recent insider transactions at Nvidia" });
      assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /ndjson/);
      const lines = (await r.text()).trim().split("\n").map(l => JSON.parse(l));
      assert.deepEqual(lines.map(l => l.stage), ["start", "understood", "sources", "connected", "verified", "prepared", "answer"]);
      assert.equal(lines.find(l => l.stage === "sources").detail.records, 3);
      const ans = lines.at(-1).answer;
      assert.ok(ans.relationships.length >= 2 && ans.timeline.length >= 3);
      assert.equal(ans.verification.removed, 0);
      const bad = await post("/v1/me/intelligence/investigate?stream=1", "a", { question: "" });
      assert.equal(bad.status, 400, "validation errors are ordinary responses, not a broken stream");
    });

    await t.test("the cost dashboard is admin-only and separates measured from estimated cost", async () => {
      assert.equal((await get("/v1/admin/costs")).status, 401);
      assert.equal((await get("/v1/admin/costs", "b")).status, 401, "a paying member is not an administrator");
      const tokenOnly = await fetch(base + "/v1/admin/costs", { headers: { authorization: "Bearer " + ADMIN_TOKEN } });
      assert.equal(tokenOnly.status, 401, "the token without a one-time code is refused");
      await q("INSERT INTO ai_usage(feature,model,status,input_tokens,output_tokens,cost_usd,cost_source) VALUES('filing_summary','openai/gpt-4.1-nano','ok',100,20,0.000018,'provider_reported'),('filing_summary','openai/gpt-4.1-nano','ok',100,20,0.5,'estimated')");
      const r = await (await fetch(base + "/v1/admin/costs", { headers: { authorization: "Bearer " + ADMIN_TOKEN, "x-insidir-admin-otp": totpCode(base32Decode(TOTP), stepAt()) } })).json();
      assert.ok(Math.abs(r.ai.last30.measuredUsd - 0.000018) < 1e-9, "estimated cost is not added to measured");
      assert.equal(r.ai.last30.estimatedUsd, 0.5);
      assert.equal(r.grossMargin.source, "unavailable", "no Stripe: no invented margin");
      assert.equal(r.infrastructure.source, "unavailable");
      assert.ok(r.cache.hitRate > 0);
      const audit = (await q("SELECT action FROM admin_audit_log ORDER BY id")).rows.map(x => x.action);
      assert.ok(audit.includes("admin.denied") && audit.includes("admin.costs"));
    });
  } finally {
    if (server) await new Promise(r => server.close(r));
    await db?.pool?.end().catch(() => {});
    await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE").catch(() => {});
    await admin.end();
  }
});
