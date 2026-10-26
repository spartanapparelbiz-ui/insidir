/* Shared settings for the end-to-end run: ports, the e2e database and the server environment. Test values only. */
import { join } from "node:path";

export const APP_PORT = 3100, WHOP_PORT = 4010, PUSH_PORT = 4011;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const OUT = join(__dirname, ".out");
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://insidir:insidir@localhost:5432/terminal_e2e";
export const WHOP = {
  secret: "ws_e2e_webhook_secret",
  plans: { plan_e2e_insidir: "prod_e2e_insidir", plan_e2e_pro: "prod_e2e_pro" },
  products: { insidir: "prod_e2e_insidir", pro: "prod_e2e_pro" },
};
export const OWNER_EMAIL = "owner@example.test";
/** Generated for this test run only (web-push generate-vapid-keys); never used anywhere real. */
export const VAPID = { publicKey: "BEvcSaND_TK1vkzoYIlv6Mm0xs1Okb9kM5N7EJ5iqFHMw1LQNAeUrgn9WqmfIe5B-jbos2NG1jaDxxna3jDXLGU", privateKey: "5Hkd0NVAqGPETGUr2UkxCDiLAXbhoKYmFdvYRpHNSrA" };

export const SERVER_ENV: Record<string, string> = {
  DATABASE_URL: E2E_DB,
  APP_URL,
  // The sandbox set (WHOP_ENV unset = sandbox), pointed at the local mock of Whop's sandbox.
  WHOP_ENV: "sandbox",
  WHOP_API_ORIGIN: `http://localhost:${WHOP_PORT}`,
  WHOP_WEB_ORIGIN: `http://localhost:${WHOP_PORT}`,
  WHOP_EMBED_CHECKOUT: "0",
  WHOP_SANDBOX_CLIENT_ID: "app_e2e",
  WHOP_SANDBOX_API_KEY: "apik_e2e",
  WHOP_SANDBOX_COMPANY_ID: "biz_e2e",
  WHOP_SANDBOX_PLAN_INSIDIR: "plan_e2e_insidir",
  WHOP_SANDBOX_PLAN_PRO: "plan_e2e_pro",
  WHOP_SANDBOX_PRODUCT_INSIDIR: "prod_e2e_insidir",
  WHOP_SANDBOX_PRODUCT_PRO: "prod_e2e_pro",
  WHOP_SANDBOX_WEBHOOK_SECRET: WHOP.secret,
  WHOP_ALERT_EMAIL: OWNER_EMAIL,
  WHOP_AFFILIATES_ENABLED: "1",
  // Billing emails land in the mock's inbox.
  RESEND_API_KEY: "re_e2e",
  EMAIL_FROM: "Insidir <qa@insidir.test>",
  EMAIL_API_URL: `http://localhost:${WHOP_PORT}/emails`,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
  VAPID_SUBJECT: "mailto:qa@insidir.com",
  EMAIL_UNSUBSCRIBE_SECRET: "e2e-unsubscribe-secret-0123456789abcdef",
  ADMIN_TOKEN: "e2e-admin-token-0123456789abcdefghijklmnop",
  ADMIN_TOTP_SECRET: "JBSWY3DPEHPK3PXP",
};
