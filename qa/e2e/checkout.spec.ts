/* The money path, end to end with Whop in test mode (a local mock with Whop's shapes and signed webhooks):
 * landing → free Terminal → Unlock → Whop checkout → pay → back through sign-in → the LIVE Terminal.
 * Then the funnel events are checked in order, the A/B row counts the conversion, and one-click cancel works. */
import { expect, test } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { q } from "./helpers";
import { MOCK_USER } from "./mock-whop";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);

test("unlock → Whop checkout → live Terminal, events in order, then cancel in one click", async ({ page, context }) => {
  await whop("/__reset", { method: "POST" });
  await q("delete from terminal.sessions where user_id = $1", [MOCK_USER.sub]);
  await q("delete from terminal.users where id = $1", [MOCK_USER.sub]);

  await page.goto("/?utm_source=instagram&utm_campaign=e2e");
  await expect(page.locator("h1")).toBeVisible();
  const vid = (await context.cookies()).find(c => c.name === "insidir_vid")!.value;
  const variant = (await context.cookies()).find(c => c.name === "insidir_ab")!.value;

  // Value before signup: the feed opens with no account.
  await page.getByRole("link", { name: "See today's live deals" }).first().click();
  await expect(page).toHaveURL(/\/terminal/);
  await expect(page.locator(".deal").first()).toBeVisible();

  // Tap 1: Unlock. Tap 2: pay on Whop.
  await page.locator("[data-unlock]").first().click();
  await expect(page).toHaveURL(new RegExp(`localhost:${WHOP_PORT}/checkout/plan_e2e_`));
  await page.getByRole("button", { name: "Pay (test mode)" }).click();

  // Back on Insidir, signed in, on the live Terminal: the fresh deal is visible with its numbers.
  await expect(page).toHaveURL(/\/terminal/, { timeout: 20_000 });
  await expect(page.getByText("Will the Hawks win").first()).toBeVisible();
  await expect(page.getByText("30 min delay")).toHaveCount(0);
  await page.screenshot({ path: `qa/screenshots/checkout-landed-${page.viewportSize()!.width}.png`, fullPage: true });

  const state = await (await whop("/__state")).json() as { webhooks: Array<{ type: string; status: number }> };
  expect(state.webhooks).toEqual([{ type: "membership.activated", status: 200 }, { type: "payment.succeeded", status: 200 }]);
  const user = (await q<{ plan: string; visitor_id: string; utm: Record<string, string> }>("select plan, visitor_id, utm from terminal.users where id = $1", [MOCK_USER.sub]))[0]!;
  expect(user.plan).not.toBe("free");
  expect(user.visitor_id).toBe(vid);
  expect(user.utm).toMatchObject({ utm_source: "instagram", utm_campaign: "e2e" });

  // Funnel events fire in order.
  await page.waitForTimeout(500);
  const evs = await q<{ name: string; variant: string | null }>(
    "select name, variant from terminal.events where visitor_id = $1 or user_id = $2 order by at, id", [vid, MOCK_USER.sub]);
  const names = evs.map(e => e.name);
  const order = ["landing_view", "feed_view", "unlock_click", "checkout_start", "paid"];
  const firsts = order.map(n => names.indexOf(n));
  expect(firsts.every(i => i >= 0), JSON.stringify(names)).toBe(true);
  expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
  expect(evs.find(e => e.name === "landing_view")?.variant).toBe(variant);

  // One-click cancel, visible in Settings.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Cancel subscription" }).click();
  await expect(page.getByText("Your subscription is cancelled")).toBeVisible();
  await expect(page.getByText("Cancels at period end")).toBeVisible();
  const after = await (await whop("/__state")).json() as { memberships: Array<{ cancel_at_period_end: boolean }> };
  expect(after.memberships[0]?.cancel_at_period_end).toBe(true);
  await page.screenshot({ path: `qa/screenshots/settings-cancelled-${page.viewportSize()!.width}.png`, fullPage: true });
});
