/* Which Whop the app talks to. One variable flips everything: WHOP_ENV=sandbox|production.
 *
 * Each environment has its own complete set of credentials and IDs, so both can sit in Railway side by side:
 *
 *   production (WHOP_ENV=production)        sandbox (anything else, the default)
 *   WHOP_API_KEY                            WHOP_SANDBOX_API_KEY            account API key, server only
 *   WHOP_COMPANY_ID                         WHOP_SANDBOX_COMPANY_ID         biz_…
 *   WHOP_CLIENT_ID, WHOP_CLIENT_SECRET      WHOP_SANDBOX_CLIENT_ID, …       OAuth app (app_…)
 *   WHOP_WEBHOOK_SECRET                     WHOP_SANDBOX_WEBHOOK_SECRET     ws_… for /api/billing/webhook
 *   WHOP_PRODUCT_INSIDIR, WHOP_PRODUCT_PRO  WHOP_SANDBOX_PRODUCT_…          prod_… that grant each plan
 *   WHOP_PLAN_INSIDIR, WHOP_PLAN_PRO        WHOP_SANDBOX_PLAN_…             plan_… sold at checkout
 *
 * Anything but exactly "production" is the sandbox, so a missing or mistyped WHOP_ENV never touches real money.
 * Hosts come from the SDK's WhopEnvironment (docs.whop.com/developer/guides/sandbox).
 *
 * Test only: WHOP_API_ORIGIN and WHOP_WEB_ORIGIN point the app at the local mock Whop (qa/e2e/mock-whop.ts). */
import { WhopEnvironment, type WhopEnvironmentUrls } from "@whop/sdk";

export type WhopEnv = "sandbox" | "production";

export interface WhopConfig {
  env: WhopEnv;
  apiKey: string;
  companyId: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  products: { insidir: string; pro: string };
  plans: { insidir: string; pro: string };
  /** What the SDK calls (its `environment` option). */
  hosts: WhopEnvironmentUrls;
  /** OAuth 2.1 endpoints: authorize, token, userinfo, revoke. */
  oauthUrl: string;
  /** Whop's website: orders, the hosted checkout. */
  webUrl: string;
  /** Whether /pricing embeds the Checkout element (else it sends buyers to a checkout configuration's purchase_url). */
  embedCheckout: boolean;
}

const trim = (s: string): string => s.replace(/\/+$/, "");

export const whopEnv = (): WhopEnv => (process.env.WHOP_ENV === "production" ? "production" : "sandbox");

export function whopConfig(): WhopConfig {
  const env = whopEnv();
  const v = (name: string): string => process.env[env === "production" ? `WHOP_${name}` : `WHOP_SANDBOX_${name}`] ?? "";
  const mock = process.env.WHOP_API_ORIGIN ? trim(process.env.WHOP_API_ORIGIN) : "";
  const hosts: WhopEnvironmentUrls = mock ? { api: `${mock}/api/v1`, vault: `${mock}/vault/api/v1` }
    : env === "production" ? WhopEnvironment.Production : WhopEnvironment.Sandbox;
  // OAuth lives beside the REST API on the same host: api.whop.com/oauth (documented) and sandbox-api.whop.com/oauth.
  const oauthUrl = new URL(hosts.api).origin + "/oauth";
  const webUrl = process.env.WHOP_WEB_ORIGIN ? trim(process.env.WHOP_WEB_ORIGIN) : env === "production" ? "https://whop.com" : "https://sandbox.whop.com";
  // Whop Elements has no sandbox yet (docs: "The sandbox environment isn't available for Whop Elements yet"), so the
  // sandbox defaults to the checkout-configuration redirect. WHOP_EMBED_CHECKOUT=1|0 overrides either way.
  const embed = process.env.WHOP_EMBED_CHECKOUT;
  return {
    env, apiKey: v("API_KEY"), companyId: v("COMPANY_ID"), clientId: v("CLIENT_ID"), clientSecret: v("CLIENT_SECRET"), webhookSecret: v("WEBHOOK_SECRET"),
    products: { insidir: v("PRODUCT_INSIDIR"), pro: v("PRODUCT_PRO") },
    plans: { insidir: v("PLAN_INSIDIR"), pro: v("PLAN_PRO") },
    hosts, oauthUrl, webUrl,
    embedCheckout: embed === "1" ? true : embed === "0" ? false : env === "production",
  };
}

export const appUrl = (): string => trim(process.env.APP_URL || "http://localhost:3000");

/** Where a member updates their card, sees invoices or cancels (docs: supported-business-models/saas). */
export const ordersUrl = (): string => `${whopConfig().webUrl}/@me/settings/orders`;
