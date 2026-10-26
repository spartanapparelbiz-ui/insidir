/* A local stand-in for Whop's SANDBOX, for end-to-end tests only. CI has no Whop account and no network, so it
 * answers exactly the requests the app makes through @whop/sdk and the OAuth endpoints, with the documented shapes,
 * and signs its webhooks the documented way (HMAC-SHA256 over `id.timestamp.body` keyed by the ws_ secret).
 *
 *   OAuth      GET /oauth/authorize (consent already given), POST /oauth/token, GET /oauth/userinfo, POST /oauth/revoke
 *   API        GET  /api/v1/users/:id/access/:resource          users.checkAccess
 *              GET  /api/v1/memberships                         memberships.list (user_id, product_ids, statuses)
 *              POST /api/v1/memberships/:id/cancel              memberships.cancel
 *              POST /api/v1/checkout_configurations             checkoutConfigurations.create → purchase_url
 *   Checkout   GET /checkout/:ch, POST /checkout/:ch/pay        a test-mode checkout with the sandbox test cards:
 *              4242 4242 4242 4242 pays, 4000 0000 0000 0002 is declined. Paying creates the membership, sends
 *              signed membership.activated + payment.succeeded webhooks, then redirects to the configuration's
 *              redirect_url, like Whop does.
 *   Email      POST /emails                                     a Resend-compatible inbox (EMAIL_API_URL)
 *   Helpers    POST /__login {user}       who the next OAuth sign-in is
 *              POST /__membership {…}     add a membership (seeded users)
 *              POST /__end/:mem           the paid period ended: status canceled, access ends
 *              POST /__webhook {type, data, id?, badSignature?}   deliver any signed event, returns the app's answer
 *              GET /__state, POST /__reset
 * The app is pointed here with WHOP_API_ORIGIN, WHOP_WEB_ORIGIN and EMAIL_API_URL (qa/e2e/env.ts). */
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface MockUser { sub: string; email: string; name: string; preferred_username: string }
export const MOCK_USER: MockUser = { sub: "user_e2e_buyer", email: "buyer@example.test", name: "E2E Buyer", preferred_username: "e2ebuyer" };

export interface Membership {
  id: string; status: string; user_id: string; product_id: string; product: { id: string }; plan_id: string;
  cancel_at_period_end: boolean; current_period_end: string; metadata: Record<string, unknown>; manage_url: string | null;
}
interface CheckoutConfig { id: string; plan_id: string; metadata: Record<string, unknown>; redirect_url: string; affiliate_code: string | null; purchase_url: string }
export interface Delivery { id: string; type: string; status: number; body: string }

export interface MockWhopOptions { port: number; appUrl: string; webhookSecret: string; plans: Record<string, string> /* plan id → product id */ }

export const TEST_CARDS = { ok: "4242424242424242", declined: "4000000000000002" };

export function startMockWhop(o: MockWhopOptions): Promise<Server> {
  const origin = `http://localhost:${o.port}`;
  let memberships: Membership[] = [];
  let configs: CheckoutConfig[] = [];
  let deliveries: Delivery[] = [];
  let emails: Array<Record<string, unknown>> = [];
  let accessCalls = 0;
  let user: MockUser = MOCK_USER;
  const codes = new Map<string, MockUser>();
  const tokens = new Map<string, MockUser>();

  const read = (req: IncomingMessage): Promise<string> => new Promise(ok => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => ok(b)); });
  const send = (res: ServerResponse, status: number, data: unknown, type = "application/json") => {
    res.writeHead(status, { "content-type": type });
    res.end(typeof data === "string" ? data : JSON.stringify(data));
  };
  const sign = (id: string, ts: string, payload: string, key: string) => createHmac("sha256", Buffer.from(key, "utf8")).update(`${id}.${ts}.${payload}`).digest("base64");
  const webhook = async (type: string, data: unknown, opts: { id?: string; badSignature?: boolean } = {}): Promise<Delivery> => {
    const id = opts.id ?? "msg_" + randomUUID().replace(/-/g, "").slice(0, 24);
    const payload = JSON.stringify({ id, type, api_version: "v1", timestamp: new Date().toISOString(), account_id: "biz_e2e", data });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(id, ts, payload, opts.badSignature ? "ws_not_the_secret" : o.webhookSecret);
    const r = await fetch(`${o.appUrl}/api/webhooks/whop`, { method: "POST", body: payload,
      headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` } });
    const d = { id, type, status: r.status, body: await r.text() };
    deliveries.push(d);
    return d;
  };
  /** Every value of a query array, however it is spelled: k=a&k=b, k[]=a, k[0]=a. */
  const many = (q: URLSearchParams, k: string): string[] => [...q.entries()].filter(([key]) => key === k || key.startsWith(k + "[")).map(([, v]) => v);
  const grants = (m: Membership) => ["active", "trialing", "past_due"].includes(m.status);
  const page = (data: unknown[]) => ({ data, page_info: { has_next_page: false, has_previous_page: false, start_cursor: null, end_cursor: null } });

  const checkoutPage = (c: CheckoutConfig, error = "") => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Whop sandbox checkout (test)</title></head>
<body style="background:#fff;color:#111;font-family:sans-serif;padding:24px"><h1>Checkout: ${c.plan_id}</h1><p>Sandbox. Use a test card.</p>
${error ? `<p role="alert" style="color:#b00">${error}</p>` : ""}
<form method="post" action="/checkout/${c.id}/pay"><label>Card number <input name="card" autocomplete="off" inputmode="numeric" style="min-height:44px"></label>
<button type="submit" style="min-height:44px">Pay</button></form></body></html>`;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", origin);
    const p = url.pathname;
    try {
      let m: RegExpMatchArray | null;
      // ---- OAuth
      if (req.method === "GET" && p === "/oauth/authorize") {
        const code = "code_" + randomUUID().slice(0, 8);
        codes.set(code, user);
        const back = new URL(url.searchParams.get("redirect_uri") ?? "");
        back.searchParams.set("code", code);
        back.searchParams.set("state", url.searchParams.get("state") ?? "");
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      if (req.method === "POST" && p === "/oauth/token") {
        const b = JSON.parse(await read(req)) as { code?: string; code_verifier?: string };
        const who = b.code ? codes.get(b.code) : undefined;
        if (!who || !b.code_verifier) return send(res, 400, { error: "invalid_grant" });
        codes.delete(b.code!);
        const at = "at_" + randomUUID();
        tokens.set(at, who);
        return send(res, 200, { access_token: at, refresh_token: "rt_" + randomUUID(), token_type: "Bearer", expires_in: 3600 });
      }
      if (req.method === "GET" && p === "/oauth/userinfo") {
        const who = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
        return who ? send(res, 200, who) : send(res, 401, { error: "invalid_token" });
      }
      if (req.method === "POST" && p === "/oauth/revoke") return send(res, 200, {});

      // ---- REST API (what @whop/sdk calls)
      if (req.method === "GET" && (m = p.match(/^\/api\/v1\/users\/([^/]+)\/access\/([^/]+)$/))) {
        accessCalls++;
        const [uid, resource] = [decodeURIComponent(m[1]!), decodeURIComponent(m[2]!)];
        const has = memberships.some(x => x.user_id === uid && x.product_id === resource && grants(x));
        return send(res, 200, { has_access: has, access_level: has ? "customer" : "no_access" });
      }
      if (req.method === "GET" && p === "/api/v1/memberships") {
        const q = url.searchParams;
        const uid = q.get("user_id"), products = many(q, "product_ids"), statuses = many(q, "statuses");
        return send(res, 200, page(memberships.filter(x => (!uid || x.user_id === uid) && (!products.length || products.includes(x.product_id))
          && (!statuses.length || statuses.includes(x.status)))));
      }
      if (req.method === "POST" && (m = p.match(/^\/api\/v1\/memberships\/([^/]+)\/cancel$/))) {
        const mem = memberships.find(x => x.id === decodeURIComponent(m![1]!));
        if (!mem) return send(res, 404, { error: { type: "not_found", message: "membership not found" } });
        const b = JSON.parse((await read(req)) || "{}") as { cancel_at_period_end?: boolean };
        if (b.cancel_at_period_end) mem.cancel_at_period_end = true; else mem.status = "canceled";
        await webhook("membership.updated", mem);
        return send(res, 200, mem);
      }
      if (req.method === "POST" && p === "/api/v1/checkout_configurations") {
        const b = JSON.parse(await read(req)) as { plan_id?: string; metadata?: Record<string, unknown>; redirect_url?: string; affiliate_code?: string };
        if (!b.plan_id || !o.plans[b.plan_id]) return send(res, 400, { error: { type: "invalid_request", message: "unknown plan_id" } });
        const id = "ch_" + randomUUID().replace(/-/g, "").slice(0, 16);
        const c: CheckoutConfig = { id, plan_id: b.plan_id, metadata: b.metadata ?? {}, redirect_url: b.redirect_url ?? "", affiliate_code: b.affiliate_code ?? null, purchase_url: `${origin}/checkout/${id}` };
        configs.push(c);
        return send(res, 201, { ...c, account_id: "biz_e2e", mode: "payment", created_at: new Date().toISOString() });
      }

      // ---- hosted checkout (test mode)
      if ((m = p.match(/^\/checkout\/(ch_[^/]+)(\/pay)?$/))) {
        const c = configs.find(x => x.id === m![1]);
        if (!c) return send(res, 404, "no such checkout", "text/plain");
        if (req.method === "GET" && !m[2]) return send(res, 200, checkoutPage(c), "text/html");
        const card = (new URLSearchParams(await read(req)).get("card") ?? "").replace(/\D/g, "");
        if (card !== TEST_CARDS.ok) {
          await webhook("payment.failed", { id: "pay_" + randomUUID().slice(0, 8), user_id: user.sub, billing_reason: "subscription_create", recovery_url: null,
            failure_message: "Your card was declined.", customer_email: user.email });
          return send(res, 402, checkoutPage(c, "Your card was declined."), "text/html");
        }
        const product = o.plans[c.plan_id]!;
        const mem: Membership = { id: "mem_" + randomUUID().slice(0, 8), status: "active", user_id: user.sub, product_id: product, product: { id: product }, plan_id: c.plan_id,
          cancel_at_period_end: false, current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(), metadata: c.metadata, manage_url: null };
        memberships.push(mem);
        await webhook("membership.activated", mem);
        await webhook("payment.succeeded", { id: "pay_" + randomUUID().slice(0, 8), user_id: user.sub, membership_id: mem.id, metadata: c.metadata });
        res.writeHead(303, { location: c.redirect_url });
        return res.end();
      }

      // ---- Resend-compatible inbox
      if (req.method === "POST" && p === "/emails") { emails.push(JSON.parse(await read(req)) as Record<string, unknown>); return send(res, 200, { id: "email_" + emails.length }); }

      // ---- test helpers
      if (req.method === "POST" && p === "/__login") { user = { ...MOCK_USER, ...(JSON.parse(await read(req)) as Partial<MockUser>) }; return send(res, 200, user); }
      if (req.method === "POST" && p === "/__membership") {
        const b = JSON.parse(await read(req)) as Partial<Membership> & { user_id: string; product_id: string };
        const mem: Membership = { id: "mem_" + randomUUID().slice(0, 8), status: "active", plan_id: "plan_seed", cancel_at_period_end: false,
          current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(), metadata: {}, manage_url: null, ...b, product: { id: b.product_id } };
        memberships.push(mem);
        return send(res, 200, mem);
      }
      if (req.method === "POST" && (m = p.match(/^\/__end\/([^/]+)$/))) {
        const mem = memberships.find(x => x.id === m![1]);
        if (!mem) return send(res, 404, {});
        mem.status = "canceled";
        await webhook("membership.updated", mem);
        return send(res, 200, mem);
      }
      if (req.method === "POST" && p === "/__webhook") {
        const b = JSON.parse(await read(req)) as { type: string; data: unknown; id?: string; badSignature?: boolean };
        return send(res, 200, await webhook(b.type, b.data, b));
      }
      if (p === "/__state") return send(res, 200, { memberships, configs, deliveries, emails, accessCalls, user });
      if (p === "/__reset") {
        const keep = (JSON.parse((await read(req)) || "{}") as { keepSeeded?: boolean }).keepSeeded;
        memberships = keep ? memberships.filter(x => x.plan_id === "plan_seed") : [];
        configs = []; deliveries = []; emails = []; accessCalls = 0; user = MOCK_USER;
        return send(res, 200, {});
      }
      return send(res, 404, { error: { type: "not_found", message: p } });
    } catch (e) {
      return send(res, 500, { error: { type: "mock_error", message: e instanceof Error ? e.message : String(e) } });
    }
  });
  return new Promise(ok => server.listen(o.port, () => ok(server)));
}
