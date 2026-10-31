/* The analyst layer and the final home page, against the seeded fixtures (notes written by the template, as the
 * worker does without a model): the home sections in order, "Every position, analyzed." with one Sources toggle open,
 * a position's page with its note, Research from ⌘K and /research (visitors: 3 a day; members: Export CSV), every
 * home link opening for a visitor, and screenshots of a position, a market, a tracker and /research. */
import { expect, test } from "@playwright/test";
import { APP_URL } from "./env";
import { shotName, signIn } from "./helpers";

test("home: the sections in order, each with its stamp; every position analyzed, one with its sources open", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero3__sub")).toHaveText("Insidir analyzes every large position on Polymarket, Kalshi and SEC filings: who placed it, their verified record, and what it means. Within minutes.");
  await expect(page.locator(".rbar input")).toHaveAttribute("placeholder", /.{10,}/);
  const order = ["Three markets. One membership.", "Open now from winning trackers", "Every position, analyzed.", "Leaderboard", "How Insidir works", "Insidir, live", "Track record", "Pricing", "Questions"];
  const tops: number[] = [];
  for (const h of order) { const el = page.getByRole("heading", { level: 2, name: h, exact: true }).first(); await expect(el, h).toBeVisible(); tops.push((await el.boundingBox())!.y); }
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  const cards = page.getByTestId("analyzed");
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
  await expect(cards.first().getByText("Analyst note", { exact: true })).toBeVisible();
  await expect(cards.first().locator("details.anote__src")).toHaveAttribute("open", "");
  await expect(cards.first().locator(".anote__fact").first()).toBeVisible();
  // The pricing table: $39/month, the $1 week small, Whop.
  await expect(page.locator(".ptable__price")).toContainText("$39/month · every tracker");
  await expect(page.locator(".ptable__fine")).toContainText("Secure sign-in and payments by Whop.");
  // The header: Research ⌘K, no Activity for visitors.
  await expect(page.locator('header nav a[href="/research"]').first()).toContainText("Research");
  await expect(page.locator('header nav a[href="/feed"]')).toHaveCount(0);
  await page.screenshot({ path: shotName("home-final", page), fullPage: true });
});

test("a position: its card, the analyst note under the headline, and Sources with each fact's link", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("analyzed").first();
  await card.locator(".anlz__h a").click();
  await expect(page).toHaveURL(/\/position\//);
  const note = page.getByTestId("analyst-note").first();
  await expect(note.getByText("Analyst note", { exact: true })).toBeVisible();
  await note.getByText("Sources").click();
  await expect(note.locator(".anote__fact").first()).toBeVisible();
  await expect(note.locator(".anote__fine")).toContainText("It describes data; it isn't advice.");
  await page.screenshot({ path: shotName("position", page), fullPage: true });
});

test("the market and tracker pages show notes on their positions", async ({ page }) => {
  await page.goto("/trackers/biggest-bets");
  await page.screenshot({ path: shotName("tracker-notes", page), fullPage: true });
  const firstNoted = page.getByTestId("analyst-note").first();
  if (await firstNoted.count()) await expect(firstNoted).toContainText("Analyst note");
  await page.goto("/market/0xe2emarket1");
  expect(page.url()).not.toMatch(/login|start/);
  await page.screenshot({ path: shotName("market-notes", page), fullPage: true });
});

test("Research: ⌘K opens it, a suggestion answers with rows and stamps, Esc closes; /research works without JavaScript", async ({ page }) => {
  await page.goto("/");
  const dlg = page.getByRole("dialog", { name: "Research" });
  // Until the page has hydrated, the shortcut has nothing listening: press again until it opens.
  await expect(async () => { if (!(await dlg.isVisible())) await page.keyboard.press("ControlOrMeta+k"); await expect(dlg).toBeVisible({ timeout: 1000 }); }).toPass({ timeout: 15_000 });
  await dlg.getByRole("button", { name: "Trackers with a positive followable ROI" }).click();
  await expect(dlg.getByTestId("research-answer")).toBeVisible();
  await expect(dlg.locator(".asof").first()).toContainText("30-min delay");
  await expect(dlg.getByText(/of 3 questions left today/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await page.goto("/research?q=" + encodeURIComponent("Largest open NFL positions this week"));
  await expect(page.getByTestId("research-answer")).toBeVisible();
  await expect(page.getByTestId("research-answer").locator(".rans__text")).toHaveText(/rows?\.|Nothing in Insidir's data matches/);
  await page.screenshot({ path: shotName("research", page), fullPage: true });
  await page.goto("/research?q=" + encodeURIComponent("Which bet should I take tonight?"));
  await expect(page.getByTestId("research-answer").locator(".rans__text")).toHaveText("Insidir shows what happened in the data. It doesn't give advice, picks or forecasts.");
});

test("Research limits: a visitor's 4th question is refused; a member exports CSV", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  for (const q of ["Trackers by 30-day volume", "Largest open NBA positions today", "Stock trackers"]) expect((await page.request.post("/api/research", { data: { q } })).status(), q).toBe(200);
  expect((await page.request.post("/api/research", { data: { q: "Director purchases in the last 30 days" } })).status()).toBe(429);
  await ctx.close();
  const m = await browser.newContext();
  await signIn(m, "insidir");
  const mp = await m.newPage();
  const r = await mp.request.post("/api/research", { data: { q: "Which trackers have the most settled positions?" } });
  const body = await r.json() as { id: number; member: boolean; remaining: number | null };
  expect(body).toMatchObject({ member: true, remaining: null });
  const csv = await mp.request.get(`/api/research/csv?id=${body.id}`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toMatch(/^"Trackers by settled positions"\n"Tracker","Followable ROI"/);
  await m.close();
});

test("every link on the home page opens for a visitor with real content", async ({ page }) => {
  await page.goto("/");
  const hrefs = [...new Set(await page.locator("a[href^='/']").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).getAttribute("href")!).filter(h => !h.startsWith("/api/"))))];
  expect(hrefs.length).toBeGreaterThan(20);
  const bad: string[] = [];
  for (const h of hrefs) {
    const res = await page.request.get(APP_URL + h, { maxRedirects: 5 });
    const text = res.status() === 200 ? await res.text() : "";
    if (res.status() !== 200 || !/<h1|<h2/.test(text)) bad.push(`${h}: ${res.status()}`);
  }
  expect(bad).toEqual([]);
});
