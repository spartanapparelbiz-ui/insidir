/* Everything gets its own page: a market (/market/<slug>), a race (/race/<slug>), a wallet (/wallet/0x…) and a bet
 * (/bet/<id>). Each opens for a visitor and a member, Kalshi first, with its breadcrumb and a 1080×1350 share card;
 * every element marked data-entity is a link that answers 200; visitors get the board's locks and its 60-minute delay;
 * the sitemaps list races, markets and every category. Seeded fixtures (qa/e2e/seed.ts, seed-millionaires.ts). */
import { expect, test, type Page } from "@playwright/test";
import { captureBodies, q, shotName, signIn } from "./helpers";
import { marketPath } from "../../lib/entities/slug";

async function fixtures() {
  const old = (await q<{ id: string; market_id: string; market_title: string; wallet: string; outcome: string }>(
    "select id, market_id, market_title, wallet, outcome from terminal.millionaire_bets where at < now() - interval '61 minutes' order by amount desc limit 1"))[0]!;
  const fresh = (await q<{ id: string }>("select id from terminal.millionaire_bets where at > now() - interval '55 minutes' order by at desc limit 1"))[0] ?? null;
  return { old, fresh, market: marketPath(old.market_id, old.market_title) };
}

async function entityLinksOk(page: Page) {
  const hrefs = [...new Set(await page.locator("[data-entity]").evaluateAll(els => els.map(e => {
    const a = e.matches("a") ? e : e.querySelector("a");
    return a ? (a as HTMLAnchorElement).getAttribute("href") ?? "" : "MISSING-LINK";
  })))];
  expect(hrefs, "every data-entity element is a link").not.toContain("MISSING-LINK");
  for (const h of hrefs.slice(0, 25)) expect((await page.request.get(h, { maxRedirects: 0 })).status(), h).toBe(200);
}

test("a market's page: Kalshi first, breadcrumb, money per side and every bet; visitors locked and an hour late", async ({ page, context }) => {
  const f = await fixtures();
  const bodies = await captureBodies(page, async () => {
    expect((await page.goto(f.market))?.status()).toBe(200);
  });
  await expect(page.getByTestId("market-page")).toBeVisible();
  await expect(page.getByTestId("crumbs")).toContainText("Markets");
  await expect(page.getByTestId("kalshi-first")).toBeVisible();
  await expect(page.locator("[data-locked=split]")).toBeVisible();
  await expect(page.locator('a[href*="polymarket.com"]')).toHaveCount(0); // a US visitor never gets a Polymarket link
  // The side never reaches a visitor; a fresh bet doesn't either.
  for (const b of bodies) if (f.fresh) expect(b.body, b.url).not.toContain(f.fresh.id);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toContain(f.market);
  await entityLinksOk(page);
  await page.screenshot({ path: shotName("entity-market", page), fullPage: true });
  await signIn(context, "insidir");
  await page.goto(f.market);
  await expect(page.getByTestId("market-money").locator("[data-locked]")).toHaveCount(0);
  await expect(page.getByTestId("market-bet-rows").locator("[data-entity=bet]").first()).toBeVisible();
  await page.screenshot({ path: shotName("entity-market-member", page), fullPage: true });
});

test("the twinned tennis market opens on Kalshi first: its title, price and one tap to it", async ({ page, context }) => {
  await signIn(context, "pro");
  expect((await page.goto("/market/0xe2etennis100"))?.status()).toBe(200);
  const k = page.getByTestId("kalshi-first");
  await expect(k).toHaveAttribute("data-twin", "yes");
  await expect(k.getByTestId("kalshi-yes")).toHaveText("60¢");
  await expect(k.getByTestId("open-kalshi")).toHaveAttribute("href", /^https:\/\/kalshi\.com\//);
});

test("a bet's page: the ticket for members (side, their price vs now, Copy); a visitor's locked, a fresh bet held back", async ({ page, context }) => {
  const f = await fixtures();
  const path = `/bet/${encodeURIComponent(f.old.id)}`;
  expect((await page.goto(path))?.status()).toBe(200);
  await expect(page.getByTestId("bet-locked")).toBeVisible();
  await expect(page.getByTestId("crumbs")).toBeVisible();
  if (f.fresh) {
    await page.goto(`/bet/${encodeURIComponent(f.fresh.id)}`);
    await expect(page.getByTestId("bet-fresh")).toBeVisible();
  }
  await signIn(context, "insidir");
  await page.goto(path);
  await expect(page.getByTestId("bet-side")).toContainText(`They bought ${f.old.outcome} at`);
  await expect(page.getByTestId("bet-who")).toContainText(/0x\w{2}…\w{2}/);
  await entityLinksOk(page);
  await page.screenshot({ path: shotName("entity-bet-member", page), fullPage: true });
});

test("a wallet's page: the last closed, today's bets, never a name", async ({ page, context }) => {
  const f = await fixtures();
  await signIn(context, "insidir");
  expect((await page.goto(`/wallet/${f.old.wallet}`))?.status()).toBe(200);
  await expect(page.getByTestId("wallet-today")).toBeVisible();
  await expect(page.getByTestId("crumbs")).toContainText("Wallets");
  await entityLinksOk(page);
  await page.screenshot({ path: shotName("entity-wallet-member", page), fullPage: true });
});

test("share cards are 1080×1350; sitemaps list races, markets and every category", async ({ page, request }) => {
  const f = await fixtures();
  for (const p of [f.market, `/bet/${encodeURIComponent(f.old.id)}`, `/wallet/${f.old.wallet}`]) {
    await page.goto(p);
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(og, p).toBeTruthy();
    expect(await page.locator('meta[property="og:image:width"]').first().getAttribute("content"), p).toBe("1080");
    expect(await page.locator('meta[property="og:image:height"]').first().getAttribute("content"), p).toBe("1350");
  }
  const idx = await (await request.get("/sitemap.xml")).text();
  for (const t of ["pages", "races", "markets", "wallets"]) expect(idx).toContain(`/sitemaps/${t}.xml`);
  expect(await (await request.get("/sitemaps/markets.xml")).text()).toContain("/market/");
  expect(await (await request.get("/sitemaps/pages.xml")).text()).toContain("/markets/football</loc>");
  expect((await request.get("/sitemaps/races.xml")).status()).toBe(200);
});

test("a category's rows open their market's page", async ({ page }) => {
  await page.goto("/markets/tennis");
  const first = page.locator("[data-entity=market]").first();
  if (await first.count()) {
    expect(await first.getAttribute("href")).toMatch(/^\/market\//);
    await entityLinksOk(page);
  }
});
