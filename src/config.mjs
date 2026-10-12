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
