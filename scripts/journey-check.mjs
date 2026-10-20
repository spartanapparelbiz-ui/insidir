#!/usr/bin/env node
/* The member journey in Chrome, end to end, through the real engine (src/api.mjs over HTTPS with a throwaway
 * self-signed certificate), PostgreSQL and a Stripe SIMULATOR (test/support/stripe-simulator.mjs):
 *   sign up → checkout waits for a confirmed address → confirm by the emailed link → agree to the $1 trial terms →
 *   (simulated) Stripe checkout and webhooks → billing shows the trial → watch a company → a synthetic research
 *   event becomes an alert → sourced explanation → alert email preferences with consent → the company report's
 *   research events → account: confirmed address, password change, recent activity, data download →
 *   cancel online → delete the account (cancelled with Stripe first) → password recovery for another account.
 * Desktop (1440) and phone (390) widths; no horizontal overflow on any page visited; no page errors.
 * Research data here is SYNTHETIC (a fictional issuer and filer) and Stripe is simulated: this proves the product's
 * own behaviour, not Stripe's or the SEC's.
 *
 *   INSIDIR_TEST_DATABASE_URL=postgresql://... CHROME_BIN=/path/to/chrome node scripts/journey-check.mjs [--shots=DIR] */
import assert from "node:assert/strict";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DB = process.env.INSIDIR_TEST_DATABASE_URL;
if (!DB) { console.error("Set INSIDIR_TEST_DATABASE_URL to a throwaway database."); process.exit(2); }
const shots = (process.argv.find(a => a.startsWith("--shots=")) || "").slice(8) || null;
if (shots) mkdirSync(shots, { recursive: true });

// A certificate for 127.0.0.1, so cookies are Secure and billing sees the https origin it requires.
const dir = mkdtempSync(join(tmpdir(), "insidir-journey-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
const PORT = 30000 + Math.floor(Math.random() * 20000), ORIGIN = `https://127.0.0.1:${PORT}`;
const WHSEC = "whsec_journey_check";
Object.assign(process.env, { DATABASE_URL: DB, ALLOW_SIGNUP: "1", ALLOWED_ORIGINS: ORIGIN, COOKIE_SECURE: "1" });
const ENV = { ...process.env, INSIDIR_PAYWALL: "1", INSIDIR_BILLING_ENABLED: "1", INSIDIR_STRIPE_SECRET_KEY: "sk_test_simulated", INSIDIR_STRIPE_PRICE_ID: "price_pro",
  INSIDIR_STRIPE_WEBHOOK_SECRET: WHSEC, INSIDIR_PUBLIC_URL: ORIGIN, INSIDIR_EMAIL_PROVIDER: "log", INSIDIR_APP_SECRET: "j".repeat(40), INSIDIR_COMPLIMENTARY_EMAILS: "" };

const { migrate, pool } = await import("../src/db.mjs");
const { createApiServer } = await import("../src/api.mjs");
const { saveEvent } = await import("../src/research-events.mjs");
const { fanOut } = await import("../src/notifications.mjs");
const { stripeSimulator, signedWebhook } = await import("../test/support/stripe-simulator.mjs");
const { chromium } = await import("playwright-core");
await migrate();
const q = (sql, p) => pool.query(sql, p);
const sim = stripeSimulator();
const api = createApiServer({ quiet: true, env: ENV, stripe: sim.client });
const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, api.listeners("request")[0]);
await new Promise(r => server.listen(PORT, "127.0.0.1", r));
const deliver = async events => { for (const e of events) { const { raw, signature } = signedWebhook(e, WHSEC); const r = await fetch(ORIGIN + "/v1/billing/webhook", { method: "POST", body: raw, headers: { "Stripe-Signature": signature, "Content-Type": "application/json" } }); assert.equal(r.status, 200); } };
const link = async (email, kind) => (await q("SELECT text_body FROM email_outbox WHERE to_email=$1 AND kind=$2 ORDER BY id DESC LIMIT 1", [email, kind])).rows[0]?.text_body.match(/https:\/\/\S+#token=[a-f0-9]{64}/)[0];
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // the webhook fetch above, to our own throwaway certificate only

const TICKER = "JRNY" + String(Math.floor(Math.random() * 9));
const PASSWORD = "journey passphrase 2026", NEW_PASSWORD = "journey passphrase 2027!";
let browser, failures = 0;
const step = async (name, fn) => { try { await fn(); console.log("ok   " + name); } catch (e) { failures++; console.log("FAIL " + name + "\n     " + String(e?.message || e).split("\n").slice(0, 6).join("\n     ")); } };

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = viewport.width;
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, acceptDownloads: true, isMobile: w < 600, hasTouch: w < 600 });
    await context.addInitScript(() => { addEventListener("load", () => window.InsidirMotion?.revealAll?.()); });
    await context.route("https://checkout.stripe.test/**", r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Simulated Stripe Checkout</title><h1>Simulated Stripe Checkout</h1>" }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    const go = async path => { await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 30000 }); await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); };
    const noOverflow = async label => { const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(o <= 4, `${w}px ${label}: horizontal overflow ${o}px`); };
    const shot = async name => { if (shots) await page.screenshot({ path: join(shots, `${w}-${name}.png`), fullPage: true }); };
    const email = `journey-${w}-${randomUUID().slice(0, 8)}@example.com`;
    let session;

    await step(`${w}px sign up lands on the subscription step`, async () => {
      await go("/signup.html");
      await page.fill("#signup-email", email).catch(async () => page.fill('form[data-auth-form="register"] input[name="email"]', email));
      await page.fill('form[data-auth-form="register"] input[name="password"]', PASSWORD);
      await page.click('form[data-auth-form="register"] button[type="submit"]');
      await page.waitForURL(/\/subscribe\.html/, { timeout: 15000 });
      await page.waitForSelector("#pw-subscribe", { state: "visible" });
      assert.match(await page.textContent("body"), /\$1/);
      await noOverflow("subscribe"); await shot("subscribe");
    });
    await step(`${w}px checkout waits for a confirmed address and offers a new link`, async () => {
      await page.check("#pw-agree"); await page.click("#pw-subscribe");
      await page.waitForFunction(() => /Confirm your email/i.test(document.getElementById("pw-feedback")?.textContent || ""), null, { timeout: 10000 });
      await page.click("#pw-feedback button");
      await page.waitForFunction(() => /sent a confirmation link/i.test(document.getElementById("pw-feedback")?.textContent || ""), null, { timeout: 10000 });
    });
    await step(`${w}px the emailed link confirms the address`, async () => {
      const url = await link(email, "verify_email");
      await page.goto(url.replace(/^https:\/\/[^/]+/, ORIGIN), { waitUntil: "domcontentloaded" });
      assert.equal(new URL(page.url()).hash, "", "the token is removed from the address bar");
      await page.click('form[data-recovery-form="verify"] button[type="submit"]');
      await page.waitForFunction(() => /confirmed/i.test(document.querySelector("[data-verify-status]")?.textContent || ""), null, { timeout: 10000 });
      await noOverflow("verify-email"); await shot("verify-email");
    });
    await step(`${w}px agreeing to the $1 trial terms opens (simulated) Stripe Checkout with the consent recorded`, async () => {
      await go("/subscribe.html");
      await page.waitForSelector("#pw-subscribe", { state: "visible" });
      await page.check("#pw-agree"); await page.click("#pw-subscribe");
      await page.waitForURL(/checkout\.stripe\.test/, { timeout: 15000 });
      const consent = (await q("SELECT offer,amount_today_cents,recurring_cents FROM billing_consents WHERE email=$1", [email])).rows;
      assert.deepEqual(consent.map(c => [c.offer, c.amount_today_cents, c.recurring_cents]), [["trial", 100, 3900]]);
      const session = [...sim.sessions.values()].at(-1);
      await deliver(sim.completeCheckout(session.id).events);
    });
    await step(`${w}px billing shows the trial and the way to cancel`, async () => {
      await go("/billing.html?checkout=success");
      await page.waitForFunction(() => /trial/i.test(document.body.innerText), null, { timeout: 15000 });
      assert.ok(await page.isVisible("[data-bl-cancel]"), "Cancel subscription is offered");
      await noOverflow("billing"); await shot("billing");
    });
    await step(`${w}px a watched company's new filing becomes an alert with a sourced explanation`, async () => {
      const r = await page.evaluate(async t => (await fetch("/v1/me/watchlist", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: t }) })).status, TICKER);
      assert.equal(r, 200);
      await q("UPDATE watchlist SET created_at=now()-interval '3 days' WHERE ticker=$1", [TICKER]);
      if (!(await q("SELECT 1 FROM research_cursors WHERE name='notifications'")).rows.length) await fanOut({ query: q });
      await saveEvent(q, { event_key: `journey:${randomUUID()}`, event_type: "insider_purchase", issuer_cik: "0000999999", ticker: TICKER, issuer_name: "Journey Synthetic Corp (test fixture)",
        owner_cik: "0000999998", owner_name: "Test Filer", transaction_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), transaction_date_end: null,
        filing_date: new Date(Date.now() - 86400000).toISOString(), ingested_at: new Date().toISOString(), reporting_lag_days: 1, accessions: ["000099999926000001"],
        source_urls: ["https://www.sec.gov/Archives/edgar/data/999999/000099999926000001/"], people: ["0000999998"],
        facts: { form: "4", owners: [{ cik: "0000999998", name: "Test Filer", roles: ["Director"] }], lineCount: 1, totalShares: "100", totalValue: "1000", valueComplete: true, priceLow: "10", priceHigh: "10",
          lines: [{ id: "j:N:0", transactionDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), code: "P", acquiredDisposed: "A", security: "Common Stock", shares: "100", pricePerShare: "10", value: "1000", ownership: "D" }], amended: false } });
      await fanOut({ query: q });
      await go("/alerts.html");
      await page.waitForSelector(".ac-item", { timeout: 15000 });
      assert.match(await page.textContent(".ac-item"), /Test Filer \(Director\) reported buying 100 shares/);
      await page.click(".ac-item [data-explain]");
      await page.waitForSelector(".re-explain h3", { timeout: 15000 });
      const text = await page.textContent(".re-explain");
      assert.match(text, /What the filing states/); assert.match(text, /Missing, delayed or uncertain/); assert.match(text, /retrieved/);
      assert.ok(await page.$('.re-explain a[href^="https://www.sec.gov/"]'), "links the SEC filing");
      await page.fill(".re-ask input", "Should I buy this stock?"); await page.click(".re-ask button");
      await page.waitForFunction(() => /does not tell you what to buy/i.test(document.querySelector(".re-explain")?.textContent || ""), null, { timeout: 10000 });
      await noOverflow("alerts"); await shot("alerts");
    });
    await step(`${w}px alert emails need the consent box, and the choice is recorded`, async () => {
      await page.check('input[name="emailAlerts"][value="immediate"]');
      assert.ok(await page.isVisible("#ac-consent"));
      await page.click('#ac-prefs button[type="submit"]');
      await page.waitForFunction(() => /Tick the box/.test(document.getElementById("ac-prefs-status")?.textContent || ""));
      await page.check('#ac-consent input[name="consent"]'); await page.click('#ac-prefs button[type="submit"]');
      await page.waitForFunction(() => /Preferences saved/.test(document.getElementById("ac-prefs-status")?.textContent || ""), null, { timeout: 10000 });
      assert.equal((await q("SELECT count(*)::int AS n FROM email_consents c JOIN users u ON u.id=c.user_id WHERE u.email=$1 AND c.action='opt_in'", [email])).rows[0].n, 1);
    });
    await step(`${w}px the company report lists the research event with its dates kept apart`, async () => {
      await go(`/company.html?ticker=${TICKER}#insiders`);
      await page.waitForSelector("#cx-re-list .ac-item", { timeout: 20000 });
      const meta = await page.textContent("#cx-re-list .ac-item__meta");
      assert.match(meta, /Traded .* Filed .* retrieved/);
      await noOverflow("company");
    });
    await step(`${w}px account: confirmed address, password change, recent activity, data download`, async () => {
      await go("/account.html");
      await page.waitForFunction(() => document.getElementById("account-verified")?.textContent === "Confirmed", null, { timeout: 15000 });
      await page.fill("#account-password-current", PASSWORD); await page.fill("#account-password-new", NEW_PASSWORD);
      await page.click("#account-password-save");
      await page.waitForFunction(() => /Password changed/.test(document.getElementById("account-security-feedback")?.textContent || ""), null, { timeout: 10000 });
      await page.waitForFunction(() => /Password changed/.test(document.getElementById("account-events")?.textContent || ""), null, { timeout: 10000 });
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click("#account-export")]);
      const data = JSON.parse(readFileSync(await download.path(), "utf8"));
      assert.equal(data.account.email, email); assert.ok(data.subscriptionConsents.length === 1 && data.alertEmailConsents.length === 1);
      await noOverflow("account"); await shot("account");
    });
    await step(`${w}px cancel online: the trial will not convert`, async () => {
      await go("/billing.html");
      await page.waitForSelector("[data-bl-cancel]", { state: "visible", timeout: 15000 });
      await page.click("[data-bl-cancel]"); await page.click("[data-bl-cancel-yes]");
      await page.waitForFunction(() => /cancelled/i.test(document.getElementById("bill-status")?.textContent || ""), null, { timeout: 15000 });
      const sub = [...sim.subs.values()].at(-1); // this context's subscription: the newest one
      assert.equal(sub.cancel_at_period_end, true);
      assert.equal((await q("SELECT count(*)::int AS n FROM email_outbox WHERE to_email=$1 AND kind='cancel_confirmed'", [email])).rows[0].n, 1);
    });
    await step(`${w}px deleting the account cancels with Stripe first and signs out`, async () => {
      session = [...sim.subs.values()].at(-1);
      await go("/account.html");
      await page.waitForSelector("#account-delete:not([disabled])", { timeout: 15000 });
      await page.click("#account-delete"); await page.fill("#account-delete-password", NEW_PASSWORD); await page.click("#account-delete-confirm");
      await page.waitForURL(/account-deleted\.html/, { timeout: 15000 });
      assert.equal(session.status, "canceled");
      assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE email=$1", [email])).rows[0].n, 0);
      await noOverflow("account-deleted");
    });
    await step(`${w}px password recovery: same answer for any address, the link resets and signs out`, async () => {
      const other = `recover-${w}-${randomUUID().slice(0, 8)}@example.com`;
      const reg = await fetch(ORIGIN + "/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ email: other, password: PASSWORD }) });
      assert.equal(reg.status, 201);
      await go("/forgot-password.html");
      await page.fill("#forgot-email", other); await page.click('form[data-recovery-form="forgot"] button[type="submit"]');
      await page.waitForFunction(() => /If an Insidir account uses that address/.test(document.querySelector(".form-alert__text")?.textContent || ""), null, { timeout: 10000 });
      await noOverflow("forgot-password");
      const url = await link(other, "password_reset");
      await page.goto(url.replace(/^https:\/\/[^/]+/, ORIGIN), { waitUntil: "domcontentloaded" });
      await page.fill("#reset-password", NEW_PASSWORD); await page.fill("#reset-confirm", NEW_PASSWORD);
      await page.click('form[data-recovery-form="reset"] button[type="submit"]');
      await page.waitForFunction(() => /password was changed/.test(document.querySelector(".form-alert__text")?.textContent || ""), null, { timeout: 10000 });
      await noOverflow("reset-password"); await shot("reset-password");
      const login = await fetch(ORIGIN + "/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ email: other, password: NEW_PASSWORD }) });
      assert.equal(login.status, 200);
    });
    await step(`${w}px no page errors`, async () => assert.deepEqual(errors, []));
    await context.close();
  }
} finally {
  await browser?.close(); server.close(); await pool.end();
}
console.log(failures ? `JOURNEY FAILED: ${failures} step(s)` : "JOURNEY PASSED at 1440px and 390px (synthetic research data, simulated Stripe)");
process.exit(failures ? 1 : 0);
