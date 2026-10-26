/* Whop: the WHOP_ENV switch, access checks and their cache, webhook signatures (the SDK's unwrapWebhook) and what
 * every handled event does. SYNTHETIC ids and payloads; nothing here calls Whop. */
import { createHmac } from "node:crypto";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { WhopEnvironment } from "@whop/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/lib/alerts/send";
import { ACCESS_TTL_MS, createAccessChecker, STALE_ON_ERROR_MS } from "@/lib/whop/access";
import { whopConfig } from "@/lib/whop/config";
import { handleWhopEvent, type KnownUser, type WebhookDeps } from "@/lib/whop/webhooks";

describe("WHOP_ENV picks one complete environment", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const both = () => {
    vi.stubEnv("WHOP_API_KEY", "prod_key"); vi.stubEnv("WHOP_SANDBOX_API_KEY", "sbx_key");
    vi.stubEnv("WHOP_PRODUCT_PRO", "prod_live_pro"); vi.stubEnv("WHOP_SANDBOX_PRODUCT_PRO", "prod_sbx_pro");
    vi.stubEnv("WHOP_WEBHOOK_SECRET", "ws_live"); vi.stubEnv("WHOP_SANDBOX_WEBHOOK_SECRET", "ws_sbx");
    vi.stubEnv("WHOP_API_ORIGIN", ""); vi.stubEnv("WHOP_WEB_ORIGIN", ""); vi.stubEnv("WHOP_EMBED_CHECKOUT", "");
  };

  it("defaults to the sandbox, with sandbox keys, hosts and the redirect checkout", () => {
    both(); vi.stubEnv("WHOP_ENV", "");
    const c = whopConfig();
    expect(c.env).toBe("sandbox");
    expect([c.apiKey, c.products.pro, c.webhookSecret]).toEqual(["sbx_key", "prod_sbx_pro", "ws_sbx"]);
    expect(c.hosts).toEqual(WhopEnvironment.Sandbox);
    expect(c.oauthUrl).toBe("https://sandbox-api.whop.com/oauth");
    expect(c.webUrl).toBe("https://sandbox.whop.com");
    expect(c.embedCheckout).toBe(false);
  });

  it("only the exact word production goes live", () => {
    both();
    vi.stubEnv("WHOP_ENV", "Production");
    expect(whopConfig().env).toBe("sandbox");
    vi.stubEnv("WHOP_ENV", "production");
    const c = whopConfig();
    expect([c.env, c.apiKey, c.products.pro, c.webhookSecret]).toEqual(["production", "prod_key", "prod_live_pro", "ws_live"]);
    expect(c.hosts).toEqual(WhopEnvironment.Production);
    expect(c.oauthUrl).toBe("https://api.whop.com/oauth");
    expect(c.webUrl).toBe("https://whop.com");
    expect(c.embedCheckout).toBe(true);
    vi.stubEnv("WHOP_EMBED_CHECKOUT", "0");
    expect(whopConfig().embedCheckout).toBe(false);
  });
});

describe("access: users.checkAccess per product, cached 60 seconds", () => {
  const PRODUCTS = { insidir: "prod_ins", pro: "prod_pro" };
  const setup = (grants: Record<string, string[]>) => {
    let t = 1_000_000;
    const calls: string[] = [];
    let down = false;
    const checker = createAccessChecker(async (u, p) => {
      calls.push(`${u}:${p}`);
      if (down) throw new Error("Whop unreachable");
      return (grants[u] ?? []).includes(p);
    }, () => t);
    return { checker, calls, advance: (ms: number) => { t += ms; }, setDown: (v: boolean) => { down = v; } };
  };

  it("Pro gets pro, Insidir gets insidir, no product is free", async () => {
    const { checker } = setup({ user_pro: ["prod_pro"], user_ins: ["prod_ins"], user_both: ["prod_ins", "prod_pro"] });
    expect(await checker.planFor("user_pro", PRODUCTS)).toBe("pro");
    expect(await checker.planFor("user_ins", PRODUCTS)).toBe("insidir");
    expect(await checker.planFor("user_both", PRODUCTS)).toBe("pro");
    expect(await checker.planFor("user_none", PRODUCTS)).toBe("free");
    expect(await checker.planFor("", PRODUCTS)).toBe("free");
    expect(await checker.planFor("user_pro", { insidir: "", pro: "" })).toBe("free");
  });

  it("asks Whop once a minute per user and product; fresh and forget ask again", async () => {
    const { checker, calls, advance } = setup({ u: ["prod_ins"] });
    await checker.planFor("u", PRODUCTS);
    await checker.planFor("u", PRODUCTS);
    expect(calls).toHaveLength(2);
    advance(ACCESS_TTL_MS - 1);
    await checker.planFor("u", PRODUCTS);
    expect(calls).toHaveLength(2);
    advance(1);
    await checker.planFor("u", PRODUCTS);
    expect(calls).toHaveLength(4);
    await checker.planFor("u", PRODUCTS, { fresh: true });
    expect(calls).toHaveLength(6);
    checker.forget("u");
    await checker.planFor("u", PRODUCTS);
    expect(calls).toHaveLength(8);
  });

  it("concurrent requests share one call", async () => {
    const { checker, calls } = setup({ u: ["prod_pro"] });
    await Promise.all([checker.hasAccess("u", "prod_pro"), checker.hasAccess("u", "prod_pro"), checker.hasAccess("u", "prod_pro")]);
    expect(calls).toHaveLength(1);
  });

  it("a Whop outage keeps the last answer for 15 minutes, then refuses paid access", async () => {
    const { checker, advance, setDown } = setup({ u: ["prod_pro"] });
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await checker.planFor("u", PRODUCTS)).toBe("pro");
    setDown(true);
    advance(ACCESS_TTL_MS);
    expect(await checker.planFor("u", PRODUCTS)).toBe("pro");
    advance(STALE_ON_ERROR_MS);
    expect(await checker.planFor("u", PRODUCTS)).toBe("free");
    expect(await checker.planFor("never_seen", PRODUCTS)).toBe("free");
    err.mockRestore();
  });

  it("cancel at period end keeps access until Whop says it ends", async () => {
    const grants: Record<string, string[]> = { u: ["prod_ins"] };
    const { checker, advance } = setup(grants);
    expect(await checker.planFor("u", PRODUCTS)).toBe("insidir");
    // Cancelled: Whop still grants access until the period ends…
    advance(ACCESS_TTL_MS);
    expect(await checker.planFor("u", PRODUCTS)).toBe("insidir");
    // …and then stops; within a minute the app follows.
    grants.u = [];
    advance(ACCESS_TTL_MS);
    expect(await checker.planFor("u", PRODUCTS)).toBe("free");
  });
});

describe("webhook signatures: the SDK's unwrapWebhook on the raw body", () => {
  // Whop signs `${webhook-id}.${webhook-timestamp}.${raw body}` with HMAC-SHA256 keyed by the ws_ secret's own bytes
  // (docs: developer/guides/webhooks, "Verify without an SDK"). qa/e2e/mock-whop.ts signs the same way.
  const secret = "ws_0123456789abcdef0123456789abcdef";
  const body = JSON.stringify({ type: "membership.activated", data: { id: "mem_1", user_id: "user_1" } });
  const now = () => Math.floor(Date.now() / 1000);
  const headers = (b: string, o: { id?: string; ts?: number; key?: string } = {}) => {
    const id = o.id ?? "msg_1", ts = String(o.ts ?? now());
    return { "webhook-id": id, "webhook-timestamp": ts,
      "webhook-signature": "v1," + createHmac("sha256", Buffer.from(o.key ?? secret, "utf8")).update(`${id}.${ts}.${b}`).digest("base64") };
  };

  it("accepts a valid signature and returns the event", () => {
    expect(unwrapWebhook<{ type: string }>(body, { headers: headers(body), key: secret }).type).toBe("membership.activated");
  });
  it("rejects a re-serialized or tampered body, a wrong secret, a stale timestamp and missing headers", () => {
    const h = headers(body);
    expect(() => unwrapWebhook(JSON.stringify(JSON.parse(body), null, 2), { headers: h, key: secret })).toThrow();
    expect(() => unwrapWebhook(body.replace("user_1", "user_2"), { headers: h, key: secret })).toThrow();
    expect(() => unwrapWebhook(body, { headers: headers(body, { key: "ws_attacker" }), key: secret })).toThrow();
    expect(() => unwrapWebhook(body, { headers: headers(body, { ts: now() - 10 * 60 }), key: secret })).toThrow();
    expect(() => unwrapWebhook(body, { headers: { "webhook-id": "msg_1" }, key: secret })).toThrow();
    expect(() => unwrapWebhook(body, { headers: h, key: "" })).toThrow();
  });
});

describe("what each Whop event does", () => {
  const known: KnownUser = { id: "our_1", whopUserId: "user_1", email: "member@example.invalid", visitorId: "vid_1" };
  const deps = (o: Partial<WebhookDeps> = {}) => {
    const sent: Email[] = [], rechecked: string[] = [], paid: string[] = [];
    const d: WebhookDeps = {
      userByWhopId: async id => (id === known.whopUserId ? known : null),
      recheck: async id => { rechecked.push(id); return "insidir"; },
      recordPaidOnce: async (_u, mem) => { if (paid.includes(mem)) return false; paid.push(mem); return true; },
      recoveryEmailedRecently: async () => false,
      sendEmail: async e => { sent.push(e); return "sent"; },
      ownerEmail: "owner@example.invalid",
      ordersUrl: "https://sandbox.whop.com/@me/settings/orders",
      dashboardUrl: "https://sandbox.whop.com/dashboard",
      ...o,
    };
    return { d, sent, rechecked, paid };
  };
  const membership = (o: Record<string, unknown> = {}) => ({ id: "mem_1", user_id: "user_1", status: "active", product: { id: "prod_ins" },
    cancel_at_period_end: false, metadata: { customer_id: "our_1" }, ...o });

  it("membership.activated re-checks access and is safe to repeat (it fires on every renewal)", async () => {
    const { d, rechecked, paid } = deps();
    const first = await handleWhopEvent({ type: "membership.activated", data: membership() }, d);
    const renewal = await handleWhopEvent({ type: "membership.activated", data: membership() }, d);
    expect(first).toMatchObject({ status: "processed", ref: "mem_1" });
    expect(first.note).toContain("first activation");
    expect(renewal.note).not.toContain("first activation");
    expect(rechecked).toEqual(["user_1", "user_1"]);
    expect(paid).toEqual(["mem_1"]);
  });

  it("checkout metadata is compared, never used to link accounts", async () => {
    const { d } = deps();
    const out = await handleWhopEvent({ type: "membership.activated", data: membership({ metadata: { customer_id: "someone_else" } }) }, d);
    expect(out.note).toContain("is not this buyer's account");
  });

  it("membership.updated re-checks access; buyers who never signed in are left to their first sign-in", async () => {
    const { d, rechecked } = deps();
    expect((await handleWhopEvent({ type: "membership.updated", data: membership({ cancel_at_period_end: true }) }, d)).note).toContain("cancels at period end");
    expect((await handleWhopEvent({ type: "membership.updated", data: membership({ user_id: "user_unknown" }) }, d)).note).toContain("has not signed in");
    expect((await handleWhopEvent({ type: "membership.updated", data: membership({ user_id: null }) }, d)).status).toBe("ignored");
    expect(rechecked).toEqual(["user_1"]);
  });

  it("payment.failed emails the buyer the recovery_url", async () => {
    const { d, sent } = deps();
    const out = await handleWhopEvent({ type: "payment.failed", data: { id: "pay_1", user_id: "user_1", billing_reason: "subscription_cycle",
      customer_email: "buyer@example.invalid", recovery_url: "https://sandbox.whop.com/recover/pay_1", failure_message: "Insufficient funds" } }, d);
    expect(out.status).toBe("processed");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("buyer@example.invalid");
    expect(sent[0]!.text).toContain("https://sandbox.whop.com/recover/pay_1");
    expect(sent[0]!.text).toContain("Insufficient funds");
    expect(sent[0]!.unsubscribe).toBeUndefined();
  });

  it("payment.failed without a recovery_url sends the Whop orders link; checkout declines send nothing", async () => {
    const { d, sent } = deps();
    await handleWhopEvent({ type: "payment.failed", data: { id: "pay_2", user_id: "user_1", billing_reason: "subscription_cycle", recovery_url: null } }, d);
    expect(sent[0]!.to).toBe(known.email);
    expect(sent[0]!.text).toContain("https://sandbox.whop.com/@me/settings/orders");
    const declined = await handleWhopEvent({ type: "payment.failed", data: { id: "pay_3", user_id: "user_1", billing_reason: "subscription_create" } }, d);
    expect(declined.status).toBe("ignored");
    expect(sent).toHaveLength(1);
  });

  it("payment.failed emails once a day per payment, and a failed send is retried", async () => {
    const already = deps({ recoveryEmailedRecently: async () => true });
    await handleWhopEvent({ type: "payment.failed", data: { id: "pay_1", user_id: "user_1", recovery_url: "https://x.invalid/r" } }, already.d);
    expect(already.sent).toHaveLength(0);
    const broken = deps({ sendEmail: async () => "failed" });
    await expect(handleWhopEvent({ type: "payment.failed", data: { id: "pay_1", user_id: "user_1", recovery_url: "https://x.invalid/r" } }, broken.d)).rejects.toThrow();
  });

  it("refund.created re-checks the buyer's access", async () => {
    const { d, rechecked } = deps();
    const out = await handleWhopEvent({ type: "refund.created", data: { id: "rfnd_1", amount: 39, currency: "usd", payment: { id: "pay_1", user: { id: "user_1" } } } }, d);
    expect(out.note).toContain("refund 39.00 USD for pay_1");
    expect(rechecked).toEqual(["user_1"]);
  });

  it("dispute.created emails the owner at once; with no owner address or a failed send it is retried", async () => {
    const { d, sent } = deps();
    const data = { id: "dspt_1", amount: 99, currency: "usd", reason: "fraudulent", status: "needs_response", evidence_due_at: "2026-11-09T00:00:00Z",
      payment: { id: "pay_9" }, buyer: { email: "buyer@example.invalid", username: "buyer", user_id: "user_1" } };
    await handleWhopEvent({ type: "dispute.created", data }, d);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("owner@example.invalid");
    expect(sent[0]!.subject).toContain("99.00 USD");
    expect(sent[0]!.text).toContain("fraudulent");
    expect(sent[0]!.text).toContain("2026-11-09");
    await expect(handleWhopEvent({ type: "dispute.created", data }, deps({ ownerEmail: null }).d)).rejects.toThrow(/WHOP_ALERT_EMAIL/);
    await expect(handleWhopEvent({ type: "dispute.created", data }, deps({ sendEmail: async () => "failed" }).d)).rejects.toThrow();
  });

  it("other events are logged and ignored", async () => {
    const { d, sent, rechecked } = deps();
    expect((await handleWhopEvent({ type: "payment.succeeded", data: { id: "pay_1" } }, d)).status).toBe("ignored");
    expect(sent).toHaveLength(0);
    expect(rechecked).toHaveLength(0);
  });
});
