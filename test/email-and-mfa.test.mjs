import test from "node:test";
import assert from "node:assert/strict";
import { totpCode, verifyTotp, base32Encode, base32Decode, generateTotpSecret } from "../src/totp.mjs";
import { enqueueEmail, transportFor, emailSettings } from "../src/email.mjs";
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

test("no email whatsoever: no provider, no transport, nothing queued, whatever the environment says", async () => {
  const configured = { INSIDIR_EMAIL_PROVIDER: "postmark", POSTMARK_SERVER_TOKEN: "pm-token", INSIDIR_EMAIL_FROM: "Insidir <a@insidir.com>", INSIDIR_EMAIL_WEBHOOK_SECRET: "w".repeat(32) };
  for (const env of [{}, configured, { INSIDIR_EMAIL_PROVIDER: "log" }]) {
    const settings = emailSettings(env);
    assert.equal(settings.enabled, false); assert.equal(settings.provider, "none"); assert.equal(settings.token, "");
    assert.equal(transportFor(settings), null);
  }
  let touched = false;
  assert.deepEqual(await enqueueEmail(async () => { touched = true; return { rows: [{ id: 1 }] }; }, { to: "a@example.com", category: "security", kind: "x", dedupeKey: "x", subject: "x", text: "x" }), { queued: false, disabled: true });
  assert.equal(touched, false, "the database is never even asked");
  assert.equal(emailSettings({ INSIDIR_PUBLIC_URL: "https://insidir.example/" }).publicUrl, "https://insidir.example");
});
