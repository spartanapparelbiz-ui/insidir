/* A local stand-in for Whop and Resend, for end-to-end tests only (the real ones need network access the CI sandbox
 * lacks). It implements just what the app calls, with the same shapes:
 *   GET  /elements.js              a stand-in for Whop's Elements script: window.WhopElements().checkout.create(…)
 *                                  mounts a test-mode checkout (email + "Pay $39 (test mode)") that posts to /__pay
 *                                  and then calls onComplete, as the real embedded checkout does
 *   POST /__pay                    creates an active membership for that email, sends signed `membership.activated`
 *                                  and `payment.succeeded` webhooks (the payment carries the checkout's metadata)
 *   POST /__refund                 ends a membership and sends `refund.created`
 *   GET  /api/v1/memberships, GET /api/v1/memberships/:id, POST /api/v1/memberships/:id/cancel, GET /api/v1/payments/:id
 *   POST /emails                   Resend's send endpoint: keeps the email (log-in codes) for the test to read
 *   GET  /__state, POST /__reset   test helpers
 * The app is pointed at it with WHOP_API_ORIGIN, WHOP_ELEMENTS_URL and RESEND_API_ORIGIN. */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

interface Membership { id: string; status: string; product: { id: string }; plan: { id: string }; cancel_at_period_end: boolean; manage_url: string;
  user: { id: string; email: string; name: string | null }; renewal_period_end: string; formatted_renewal_price: string; metadata: Record<string, string> }
interface Payment { id: string; membership: { id: string }; user: { id: string; email: string }; metadata: Record<string, string> }
export interface MockWhopOptions { port: number; appUrl: string; webhookSecret: string; plans: Record<string, string> /* plan id → product id */ }

export const whopUserFor = (email: string) => "user_" + createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12);

const ELEMENTS = (origin: string) => `window.WhopElements = function () {
  return { checkout: { create: function (opts) {
    return { create: function (kind, props) { return { mount: function (el) {
      var box = typeof el === "string" ? document.querySelector(el) : el;
      box.innerHTML = '<form data-mock-checkout style="display:grid;gap:12px;padding:16px"><label>Email <input name="email" type="email" required></label><button type="submit" style="min-height:44px">Pay $39 (test mode)</button></form>';
      var f = box.querySelector("form"); f.email.value = (props && props.buyerEmail) || "";
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        fetch("${origin}/__pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: opts.plan, email: f.email.value, metadata: opts.metadata || {} }) })
          .then(function (r) { return r.json(); }).then(function (r) { opts.onComplete && opts.onComplete({ result: "payment", paymentId: r.paymentId, sessionId: "chs_mock" }); });
      });
    } }; } };
  } } };
};`;

export function startMockWhop(o: MockWhopOptions): Promise<Server> {
  let memberships: Membership[] = [];
  let payments: Payment[] = [];
  const webhooks: Array<{ type: string; status: number }> = [];
  const emails: Array<{ to: string; subject: string; text: string }> = [];

  const body = (req: IncomingMessage): Promise<string> => new Promise(ok => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => ok(b)); });
  const send = (res: ServerResponse, status: number, data: unknown, type = "application/json") => {
    res.writeHead(status, { "content-type": type, "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
    res.end(typeof data === "string" ? data : JSON.stringify(data));
  };
  const webhook = async (type: string, data: unknown) => {
    const payload = JSON.stringify({ type, data, api_version: "v1" });
    const id = "msg_" + randomUUID(), ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(o.webhookSecret, "utf8")).update(`${id}.${ts}.${payload}`).digest("base64");
    const r = await fetch(`${o.appUrl}/api/billing/webhook`, { method: "POST", body: payload, headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` } });
    webhooks.push({ type, status: r.status });
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${o.port}`);
    const p = url.pathname;
    try {
      let m: RegExpMatchArray | null;
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (req.method === "GET" && p === "/elements.js") return send(res, 200, ELEMENTS(`http://localhost:${o.port}`), "text/javascript");
      if (req.method === "POST" && p === "/__pay") {
        const b = JSON.parse(await body(req)) as { plan: string; email: string; metadata: Record<string, string> };
        const product = o.plans[b.plan];
        if (!product) return send(res, 404, { error: "unknown plan" });
        const email = b.email.trim().toLowerCase();
        const user = { id: whopUserFor(email), email, name: null };
        const mem: Membership = { id: "mem_" + randomUUID().slice(0, 8), status: "active", product: { id: product }, plan: { id: b.plan }, cancel_at_period_end: false,
          manage_url: `http://localhost:${o.port}/manage`, user, renewal_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(), formatted_renewal_price: "$39.00 / month", metadata: {} };
        const pay: Payment = { id: "pay_" + randomUUID().slice(0, 8), membership: { id: mem.id }, user: { id: user.id, email }, metadata: b.metadata };
        memberships = memberships.filter(x => x.user.id !== user.id).concat(mem);
        payments.push(pay);
        await webhook("membership.activated", mem);
        await webhook("payment.succeeded", pay);
        return send(res, 200, { paymentId: pay.id, membershipId: mem.id });
      }
      if (req.method === "POST" && p === "/__refund") {
        const b = JSON.parse(await body(req)) as { email: string };
        const mem = memberships.find(x => x.user.email === b.email.toLowerCase());
        const pay = payments.find(x => x.membership.id === mem?.id);
        if (!mem || !pay) return send(res, 404, { error: "no membership" });
        mem.status = "canceled";
        await webhook("refund.created", { id: "rf_" + randomUUID().slice(0, 8), payment: { id: pay.id } });
        return send(res, 200, {});
      }
      if (req.method === "GET" && p === "/api/v1/memberships") {
        const ids = url.searchParams.getAll("user_ids[]");
        return send(res, 200, { data: memberships.filter(x => ids.includes(x.user.id)), page_info: { has_next_page: false } });
      }
      if (req.method === "GET" && (m = p.match(/^\/api\/v1\/memberships\/([^/]+)$/))) {
        const mem = memberships.find(x => x.id === decodeURIComponent(m![1]!));
        return mem ? send(res, 200, mem) : send(res, 404, { error: "not found" });
      }
      if (req.method === "POST" && (m = p.match(/^\/api\/v1\/memberships\/([^/]+)\/cancel$/))) {
        const mem = memberships.find(x => x.id === decodeURIComponent(m![1]!));
        if (!mem) return send(res, 404, { error: "not found" });
        mem.cancel_at_period_end = true;
        return send(res, 200, mem);
      }
      if (req.method === "GET" && (m = p.match(/^\/api\/v1\/payments\/([^/]+)$/))) {
        const pay = payments.find(x => x.id === decodeURIComponent(m![1]!));
        return pay ? send(res, 200, pay) : send(res, 404, { error: "not found" });
      }
      if (req.method === "POST" && p === "/emails") {
        const b = JSON.parse(await body(req)) as { to: string[]; subject: string; text: string };
        emails.push({ to: b.to[0]!, subject: b.subject, text: b.text });
        return send(res, 200, { id: "em_" + randomUUID().slice(0, 8) });
      }
      if (p === "/__state") return send(res, 200, { memberships, payments, webhooks, emails });
      if (p === "/__reset") { memberships = []; payments = []; webhooks.length = 0; emails.length = 0; return send(res, 200, {}); }
      return send(res, 404, { error: "not found", path: p });
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  return new Promise(ok => server.listen(o.port, () => ok(server)));
}
