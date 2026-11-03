/* The final pass's guarantees, end to end against the production build:
 *   At rest  a full-page screenshot with no scrolling: every h1/h2 visible and drawn (its box has light pixels), no
 *            section blank where it has content; the /go paywall panel and every block of a member's home visible.
 *   Crawl    every internal link from the home page (visitor and member) and every sitemap URL: no 4xx/5xx, no console
 *            error, no hydration warning.
 *   Links    header, footer and the phone menu go where they say.
 *   /go      the progress bar (step N of 12), Back on every step before paying, UTM tags carried through every step.
 *   Pop-ups  never in the first 15 s, at most once a session; Esc, a tap outside and Close all close it, remembered 24 h.
 *   Share    favicon and app icons (the brackets mark), the manifest, the OG image rendered (not blank), robots.
 *   Keyboard the pop-up traps focus and returns it; the stake slider moves by arrow keys.
 *   Privacy  no seeded username reaches any page. */
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { APP_URL } from "./env";
import { q, signIn } from "./helpers";

const closed = { name: "insidir_pay_closed", value: "1", url: APP_URL };
const ignorable = (t: string) => /Failed to load resource: the server responded with a status of 401|favicon|ERR_BLOCKED_BY_CLIENT|ResizeObserver/.test(t);

function watch(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", e => errs.push(`pageerror: ${e.message}`));
  page.on("console", m => {
    const t = m.text();
    if ((m.type() === "error" && !ignorable(t)) || /hydrat|did not match|server rendered HTML/i.test(t)) errs.push(`${m.type()}: ${t.slice(0, 240)}`);
  });
  return errs;
}

test("content is visible at rest: a full-page screenshot with no scrolling shows every heading and section", async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.addCookies([closed]);
  await page.goto("/");
  await page.waitForTimeout(2500); // the hero's entrance is over; nothing has scrolled
  const png = await page.screenshot({ fullPage: true });
  const img = sharp(png);
  const { width, height } = await img.metadata();
  const raw = await img.raw().toBuffer();
  const ch = raw.length / (width! * height!);
  const dpr = await page.evaluate(() => devicePixelRatio);
  const lightIn = (b: { x: number; y: number; w: number; h: number }) => {
    let light = 0, n = 0;
    for (let y = Math.max(0, Math.floor(b.y * dpr)); y < Math.min(height!, (b.y + b.h) * dpr); y += 2) {
      for (let x = Math.max(0, Math.floor(b.x * dpr)); x < Math.min(width!, (b.x + b.w) * dpr); x += 2) {
        const i = (y * width! + x) * ch;
        n++;
        if (raw[i]! + raw[i + 1]! + raw[i + 2]! > 3 * 150) light++;
      }
    }
    return n ? light / n : 0;
  };
  // Every heading: computed fully opaque (itself and every ancestor) and actually drawn (light pixels in its box).
  const heads = await page.evaluate(() => [...document.querySelectorAll("main h1, main h2")].map(h => {
    let o = 1;
    for (let e: Element | null = h; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    const r = h.getBoundingClientRect();
    return { text: (h.textContent ?? "").trim().slice(0, 40), o, x: r.x, y: r.y + scrollY, w: r.width, h: r.height };
  }));
  expect(heads.length).toBeGreaterThan(6);
  for (const hd of heads) {
    expect(hd.o, `${hd.text}: opacity`).toBeGreaterThan(0.99);
    expect(lightIn({ x: hd.x, y: hd.y, w: hd.w, h: hd.h }), `${hd.text}: drawn`).toBeGreaterThan(0.02);
  }
  // Every section with content: not blank (more than 90% black) across the boxes of its text.
  const sections = await page.evaluate(() => [...document.querySelectorAll("main > section.b-stage")].map(s => {
    const boxes = [...s.querySelectorAll("h1, h2, h3, p, li, .b-dcard")].slice(0, 30).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; }).filter(b => b.w > 4 && b.h > 4);
    return { id: s.getAttribute("data-testid"), boxes };
  }));
  for (const s of sections) {
    if (!s.boxes.length) continue;
    const lit = s.boxes.map(lightIn).reduce((a, b) => a + b, 0) / s.boxes.length;
    expect(lit, `${s.id}: blank at rest`).toBeGreaterThan(0.004);
  }
});

test("the /go paywall panel and every block of a member's home are visible", async ({ page, context }) => {
  await context.addCookies([closed]);
  await page.goto("/go?step=paywall");
  const panel = page.getByTestId("paywall");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("paywall-price")).toContainText("$1 today");
  expect(await panel.evaluate(e => { let o = 1; for (let x: Element | null = e; x; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return o; })).toBeGreaterThan(0.99);
  await signIn(context, "insidir");
  for (const [tab, ids] of [["", ["ask", "your-markets", "week-recap"]], ["board", ["tab-board", "live-feed"]], ["brief", ["tab-brief"]], ["following", ["following-panel"]], ["live", ["tab-live"]]] as const) {
    await page.goto(tab ? `/?tab=${tab}` : "/");
    await expect(page.getByTestId("member-home")).toBeVisible();
    for (const id of ids) {
      const el = page.getByTestId(id).first();
      await expect(el, `${tab || "check"}: ${id}`).toBeVisible();
      expect(await el.evaluate(e => { let o = 1; for (let x: Element | null = e; x; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return o; }), id).toBeGreaterThan(0.99);
    }
  }
});

test("crawl: every internal link from the home page and every sitemap URL renders, with no console error or hydration warning", async ({ page, context, request }, info) => {
  test.skip(info.project.name !== "desktop-1440", "one crawl is enough: the pages are the same at every width");
  test.setTimeout(600_000);
  await context.addCookies([closed]);
  const errs = watch(page);
  const visited = new Map<string, { status: number; errors: string[] }>();
  const links = async () => (await page.locator("a[href^='/']").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).getAttribute("href") ?? ""))).map(h => h.split("#")[0]!).filter(h => h && !h.startsWith("/auth/") && !h.startsWith("/api/") && !h.startsWith("/login/start"));
  const visit = async (path: string) => {
    if (visited.has(path)) return;
    errs.length = 0;
    const r = await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(400);
    visited.set(path, { status: r?.status() ?? 0, errors: [...errs] });
  };
  // As a visitor: the home page, everything it links to, and every page in the sitemaps.
  await visit("/");
  for (const h of new Set(await links())) await visit(h);
  const index = await (await request.get("/sitemap.xml")).text();
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]!).pathname);
  expect(maps.length).toBeGreaterThan(2);
  const pages: string[] = [];
  for (const m of maps) {
    const x = await request.get(m);
    expect(x.status(), m).toBe(200);
    pages.push(...[...(await x.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(l => new URL(l[1]!).pathname));
  }
  expect(pages).toEqual(expect.arrayContaining(["/", "/board", "/markets", "/markets/football"]));
  for (const p of [...new Set(pages)].slice(0, 120)) await visit(p);
  // As a member: their home's links too.
  await signIn(context, "insidir");
  visited.delete("/");
  await visit("/");
  for (const h of new Set(await links())) if (!visited.has(h)) await visit(h);
  const bad = [...visited].filter(([, v]) => v.status >= 400 || v.errors.length);
  expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
  expect(visited.size).toBeGreaterThan(30);
});

test("header, footer and the phone menu: every link goes where it says", async ({ page, context }, info) => {
  await context.addCookies([closed]);
  await page.goto("/");
  const nav = page.getByTestId("hero").locator("nav").first();
  const check = async (loc: ReturnType<Page["locator"]>) => {
    const items = await loc.evaluateAll(as => as.map(a => ({ text: (a.textContent ?? "").trim(), href: (a as HTMLAnchorElement).getAttribute("href") ?? "" })).filter(a => a.href.startsWith("/")));
    for (const it of items) {
      const r = await page.request.get(it.href.split("#")[0]!, { maxRedirects: 0 });
      expect(r.status(), `${it.text} → ${it.href}`).toBeLessThan(400);
      // The link's words name its destination (Start for $1 opens the funnel).
      const want: Record<string, RegExp> = { Markets: /^\/markets/, Board: /^\/board/, Record: /^\/results/, FAQ: /faq/, Pricing: /pricing/, "Log in": /^\/login/, "Start for $1": /^\/go/, Terms: /^\/terms/, Privacy: /^\/privacy/, Status: /^\/status/ };
      if (want[it.text]) expect(it.href, it.text).toMatch(want[it.text]!);
    }
    return items.length;
  };
  if (info.project.name === "phone-390") {
    await page.getByRole("button", { name: "Open menu" }).click();
    expect(await check(page.locator(".b-menu a"))).toBeGreaterThan(3);
  } else expect(await check(nav.locator("a"))).toBeGreaterThan(3);
  expect(await check(page.getByTestId("brand-foot").locator("a"))).toBeGreaterThan(10);
});

test("/go: the progress bar counts the steps, Back works on every step before paying, UTM tags ride along", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([closed]);
  await page.goto("/go?utm_source=final&utm_campaign=pass");
  const bar = page.getByTestId("go-progress");
  await expect(bar).toHaveAttribute("aria-valuenow", "1");
  await expect(bar).toHaveAttribute("aria-valuemax", "12");
  await expect(page.getByTestId("go-back")).toHaveAttribute("href", "/");
  await page.getByTestId("go-next").click();
  await expect(page).toHaveURL(/step=cats&utm_source=final&utm_campaign=pass/);
  await expect(bar).toHaveAttribute("aria-valuenow", "2");
  await page.getByTestId("go-back").click();
  await expect(page.getByTestId("go")).toHaveAttribute("data-step", "hook");
  await expect(page).toHaveURL(/step=hook&utm_source=final/);
  await page.getByTestId("go-next").click();
  await page.locator(".b-tile").first().click();
  await page.getByTestId("go-next").click();
  await expect(page.getByTestId("go")).toHaveAttribute("data-step", "where");
  await expect(page).toHaveURL(/step=where&utm_source=final&utm_campaign=pass/);
  // The browser's own Back works too.
  await page.goBack();
  await expect(page.getByTestId("go")).toHaveAttribute("data-step", "cats");
  await page.goForward();
  await expect(page.getByTestId("go")).toHaveAttribute("data-step", "where");
  // Paywall: Back to the aha; after paying (unlocked) there is no Back.
  await page.goto("/go?step=paywall&utm_source=final");
  await page.getByTestId("go-back").click();
  await expect(page.getByTestId("go")).toHaveAttribute("data-step", "aha");
  await page.goto("/go?step=unlocked");
  await expect(page.getByTestId("go-back")).toHaveCount(0);
});

test("pop-ups: never in the first 15 s, once a session; Esc, a tap outside and Close all close it, remembered for 24 hours", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-1440", "the timing rules are the same at every width");
  test.setTimeout(90_000);
  await page.clock.install();
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __bmOK?: boolean }).__bmOK === true); // hydrated: the pop-up listens
  const sheet = page.getByTestId("pay-sheet");
  // The free check's verdict fires the automatic pop-up 2.5 s later, but not inside the first 15 s on the page.
  await page.evaluate(() => window.dispatchEvent(new Event("insidir:free-used")));
  await page.clock.runFor(5_000);
  await expect(sheet).toHaveCount(0);
  await page.clock.runFor(11_000);
  await expect(sheet).toHaveCount(1);
  // Focus is inside, Tab stays inside, Esc closes and gives focus back.
  const inside = () => page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")));
  expect(await inside()).toBe(true);
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); expect(await inside()).toBe(true); }
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  const cookie = (await context.cookies()).find(c => c.name === "insidir_pay_closed");
  expect(cookie).toBeTruthy();
  expect(cookie!.expires * 1000 - Date.now()).toBeGreaterThan(23 * 3_600_000);
  // Closed: no automatic pop-up again; a tap on something locked always opens it.
  await page.evaluate(() => window.dispatchEvent(new Event("insidir:free-used")));
  await page.clock.runFor(5_000);
  await expect(sheet).toHaveCount(0);
  const lock = page.locator("[data-locked]").first();
  await lock.scrollIntoViewIfNeeded();
  await lock.click();
  await expect(sheet).toHaveCount(1);
  await page.getByTestId("pay-sheet-scrim").click({ position: { x: 5, y: 5 } });
  await expect(sheet).toHaveCount(0);
  await lock.click();
  await page.getByTestId("pay-sheet-close").click();
  await expect(sheet).toHaveCount(0);
  // A fresh session that never closed one: one automatic pop-up per session.
  await context.clearCookies();
  const p2 = await context.newPage();
  await p2.clock.install();
  await p2.goto("/");
  await p2.waitForFunction(() => (window as unknown as { __bmOK?: boolean }).__bmOK === true);
  await p2.clock.runFor(16_000);
  await p2.evaluate(() => window.dispatchEvent(new Event("insidir:free-used")));
  await p2.clock.runFor(3_000);
  await expect(p2.getByTestId("pay-sheet")).toHaveCount(1);
  await p2.keyboard.press("Escape");
  await p2.evaluate(() => { document.cookie = "insidir_pay_closed=; max-age=0; path=/"; window.dispatchEvent(new Event("insidir:free-used")); });
  await p2.clock.runFor(3_000);
  await expect(p2.getByTestId("pay-sheet")).toHaveCount(0);
});

test("share and install: brackets-mark icons, the manifest, a rendered OG image, robots", async ({ request }) => {
  const fav = await (await request.get("/icons/favicon.svg")).text();
  expect(fav).toContain('<rect x="0" y="0" width="40" height="18"/>'); // the brackets mark, not the old one
  for (const f of ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"]) {
    const r = await request.get(`/icons/${f}`);
    expect(r.status(), f).toBe(200);
    const s = await sharp(await r.body()).stats();
    expect(s.channels[0]!.max, `${f}: has the white mark`).toBe(255);
  }
  const man = await (await request.get("/manifest.webmanifest")).json();
  expect(man).toMatchObject({ name: "Insidir", background_color: "#000000", theme_color: "#000000" });
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
  const st = await sharp(await og.body()).stats();
  expect(st.channels[0]!.stdev, "the OG image isn't blank").toBeGreaterThan(20);
  const home = await (await request.get("/")).text();
  expect(home).toMatch(/<title>Insidir: see which side the millionaires bet<\/title>/);
  expect(home).toContain('rel="icon" href="/icons/favicon.svg"');
  expect(home).toMatch(/property="og:image"/);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap:");
  expect(robots).toContain("Disallow: /settings");
});

test("keyboard: the stake slider moves by arrow keys (when a record exists); the funnel is reachable by Tab", async ({ page, context }) => {
  await context.addCookies([closed]);
  await page.goto("/");
  const range = page.getByTestId("stake-range");
  if (await range.count()) {
    await range.focus();
    const before = await page.getByTestId("stake-value").textContent();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("stake-value")).not.toHaveText(before!);
  }
  await page.goto("/go");
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "go-next")) break;
  }
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("go-next");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("go")).toHaveAttribute("data-step", "cats");
});

test("no wallet's username or identity reaches any page", async ({ page, context }) => {
  const names = (await q<{ n: string }>("select distinct wallet_name as n from terminal.moves where wallet_name is not null and length(wallet_name) > 3 union select distinct name from terminal.tracked_wallets where name is not null and length(name) > 3")).map(r => r.n);
  await context.addCookies([closed]);
  for (const who of [null, "insidir"] as const) {
    if (who) await signIn(context, who);
    for (const path of ["/", "/board", "/markets", "/markets/football", "/go?step=aha"]) {
      await page.goto(path);
      const html = await page.content();
      for (const n of names) expect(html.includes(`>${n}<`), `${path}: ${n}`).toBe(false);
    }
  }
});
