/* The new design system end to end, at 390px and 1440px (qa/e2e/playwright.config.ts projects).
 *   Home page (visitor): the announcement until the polls close, the hero sized to its content (not the full screen)
 *   with the glass ask box, live chips and the best tracker's record; live market cards by category; the Read as an
 *   answer with source chips; the ticker (still under reduced motion); the record by window; pricing; FAQ; footer. No
 *   horizontal scroll on a phone; no placeholder dashes. A chip opens its Read.
 *   Members: the sidebar on desktop, the bottom tab bar on phones; the member home; a Read as an answer with its
 *   sources and related markets; Library with search; Markets with tabs and search; Account. */
import { expect, test, type Page } from "@playwright/test";
import { electionMode } from "@/lib/nx/data";
import { q, shotName, signIn } from "./helpers";

const phone = (p: Page) => p.viewportSize()!.width < 600;

async function noSideScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw + 1);
}
async function noDashes(page: Page) {
  // A missing number hides its element: no lone em dash stands in for one.
  const dashes = await page.locator("main").evaluate(el => [...el.querySelectorAll("*")].filter(n => n.children.length === 0 && n.textContent?.trim() === "—").length);
  expect(dashes).toBe(0);
}

test("home page: hero, live markets, the Read as an answer, ticker, record, pricing, FAQ, footer", async ({ page }) => {
  await page.goto("/");
  if (electionMode(Date.now())) await expect(page.getByTestId("announcement")).toHaveText("Midterms are Tuesday. See where the smart money is before polls close →");
  else await expect(page.getByTestId("announcement")).toHaveCount(0);
  const nav = page.locator(".nxl-nav");
  await expect(nav.getByRole("link", { name: "Insidir home" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Start for $1" })).toHaveAttribute("href", "/start");
  if (!phone(page)) for (const l of ["Markets", "Record", "How it works"]) await expect(nav.getByRole("link", { name: l })).toBeVisible();
  // The hero: sized to its content, at least 520px (phone) / 560px (desktop), never the full screen's height by rule.
  const hero = page.locator(".nxl-hero");
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText("Where's the smart money?");
  const h = (await hero.boundingBox())!.height;
  expect(h).toBeGreaterThanOrEqual(phone(page) ? 520 : 560);
  await expect(page.getByTestId("read-input")).toHaveAttribute("placeholder", "Paste a Polymarket or Kalshi link, or ask about any market");
  await expect(page.getByTestId("read-go")).toHaveText("Read");
  expect((await page.getByTestId("read-input").boundingBox())!.y + 40).toBeLessThan(page.viewportSize()!.height);
  const chips = page.getByTestId("hero-chips").getByRole("button");
  expect(await chips.count()).toBeGreaterThanOrEqual(1);
  expect(await chips.count()).toBeLessThanOrEqual(5);
  await expect(page.getByTestId("hero-proof")).toHaveText(/^ ?Tennis: \+\d+\.\d% over 32 settled bets$/);
  await expect(page.locator(".nxl-hero__fine")).toHaveText("Works with Polymarket and Kalshi. Insidir never touches your money.");
  // Live markets: category tabs over cards, each with a price or a split from real data.
  const live = page.getByTestId("live-markets");
  await expect(live.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
  const card = live.getByRole("tabpanel").first().getByTestId("nx-card").first();
  await expect(card).toBeVisible();
  // The Read as an answer: the question, the card, and its sources.
  await expect(page.locator("#answer h2")).toBeVisible();
  await expect(page.getByTestId("answer-sources")).toContainText(/Updated/);
  await expect(page.locator("#answer").getByTestId("read-card")).toBeVisible();
  await expect(page.getByTestId("ticker")).toContainText(/\$[\d,]+/);
  await expect(page.getByTestId("record").getByRole("tab").first()).toBeVisible();
  await expect(page.locator("#pricing h2")).toHaveText("$1 for your first 3 days, then $39/month. Cancel anytime.");
  await expect(page.locator(".nxl-faq__item")).toHaveCount(6);
  await expect(page.locator(".nxl-final h2")).toHaveText("Know where the money is before you bet.");
  await expect(page.getByTestId("nx-advice")).toHaveText("Information, not financial or betting advice. Operated by Aethric LLC.");
  await expect(page.locator("footer.foot")).toBeHidden();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/guarantee|risk-free|easy money|sure thing/i);
  await noSideScroll(page);
  await noDashes(page);
  await page.screenshot({ path: shotName("nx-home", page), fullPage: true });
});

test("home page: the record switches window; a chip opens its Read; the ticker holds still under reduced motion", async ({ page, browser }) => {
  await page.goto("/");
  const rec = page.getByTestId("record");
  const tabs = rec.getByRole("tab");
  if ((await tabs.count()) > 1) { await tabs.nth(1).click(); await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true"); await expect(rec.getByRole("tabpanel").nth(1)).toBeVisible(); }
  await page.getByTestId("hero-chips").getByRole("button").first().click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByTestId("read-question")).toBeVisible();
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: page.viewportSize()! });
  const p = await ctx.newPage();
  await p.goto("/");
  expect(await p.locator(".nx-ticker__track").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  expect(await p.locator(".nx-live").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await ctx.close();
});

test("members: the frame, the member home, a Read as an answer, Library, Markets and Account", async ({ page, context }) => {
  test.setTimeout(90_000);
  await signIn(context, "proIntl");
  await page.goto("/");
  if (phone(page)) {
    await expect(page.locator(".nxm-tabs")).toBeVisible();
    await expect(page.locator(".nxm-side")).toBeHidden();
    for (const l of ["Home", "Markets", "Read", "Your markets", "Account"]) await expect(page.locator(".nxm-tabs").getByText(l, { exact: true })).toBeVisible();
  } else {
    await expect(page.locator(".nxm-side")).toBeVisible();
    await expect(page.locator(".nxm-tabs")).toBeHidden();
    await expect(page.getByTestId("new-read")).toHaveText("New Read");
    for (const l of ["Home", "Markets", "Your markets", "Library", "Record", "Account"]) await expect(page.locator(".nxm-side__nav").getByRole("link", { name: l })).toBeVisible();
  }
  const home = page.getByTestId("member-home");
  await expect(home.locator(".nxm-banner h1")).toHaveText(/^Good (morning|afternoon|evening)(, .+)?\.$/);
  await expect(page.getByTestId("member-chips").getByRole("button").first()).toBeVisible();
  // A member who has read markets sees them; one who hasn't sees "Start with these".
  const yours = page.getByTestId("your-markets"), start = page.getByTestId("start-with");
  await expect(yours.or(start)).toBeVisible();
  await noSideScroll(page);
  await noDashes(page);
  await page.screenshot({ path: shotName("nx-member-home", page), fullPage: true });

  // A Read, as an answer: the question as asked, the card, sources, related markets.
  await page.getByTestId("read-input").fill("tennis");
  await page.getByTestId("read-go").click();
  await expect(page).toHaveURL(/\/read\/[A-Za-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByTestId("read-question")).toHaveText("tennis");
  await expect(page.getByTestId("read-sources")).toContainText("Polymarket");
  await expect(page.getByTestId("read-sources")).toContainText(/Updated/);
  await expect(page.getByTestId("related").getByTestId("nx-card").first()).toBeVisible();
  const acts = page.locator(".rcard__acts");
  if (phone(page)) expect(await acts.evaluate(el => getComputedStyle(el).position)).toBe("sticky");
  await noDashes(page);
  await page.screenshot({ path: shotName("nx-read", page), fullPage: true });

  // Library: that Read is there; search narrows it.
  await page.goto("/library");
  await expect(page.getByTestId("library")).toContainText("tennis");
  await page.getByLabel("Search your Reads").fill("zzzz-nothing");
  await page.getByLabel("Search your Reads").press("Enter");
  await expect(page.getByTestId("library-none")).toContainText("No Reads match");
  await page.goto("/library");
  await page.screenshot({ path: shotName("nx-library", page), fullPage: true });

  // Markets: tabs and search over cards sorted by proven money.
  await page.goto("/markets");
  await expect(page.getByTestId("markets-grid").getByTestId("nx-card").first()).toBeVisible();
  await page.locator(".nxm-cats").getByRole("link", { name: "Sports" }).click();
  await expect(page).toHaveURL(/cat=sports/);
  await expect(page.getByTestId("markets-grid")).toContainText("Tennis match");
  await page.getByLabel("Search markets").fill("Tennis match 102");
  await page.getByLabel("Search markets").press("Enter");
  await expect(page.getByTestId("markets-grid").getByTestId("nx-card")).toHaveCount(1);
  await page.goto("/markets");
  await noSideScroll(page);
  await page.screenshot({ path: shotName("nx-markets", page), fullPage: true });

  // Account: plan, billing, alerts, categories, sign out, cancel with a reason.
  await page.goto("/settings");
  const acct = page.getByTestId("account");
  await expect(acct.getByRole("heading", { level: 1 })).toHaveText("Account");
  await expect(acct).toContainText("Insidir · $39/month");
  await expect(page.getByTestId("manage-subscription")).toHaveText("Manage billing");
  await expect(acct.getByRole("link", { name: "Edit categories" })).toHaveAttribute("href", "/onboarding?again=1");
  await expect(acct.getByRole("button", { name: "Sign out" })).toBeVisible();
  await acct.getByText("Cancel subscription").click();
  await expect(page.getByTestId("cancel-form").getByRole("radio").first()).toBeVisible();
  await page.screenshot({ path: shotName("nx-account", page), fullPage: true });
  await q("delete from terminal.reads where question = 'tennis'");
});
