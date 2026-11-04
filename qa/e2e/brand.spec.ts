/* The brand pages end to end, against the millionaire fixtures (qa/e2e/seed-millionaires.ts):
 *   Landing   the stages in order, the hero's words and CTAs, the four pain → fix rows, the check demo picking a side
 *             and its verdict landing, the live feed with sides locked for a visitor (never sent), a tap on a lock
 *             opening the paywall, the proof record, pricing, no sideways scroll.
 *   The check a visitor checks a bet, picks a side, gets the verdict and its evidence (remembered on reload); the wallets,
 *             big bets and analyst line locked; a second check opens the paywall pop-up.
 *   /go       hook → categories → where → size → building → aha (one market whole, two with the side never sent) →
 *             paywall → the mock Whop checkout → the same markets whole → sign in with Whop → answers saved →
 *             follow a millionaire → push (not now) → their home.
 *   Home      a member's home: the homepage's stages, unlocked and live, with their desk; search inline. */
import { expect, test } from "@playwright/test";
import { WHOP_PORT } from "./env";
import { noHorizontalScroll, q, shotName, signIn } from "./helpers";
import { MW } from "./seed-millionaires";

const post = (path: string, body: unknown) => fetch(`http://localhost:${WHOP_PORT}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const closed = { name: "insidir_pay_closed", value: "1", url: "http://localhost:3100" };

test("landing: value first (free tiles), then what members get; sides locked only where they're members'", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([closed]);
  await page.goto("/");
  // Election Day (Nov 3–4 ET only), the spotlight, your stake and price gaps step aside when there is nothing real to show.
  const order = ["hero", "pulse", "free", "members", "markets", "proof", "pricing", "faq", "final-cta"];
  const ys = [];
  for (const id of order) { const el = page.getByTestId(id); await expect(el, id).toHaveCount(1); ys.push((await el.boundingBox())!.y); }
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  await expect(page.getByTestId("hero").getByRole("heading", { level: 1 })).toHaveText("You're betting against millionaires.");
  // Today's real total since midnight ET: the fixtures' six Millionaire bets of the last 90 minutes ($299K) once they all
  // fall after midnight. Within 95 minutes of midnight ET only part of them do: then today's part, or the last 24 hours
  // while today is still under $100K.
  const etMinutes = (() => { const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()); return Number(p.find(x => x.type === "hour")!.value) * 60 + Number(p.find(x => x.type === "minute")!.value); })();
  if (etMinutes > 95) {
    await expect(page.getByTestId("hero-total")).toHaveAttribute("data-amount", "299000");
    await expect(page.getByTestId("hero-line")).toHaveText("Wallets up $1M+ bet $299K today. Which side were you on?", { timeout: 5_000 });
  } else {
    await expect(page.getByTestId("hero-total")).toHaveAttribute("data-amount", /^[1-9]\d*$/);
    await expect(page.getByTestId("hero-line")).toHaveText(/^Wallets up \$1M\+ bet \$\d+K (today|in the last 24 hours)\. Which side were you on\?$/, { timeout: 5_000 });
  }
  await expect(page.getByTestId("hero-sample")).toHaveAttribute("href", "#free");
  await expect(page.getByTestId("hero-start")).toHaveAttribute("href", "/go");
  // The Pulse: today's millionaire money, the biggest bet (side free), the hottest market; every card says something real.
  // Since midnight ET: $299K once all six fixture bets (8–90 minutes old) fall after midnight; just after midnight,
  // part or none of it (the card then says there's none yet today).
  if (etMinutes > 95) await expect(page.getByTestId("pulse-total")).toContainText("$299K");
  else await expect(page.getByTestId("pulse-total")).toContainText(/\$\d+K|No millionaire money yet today/);
  await expect(page.getByTestId("pulse-biggest")).toContainText("Millionaire");
  await expect(page.getByTestId("pulse-hottest")).toContainText("Chiefs vs. Bills");
  for (const id of ["pulse-total", "pulse-biggest", "pulse-hottest", "pulse-disagree", "pulse-unusual"]) await expect(page.getByTestId(id)).toBeVisible();
  await page.screenshot({ path: shotName("brand-hero", page) });

  // Free right now, a live sample: today's #1 millionaire bet whole (side included), the board 60 minutes late, one race.
  const free = page.getByTestId("free");
  await free.scrollIntoViewIfNeeded();
  await expect(free.getByRole("heading", { level: 2 })).toHaveText("Free right now. No account.");
  const top = page.getByTestId("free-top-bet");
  if (etMinutes > 95) {
    await expect(top.getByTestId("bet-row")).toHaveCount(1);
    await expect(top.locator("[data-locked]")).toHaveCount(0);
  }
  await expect(top).not.toContainText(/\bNone\b/);
  // 60 minutes late: only the fixture bets older than an hour, never the newer ones.
  const late = page.getByTestId("free-late");
  for (const row of await late.getByTestId("bet-row").all()) await expect(row).not.toContainText(/\b([1-5]?\d)m ago\b/);
  await expect(page.getByTestId("free-race")).toBeVisible();
  await page.screenshot({ path: shotName("brand-free", page) });

  // What members get: five steps beside a phone showing real screens (on phones, each step shows its own).
  const members = page.getByTestId("members");
  await members.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("member-row")).toHaveCount(5);
  await expect(members.getByTestId("screen-market").first()).toContainText("Millionaires");
  await expect(members.getByTestId("screen-brief").first()).toContainText("Chiefs vs. Bills");
  await expect(members.getByTestId("screen-wallet").first()).toContainText("Millionaire");
  await expect(members).toContainText("$1 for 3 days, then $39/month.");
  await page.screenshot({ path: shotName("brand-members", page) });

  // A tap on a free bet: the pop-up names what they just saw.
  await top.getByTestId("bet-row").first().click();
  const sheet = page.getByTestId("pay-sheet");
  await expect(sheet).toHaveAttribute("data-kind", "free");
  await expect(sheet.getByTestId("paywall-headline")).toHaveText(etMinutes > 95 ? "That was 1 of 6 millionaire bets today. See them all live, with a ping when the next one lands. $1 for 3 days."
    : /^That was 1 of \d+ millionaire bets? today\. See them all live, with a ping when the next one lands\. \$1 for 3 days\.$/);
  await expect(sheet.getByTestId("paywall-price")).toContainText("$1 today, then $39/month from");
  await page.screenshot({ path: shotName("brand-popup", page) });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await expect(page.getByTestId("proof-net")).toHaveText("+$1,348");
  await expect(page.getByTestId("proof")).toContainText("$100 on every millionaire bet · 30 settled");
  await expect(page.getByTestId("pricing")).toContainText("Less than one bad bet.");
  await expect(page.getByTestId("final-cta").getByRole("heading")).toHaveText("Bet with the millionaires.");
  await expect(page.getByTestId("brand-foot")).toContainText("Gambling problem? Call 1-800-GAMBLER.");
  await noHorizontalScroll(page);
});



test("the free live sample: today's #1 millionaire bet whole, the board 60 minutes late, one race in full", async ({ page }) => {
  await page.goto("/#free");
  const top = page.getByTestId("free-top-bet");
  await expect(top).toBeVisible();
  // Whole: the side is shown (a visitor's board rows lock it).
  await expect(top.locator(".s-lockside, [data-locked=side]")).toHaveCount(0);
  await expect(page.getByTestId("free-late")).toContainText("Members see each one the second it lands.");
  await expect(page.getByTestId("free-late").getByRole("link", { name: "The board" })).toHaveAttribute("href", "/board");
  await expect(page.getByTestId("free-race").getByRole("link", { name: "Every race" })).toHaveAttribute("href", "/election");
  await page.screenshot({ path: shotName("brand-free-sample", page) });
});

test("search (⌘K): markets by words, a pasted Polymarket link opens that market's page, a wallet by its address", async ({ page, context }) => {
  await signIn(context, "insidir");
  const words = await (await page.request.get("/api/search?q=tennis%20match%20100")).json() as { go: string | null; hits: Array<{ href: string; kind: string }> };
  expect(words.hits.map(h => h.href)).toContain("/market/0xe2etennis100");
  const link = await (await page.request.get(`/api/search?q=${encodeURIComponent("https://polymarket.com/event/e2e-tennis-100")}`)).json() as { go: string | null };
  expect(link.go === null || link.go.startsWith("/market/")).toBe(true);
  const w = await (await page.request.get("/api/search?q=0xe2e00000000000000000000000000000000000aa")).json() as { go: string | null };
  expect(w.go).toBe("/wallet/0xe2e00000000000000000000000000000000000aa");
  await page.goto("/?search=1");
  await page.getByLabel("Search markets, races and wallets, or paste a link").fill("tennis match 100");
  await page.getByLabel("Search markets, races and wallets, or paste a link").press("Enter");
  await expect(page.getByTestId("desk-search-result").locator('a[href="/market/0xe2etennis100"]')).toBeVisible();
});

test("/go: one question per screen, the aha, paywall, the mock checkout, unlocked, sign in, saved, follow, push, home", async ({ page }) => {
  test.setTimeout(120_000);
  const w = page.viewportSize()!.width, email = `go-${w}@example.test`;
  await q("delete from terminal.users where email = $1", [email]);
  await page.goto("/go?utm_source=e2e&utm_campaign=brand");
  const go = page.getByTestId("go");
  await expect(go).toHaveAttribute("data-step", "hook");
  await expect(page.getByTestId("go-hook-bet")).toContainText(/A \$1M\+ wallet just bet \$[\d.]+K on E2E fixture/); // a visitor never gets the wallet's record
  await page.screenshot({ path: shotName("go-1-hook", page) });
  await page.getByTestId("go-next").click();
  await expect(go).toHaveAttribute("data-step", "cats");
  await expect(page.getByTestId("go-tile")).toHaveCount(19);
  await page.locator('[data-testid=go-tile][data-cat=football]').click();
  await page.locator('[data-testid=go-tile][data-cat=politics]').click();
  await expect(page.locator('[data-testid=go-tile][data-cat=football]')).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: shotName("go-2-categories", page) });
  await page.getByTestId("go-next").click();
  await expect(go).toHaveAttribute("data-step", "where");
  await page.locator('[data-testid=go-answer][data-value=kalshi]').click();
  await expect(go).toHaveAttribute("data-step", "size");
  await page.locator('[data-testid=go-answer][data-value="25-100"]').click();
  await expect(go).toHaveAttribute("data-step", "building");
  await expect(page.getByTestId("go-ticks")).toContainText("Reading 6 millionaire wallets");
  await expect(page.getByTestId("go-ticks")).toContainText("bets in Football and Politics today");
  await expect(go).toHaveAttribute("data-step", "aha", { timeout: 10_000 });
  // One market whole; the others with one total and the side never sent.
  await expect(page.getByTestId("aha-open")).toHaveCount(1);
  await expect(page.getByTestId("aha-locked")).toHaveCount(1);
  await expect(page.getByTestId("aha-locked").locator("[data-locked=split]")).toHaveCount(1); // the side drawn from nothing
  await expect(page.getByTestId("go-stake")).toContainText("$50 on every millionaire bet: +$674 over 30 settled. Past results, not a promise.");
  await page.screenshot({ path: shotName("go-6-aha", page), fullPage: true });
  await page.getByTestId("go-next").click();
  await expect(page.getByTestId("paywall-headline")).toHaveText("See which side they took in Football and Politics.");
  await expect(page.getByTestId("paywall-timeline")).toContainText("Today $1");
  await expect(page.getByTestId("paywall-remind")).toBeChecked();
  await page.screenshot({ path: shotName("go-7-paywall", page) });
  await page.getByTestId("paywall-start").click();
  await expect(go).toHaveAttribute("data-step", "checkout");
  await page.getByTestId("age-18").getByRole("checkbox").check();
  const form = page.locator("[data-mock-checkout]");
  await expect(form).toBeVisible();
  await page.screenshot({ path: shotName("go-8-checkout", page) });
  await post("/__whop_user", { email, name: "Go Buyer" });
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Pay $1 (test mode)" }).click();
  // Back to the same markets, now whole.
  await expect(page).toHaveURL(/\/go\?step=unlocked/, { timeout: 20_000 });
  await expect(page.getByTestId("aha-locked")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("aha-open")).toHaveCount(2);
  await page.screenshot({ path: shotName("go-9-unlocked", page), fullPage: true });
  await page.getByTestId("go-signin").click();
  // Right after paying and signing in: the ping opt-in, then follow a millionaire.
  await expect(go).toHaveAttribute("data-step", "push", { timeout: 25_000 });
  await page.screenshot({ path: shotName("go-10-push", page) });
  await page.getByTestId("ping-next").click();
  await expect(go).toHaveAttribute("data-step", "follow");
  const saved = (await q<{ settings: { go: { categories: string[]; where: string; size: string }; betOn: string[]; remindBeforeCharge: boolean }; utm: Record<string, string> | null }>("select settings, utm from terminal.users where email = $1", [email]))[0]!;
  expect(saved.settings.go).toEqual({ categories: ["football", "politics"], where: "kalshi", size: "25-100" });
  expect(saved.settings.betOn).toEqual(["nfl", "cfb", "other"]);
  expect(saved.settings.remindBeforeCharge).toBe(true);
  expect(saved.utm).toMatchObject({ utm_source: "e2e", utm_campaign: "brand" });
  await expect(page.getByTestId("go-wallet").first()).toContainText("Millionaire");
  await page.getByTestId("go-follow-btn").first().click();
  await expect(page.getByTestId("go-follow-btn").first()).toHaveText("Following");
  await page.screenshot({ path: shotName("go-11-follow", page) });
  await page.getByTestId("go-next").click();
  await expect(page.getByTestId("member-home")).toBeVisible({ timeout: 15_000 });
});

test("a member's home is the homepage, unlocked: stages with computed headlines, today's #1 position as a ticket, the live board with Copy on the selected row only, their desk; search inline", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/");
  await expect(page.locator('[data-home="stages"]')).toBeVisible();
  // The hero: a computed headline about today's (or the last 24 hours') millionaire money, on the homepage's stage.
  await expect(page.getByTestId("home-hero").getByRole("heading", { level: 1 })).toHaveText(/^Wallets up \$1M\+ bet \$[\d.]+[KM] (today|in the last 24 hours)\.$/);
  // Today's #1 open position: $85K on the Chiefs (now 51¢); every millionaire entry on that side, $85K + $20K, at an
  // average 47¢; then Copy at the price now and Follow.
  const t = page.getByTestId("home-ticket");
  await expect(t).toContainText("E2E fixture: Chiefs vs. Bills");
  await expect(t).toContainText("$105K from wallets up $1M+");
  await expect(t).toContainText("in at 47¢ · now 51¢");
  await expect(t.getByTestId("ticket-copy")).toHaveAttribute("href", "/copy/e2e%3Amb4");
  await expect(t.getByTestId("ticket-copy")).toHaveText("Copy at 51¢");
  await expect(t.getByTestId("desk-follow")).toBeVisible();
  // Never a wallet's face: the ticket names a short address and its profit only.
  await expect(t).toContainText(/0xe2e0…0001 · \+\$3\.1M all-time/);
  // The live board: written rows, no logos; Copy appears only on the selected row.
  const board = page.getByTestId("live-board");
  await board.scrollIntoViewIfNeeded();
  await expect(board.getByTestId("bet-row").first()).toHaveAttribute("data-bet", "e2e:mb4");
  await expect(board.locator("img")).toHaveCount(0);
  await expect(board.getByTestId("bet-copy")).toHaveCount(0);
  await board.getByTestId("bet-row").first().locator("button").first().click();
  await expect(board.getByTestId("bet-copy")).toHaveCount(1);
  await expect(board.getByTestId("bet-copy")).toHaveAttribute("href", "/copy/e2e%3Amb4");
  // Their desk: copies, follows, pings; never a stat that reads 0.
  const desk = page.getByTestId("home-desk");
  await expect(desk.getByTestId("desk-follows")).not.toContainText(/^0$/m);
  // No monospace anywhere, no sidebar.
  expect(await page.evaluate(() => [...document.querySelectorAll("main *")].some(e => /mono/i.test(getComputedStyle(e).fontFamily)))).toBe(false);
  await expect(page.locator(".b-sidebar")).toHaveCount(0);
  // Search: a market in plain words comes back inline with its millionaire side.
  // (Tennis match 100 has millionaire money: $74K + $40K on Player A.)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("desk-search").getByRole("textbox").fill("Tennis match 100");
  await page.getByTestId("desk-search").getByRole("textbox").press("Enter");
  await expect(page.getByTestId("desk-search-result").locator('a[href="/market/0xe2etennis100"]')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: shotName("brand-home", page) });
  await noHorizontalScroll(page);
});
