/* The brand pages end to end, against the millionaire fixtures (qa/e2e/seed-millionaires.ts):
 *   Landing   the stages in order, the hero's words and CTAs, the four pain → fix rows, the check demo picking a side
 *             and its verdict landing, the live feed with sides locked for a visitor (never sent), a tap on a lock
 *             opening the paywall, the proof record, pricing, no sideways scroll.
 *   The check a visitor checks a bet, picks a side, gets the verdict and its evidence (remembered on reload); the wallets,
 *             big bets and analyst line locked; a second check opens the paywall pop-up.
 *   /go       hook → categories → where → size → building → aha (one market whole, two with the side never sent) →
 *             paywall → the mock Whop checkout → the same markets whole → sign in with Whop → answers saved →
 *             follow a millionaire → push (not now) → their home.
 *   Home      a member's Desk: tape, flow with sides, EdgeChart, their desk, search inline. */
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
  await expect(page.getByTestId("hero").getByRole("heading", { level: 1 })).toHaveText("You're bettingagainst millionaires.");
  // Today's real total since midnight ET (the fixtures' six Millionaire bets of the last 90 minutes: $299K).
  await expect(page.getByTestId("hero-total")).toHaveAttribute("data-amount", "299000");
  await expect(page.getByTestId("hero-line")).toHaveText("Wallets up $1M+ bet $299K today. Which side were you on?", { timeout: 5_000 });
  await expect(page.getByTestId("hero-check")).toHaveAttribute("href", "#check");
  await expect(page.getByTestId("hero-start")).toHaveAttribute("href", "/go");
  // The Pulse: today's millionaire money, the biggest bet (side free), the hottest market; every card says something real.
  await expect(page.getByTestId("pulse-total")).toContainText("$299K");
  await expect(page.getByTestId("pulse-biggest")).toContainText("Millionaire");
  await expect(page.getByTestId("pulse-hottest")).toContainText("Chiefs vs. Bills");
  for (const id of ["pulse-total", "pulse-biggest", "pulse-hottest", "pulse-disagree", "pulse-unusual"]) await expect(page.getByTestId(id)).toBeVisible();
  await page.screenshot({ path: shotName("brand-hero", page) });

  // Free right now: today's #1 millionaire market whole (Chiefs vs. Bills: the split, the wallets, the price, the line).
  const free = page.getByTestId("free");
  await free.scrollIntoViewIfNeeded();
  await expect(free.getByRole("heading", { level: 2 })).toHaveText("Free right now.No account.");
  const top = page.getByTestId("free-top");
  await expect(top).toContainText("E2E fixture: Chiefs vs. Bills");
  await expect(top.getByTestId("tier-millionaire")).toContainText("$135K · 3 wallets");
  await expect(top).toContainText("Chiefs 51¢ · Bills 49¢");
  await expect(page.getByTestId("free-top-line")).toHaveText("Millionaire money is 78% on Chiefs: $105K from 2 wallets against $30K from 1 wallet.");
  // The last 3 millionaire bets, sides included.
  const last3 = page.getByTestId("free-last3");
  await expect(last3.getByTestId("bet-row")).toHaveCount(3);
  await expect(last3.getByTestId("bet-row").first()).toContainText("Chiefs");
  await expect(last3.locator("[data-locked]")).toHaveCount(0);
  await expect(page.getByTestId("free-more")).toHaveText(/^\+3 more today\. Members see every one live\.$/);
  await page.screenshot({ path: shotName("brand-free", page) });

  // What members get: five steps beside a phone showing real screens (on phones, each step shows its own).
  const members = page.getByTestId("members");
  await members.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("member-row")).toHaveCount(5);
  await expect(members.getByTestId("screen-check").first()).toContainText("Millionaires agree with you");
  await expect(members.getByTestId("screen-brief").first()).toContainText("Chiefs vs. Bills");
  await expect(members.getByTestId("screen-wallet").first()).toContainText("Millionaire");
  await expect(members).toContainText("$1 for 3 days, then $39/month.");
  await page.screenshot({ path: shotName("brand-members", page) });

  // A tap on a free bet: the pop-up names what they just saw.
  await last3.getByTestId("bet-row").first().click();
  const sheet = page.getByTestId("pay-sheet");
  await expect(sheet).toHaveAttribute("data-kind", "free");
  await expect(sheet.getByTestId("paywall-headline")).toHaveText("That was 1 of 6 millionaire bets today. See them all live, with a ping when the next one lands. $1 for 3 days.");
  await expect(sheet.getByTestId("paywall-price")).toContainText("$1 today, then $39/month from");
  await page.screenshot({ path: shotName("brand-popup", page) });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await expect(page.getByTestId("proof-net")).toHaveText("+$1,348");
  await expect(page.getByTestId("proof")).toContainText("$100 on every millionaire bet · 30 settled");
  await expect(page.getByTestId("pricing")).toContainText("Less thanone bad bet.");
  await expect(page.getByTestId("final-cta").getByRole("heading")).toHaveText("Bet with themillionaires.");
  await expect(page.getByTestId("brand-foot")).toContainText("Gambling problem? Call 1-800-GAMBLER.");
  await noHorizontalScroll(page);
});

test("the free check, inline: paste, pick your side, the verdict, the price; nothing else sent", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([closed, { name: "insidir_vid", value: `e2e-inline-${page.viewportSize()!.width}-${Date.now()}`, url: "http://localhost:3100" }]);
  await page.goto("/#check");
  const tile = page.getByTestId("free-check-tile");
  await tile.getByTestId("ask-input").fill("Tennis match 100");
  await tile.getByTestId("ask-go").click();
  const card = tile.getByTestId("free-check");
  await expect(card).toContainText("E2E fixture: Tennis match 100", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/(#check)?$/);
  await card.getByTestId("pick-yes").click();
  await expect(card.getByTestId("verdict-evidence")).toHaveText("2 wallets with $1M+ all-time profit have $114K on Player A");
  await expect(card.getByTestId("free-check-price")).toBeVisible();
  await page.screenshot({ path: shotName("brand-free-check", page) });
});

test("the check: pick your side, the verdict and its evidence (remembered), locked details, the second check opens the paywall", async ({ page, context }) => {
  test.setTimeout(60_000);
  const vid = `e2e-check-${page.viewportSize()!.width}-${Date.now()}`;
  await context.addCookies([{ name: "insidir_vid", value: vid, url: "http://localhost:3100" }]);
  // The free check opens its page from the landing; the side is asked there (nothing picked yet on this one).
  const made = await page.request.post("/api/read", { multipart: { text: "Tennis match 100" } });
  await page.goto(`/read/${(await made.json()).id}`);
  const card = page.getByTestId("check-card");
  await expect(page.getByTestId("read-head").getByRole("heading", { level: 1 })).toHaveText("E2E fixture: Tennis match 100");
  await expect(card).toContainText("Which side are you on?");
  await expect(card.getByTestId("verdict")).toHaveCount(0);
  await page.screenshot({ path: shotName("brand-read-side", page) });
  await card.getByTestId("pick-yes").click();
  await expect(card).toHaveAttribute("data-verdict", "agree");
  await expect(card.getByTestId("verdict-headline")).toHaveText("✓ Millionaires agree with you");
  await expect(card.getByTestId("verdict-evidence")).toHaveText("2 wallets with $1M+ all-time profit have $114K on Player A");
  await expect(card.getByTestId("read-locked")).toBeVisible();
  await expect(card.getByTestId("read-line-locked")).toBeVisible();
  await expect(card.getByTestId("read-wallets-locked")).toBeVisible();
  await expect(page.getByTestId("read-advice")).toContainText("Information, not financial or betting advice.");
  await page.screenshot({ path: shotName("brand-read-verdict", page), fullPage: true });
  // Remembered per market.
  await page.reload();
  await expect(page.getByTestId("check-card")).toHaveAttribute("data-verdict", "agree");
  // The free check is used: the next one opens the paywall pop-up.
  await page.getByTestId("read-again").getByTestId("ask-input").fill("Chiefs vs. Bills");
  await page.getByTestId("read-again").getByTestId("ask-go").click();
  await expect(page.getByTestId("pay-sheet")).toHaveAttribute("data-kind", "limit", { timeout: 15_000 });
  await expect(page.getByTestId("paywall-headline")).toHaveText("You've used your free check. Check every bet for $1 for 3 days.");
  await noHorizontalScroll(page);
});

test("/go: one question per screen, the aha, paywall, the mock checkout, unlocked, sign in, saved, follow, push, home", async ({ page }) => {
  test.setTimeout(120_000);
  const w = page.viewportSize()!.width, email = `go-${w}@example.test`;
  await q("delete from terminal.users where email = $1", [email]);
  await page.goto("/go?utm_source=e2e&utm_campaign=brand");
  const go = page.getByTestId("go");
  await expect(go).toHaveAttribute("data-step", "hook");
  await expect(page.getByTestId("go-hook-bet")).toContainText(/A \+\$[\d.]+[MK] wallet just bet \$[\d.]+K on E2E fixture/);
  await page.screenshot({ path: shotName("go-1-hook", page) });
  await page.getByTestId("go-next").click();
  await expect(go).toHaveAttribute("data-step", "cats");
  await expect(page.getByTestId("go-tile")).toHaveCount(18);
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
  await expect(page.getByTestId("go-ticks")).toContainText("Checking 6 millionaire wallets");
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
  await page.getByTestId("go-push-skip").click();
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

test("a member's Desk: the tape, the flow with sides, EdgeChart on a click, their desk, the wallets active today, search inline", async ({ page, context }) => {
  await signIn(context, "insidir");
  await page.goto("/");
  const home = page.getByTestId("member-home");
  await expect(home.getByRole("heading", { level: 1 })).toHaveText("Desk");
  await expect(page.getByTestId("desk-tape")).toBeVisible();
  // The flow: the newest millionaire bets with sides (members), newest first: Chiefs (8 min), the funding bill (15), Player A (25).
  const flow = page.getByTestId("live-flow");
  await expect(flow.getByTestId("bet-row").first()).toHaveAttribute("data-bet", "e2e:mb4");
  await expect(flow.locator(".d-side").first()).toHaveText("Chiefs");
  await expect(flow.getByTestId("bet-copy").first()).toHaveAttribute("href", "/copy/e2e%3Amb4");
  // EdgeChart opens on today's biggest ($85K on the Chiefs): every millionaire entry on that side, $85K + $20K, at an
  // average 47¢; another row loads on a click.
  await expect(page.getByTestId("edge-head")).toContainText("avg 47¢");
  await expect(page.getByTestId("edge-head")).toContainText("$105K in");
  await flow.locator('[data-bet="e2e:mb7"]').click();
  await expect(page.getByTestId("edge-head")).toContainText("$50K in");
  await expect(page.getByTestId("edge-head")).toContainText("62¢");
  // Your desk: following none, so today's most active millionaire wallets with Follow.
  await expect(page.getByTestId("your-desk")).toContainText("Following");
  // No two wallets share an orb.
  const orbs = await page.locator('[data-testid="live-flow"] .d-orb').evaluateAll(os => os.map(o => [o.closest("[data-bet]")?.querySelector(".d-wallet__t .d-num")?.textContent, o.getAttribute("data-orb")]));
  const byOrb = new Map<string, Set<string>>();
  for (const [w, o] of orbs) { if (!byOrb.has(o!)) byOrb.set(o!, new Set()); byOrb.get(o!)!.add(w!); }
  for (const [o, ws] of byOrb) expect(ws.size, o).toBe(1);
  // No scenery photo in any row.
  await expect(flow.locator("img")).toHaveCount(0);
  // Search: a market in plain words comes back inline with its millionaire side.
  await page.getByTestId("desk-search").getByRole("textbox").fill("Chiefs vs. Bills");
  await page.getByTestId("desk-search").getByRole("textbox").press("Enter");
  await expect(page.getByTestId("desk-search-result")).toContainText("Millionaires are on", { timeout: 10_000 });
  await page.screenshot({ path: shotName("brand-desk", page) });
  await noHorizontalScroll(page);
});
