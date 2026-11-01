/* The Read, end to end against the seeded fixtures (qa/e2e/seed.ts). The open tennis position 100 is E2E-Follow's
 * ($90K on Player A at 52¢; E2E-Follow is proven: 32 settled, a positive followable return), on Polymarket at 58¢ and
 * matched to a Kalshi market that pays the other way round (Kalshi YES 40¢ → Player A 60¢ there).
 *   A visitor (region unknown = the US rule): types the market, gets one Read in under 5 seconds: the split and Kalshi's
 *   price only (no Polymarket anywhere); the big bets and the analyst line blurred and never sent; Open on Kalshi;
 *   Share is a 1080×1350 PNG; a second Read asks for $1. Start for $1 → pay first (no sign-in) → Whop sign-in → back
 *   on the same Read as a member: the big bets and the line.
 *   A member outside the US: "tennis" offers 3 markets; picked, both venues with the better price marked, Open on it;
 *   the Read is on their home page. /admin shows landing → first Read and → paid. */
import { expect, test, type Page } from "@playwright/test";
import { base32Decode, stepAt, totpCode } from "@/lib/admin";
import { SERVER_ENV, WHOP_PORT } from "./env";
import { q, shotName, signIn } from "./helpers";

const whop = (path: string, init?: RequestInit) => fetch(`http://localhost:${WHOP_PORT}${path}`, init);
const post = (path: string, body: unknown) => whop(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function readFrom(page: Page, text: string) {
  await page.getByTestId("read-input").fill(text);
  const t0 = Date.now();
  await page.getByTestId("read-go").click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByTestId("read-card")).toBeVisible();
  return Date.now() - t0;
}

test("a visitor's one Read (US rule), blurred bets and line never sent, Share, then pay first and back on the same Read as a member", async ({ page }) => {
  test.setTimeout(90_000);
  const w = page.viewportSize()!.width;
  const email = `reader-${w}@example.test`;
  await q("delete from terminal.users where email = $1", [email]);
  await page.goto("/");
  const ms = await readFrom(page, "Tennis match 100");
  expect(ms).toBeLessThan(5_000);
  const url = page.url();
  const id = url.split("/read/")[1]!;
  const card = page.getByTestId("read-card");
  await expect(card.getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 100");
  // Proven money: E2E-Follow's $90K, all on Player A.
  await expect(page.getByTestId("read-proven")).toContainText("Player A100% · $90K · 1 wallet");
  // The US rule: Kalshi only. Player A is Kalshi's NO (the pair is inverted): 60¢; the other side 40¢.
  await expect(page.getByTestId("read-prices").locator("thead th")).toHaveText(["Side", "Kalshi"]);
  await expect(page.getByTestId("price-kalshi")).toHaveText(["60¢", "40¢"]);
  await expect(page.getByTestId("price-polymarket")).toHaveCount(0);
  await expect(page.getByTestId("read-open")).toHaveText("Open on Kalshi");
  await expect(page.getByTestId("read-open")).toHaveAttribute("href", "https://kalshi.com/markets/e2e/KXE2ETENNIS-100");
  await expect(page.locator('a[href*="polymarket.com"]')).toHaveCount(0);
  // The bets and the line: blurred, and not in the page at all.
  await expect(page.getByTestId("read-locked")).toContainText("1 big bet in the last 24 hours, and the analyst line");
  await expect(page.getByTestId("read-bets")).toHaveCount(0);
  await expect(page.getByTestId("read-line")).toHaveCount(0);
  const html = await (await page.request.get(url)).text();
  expect(html).not.toMatch(/\$90K on Player A|0xe2…dd|Analyst line<\/h2><p class="rline"/);
  await page.screenshot({ path: shotName("read-visitor", page), fullPage: true });
  // Share: the image, 1080×1350, insidir.com on it.
  const img = await page.request.get(`/read/${id}/image`);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  const png = await img.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
  // A second Read: Start for $1.
  await page.goto("/");
  await page.getByTestId("read-input").fill("Tennis match 101");
  await page.getByTestId("read-go").click();
  const err = page.getByTestId("read-box").getByRole("alert");
  await expect(err).toContainText("You've used your free Read. Members read every market.");
  await expect(err.getByRole("link", { name: "Start for $1" })).toHaveAttribute("href", "/start");
  // From the blurred part: pay first (no sign-in), Whop sign-in, and back on this Read as a member.
  await page.goto(url);
  await page.getByTestId("read-locked").getByRole("link", { name: "Start for $1" }).click();
  await expect(page).toHaveURL(new RegExp(`/start\\?next=%2Fread%2F${id}$`));
  await expect(page.getByTestId("start-pay-first")).toContainText("then you're back on your Read");
  await post("/__whop_user", { email, name: null });
  const form = page.locator("[data-mock-checkout]");
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();
  await expect(page).toHaveURL(url, { timeout: 25_000 });
  await expect(page.getByTestId("read-bets")).toContainText("$90K on Player A at 52¢");
  await expect(page.getByTestId("read-bets")).toContainText("Polymarket · 0xe2…dd");
  await expect(page.getByTestId("read-line")).toHaveText(/\S/);
  expect(await page.getByTestId("read-line").innerText()).not.toMatch(/guarantee|should|insider/i);
  await expect(page.getByTestId("read-locked")).toHaveCount(0);
  await page.screenshot({ path: shotName("read-after-pay", page), fullPage: true });
});

test("a member outside the US: three choices, both venues with the better price marked, Open on it; on their home page after", async ({ page, context }) => {
  await signIn(context, "proIntl");
  await page.goto("/");
  await page.getByTestId("read-input").fill("tennis");
  await page.getByTestId("read-go").click();
  const choices = page.getByTestId("read-choices").locator("button");
  await expect(choices).toHaveCount(3);
  await choices.filter({ hasText: "Tennis match 100" }).click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByTestId("read-prices").locator("thead th")).toHaveText(["Side", "Kalshi", "Polymarket"]);
  // Player A: Kalshi 60¢, Polymarket 58¢ (better); the other side: Kalshi 40¢ (better), Polymarket 42¢.
  await expect(page.getByTestId("price-kalshi")).toHaveText(["60¢", "40¢Best"]);
  await expect(page.getByTestId("price-polymarket")).toHaveText(["58¢Best", "42¢"]);
  await expect(page.getByTestId("read-open")).toHaveText("Open on Polymarket");
  await expect(page.getByTestId("read-bets")).toBeVisible();
  await expect(page.getByTestId("read-line")).toHaveText(/\S/);
  await page.screenshot({ path: shotName("read-member-intl", page), fullPage: true });
  await page.goto("/");
  await expect(page.getByTestId("recent-reads").locator("a").first()).toContainText("E2E fixture: Tennis match 100");
});

test("/admin: landing → first Read and → paid, median and 75th percentile, and the Reads' build time", async ({ page }) => {
  test.setTimeout(120_000);
  await q("delete from terminal.events where visitor_id = 'e2e-speed-v'");
  await q(`insert into terminal.events (name, visitor_id, at) values ('landing_view', 'e2e-speed-v', now() - interval '10 minutes'), ('read', 'e2e-speed-v', now() - interval '9 minutes')`);
  for (let i = 0; i < 3; i++) {
    const step = stepAt(Date.now());
    await page.goto("/admin");
    await page.getByLabel("Admin token").fill(SERVER_ENV.ADMIN_TOKEN!);
    await page.getByLabel("Authenticator code").fill(totpCode(base32Decode(SERVER_ENV.ADMIN_TOTP_SECRET!)!, step));
    await page.getByRole("button", { name: "Sign in" }).click();
    if (await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 5_000 }).then(() => true, () => false)) break;
    while (stepAt(Date.now()) <= step) await page.waitForTimeout(1000);
  }
  const speed = page.getByTestId("admin-speed");
  await expect(speed.getByTestId("speed-read").locator("th")).toHaveText("Landing → first Read");
  expect(Number(await speed.getByTestId("speed-read").locator("td").first().innerText())).toBeGreaterThanOrEqual(1);
  await expect(speed.getByTestId("speed-paid").locator("th")).toHaveText("Landing → paid");
  await expect(speed.getByTestId("speed-reads")).toContainText(/\d+ Reads · median build \d+ ms/);
  await expect(page.getByTestId("admin-cancels")).toBeVisible();
  await q("delete from terminal.events where visitor_id = 'e2e-speed-v'");
});
