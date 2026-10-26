/* Web push end to end, minus Google's/Apple's push servers (unreachable here):
 *   1. A Pro member taps "Turn on alerts" on the Alerts page. The browser's PushManager is replaced by a stand-in
 *      whose endpoint is our local push service and whose keys we hold, so the real flow runs: permission → service
 *      worker → subscription → POST /api/push/subscribe.
 *   2. The real worker runs its alert job and sends a VAPID-signed, encrypted push to that endpoint.
 *   3. We decrypt it with the subscription's private key and check the deal and the text.
 *   4. We deliver that exact payload to the real service worker (Chrome DevTools Protocol) and check the
 *      notification it shows. Then opening the alert link records alert_opened and lands on the deal.
 * The iPhone part (Home Screen install, permission prompt, lock-screen banner) is a manual checklist in the QA report. */
import { spawn } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { APP_URL, E2E_DB, OUT, PUSH_PORT, VAPID } from "./env";
import { dealId, q, signIn } from "./helpers";
import { E2E_USERS } from "./seed";

// http_ece ships with web-push and has no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece") as { decrypt(buf: Buffer, p: { version: string; privateKey: ReturnType<typeof createECDH>; authSecret: Buffer }): Buffer };

const b64u = (b: Buffer) => b.toString("base64url");

function runWorker(ms: number): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn("npx", ["tsx", "worker/index.ts"], {
      env: { ...process.env, DATABASE_URL: E2E_DB, APP_URL, NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey, VAPID_SUBJECT: "mailto:qa@insidir.com",
        NODE_EXTRA_CA_CERTS: join(OUT, "push-cert.pem"), WORKER_RUN_FOR_MS: String(ms), ALERT_MS: "1000", SWEEP_MS: "3600000", SCAN_MS: "3600000", FULL_SCAN_MS: "3600000",
        WHALE_MS: "3600000", SETTLE_MS: "3600000", KALSHI_API_URL: "http://127.0.0.1:9", POLYMARKET_GAMMA_URL: "http://127.0.0.1:9", POLYMARKET_CLOB_URL: "http://127.0.0.1:9",
        POLYMARKET_DATA_URL: "http://127.0.0.1:9", POLYMARKET_US_ENABLED: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    p.stdout.on("data", d => (log += d)); p.stderr.on("data", d => (log += d));
    p.on("exit", () => ok(log)); p.on("error", fail);
  });
}

test("push: subscribe from a tap, worker sends a real encrypted alert, service worker shows it", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  const pro = E2E_USERS.pro!;
  await q("delete from terminal.alerts_sent where user_id = $1", [pro.id]);
  await q("delete from terminal.push_subscriptions where user_id = $1", [pro.id]);
  await q("update terminal.users set settings = settings || '{\"alertPush\": false}'::jsonb where id = $1", [pro.id]);
  const before = (JSON.parse(readFileSync(join(OUT, "pushes.json"), "utf8")) as unknown[]).length;

  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const auth = randomBytes(16);
  const endpoint = `https://localhost:${PUSH_PORT}/push/e2e-${page.viewportSize()!.width}`;
  await context.grantPermissions(["notifications"], { origin: APP_URL });
  await context.addInitScript(({ endpoint, p256dh, auth }) => {
    const fake = { endpoint, expirationTime: null, options: {}, getKey: () => null, toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh, auth } }), unsubscribe: async () => true };
    let current: typeof fake | null = null;
    PushManager.prototype.subscribe = async function () { current = fake; return fake as unknown as PushSubscription; };
    PushManager.prototype.getSubscription = async function () { return current as unknown as PushSubscription | null; };
  }, { endpoint, p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) });

  await signIn(context, "pro");
  await page.goto("/alerts");
  await page.getByRole("button", { name: "Turn on alerts" }).click();
  await expect(page.getByRole("button", { name: "Turn off alerts on this device" })).toBeVisible();
  const subs = await q<{ endpoint: string }>("select endpoint from terminal.push_subscriptions where user_id = $1", [pro.id]);
  expect(subs.map(s => s.endpoint)).toEqual([endpoint]);

  try {
    const log = await runWorker(12_000);
    const pushes = JSON.parse(readFileSync(join(OUT, "pushes.json"), "utf8")) as Array<{ path: string; headers: Record<string, string>; body: string }>;
    const mine = pushes.slice(before).filter(p => endpoint.endsWith(p.path));
    expect(mine.length, log).toBe(1);
    const got = mine[0]!;
    expect(got.headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(got.headers["content-encoding"]).toBe("aes128gcm");
    expect(got.headers.urgency).toBe("high");
    const payload = JSON.parse(ece.decrypt(Buffer.from(got.body, "base64"), { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString("utf8")) as { title: string; body: string; url: string };
    const hawks = await dealId("Hawks");
    expect(payload.title).toContain("Will the Hawks win");
    expect(payload.body).toContain("YES on Kalshi at 55¢ + NO on Polymarket US at 40¢");
    expect(payload.body).toContain("if both sides fill and both markets settle the same way");
    expect(payload.url).toBe(`${APP_URL}/api/alerts/opened?opp=${encodeURIComponent(hawks)}&ch=push`);
    // US member: never an alert for the international deal found at the same time.
    expect(pushes.slice(before).some(p => /Fed cut/.test(p.body))).toBe(false);

    // The real service worker shows it.
    const cdp = await context.newCDPSession(page);
    type Reg = { registrationId: string; scopeURL: string; isDeleted: boolean };
    const regs = new Map<string, Reg>();
    cdp.on("ServiceWorker.workerRegistrationUpdated", e => { for (const r of (e as { registrations: Reg[] }).registrations) regs.set(r.registrationId, r); });
    await cdp.send("ServiceWorker.enable");
    // The live registration for this site (an earlier, replaced one can still be listed).
    const live = () => [...regs.values()].filter(r => !r.isDeleted && r.scopeURL === `${APP_URL}/`).at(-1);
    await expect.poll(() => Boolean(live())).toBe(true);
    const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.title));
    await expect(async () => {
      await cdp.send("ServiceWorker.deliverPushMessage", { origin: APP_URL, registrationId: live()!.registrationId, data: JSON.stringify(payload) });
      await expect.poll(shown, { timeout: 3_000 }).toContain(payload.title);
    }).toPass({ timeout: 20_000 });

    // Opening the alert records alert_opened and lands on the deal.
    await page.goto(payload.url);
    await expect(page).toHaveURL(new RegExp(`/deal/${hawks}`));
    const opened = await q("select 1 from terminal.events where user_id = $1 and name = 'alert_opened'", [pro.id]);
    expect(opened.length).toBeGreaterThan(0);
  } finally {
    // The worker couldn't reach any venue (by design here); put the scanner heartbeats back so later tests see live data.
    await q("update terminal.worker_heartbeats set ok = true, error = null, last_run_at = now() where job like 'scan:%'");
  }
});
