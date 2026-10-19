import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { totpCode, verifyTotp, base32Encode, base32Decode, generateTotpSecret } from "../src/totp.mjs";
import { renderEmail, postmarkTransport, deliverDue, enqueueEmail, backoffMs, handleEmailWebhook, MAX_ATTEMPTS } from "../src/email.mjs";
import { memoryLimiter } from "../src/rate-limit.mjs";
import { MIGRATIONS, migrate } from "../src/db.mjs";
import { readdirSync } from "node:fs";

test("TOTP matches the RFC 6238 SHA-1 test vectors (6 digits)", () => {
  const key = Buffer.from("12345678901234567890");
  for (const [t, code] of [[59, "287082"], [1111111109, "081804"], [1234567890, "005924"], [2000000000, "279037"]])
    assert.equal(totpCode(key, Math.floor(t / 30)), code, String(t));
  const secret = base32Encode(key);
  assert.deepEqual(base32Decode(secret), key);
  assert.equal(verifyTotp(secret, "287082", { now: 59_000 }), 1);
  assert.equal(verifyTotp(secret, "287082", { now: 59_000 + 30_000 }), 1, "one step of drift");
  assert.equal(verifyTotp(secret, "287082", { now: 59_000 + 90_000 }), null, "too old");
  assert.equal(verifyTotp(secret, "28708", { now: 59_000 }), null);
  assert.equal(verifyTotp("not base32!", "287082"), null);
  assert.match(generateTotpSecret(), /^[A-Z2-7]{32}$/);
});

test("memory limiter: hit counts, atLimit reads, fail spends without a limit, windows expire", async () => {
  let now = 0;
  const l = memoryLimiter({ now: () => now });
  assert.equal(await l.hit("k", 2, 1000), false);
  assert.equal(await l.hit("k", 2, 1000), false);
  assert.equal(await l.hit("k", 2, 1000), true);
  now = 1001;
  assert.equal(await l.hit("k", 2, 1000), false, "new window");
  await l.fail("f", 1000); await l.fail("f", 1000);
  assert.equal(await l.atLimit("f", 2), true);
  assert.equal(await l.atLimit("f", 3), false);
});

test("every SQL migration is applied, in order", () => {
  assert.deepEqual([...MIGRATIONS], readdirSync(new URL("../sql/", import.meta.url)).filter(f => f.endsWith(".sql")).sort());
});

test("emails escape everything they render and always have a text part", () => {
  const { text, html } = renderEmail({ heading: "<b>Hi</b>", paragraphs: ['"quoted" & <script>x</script>'], lines: [{ label: "Amount", value: "$1.00" }], action: { label: "Go", url: "https://insidir.test/a?b=1&c=2" }, footer: ["f"] });
  assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;") && html.includes("&amp;c=2"));
  assert.match(text, /Amount: \$1\.00/); assert.match(text, /Go: https:\/\/insidir\.test\/a\?b=1&c=2/);
  assert.match(text, /Research, not investment advice/);
});

test("Postmark transport: success, permanent and transient errors are told apart", async () => {
  const reply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });
  assert.deepEqual(await postmarkTransport({ token: "t", fetchImpl: reply(200, { ErrorCode: 0, MessageID: "m-1" }) }).send({ to: "a@b.co" }), { messageId: "m-1" });
  await assert.rejects(postmarkTransport({ token: "t", fetchImpl: reply(422, { ErrorCode: 406, Message: "Inactive" }) }).send({}), e => e.permanent && e.suppressReason === "hard_bounce");
  await assert.rejects(postmarkTransport({ token: "t", fetchImpl: reply(422, { ErrorCode: 300 }) }).send({}), e => e.permanent);
  await assert.rejects(postmarkTransport({ token: "t", fetchImpl: reply(422, { ErrorCode: 10 }) }).send({}), e => e.permanent === false, "bad token: retried after the operator fixes it");
  await assert.rejects(postmarkTransport({ token: "t", fetchImpl: reply(503, {}) }).send({}), e => e.permanent === false);
  await assert.rejects(postmarkTransport({ token: "t", fetchImpl: async () => { throw new TypeError("fetch failed"); } }).send({}), e => e.permanent === false);
  assert.equal(backoffMs(1), 60_000); assert.equal(backoffMs(3), 240_000); assert.equal(backoffMs(30), 6 * 3600_000);
});

test("email webhook refuses without the shared secret", async () => {
  const res = {}; let sent;
  const json = (_r, status, body) => { sent = { status, body }; };
  const env = { INSIDIR_EMAIL_WEBHOOK_SECRET: "s".repeat(32) };
  await handleEmailWebhook({ headers: { authorization: "Basic " + Buffer.from("postmark:wrong").toString("base64") } }, res, json, { query: async () => ({ rows: [] }), env, readBody: async () => Buffer.from("{}") });
  assert.equal(sent.status, 401);
  await handleEmailWebhook({ headers: {} }, res, json, { query: async () => ({ rows: [] }), env: {}, readBody: async () => Buffer.from("{}") });
  assert.equal(sent.status, 503);
});

const DB = process.env.INSIDIR_TEST_DATABASE_URL;
test("outbox on PostgreSQL: idempotent queueing, retries with backoff, suppression, erasure, no double send", { skip: !DB && "set INSIDIR_TEST_DATABASE_URL" }, async t => {
  const pool = new pg.Pool({ connectionString: DB });
  t.after(() => pool.end());
  const q = (sql, p) => pool.query(sql, p);
  // The schema exactly as the engine applies it at start: under the migration lock, recorded in schema_migrations
  // (running the files directly re-took their table locks while other suites were mid-query and deadlocked).
  await migrate(pool);
  await q("DELETE FROM email_outbox WHERE kind LIKE 'test_%'");
  const tag = randomUUID();
  const K = ["test_alert", "test_billing"]; // other suites share the database: deliver only this test's messages
  const msg = (n, extra = {}) => ({ to: `r${n}-${tag}@example.com`, category: "alert", kind: "test_alert", dedupeKey: `test:${tag}:${n}`, subject: "S", text: "body " + n, ...extra });

  assert.deepEqual((await enqueueEmail(q, msg(1))).queued, true);
  assert.deepEqual(await enqueueEmail(q, msg(1)), { queued: false }, "same dedupe key: queued once");
  await enqueueEmail(q, msg(2));
  await enqueueEmail(q, msg(3, { category: "billing", retainBody: true, kind: "test_billing" }));
  await q("INSERT INTO email_suppressions(recipient_hash,reason) VALUES((SELECT recipient_hash FROM email_outbox WHERE dedupe_key=$1),'hard_bounce') ON CONFLICT DO NOTHING", [`test:${tag}:2`]);

  let calls = 0, failedOnce = false; const sentTo = [];
  const flaky = { name: "fake", async send(m) { calls++; if (m.text === "body 1" && !failedOnce && (failedOnce = true)) throw Object.assign(new Error("temporary"), { permanent: false }); sentTo.push(m.to); return { messageId: "id-" + calls }; } };
  // Two workers at once never claim the same row.
  const [a, b] = await Promise.all([deliverDue({ query: q, transport: flaky, limit: 10, kinds: K }), deliverDue({ query: q, transport: flaky, limit: 10, kinds: K })]);
  const row = async n => (await q("SELECT * FROM email_outbox WHERE dedupe_key=$1", [`test:${tag}:${n}`])).rows[0];
  assert.equal((await row(1)).status, "queued", "transient failure: queued again");
  assert.ok(new Date((await row(1)).next_attempt_at) > new Date(Date.now() + 50_000), "with backoff");
  assert.equal((await row(2)).status, "suppressed"); assert.equal((await row(2)).text_body, null);
  const billing = await row(3);
  assert.equal(billing.status, "sent"); assert.equal(billing.text_body, "body 3", "billing notices keep their body"); assert.ok(billing.to_email);
  assert.equal(a.claimed + b.claimed, 3);
  await q("UPDATE email_outbox SET next_attempt_at=now() WHERE dedupe_key=$1", [`test:${tag}:1`]);
  await deliverDue({ query: q, transport: flaky, limit: 10, kinds: K });
  const alert = await row(1);
  assert.equal(alert.status, "sent"); assert.equal(alert.text_body, null, "alert bodies are erased once delivered"); assert.equal(alert.to_email, null);
  assert.equal(new Set(sentTo).size, sentTo.length, "nobody mailed twice");

  // A message that keeps failing is abandoned after MAX_ATTEMPTS and erased.
  await enqueueEmail(q, msg(4));
  const broken = { name: "fake", async send() { throw Object.assign(new Error("down"), { permanent: false }); } };
  for (let i = 0; i < MAX_ATTEMPTS; i++) { await q("UPDATE email_outbox SET next_attempt_at=now() WHERE dedupe_key=$1", [`test:${tag}:4`]); await deliverDue({ query: q, transport: broken, limit: 10, kinds: K }); }
  const dead = await row(4);
  assert.equal(dead.status, "failed"); assert.equal(dead.attempts, MAX_ATTEMPTS); assert.equal(dead.text_body, null);

  // Provider webhook: a hard bounce suppresses the address; an unsubscribe only stops optional mail.
  const env = { INSIDIR_EMAIL_WEBHOOK_SECRET: "w".repeat(32) };
  const auth = { authorization: "Basic " + Buffer.from("postmark:" + "w".repeat(32)).toString("base64") };
  const hook = async payload => { let out; await handleEmailWebhook({ headers: auth }, {}, (_r, status, body) => { out = { status, body }; }, { query: q, env, readBody: async () => Buffer.from(JSON.stringify(payload)) }); return out; };
  const bounced = `bounce-${tag}@example.com`;
  assert.equal((await hook({ RecordType: "Bounce", Type: "HardBounce", Email: bounced, MessageID: "id-2" })).body.suppressed, true);
  const { isSuppressed } = await import("../src/email.mjs");
  assert.equal(await isSuppressed(q, bounced, "security"), "hard_bounce");
  const unsub = `unsub-${tag}@example.com`;
  await hook({ RecordType: "SubscriptionChange", Recipient: unsub, SuppressSending: true, SuppressionReason: "ManualSuppression" });
  assert.equal(await isSuppressed(q, unsub, "alert"), "unsubscribed");
  assert.equal(await isSuppressed(q, unsub, "billing"), null, "billing notices still reach someone who unsubscribed from alerts");
});
