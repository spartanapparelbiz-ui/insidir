export const config = Object.freeze({
  port: Number(process.env.PORT || 8080),
  databaseUrl: process.env.DATABASE_URL || "",
  userAgent: process.env.SEC_USER_AGENT || "",
  ingestSecret: process.env.INGEST_SECRET || "",
  autoIngest: process.env.AUTO_INGEST === "1",
  allowSignup: process.env.ALLOW_SIGNUP === "1",
  cookieSecure: process.env.COOKIE_SECURE !== "0",
  origins: new Set((process.env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean)),
  maxPerRun: Math.min(100, Math.max(1, Number(process.env.SEC_MAX_FILINGS_PER_RUN || 100))),
  timeoutMs: Math.min(30000, Math.max(4000, Number(process.env.SEC_TIMEOUT_MS || 15000))),
  brokerageConnectEnabled: process.env.BROKERAGE_CONNECT_ENABLED === "1",
  snaptradeOAuthClientId: process.env.SNAPTRADE_OAUTH_CLIENT_ID || "",
  snaptradeOAuthClientSecret: process.env.SNAPTRADE_OAUTH_CLIENT_SECRET || "",
  snaptradeOAuthRedirectUri: process.env.SNAPTRADE_OAUTH_REDIRECT_URI || "",
  brokerageEncryptionKey: process.env.BROKERAGE_ENCRYPTION_KEY || ""
});
export function secReady() {
  return /.+\s.+@[^@\s]+\.[^@\s]+/.test(config.userAgent);
}

/* Paywall and billing settings. These read the environment at call time (pass `env`
 * to test them) because the paywall must react to the deployed configuration. */

// The paywall is ON unless INSIDIR_PAYWALL is exactly "0" (local development only).
// Any other value — unset, "1", "false", "off" — keeps the product gated.
export function paywallEnabled(env = process.env) {
  return String(env.INSIDIR_PAYWALL ?? "").trim() !== "0";
}

// Owner/team accounts that may use the product without a Stripe subscription.
// Comma-separated; surrounding spaces and letter case are ignored.
export function complimentaryEmails(env = process.env) {
  return new Set(String(env.INSIDIR_COMPLIMENTARY_EMAILS || "").split(/[,\s]+/)
    .map(v => v.trim().toLowerCase()).filter(Boolean));
}

// Stripe checkout is live only when it is switched on AND fully configured.
export function billingSettings(env = process.env) {
  const secretKey = String(env.INSIDIR_STRIPE_SECRET_KEY || "").trim();
  const priceId = String(env.INSIDIR_STRIPE_PRICE_ID || "").trim();
  const webhookSecret = String(env.INSIDIR_STRIPE_WEBHOOK_SECRET || "").trim();
  const publicUrl = String(env.INSIDIR_PUBLIC_URL || "").trim();
  return Object.freeze({
    secretKey, priceId, webhookSecret, publicUrl,
    enabled: String(env.INSIDIR_BILLING_ENABLED || "").trim() === "1" && !!secretKey && !!priceId && !!webhookSecret
  });
}

/* The paid trial: a new subscriber pays a one-time fee (default $1) at checkout, uses the whole product
 * for the trial days (default 7), and the subscription then renews at the plan's price unless it is
 * cancelled first. The length is fixed on each subscription when its checkout is created (Stripe's trial_end), so
 * changing it affects new checkouts only; trials already running keep the end date they started with. One trial per account and per Stripe customer (see billing.mjs). INSIDIR_TRIAL=0
 * switches it off; days and fee are clamped so a typo cannot give the product away or overcharge. */
// The trial length the public pages, terms and emails state ("7 days for $1"). INSIDIR_TRIAL_DAYS can override it for
// checkout, but then the published copy is wrong: ops.mjs raises an alert when the two differ.
export const TRIAL_DAYS = 7;
export function trialSettings(env = process.env) {
  const days = Math.trunc(Number(env.INSIDIR_TRIAL_DAYS ?? TRIAL_DAYS));
  const feeCents = Math.trunc(Number(env.INSIDIR_TRIAL_FEE_CENTS ?? 100));
  const enabled = String(env.INSIDIR_TRIAL ?? "").trim() !== "0";
  return Object.freeze({
    enabled,
    days: Number.isFinite(days) ? Math.min(14, Math.max(1, days)) : TRIAL_DAYS,
    feeCents: Number.isFinite(feeCents) ? Math.min(3900, Math.max(50, feeCents)) : 100
  });
}

/* Outgoing email (src/email.mjs). INSIDIR_EMAIL_PROVIDER=postmark needs POSTMARK_SERVER_TOKEN and INSIDIR_EMAIL_FROM;
 * `log` prints messages for local development. Anything else: nothing is sent (messages wait in the outbox). */
export function emailSettings(env = process.env) {
  const provider = String(env.INSIDIR_EMAIL_PROVIDER || "").trim().toLowerCase();
  const from = String(env.INSIDIR_EMAIL_FROM || "").trim();
  const token = String(env.POSTMARK_SERVER_TOKEN || "").trim();
  const webhookSecret = String(env.INSIDIR_EMAIL_WEBHOOK_SECRET || "").trim();
  const publicUrl = String(env.INSIDIR_PUBLIC_URL || "").trim().replace(/\/+$/, "") || "https://insidir.com";
  const enabled = provider === "log" || (provider === "postmark" && !!token && /@/.test(from));
  return Object.freeze({ provider: enabled ? provider : "none", requested: provider || null, from: from || "Insidir <no-reply@insidir.com>",
    replyTo: String(env.INSIDIR_EMAIL_REPLY_TO || "hello@aethric.llc").trim(), token, webhookSecret, publicUrl, enabled,
    transactionalStream: String(env.POSTMARK_TRANSACTIONAL_STREAM || "outbound"), alertStream: String(env.POSTMARK_ALERT_STREAM || env.POSTMARK_TRANSACTIONAL_STREAM || "outbound") });
}


/* There is no email-verification step: nobody is asked to confirm their address before subscribing or turning on
 * alert emails. Only a complimentary address, once email is configured, needs its owner to prove it (src/paywall.mjs). */
