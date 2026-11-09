/* A wallet's page (/wallet/[address]) and what search engines see. Seeded fixtures (qa/e2e/seed.ts): E2E-Top's wallet
 * (41 of 63, +$1.2M, positions that add up to it). A wallet is only ever its short address: never a name, a username
 * or a picture. */
import { expect, test } from "@playwright/test";
import { captureBodies, signIn } from "./helpers";

const TOP = "0xe2e00000000000000000000000000000000000aa";

test("a wallet's page: every stat from its resolved positions, for members; never a name or a face", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto(`/wallet/${TOP}`);
  const tile = (label: string) => page.locator(".s-stat").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
  await expect(tile("Record")).toHaveText("41–22");
  await expect(tile("Win rate")).toHaveText("65%");
  await expect(tile("All-time net P&L")).toHaveText("+$1.2M");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("0xe2…aa");
  await expect(page.locator("main")).not.toContainText("E2E-Top");
  // Never a face for a wallet.
  await expect(page.getByTestId("wallet-hero").locator("img:not(.b-stage__bg *)")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See their Polymarket profile" })).toHaveCount(0);
});

test("a wallet's page opens for a visitor with the record locked; the record never reaches a visitor", async ({ page }) => {
  const bodies = await captureBodies(page, async () => {
    expect((await page.goto(`/wallet/${TOP}`))?.status()).toBe(200);
    await expect(page.getByText(/Their record is for members/)).toBeVisible();
    await page.goto("/wallets");
  });
  for (const b of bodies) expect(b.body, b.url).not.toMatch(/Won 41 of 63|\+\$1\.2M|\$310K|Net P&L over time|E2E-Top/);
});

test("old wallet links are 301s to /wallet/[address]", async ({ request }) => {
  for (const old of [`/p/${TOP}`, `/trader/${TOP}`]) {
    const r = await request.get(old, { maxRedirects: 0 });
    expect(r.status(), old).toBe(301);
    expect(r.headers().location, old).toContain(`/wallet/${TOP}`);
  }
});

test("robots.txt and the sitemaps: pages, every category, markets and wallets; never admin or account pages", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const r = await robots.text();
  expect(r).toContain("Sitemap: ");
  for (const d of ["/api/", "/admin", "/settings", "/login", "/go"]) expect(r).toContain(`Disallow: ${d}`);
  expect(r).not.toContain("Disallow: /wallet/");
  const idx = await (await request.get("/sitemap.xml")).text();
  for (const t of ["pages", "markets", "wallets"]) expect(idx).toContain(`/sitemaps/${t}.xml</loc>`);
  const get = async (t: string) => { const res = await request.get(`/sitemaps/${t}.xml`); expect(res.status(), t).toBe(200); return res.text(); };
  const pages = await get("pages");
  for (const p of ["/board</loc>", "/election</loc>", "/markets/tennis</loc>", "/pricing</loc>"]) expect(pages).toContain(p);
  expect(await get("wallets")).toContain("/wallet/0xe2e");
  expect(await get("markets")).toContain("/market/");
  for (const p of ["/settings", "/admin", "/copies", "/check", "/feed", "/top", "/trackers"]) expect(pages).not.toContain(`${p}</loc>`);
});
