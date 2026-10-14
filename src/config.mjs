export const config = Object.freeze({
  port: Number(process.env.PORT || 8080),
  databaseUrl: process.env.DATABASE_URL || "",
  userAgent: process.env.SEC_USER_AGENT || "",
  ingestSecret: process.env.INGEST_SECRET || "",
  autoIngest: process.env.AUTO_INGEST === "1",
  allowSignup: process.env.ALLOW_SIGNUP === "1",
  cookieSecure: process.env.COOKIE_SECURE !== "0",
  origins: new Set((process.env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean)),
  maxPerRun: Math.min(100, Math.max(1, Number(process.env.SEC_MAX_FILINGS_PER_RUN || 35))),
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
