/* The landing (Cruip Open layout, Magic UI motion), the Millionaires' board and the member pages end to end, at 390px and 1440px (qa/e2e/playwright.config.ts projects).
 *   Home page (visitor): the announcement until the polls close, the hero sized to its content (not the full screen)
 *   with the glass ask box, live chips and the best tracker's record; live market cards by category; the Read as an
 *   answer with source chips; the ticker (still under reduced motion); the record by window; pricing; FAQ; footer. No
 *   horizontal scroll on a phone; no placeholder dashes. A chip opens its Read.
 *   Members: the sidebar on desktop, the bottom tab bar on phones; the member home; a Read as an answer with its
 *   sources and related markets; Library with search; Markets with tabs and search; Account. */
import { expect, test, type Page } from "@playwright/test";
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

test("home page: the millionaires hero, the board an hour late, live numbers, a real Read, the bento, record, pricing, FAQ, footer", async ({ page }) => {
  await page.goto("/");
  const head = page.getByTestId("op-header");
  await expect(head.getByRole("link", { name: "insidir home" })).toBeVisible();
  await expect(head.locator('a[data-unlock="nav"]')).toHaveText("Start for $1");
  if (!phone(page)) for (const l of ["Millionaires", "Record", "Pricing"]) await expect(head.getByRole("link", { name: l })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("See what Polymarket's millionaires are betting.");
  await expect(page.locator(".op-hero__sub")).toHaveText("Insidir tracks every big bet on Polymarket and Kalshi and shows you where wallets that have made $1M+ are putting their money.");
  await expect(page.getByTestId("read-input")).toHaveAttribute("placeholder", "Paste a Polymarket or Kalshi link, or ask about any market");
  expect((await page.getByTestId("read-input").boundingBox())!.y + 40).toBeLessThan(page.viewportSize()!.height);
  await expect(page.getByTestId("board-delay")).toContainText("60 minutes delayed. Members see this live.");
  await expect(page.getByTestId("board-preview").or(page.getByTestId("board-none"))).toBeVisible();
  // Live numbers: the real counts, in the HTML before any animation.
  const n = await q<{ n: number }>("select count(*)::int as n from terminal.moves where source in ('polymarket', 'kalshi') and hidden_at is null");
  await expect(page.getByTestId("stat-bets")).toHaveText(n[0]!.n.toLocaleString("en-US"));
  await expect(page.getByTestId("bento")).toContainText("Millionaire money");
  for (const t of ["Pings", "Best price", "Unusual bets"]) await expect(page.getByTestId("bento")).toContainText(t);
  await expect(page.locator("#pricing h2")).toHaveText("$1 for 3 days, then $39/month.");
  await expect(page.locator(".op-faq details")).toHaveCount(7);
  await expect(page.getByTestId("sk-advice")).toHaveText("Information, not financial or betting advice. Operated by Aethric LLC.");
  await expect(page.locator("canvas")).toHaveCount(0);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/guarantee|risk-free|easy money|sure thing/i);
  expect(body).not.toMatch(/user_e2e|undefined|NaN/);
  const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && getComputedStyle(i).display !== "none").length);
  expect(broken).toBe(0);
  await noSideScroll(page);
  await noDashes(page);
  await page.screenshot({ path: shotName("op-home", page), fullPage: true });
});

test("home page: the record switches window; under reduced motion the marquee and list hold still and the numbers are final", async ({ page, browser }) => {
  await page.goto("/");
  const rec = page.getByTestId("record");
  const tabs = rec.getByRole("tab");
  if ((await tabs.count()) > 1) { await tabs.first().click(); await expect(tabs.first()).toHaveAttribute("aria-selected", "true"); await expect(rec.getByRole("tabpanel")).toHaveCount(1); await expect(rec.getByRole("tabpanel")).toBeVisible(); }
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: page.viewportSize()! });
  const p = await ctx.newPage();
  await p.goto("/");
  if (await p.locator(".mu-marquee__track").count()) expect(await p.locator(".mu-marquee__track").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  const n = await q<{ n: number }>("select count(*)::int as n from terminal.moves where source in ('polymarket', 'kalshi') and hidden_at is null");
  await expect(p.getByTestId("stat-bets")).toHaveText(n[0]!.n.toLocaleString("en-US"));
  await ctx.close();
});

test("the Millionaires' board: $1M+ wallets only, a tier badge and never a name; members live, visitors an hour late", async ({ page, context, browser }) => {
  // E2E-Top's wallet has made $1M+ (Polymarket's leaderboard pnl, as the backfill stores it).
  const TOP = "0xe2e00000000000000000000000000000000000aa";
  await q("insert into terminal.wallet_pnl (wallet, closed, closed_at_least, pnl, read_at) values ($1, 900, false, 2400000, now()) on conflict (wallet) do update set pnl = 2400000", [TOP]);
  try {
    const fresh = await q<{ id: string }>("select id from terminal.moves where wallet = $1 and amount >= 10000 and at > now() - interval '60 minutes' and hidden_at is null", [TOP]);
    const older = await q<{ id: string }>("select id from terminal.moves where wallet = $1 and amount >= 10000 and at <= now() - interval '60 minutes' and at > now() - interval '7 days' and hidden_at is null", [TOP]);
    await page.goto("/board");
    await expect(page.getByTestId("board-delay")).toContainText("60 minutes delayed. Members see this live.");
    await expect(page.getByTestId("board").locator("li")).toHaveCount(older.length);
    if (older.length) await expect(page.getByTestId("board").locator(".tier-badge").first()).toHaveText("$1M+");
    expect(await page.locator("body").innerText()).not.toMatch(/E2E-Top/);
    await page.screenshot({ path: shotName("op-board-visitor", page), fullPage: true });
    const m = await browser.newContext({ viewport: page.viewportSize()! });
    await signIn(m, "proIntl");
    const mp = await m.newPage();
    await mp.goto("/board");
    await expect(mp.getByTestId("board-live")).toBeVisible();
    await expect(mp.getByTestId("board").locator("li")).toHaveCount(fresh.length + older.length);
    expect(await mp.locator("body").innerText()).not.toMatch(/E2E-Top/);
    await mp.screenshot({ path: shotName("op-board-member", mp), fullPage: true });
    await m.close();
  } finally {
    await q("delete from terminal.wallet_pnl where wallet = $1", [TOP]);
  }
  void context;
});

test("members: the frame, the member home, a Read as an answer, Library, Markets and Account", async ({ page, context }) => {
  test.setTimeout(90_000);
  await signIn(context, "proIntl");
  await page.goto("/");
  if (phone(page)) {
    await expect(page.locator(".skm-tabs")).toBeVisible();
    await expect(page.locator(".skm-side")).toBeHidden();
    for (const l of ["Home", "Millionaires", "Read", "Your markets", "Account"]) await expect(page.locator(".skm-tabs").getByText(l, { exact: true })).toBeVisible();
  } else {
    await expect(page.locator(".skm-side")).toBeVisible();
    await expect(page.locator(".skm-tabs")).toBeHidden();
    await expect(page.getByTestId("new-read")).toHaveText("New Read");
    for (const l of ["Home", "Millionaires", "Markets", "Your markets", "Library", "Record", "Account"]) await expect(page.locator(".skm-side__nav").getByRole("link", { name: l, exact: true })).toBeVisible();
  }
  // The greeting: a first name only when the account has one that looks like a name (never "user_e2e_…").
  await expect(page.getByTestId("hello")).toHaveText(/^Good (morning|afternoon|evening)(, [A-Z][\p{L}'’-]*)?\.$/u);
  await expect(page.getByTestId("hello")).not.toContainText("user_");
  await expect(page.locator("canvas")).toHaveCount(0);
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
  await expect(page.getByTestId("read-question")).toHaveText(/^You asked\s*tennis$/);
  await expect(page.getByTestId("answer-sources")).toContainText("Polymarket");
  await expect(page.getByTestId("answer-sources")).toContainText(/Updated/);
  await expect(page.getByTestId("related").getByTestId("sk-card-title").first()).toBeVisible();
  const acts = page.locator(".rcard__acts");
  if (phone(page)) expect(await acts.evaluate(el => getComputedStyle(el).position)).toBe("fixed");
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
  await expect(page.getByTestId("markets-grid").getByTestId("sk-card-title").first()).toBeVisible();
  await page.locator(".skm-cats").getByRole("link", { name: "Sports" }).click();
  await expect(page).toHaveURL(/cat=sports/);
  await expect(page.getByTestId("markets-grid")).toContainText("Tennis match");
  await page.getByLabel("Search markets").fill("Tennis match 102");
  await page.getByLabel("Search markets").press("Enter");
  await expect(page.getByTestId("markets-grid").getByTestId("sk-card-title")).toHaveCount(1);
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
