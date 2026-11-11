/* Copy trading end to end, minus Google's and Apple's push servers (unreachable here; real devices are a manual
 * checklist in the report):
 *   1. A member sets a bankroll and a max per trade in Account, and follows a Verified wallet on the leaderboard.
 *   2. The wallet trades: the real worker sends an encrypted push to the member's device (our stand-in push service),
 *      and we decrypt it: wallet, market, side, their size, your size (2% of $2,000 = $40), price, the cheaper venue.
 *   3. The push opens the copy ticket: both venues' prices, the cheaper marked, the matched size; Copy opens that market
 *      on the venue in a new tab; the member marks it placed and it shows in My copies.
 *   4. The wallet sells 60%: the worker pushes the exit, with their exit price and the member's entry, linking straight to
 *      the market. Test data throughout; no real purchase. */
import { spawn } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { APP_URL, E2E_DB, OUT, PUSH_PORT, SERVER_ENV, VAPID } from "./env";
import { q, signIn } from "./helpers";
import { E2E_USERS } from "./seed";
import { MW } from "./seed-millionaires";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece") as { decrypt(buf: Buffer, p: { version: string; privateKey: ReturnType<typeof createECDH>; authSecret: Buffer }): Buffer };
const b64u = (b: Buffer) => b.toString("base64url");

function runWorker(ms: number): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn("npx", ["tsx", "worker/index.ts"], {
      env: { ...process.env, DATABASE_URL: E2E_DB, APP_URL, INSIDIR_VAPID_PUBLIC_KEY: VAPID.publicKey, INSIDIR_VAPID_PRIVATE_KEY: VAPID.privateKey, VAPID_SUBJECT: "mailto:qa@insidir.com",
        NODE_EXTRA_CA_CERTS: join(OUT, "push-cert.pem"), WORKER_RUN_FOR_MS: String(ms), ALERT_MS: "3600000",
        WHALE_MS: "3600000", SETTLE_MS: "3600000", KALSHI_API_URL: "http://127.0.0.1:9", POLYMARKET_GAMMA_URL: "http://127.0.0.1:9", POLYMARKET_CLOB_URL: "http://127.0.0.1:9",
        POLYMARKET_DATA_URL: "http://127.0.0.1:9", POLYMARKET_US_ENABLED: "0", FEATURES_READY: SERVER_ENV.FEATURES_READY },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    p.stdout.on("data", d => (log += d)); p.stderr.on("data", d => (log += d));
    p.on("exit", () => ok(log)); p.on("error", fail);
  });
}

test("copy trading: bankroll, follow, entry push with your size, Copy opens the market, placed, exit push", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  test.setTimeout(150_000);
  const w = page.viewportSize()!.width, u = E2E_USERS.insidir!, wallet = MW(2), betId = `e2e:cflow-${w}`, sellId = `ps:e2e-cflow-${w}`;
  await q("delete from terminal.alerts_sent where user_id = $1", [u.id]);
  await q("delete from terminal.push_subscriptions where user_id = $1", [u.id]);
  await q("delete from terminal.follows where user_id = $1", [u.id]);
  await q("delete from terminal.bet_copies where user_id = $1", [u.id]);
  await q("delete from terminal.millionaire_bets where id = $1", [betId]);
  await q("delete from terminal.position_events where id = $1", [sellId]);

  // 1. Your size in Account.
  await signIn(context, "insidir");
  await page.goto("/settings#copy");
  await page.getByTestId("copy-bankroll").fill("2000");
  await page.getByTestId("copy-max").fill("100");
  await page.getByTestId("copy-drop").fill("10");
  await page.getByTestId("copy-save").click();
  await expect(page.getByText("Saved.")).toBeVisible();
  const s = (await q<{ s: { copy: unknown } }>("select settings as s from terminal.users where id = $1", [u.id]))[0]!.s;
  expect(s.copy).toEqual({ bankroll: 2000, maxTrade: 100, dropCents: 10 });
  await page.screenshot({ path: `qa/screenshots/copy-1-bankroll-${w}.png` });

  // Follow the Verified wallet from the leaderboard (Verified first, each check behind it).
  await page.goto("/wallets");
  await expect(page.getByTestId("verified-count")).toContainText("3 of 4 wallets up $1M+ pass every test today.");
  const row = page.getByTestId("verified-row").filter({ hasText: wallet.slice(0, 6) }).filter({ has: page.locator('a[href="/wallet/' + wallet + '"]') });
  await expect(row).toHaveCount(1);
  await expect(page.getByTestId("verified-row").last()).toHaveAttribute("data-verified", "false"); // the one that fails sits below
  await row.getByRole("button", { name: /^Follow/ }).click();
  await expect.poll(async () => (await q("select 1 from terminal.follows where user_id = $1 and kind = 'trader' and target = $2", [u.id, wallet])).length).toBe(1);
  await page.screenshot({ path: `qa/screenshots/copy-2-leaderboard-${w}.png`, fullPage: false });

  // A device with push on (the stand-in endpoint and keys we hold).
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const auth = randomBytes(16), endpoint = `https://localhost:${PUSH_PORT}/push/copy-${w}`;
  await q("insert into terminal.push_subscriptions (endpoint, user_id, p256dh, auth) values ($1, $2, $3, $4)", [endpoint, u.id, b64u(ecdh.getPublicKey()), b64u(auth)]);
  await q("update terminal.users set settings = settings || '{\"alertPush\": true, \"quietStart\": null, \"quietEnd\": null}'::jsonb where id = $1", [u.id]);
  const pushes = () => (JSON.parse(readFileSync(join(OUT, "pushes.json"), "utf8")) as Array<{ path: string; body: string }>).filter(p => endpoint.endsWith(p.path))
    .map(p => JSON.parse(ece.decrypt(Buffer.from(p.body, "base64"), { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString("utf8")) as { title: string; body: string; url: string });

  // 2. The wallet trades $16K on Tennis match 100 (Player A at 55¢): 2% of its $800K bankroll, so $40 of the member's $2,000.
  await q(`insert into terminal.millionaire_bets (id, wallet, tier, source, market_id, event_title, market_title, outcome, outcome_side, amount, price, category, url, yes_label, no_label, at, last_at)
    values ($1, $2, 'millionaire', 'polymarket', '0xe2etennis100', 'E2E fixture: Tennis match 100', 'E2E fixture: Tennis match 100', 'Player A', 'yes', 16000, 0.55, 'tennis',
      'https://polymarket.com/event/e2e-tennis-100', 'Player A', 'Player B', now(), now())`, [betId, wallet]);
  await runWorker(15_000);
  const entry = pushes().find(p => p.url.endsWith(`/copy/${encodeURIComponent(betId)}`));
  expect(entry, "the entry push").toBeTruthy();
  expect(entry!.title).toBe("Signal");
  expect(entry!.body).toContain("Verified 0xe2e0…0002, up $2.4M, opened $16K on Player A in “E2E fixture: Tennis match 100” at 55¢.");
  expect(entry!.body).toContain("Sizing: $40, 2% of your bankroll, as they put in 2% of theirs (matched size, not advice).");
  expect(entry!.body).toMatch(/Kalshi \d+¢, Polymarket \d+¢: (Kalshi|Polymarket) is cheaper\./);

  // 3. The push opens the copy ticket.
  await page.goto(new URL(entry!.url).pathname);
  await expect(page.getByTestId("copy-size")).toContainText("They put in 2%. Sizing: $40.");
  await expect(page.getByTestId("copy-size")).toContainText("Matched size, not advice.");
  await expect(page.getByTestId("copy-amount")).toHaveValue("40");
  await expect(page.getByTestId("copy-cheaper")).toHaveCount(1);
  await page.screenshot({ path: `qa/screenshots/copy-3-ticket-${w}.png` });
  const open = page.getByTestId("copy-open");
  const href = await open.getAttribute("href");
  expect(href).toMatch(/^https:\/\/kalshi\.com\//); // a US member: Kalshi's approved twin of this market
  const [tab] = await Promise.all([context.waitForEvent("page"), open.click()]);
  expect(tab.url()).toContain("kalshi.com");
  await tab.close();
  await expect(page.getByTestId("copy-mark")).toBeVisible();
  await page.getByTestId("copy-placed").click();
  await expect(page.getByTestId("copy-logged")).toContainText("Marked placed");
  const copy = (await q<{ id: number; status: string; venue: string; amount: number; wallet: string }>("select id, status, venue, amount, wallet from terminal.bet_copies where user_id = $1 and bet_id = $2", [u.id, betId]))[0]!;
  expect(copy).toMatchObject({ status: "placed", venue: "kalshi", amount: 40, wallet });
  await page.goto("/copies");
  await expect(page.getByTestId("copy-row").first()).toContainText("copied 0xe2e0…0002 · still in");
  await expect(page.getByTestId("copy-totals")).toBeVisible();
  await page.screenshot({ path: `qa/screenshots/copy-4-mycopies-${w}.png` });
  await page.goto("/");
  await expect(page.getByTestId("copies-total")).toContainText("Your copies this month:");

  // 4. The wallet sells 60% at 84¢: the exit push, with the member's entry, straight to the market.
  await q(`insert into terminal.position_events (id, wallet, tier, market_id, outcome_side, outcome, market_title, event_title, category, url, kind, amount, price, shares, held_after, at, last_at)
    values ($1, $2, 'millionaire', '0xe2etennis100', 'yes', 'Player A', 'E2E fixture: Tennis match 100', 'E2E fixture: Tennis match 100', 'tennis', null, 'trim', 10000, 0.84, 600, 400, now(), now())`, [sellId, wallet]);
  await runWorker(15_000);
  const exit = pushes().find(p => p.title === "Exit signal");
  expect(exit, "the exit push").toBeTruthy();
  expect(exit!.body).toMatch(/^0xe2e0…0002 sold 60% of Player A in “E2E fixture: Tennis match 100” at 84¢\. Result: [+−]\d+%\. You entered at \d+¢\.$/);
  expect(exit!.url).toBe(`${APP_URL}/api/copies/open?id=${copy.id}`);
  const go = await page.request.get(exit!.url, { maxRedirects: 0 });
  expect(go.status()).toBe(307);
  expect(go.headers().location).toMatch(/^https:\/\/kalshi\.com\//);
  await page.goto("/copies");
  await expect(page.getByTestId("copy-row").first()).toContainText("it sold");
  // Leave the board as it was for the other specs.
  await q("delete from terminal.bet_copies where user_id = $1", [u.id]);
  await q("delete from terminal.millionaire_bets where id = $1", [betId]);
  await q("delete from terminal.position_events where id = $1", [sellId]);
  await q("delete from terminal.follows where user_id = $1", [u.id]);
  await q("delete from terminal.push_subscriptions where user_id = $1", [u.id]);
});
