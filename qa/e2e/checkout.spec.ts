/* The Whop money path, end to end, against a local mock of Whop's SANDBOX (qa/e2e/mock-whop.ts) that answers the
 * SDK's real requests and signs webhooks the documented way. One test per item of the migration checklist:
 *
 *   1. Sign in with Whop → the free, delayed feed
 *   2. Checkout with a sandbox test card → webhook → access granted → lands on the live Terminal
 *   3. Insidir can't see Pro features; Pro sees everything
 *   4. Cancel → access ends when Whop says it ends
 *   5. Refund and failed payment are handled (and a dispute alerts the owner)
 *   6. A duplicate webhook is ignored, a bad signature is rejected
 *   7. A free user's network responses carry no paid data (after access ends; qa/e2e/paywall.spec.ts covers more)
 *
 * The tests run in order and share the buyer's account. */
import { expect, test, type Page } from "@playwright/test";
import { OWNER_EMAIL, WHOP, WHOP_PORT } from "./env";
import { captureBodies, q, signIn } from "./helpers";
import { MOCK_USER, TEST_CARDS, type Delivery, type Membership } from "./mock-whop";

const whop = (path: string, body?: unknown) =>
  fetch(`http://localhost:${WHOP_PORT}${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
interface State {
  memberships: Membership[]; configs: Array<{ plan_id: string; metadata: Record<string, unknown>; redirect_url: string }>;
  deliveries: Delivery[]; emails: Array<{ to: string[]; subject: string; text: string; headers?: Record<string, string> }>; accessCalls: number;
}
const state = async (): Promise<State> => (await whop("/__state"))!.json() as Promise<State>;
const send = async (type: string, data: unknown, o: { id?: string; badSignature?: boolean } = {}) =>
  (await (await whop("/__webhook", { type, data, ...o }))!.json()) as Delivery;

/** Sign in with Whop: the app's /auth/login → Whop's authorize (consent already given) → /auth/callback. */
async function whopSignIn(page: Page, next = "/terminal"): Promise<void> {
  await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
  await expect(page).toHaveURL(new RegExp(next.replace(/[?]/g, "\\?")));
}
const buyer = async () => (await q<{ id: string; whop_user_id: string; whop_username: string; email: string; plan: string; created_at: Date }>(
  "select id, whop_user_id, whop_username, email, plan, created_at from terminal.users where whop_user_id = $1", [MOCK_USER.sub]))[0];

test.describe.serial("Whop sandbox: sign-in, checkout, access, webhooks", () => {
  test.beforeAll(async () => {
    await whop("/__reset", { keepSeeded: true });
    await q("delete from terminal.users where whop_user_id = $1", [MOCK_USER.sub]);
  });

  test("1. sign in with Whop → free delayed feed", async ({ page }) => {
    await page.goto("/?utm_source=instagram&utm_campaign=e2e");
    await page.getByRole("link", { name: "Log in" }).first().click();
    await expect(page).toHaveURL(/\/terminal/);
    await expect(page.locator(".planbar")).toContainText("30 min delay");
    // A new account gets the first-run setup; skip it like a hurried buyer would.
    await page.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const u = await buyer();
    expect(u).toMatchObject({ whop_user_id: MOCK_USER.sub, whop_username: MOCK_USER.preferred_username, email: MOCK_USER.email, plan: "free" });
    expect(u!.id).not.toBe(MOCK_USER.sub);
    expect(u!.created_at).toBeTruthy();
    expect((await state()).accessCalls).toBeGreaterThan(0);
  });

  test("2. checkout with a sandbox test card → webhook → access granted → lands on Terminal", async ({ page, context }) => {
    const started = (await q<{ now: Date }>("select now()"))[0]!.now;
    await whopSignIn(page);
    const vid = (await context.cookies()).find(c => c.name === "insidir_vid")?.value;
    await page.locator("[data-unlock]").first().click();
    await expect(page).toHaveURL(/\/pricing\?plan=insidir/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Insidir · $39/mo");
    await page.screenshot({ path: `qa/screenshots/pricing-checkout-${page.viewportSize()!.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Continue to secure checkout" }).click();
    await expect(page).toHaveURL(new RegExp(`localhost:${WHOP_PORT}/checkout/ch_`));

    // The declined test card first: no access, nothing emailed (the decline is shown on the checkout).
    await page.getByLabel("Card number").fill(TEST_CARDS.declined);
    await page.getByRole("button", { name: "Pay" }).click();
    await expect(page.getByRole("alert")).toContainText("declined");
    // Then 4242 4242 4242 4242.
    await page.getByLabel("Card number").fill("4242 4242 4242 4242");
    await page.getByRole("button", { name: "Pay" }).click();

    await expect(page).toHaveURL(/\/terminal\?welcome=/, { timeout: 20_000 });
    await expect(page.getByTestId("welcome")).toHaveText("You're in. Here's what's live right now.");
    await expect(page.getByText("30 min delay")).toHaveCount(0);
    await expect(page.getByText("Will the Hawks win").first()).toBeVisible();
    await page.screenshot({ path: `qa/screenshots/checkout-landed-${page.viewportSize()!.width}.png`, fullPage: true });

    const s = await state();
    const u = (await buyer())!;
    expect(s.configs[0]).toMatchObject({ plan_id: "plan_e2e_insidir", metadata: { customer_id: u.id } });
    expect(s.configs[0]!.redirect_url).toMatch(/\/terminal\?welcome=1$/);
    expect(s.deliveries.map(d => [d.type, d.status])).toEqual([["payment.failed", 200], ["membership.activated", 200], ["payment.succeeded", 200]]);
    expect(s.emails).toEqual([]);
    expect(u.plan).toBe("insidir");
    const logged = await q<{ type: string; status: string }>("select type, status from terminal.webhook_events where id = any($1) order by received_at",
      [s.deliveries.map(d => d.id)]);
    expect(logged).toEqual([{ type: "payment.failed", status: "ignored" }, { type: "membership.activated", status: "processed" }, { type: "payment.succeeded", status: "ignored" }]);

    // Funnel, in order.
    const evs = (await q<{ name: string }>("select name from terminal.events where (visitor_id = $1 or user_id = $2) and at >= $3 order by at, id", [vid, u.id, started]))
      .map(e => e.name);
    const order = ["feed_view", "unlock_click", "checkout_start", "paid"];
    const firsts = order.map(n => evs.indexOf(n));
    expect(firsts.every(i => i >= 0), JSON.stringify(evs)).toBe(true);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
  });

  test("3. Insidir can't see Pro features; Pro sees everything", async ({ page, browser }) => {
    await whopSignIn(page);
    for (const path of ["/whales", "/pnl"]) {
      await page.goto(path);
      await expect(page.locator(".locked"), path).toHaveCount(1);
    }
    expect((await page.request.post("/api/pnl/kalshi", { data: "a,b" })).status()).toBe(403);
    const feed = await (await page.request.get("/api/feed")).json() as { plan: string; rows: Array<{ locked: boolean }> };
    expect(feed.plan).toBe("insidir");
    expect(feed.rows.some(r => !r.locked)).toBe(true);

    const pro = await browser.newContext();
    await signIn(pro, "pro");
    const p = await pro.newPage();
    for (const path of ["/terminal", "/whales", "/pnl"]) {
      await p.goto(path);
      await expect(p.locator(".locked"), path).toHaveCount(0);
    }
    expect((await p.request.post("/api/pnl/kalshi", { data: "a,b" })).status()).not.toBe(403);
    await pro.close();
  });

  test("4. cancel → access ends when Whop says it ends", async ({ page }) => {
    await whopSignIn(page, "/settings");
    await expect(page.getByRole("link", { name: "Manage billing" })).toHaveAttribute("href", `http://localhost:${WHOP_PORT}/@me/settings/orders`);
    await expect(page.getByTestId("refer-link")).toContainText(`/?a=${MOCK_USER.preferred_username}`);
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    await expect(page.getByText("Your subscription is cancelled")).toBeVisible();
    await expect(page.getByTestId("cancels")).toContainText("Cancels at period end. Access until");
    await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
    await page.screenshot({ path: `qa/screenshots/settings-cancelled-${page.viewportSize()!.width}.png`, fullPage: true });

    // Still paid until the period ends.
    const mem = (await state()).memberships.find(m => m.user_id === MOCK_USER.sub && m.status === "active")!;
    expect(mem.cancel_at_period_end).toBe(true);
    await page.goto("/terminal");
    await expect(page.getByText("30 min delay")).toHaveCount(0);

    // Whop ends the period: membership.updated, and the next request is free.
    await whop(`/__end/${mem.id}`, {});
    await page.goto("/terminal");
    await expect(page.locator(".planbar")).toContainText("30 min delay");
    expect((await buyer())!.plan).toBe("free");
  });

  test("5. refund and failed payment are handled; a dispute alerts the owner", async () => {
    const before = (await state()).emails.length;
    const pay = `pay_e2e_renewal_${Date.now()}`;
    const failed = await send("payment.failed", { id: pay, user_id: MOCK_USER.sub, billing_reason: "subscription_cycle", customer_email: MOCK_USER.email,
      recovery_url: `http://localhost:${WHOP_PORT}/recover/${pay}`, failure_message: "Insufficient funds" });
    expect(failed.status).toBe(200);
    const refund = await send("refund.created", { id: "rfnd_e2e_1", amount: 39, currency: "usd", status: "succeeded", payment: { id: "pay_e2e_first", user: { id: MOCK_USER.sub } } });
    expect(refund.status).toBe(200);
    const dispute = await send("dispute.created", { id: "dspt_e2e_1", amount: 39, currency: "usd", reason: "fraudulent", status: "needs_response",
      evidence_due_at: "2026-11-09T00:00:00Z", payment: { id: "pay_e2e_first" }, buyer: { email: MOCK_USER.email, username: MOCK_USER.preferred_username, user_id: MOCK_USER.sub } });
    expect(dispute.status).toBe(200);

    const emails = (await state()).emails.slice(before);
    expect(emails).toHaveLength(2);
    expect(emails[0]).toMatchObject({ to: [MOCK_USER.email], subject: "Action needed: your Insidir payment failed" });
    expect(emails[0]!.text).toContain(`http://localhost:${WHOP_PORT}/recover/${pay}`);
    expect(emails[0]!.headers?.["List-Unsubscribe"]).toBeUndefined();
    expect(emails[1]).toMatchObject({ to: [OWNER_EMAIL] });
    expect(emails[1]!.subject).toContain("Dispute opened: 39.00 USD");
    const rows = await q<{ type: string; status: string; note: string; ref: string }>(
      "select type, status, note, ref from terminal.webhook_events where id = any($1) order by received_at", [[failed.id, refund.id, dispute.id]]);
    expect(rows.map(r => [r.type, r.status, r.ref])).toEqual([["payment.failed", "processed", pay], ["refund.created", "processed", "rfnd_e2e_1"],
      ["dispute.created", "processed", "dspt_e2e_1"]]);
    expect(rows[1]!.note).toContain("refund 39.00 USD for pay_e2e_first; plan now free");

    // A second failed attempt on the same payment the same day: no second email.
    await send("payment.failed", { id: pay, user_id: MOCK_USER.sub, billing_reason: "subscription_cycle", customer_email: MOCK_USER.email,
      recovery_url: `http://localhost:${WHOP_PORT}/recover/${pay}` });
    expect((await state()).emails.length).toBe(before + 2);
  });

  test("6. a duplicate webhook is ignored, a bad signature is rejected", async () => {
    const data = { id: "rfnd_e2e_dup", amount: 5, currency: "usd", payment: { id: "pay_e2e_first", user: { id: MOCK_USER.sub } } };
    const id = `msg_e2e_dup_${Date.now()}`;
    const first = await send("refund.created", data, { id });
    const again = await send("refund.created", data, { id });
    expect([first.status, again.status]).toEqual([200, 200]);
    expect(JSON.parse(again.body)).toMatchObject({ duplicate: true });
    expect((await q("select 1 from terminal.webhook_events where id = $1", [id])).length).toBe(1);

    const forged = await send("membership.activated", { id: "mem_forged", user_id: MOCK_USER.sub, status: "active", product: { id: WHOP.products.pro } },
      { id: "msg_e2e_forged", badSignature: true });
    expect(forged.status).toBe(401);
    expect(await q("select 1 from terminal.webhook_events where id = 'msg_e2e_forged'")).toEqual([]);
    expect((await buyer())!.plan).toBe("free");
  });

  test("7. a free user's network responses contain no paid data", async ({ page }) => {
    await whopSignIn(page);
    const bodies = await captureBodies(page, async () => {
      await page.goto("/terminal");
      await page.evaluate(() => fetch("/api/feed").then(r => r.text()));
    });
    const fresh = await q<{ id: string; title: string }>(
      "select id, data->>'title' as title from terminal.opportunities where first_seen_at > now() - interval '30 minutes'");
    expect(fresh.length).toBeGreaterThan(0);
    for (const { url, body } of bodies.filter(b => !b.url.includes("/_next/static/"))) {
      for (const f of fresh) expect(body.includes(f.id), `${url} carries fresh deal ${f.id}`).toBe(false);
    }
    const feed = await (await page.request.get("/api/feed")).json() as { plan: string; rows: Array<{ profit: unknown; cost: unknown; sets: unknown; locked: boolean }> };
    expect(feed.plan).toBe("free");
    expect(feed.rows.length).toBeLessThanOrEqual(3);
    for (const r of feed.rows) expect([r.profit, r.cost, r.sets, r.locked]).toEqual([null, null, null, true]);
  });
});
