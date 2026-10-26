/* A local stand-in for Whop, for end-to-end tests only (Whop's test mode needs network access the CI sandbox lacks).
 * It implements just what the app calls, with the same shapes:
 *   GET  /checkout/:plan          a test-mode checkout page with one "Pay (test mode)" button
 *   POST /checkout/:plan/pay      creates an active membership, sends signed `membership.activated` and
 *                                 `payment.succeeded` webhooks to the app, then redirects to the product's
 *                                 "redirect after purchase" (/auth/login?next=/terminal), like Whop does
 *   GET  /oauth/authorize         approves at once and redirects back with a code (consent already given)
 *   POST /oauth/token, GET /oauth/userinfo, POST /oauth/revoke
 *   GET  /api/v1/memberships, POST /api/v1/memberships/:id/cancel
 *   GET  /__state, POST /__reset  test helpers
 * The app is pointed at it with WHOP_API_ORIGIN and WHOP_CHECKOUT_ORIGIN. */
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export const MOCK_USER = { sub: "user_e2e_buyer", email: "buyer@example.test", name: "E2E Buyer", preferred_username: "e2ebuyer" };

interface Membership { id: string; status: string; product: { id: string }; plan: { id: string }; cancel_at_period_end: boolean; manage_url: string; user: { id: string };
  renewal_period_end: string; formatted_renewal_price: string }
/** What the mock charges per plan, as Whop formats it. */
const PRICE: Record<string, string> = { plan_e2e_insidir: "$39.00 / month", plan_e2e_pro: "$99.00 / month" };
export interface MockWhopOptions { port: number; appUrl: string; webhookSecret: string; plans: Record<string, string> /* plan id → product id */ }

export function startMockWhop(o: MockWhopOptions): Promise<Server> {
  let memberships: Membership[] = [];
  const webhooks: Array<{ type: string; status: number }> = [];
  const codes = new Map<string, string>();

  const body = (req: IncomingMessage): Promise<string> => new Promise(ok => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => ok(b)); });
  const send = (res: ServerResponse, status: number, data: unknown, type = "application/json") => {
    res.writeHead(status, { "content-type": type });
    res.end(typeof data === "string" ? data : JSON.stringify(data));
  };
  const webhook = async (type: string, data: unknown) => {
    const payload = JSON.stringify({ type, data, api_version: "v1" });
    const id = "msg_" + randomUUID(), ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(o.webhookSecret, "utf8")).update(`${id}.${ts}.${payload}`).digest("base64");
    const r = await fetch(`${o.appUrl}/api/whop/webhook`, { method: "POST", body: payload, headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` } });
    webhooks.push({ type, status: r.status });
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${o.port}`);
    const p = url.pathname;
    try {
      let m: RegExpMatchArray | null;
      if (req.method === "GET" && (m = p.match(/^\/checkout\/([^/]+)$/))) {
        const plan = decodeURIComponent(m[1]!);
        return send(res, 200, `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Whop checkout (test mode)</title></head>
<body style="background:#fff;font-family:sans-serif;padding:24px"><h1>Checkout: ${plan}</h1><p>Test mode. No card is charged.</p>
<form method="post" action="/checkout/${encodeURIComponent(plan)}/pay"><button type="submit" style="min-height:44px">Pay (test mode)</button></form></body></html>`, "text/html");
      }
      if (req.method === "POST" && (m = p.match(/^\/checkout\/([^/]+)\/pay$/))) {
        const plan = decodeURIComponent(m[1]!);
        const product = o.plans[plan];
        if (!product) return send(res, 404, { error: "unknown plan" });
        const mem: Membership = { id: "mem_" + randomUUID().slice(0, 8), status: "active", product: { id: product }, plan: { id: plan }, cancel_at_period_end: false, manage_url: `http://localhost:${o.port}/manage`, user: { id: MOCK_USER.sub },
          renewal_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(), formatted_renewal_price: PRICE[plan] ?? "$39.00 / month" };
        memberships = memberships.filter(x => x.user.id !== MOCK_USER.sub).concat(mem);
        await webhook("membership.activated", mem);
        await webhook("payment.succeeded", { id: "pay_" + randomUUID().slice(0, 8), user: { id: MOCK_USER.sub }, membership: { id: mem.id } });
        res.writeHead(303, { location: `${o.appUrl}/auth/login?next=/terminal` });
        return res.end();
      }
      if (req.method === "GET" && p === "/oauth/authorize") {
        const code = "code_" + randomUUID().slice(0, 8);
        codes.set(code, url.searchParams.get("code_challenge") ?? "");
        const back = new URL(url.searchParams.get("redirect_uri") ?? "");
        back.searchParams.set("code", code);
        back.searchParams.set("state", url.searchParams.get("state") ?? "");
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      if (req.method === "POST" && p === "/oauth/token") {
        const b = JSON.parse(await body(req)) as { code?: string; code_verifier?: string };
        if (!b.code || !codes.has(b.code) || !b.code_verifier) return send(res, 400, { error: "invalid_grant" });
        codes.delete(b.code);
        return send(res, 200, { access_token: "at_" + randomUUID(), refresh_token: "rt_" + randomUUID(), token_type: "Bearer", expires_in: 3600 });
      }
      if (req.method === "GET" && p === "/oauth/userinfo") return send(res, 200, MOCK_USER);
      if (req.method === "POST" && p === "/oauth/revoke") return send(res, 200, {});
      if (req.method === "GET" && p === "/api/v1/memberships") {
        const ids = url.searchParams.getAll("user_ids[]");
        return send(res, 200, { data: memberships.filter(x => ids.includes(x.user.id)), page_info: { has_next_page: false } });
      }
      if (req.method === "POST" && (m = p.match(/^\/api\/v1\/memberships\/([^/]+)\/cancel$/))) {
        const mem = memberships.find(x => x.id === decodeURIComponent(m![1]!));
        if (!mem) return send(res, 404, { error: "not found" });
        mem.cancel_at_period_end = true;
        return send(res, 200, mem);
      }
      if (p === "/__state") return send(res, 200, { memberships, webhooks });
      if (p === "/__reset") { memberships = []; webhooks.length = 0; return send(res, 200, {}); }
      return send(res, 404, { error: "not found", path: p });
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  return new Promise(ok => server.listen(o.port, () => ok(server)));
}
