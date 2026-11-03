/* Copy the winners, end to end against the seeded fixtures (qa/e2e/seed.ts): E2E-Follow (0xe2…dd) has 32 settled
 * positions (20 won, 12 lost) and three open tennis positions; the first (Player A, tennis 100) is matched to a Kalshi
 * market (inverted pair, Kalshi YES at 40¢), the other two have no Kalshi match.
 *   A US member copying that Polymarket wallet: Open goes to the Kalshi market at Kalshi's price (NO: 60¢); the
 *   unmatched move is view only; no polymarket.com link anywhere. P&L counts only moves after the copy began, at the
 *   member's size ($10, then $50 from Settings). The weekly recap and its share image.
 *   Outside the US: Polymarket at Polymarket's price.
 *   After paying, onboarding is one step: pick a winner to copy, the top 5 with their record. */
import { expect, test } from "@playwright/test";
import { q, shotName, signIn } from "./helpers";

const W = "0xe2e00000000000000000000000000000000000dd";
// Copying since 9½ days ago: of the 32 settled, only the last (lost, settled 8 days ago) came after.
const copyFrom = async (user: string) => {
  await q("delete from terminal.follows where user_id = $1", [user]);
  await q("insert into terminal.follows (user_id, kind, target, created_at) values ($1, 'trader', $2, now() - interval '9 days 12 hours')", [user, W]);
};

// Copies are follows: leave none behind, or the worker would alert these members about the wallet in later specs.
test.afterAll(async () => {
  await q("delete from terminal.follows where user_id = any($1)", [["user_e2e_insidir", "user_e2e_pro_intl", "user_e2e_pro"]]);
  await q("update terminal.users set onboarded_at = coalesce(onboarded_at, now()) where id = any($1)", [["user_e2e_insidir", "user_e2e_pro_intl", "user_e2e_pro"]]);
});

test("a US member copying a Polymarket wallet: Open goes to the matched Kalshi market at Kalshi's price; no match is view only; P&L at your size", async ({ page, context }) => {
  await copyFrom("user_e2e_insidir");
  await q("update terminal.users set settings = settings - 'copySize' where id = 'user_e2e_insidir'");
  await signIn(context, "insidir");
  await page.goto("/copies");
  await expect(page.getByRole("heading", { level: 1, name: "My copies" })).toBeVisible();
  const pnl = page.getByTestId("copy-pnl");
  await expect(pnl.locator(".mycp__line")).toHaveText("Copying 0xe2…dd · $0 this week");
  await expect(pnl.getByTestId("copy-total")).toHaveText("−$10");
  await expect(pnl).toContainText("at $10 a move · 0–1 settled · 3 open");
  await expect(pnl.getByTestId("copy-total")).toHaveClass(/neg/);

  const matched = page.getByTestId("copy-move").filter({ hasText: "Player A" });
  await expect(matched).toHaveAttribute("data-open", "kalshi");
  await expect(matched.getByTestId("their-price")).toHaveText("52¢");
  await expect(matched.getByTestId("your-price")).toHaveText("60¢");
  await expect(matched.getByText("You can get on Kalshi")).toBeVisible();
  await expect(matched.getByTestId("copy-open")).toHaveText("Open on Kalshi");
  await expect(matched.getByTestId("copy-open")).toHaveAttribute("href", "https://kalshi.com/markets/e2e/KXE2ETENNIS-100");
  await expect(matched.getByTestId("copy-note")).toHaveText(/\S/);
  const unmatched = page.getByTestId("copy-move").filter({ hasText: "Player B" });
  await expect(unmatched).toHaveAttribute("data-open", "none");
  await expect(unmatched.getByTestId("copy-view-only")).toHaveText("View only: not on Kalshi");
  await expect(unmatched.getByTestId("your-price")).toHaveText("—");
  await expect(page.locator('main a[href*="polymarket.com"]')).toHaveCount(0);

  // The weekly recap and its share image.
  await expect(page.getByTestId("recap").getByRole("heading", { name: "Your winner vs. the field" })).toBeVisible();
  const img = await page.request.get("/copies/recap.png");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  await page.screenshot({ path: shotName("my-copies-us", page), fullPage: true });

  // $50 a move from Settings: the same settled loss is now −$50.
  await page.goto("/settings");
  await page.getByTestId("copy-size").getByLabel("$50 a move").check();
  await page.getByTestId("copy-size").getByRole("button", { name: "Save size" }).click();
  await expect(page).toHaveURL(/\/settings\?saved=1/);
  await page.goto("/copies");
  await expect(page.getByTestId("copy-total")).toHaveText("−$50");
  await expect(page.getByTestId("copy-pnl")).toContainText("at $50 a move");
  // The wallet's page shows it followed; nothing names who is behind it on My copies.
  await expect(page.getByTestId("my-copies")).not.toContainText("E2E-Follow");
  await page.goto(`/p/${W}`);
  // Following a wallet is copying it: the wallet's page shows it as followed.
  await expect(page.getByTestId("desk-follow")).toHaveAttribute("aria-pressed", "true");
  await q("update terminal.users set settings = settings - 'copySize' where id = 'user_e2e_insidir'");
});

test("outside the US: the same move opens on Polymarket at Polymarket's price", async ({ page, context }) => {
  await copyFrom("user_e2e_pro_intl");
  await signIn(context, "proIntl");
  await page.goto("/copies");
  const matched = page.getByTestId("copy-move").filter({ hasText: "Player A" });
  await expect(matched).toHaveAttribute("data-open", "polymarket");
  await expect(matched.getByTestId("your-price")).toHaveText("58¢");
  await expect(matched.getByTestId("copy-open")).toHaveText("Open on Polymarket");
  await expect(matched.getByTestId("copy-open")).toHaveAttribute("href", /^https:\/\/polymarket\.com\//);
});

test("before copying anyone, /copies offers the top 5 winners to copy with their record; one tap copies", async ({ page, context }) => {
  await q("delete from terminal.follows where user_id = 'user_e2e_pro'");
  await signIn(context, "pro");
  await page.goto("/copies");
  await expect(page.getByRole("heading", { level: 1, name: "Pick a winner to copy" })).toBeVisible();
  const rows = page.getByTestId("copy-picker").locator(".cpick__row");
  expect(await rows.count()).toBeGreaterThan(0);
  expect(await rows.count()).toBeLessThanOrEqual(5);
  await expect(rows.first().locator(".cpick__name")).toHaveText("0xe2…dd");
  await expect(rows.first()).toContainText("20–12 on 32 settled");
  await expect(rows.first().locator("input")).toBeChecked();
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page).toHaveURL(/\/copies$/);
  await expect(page.getByTestId("copy-pnl").locator(".mycp__line")).toContainText("Copying 0xe2…dd");
  expect(await q("select kind, target from terminal.follows where user_id = 'user_e2e_pro'")).toEqual([{ kind: "trader", target: W }]);
});
