/* The states a visitor can land in besides the happy path: the 404, an error, and each empty state on the public
 * and Pro pages. Every one says what happened and offers a next step with a button. Whatever a test changes in
 * the database it puts back. */
import { expect, test } from "@playwright/test";
import { footerOk, noHorizontalScroll, q, signIn } from "./helpers";

test("404: on-brand, says what happened, links back to the feed", async ({ page }) => {
  const res = await page.goto("/no-such-page-anywhere");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wrong trail.");
  await expect(page.getByText("This page doesn't exist.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the feed" })).toHaveAttribute("href", "/feed");
  // The site's own page (Schibsted Grotesk), not the framework's default.
  const [body, sans] = await page.evaluate(() => [getComputedStyle(document.body).fontFamily, getComputedStyle(document.documentElement).getPropertyValue("--font-schibsted")]);
  expect(sans.trim()).not.toBe("");
  expect(body.replace(/["']/g, "")).toContain(sans.split(",")[0]!.trim().replace(/["']/g, ""));
  await footerOk(page);
  await noHorizontalScroll(page);
});

test("error: a deal that doesn't exist says so and points to the Terminal; the API answers 404 with no data", async ({ page }) => {
  const api = await page.request.get("/api/deal/no-such-deal");
  expect(api.status()).toBe(404);
  expect(await api.json()).toMatchObject({ view: { state: "not_found" } });
  await page.goto("/deal/no-such-deal");
  await expect(page.getByRole("heading", { name: "Deal not found" })).toBeVisible();
  await expect(page.getByText(/It may have closed/)).toBeVisible();
  const go = page.locator("main .btn--primary");
  await expect(go).toHaveCount(1);
  await expect(go).toHaveText("See today's live deals");
});

test("behind: when the move polls stop, the feed says it's catching up (never 'Connection lost' or 'paused')", async ({ page }) => {
  try {
    await q("insert into terminal.worker_heartbeats (job, last_run_at, ok) values ('e2e:pause', now(), true) on conflict do nothing");
    await q("update terminal.worker_heartbeats set last_run_at = now() - interval '10 minutes', last_ok_at = now() - interval '10 minutes', ok = true, error = null where job like 'moves:%'");
    await page.goto("/feed");
    await expect(page.getByText("Catching up · last update 10m ago")).toBeVisible();
    await expect(page.getByText(/Last update from the source/)).toBeVisible();
    await expect(page.getByText(/Connection lost|Live data paused/)).toHaveCount(0);
    await expect(page.locator(".move").first()).toBeVisible();
  } finally {
    await q("delete from terminal.worker_heartbeats where job = 'e2e:pause'");
    await q("update terminal.worker_heartbeats set last_run_at = now(), last_ok_at = now(), ok = true, error = null where job like 'moves:%'");
  }
});

test("empty: a quiet feed says so and points to Results", async ({ page }) => {
  const saved = await q<Record<string, unknown>>("select * from terminal.moves");
  try {
    await q("delete from terminal.moves");
    await page.goto("/feed");
    await expect(page.getByText("Quiet right now.")).toBeVisible();
    await expect(page.getByText("Follow a few top traders and we'll ping you when they move.")).toBeVisible();
  } finally {
    for (const m of saved) {
      const cols = Object.keys(m);
      await q(`insert into terminal.moves (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) on conflict do nothing`, cols.map(c => m[c]));
    }
  }
});

test("empty: Whales with no large trades says what shows up there and offers the Terminal", async ({ page, context }) => {
  await signIn(context, "pro");
  const saved = await q<{ key: string; data: unknown; at: Date }>("select key, data, at from terminal.whale_trades");
  try {
    await q("delete from terminal.whale_trades");
    await page.goto("/whales");
    const empty = page.locator("[data-empty=whales]");
    await expect(empty).toBeVisible();
    await expect(empty.getByText("No large trades yet")).toBeVisible();
    await expect(empty.getByRole("link", { name: "See the live feed" })).toHaveAttribute("href", "/feed");
    await noHorizontalScroll(page);
  } finally {
    for (const w of saved) await q("insert into terminal.whale_trades (key, data, at) values ($1, $2, $3) on conflict do nothing", [w.key, w.data, w.at]);
  }
});

test("empty: P&L before anything is loaded says what to do first", async ({ page, context }) => {
  await signIn(context, "pro");
  await page.goto("/pnl");
  await expect(page.locator("[data-empty=pnl]")).toContainText("Start by pasting your Polymarket wallet address");
  await expect(page.getByLabel("Your Polymarket wallet address")).toBeVisible();
  await expect(page.locator("main .btn--primary")).toHaveCount(1);
});

test("one primary action: the landing (above the final band), pricing and legal pages each show exactly one", async ({ page }) => {
  for (const path of ["/", "/pricing", "/terms", "/privacy"]) {
    await page.goto(path);
    // Pictures of the app (the home page's phone mockups) are inert: what they show is not an action on this page.
    const primaries = await page.locator("main .btn--primary:not(.band2 .btn)").evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent !== null && !e.closest("[inert]")).length);
    expect(primaries, path).toBe(1);
  }
});
