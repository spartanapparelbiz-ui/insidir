/* Shared settings for the end-to-end run: ports, the e2e database and the server environment. Test values only. */
import { join } from "node:path";

export const APP_PORT = 3100, WHOP_PORT = 4010, PUSH_PORT = 4011;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const OUT = join(__dirname, ".out");
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://insidir:insidir@localhost:5432/terminal_e2e";
export const WHOP = { secret: "ws_e2e_webhook_secret", plans: { plan_e2e_insidir: "prod_e2e_insidir", plan_e2e_pro: "prod_e2e_pro" } };
/** Generated for this test run only (web-push generate-vapid-keys); never used anywhere real. */
export const VAPID = { publicKey: "BEvcSaND_TK1vkzoYIlv6Mm0xs1Okb9kM5N7EJ5iqFHMw1LQNAeUrgn9WqmfIe5B-jbos2NG1jaDxxna3jDXLGU", privateKey: "5Hkd0NVAqGPETGUr2UkxCDiLAXbhoKYmFdvYRpHNSrA" };

export const SERVER_ENV: Record<string, string> = {
  DATABASE_URL: E2E_DB,
  APP_URL,
  WHOP_API_ORIGIN: `http://localhost:${WHOP_PORT}`,
  WHOP_CHECKOUT_ORIGIN: `http://localhost:${WHOP_PORT}`,
  WHOP_CLIENT_ID: "app_e2e",
  WHOP_API_KEY: "key_e2e",
  WHOP_COMPANY_ID: "biz_e2e",
  WHOP_PLAN_INSIDIR: "plan_e2e_insidir",
  WHOP_PLAN_PRO: "plan_e2e_pro",
  WHOP_PRODUCT_INSIDIR: "prod_e2e_insidir",
  WHOP_PRODUCT_PRO: "prod_e2e_pro",
  WHOP_WEBHOOK_SECRET: WHOP.secret,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
  VAPID_SUBJECT: "mailto:qa@insidir.com",
  EMAIL_UNSUBSCRIBE_SECRET: "e2e-unsubscribe-secret-0123456789abcdef",
  ADMIN_TOKEN: "e2e-admin-token-0123456789abcdefghijklmnop",
  ADMIN_TOTP_SECRET: "JBSWY3DPEHPK3PXP",
  // The stand-in push service's self-signed certificate (made by run.sh), so "Send test alert" can reach it.
  NODE_EXTRA_CA_CERTS: join(OUT, "push-cert.pem"),
};
