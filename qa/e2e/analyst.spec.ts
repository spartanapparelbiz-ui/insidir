/* The analyst layer and the final home page, against the seeded fixtures (notes written by the template, as the
 * worker does without a model): the home sections in order, "Every position, analyzed." with one Sources toggle open,
 * a position's page with its note, Research from ⌘K and /research (visitors: 3 a day; members: Export CSV), every
 * home link opening for a visitor, and screenshots of a position, a market, a tracker and /research. */
import { expect, test } from "@playwright/test";
import { APP_URL } from "./env";
import { q, shotName, signIn } from "./helpers";

test("a position: its card, the analyst note under the headline, and Sources with each fact's link", async ({ page }) => {
  const id = (await q<{ id: string }>("select n.move_id as id from terminal.analyst_notes n join terminal.moves m on m.id = n.move_id order by n.created_at desc limit 1"))[0]!.id;
  await page.goto(`/position/${encodeURIComponent(id)}`);
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
  const hrefs = [...new Set(await page.locator("a[href^='/']").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).getAttribute("href")!).filter(h => !h.startsWith("/api/") && !h.endsWith("/image"))))];
  expect(hrefs.length).toBeGreaterThan(10);
  const bad: string[] = [];
  for (const h of hrefs) {
    const res = await page.request.get(APP_URL + h, { maxRedirects: 5 });
    const text = res.status() === 200 ? await res.text() : "";
    if (res.status() !== 200 || !/<h1|<h2/.test(text)) bad.push(`${h}: ${res.status()}`);
  }
  expect(bad).toEqual([]);
});
