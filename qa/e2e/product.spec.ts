/* The product end to end (fixtures: qa/e2e/seed-millionaires.ts, whose bets are 8–90 minutes old):
 *   /board     visitors 60 minutes late with the live count and Start for $1; members live, Copy on the selected row.
 *   /election  the major races (control first): visitors the top 3 whole, the rest locked; members every race.
 *   Copy       a member opens a bet's ticket from the board: their price vs now, the amount, Open on the venue (US:
 *              Kalshi or view-only, never Polymarket), "I placed it" → Your copies; it settles with the market.
 *   Pings      the worker pushes a $1M+ wallet's $25K+ bet in the member's categories, once, in plain words, to the
 *              copy ticket. */
import { spawn } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { settleBets } from "@/lib/millionaires/bets";
import * as schema from "@/lib/db/schema";
import { APP_URL, E2E_DB, OUT, PUSH_PORT, SERVER_ENV, VAPID } from "./env";
import { pool, q, signIn } from "./helpers";
import { MW } from "./seed-millionaires";
import { E2E_USERS } from "./seed";

// http_ece ships with web-push and has no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece") as { decrypt(buf: Buffer, p: { version: string; privateKey: ReturnType<typeof createECDH>; authSecret: Buffer }): Buffer };
const closed = { name: "insidir_pay_closed", value: "1", url: APP_URL };
const db = drizzle(pool, { schema });

async function bet(id: string, o: { wallet?: string; market: string; title: string; outcome: string; side?: "yes" | "no"; amount: number; price: number; category: string; minsAgo: number; yes?: string; no?: string }) {
  await q(`insert into terminal.millionaire_bets (id, wallet, tier, source, market_id, event_title, market_title, outcome, outcome_side, amount, price, category, url, yes_label, no_label, at, last_at)
    values ($1, $2, 'millionaire', 'polymarket', $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12, now() - make_interval(mins => $13), now() - make_interval(mins => $13))
    on conflict (id) do nothing`,
    [id, o.wallet ?? MW(1), o.market, o.title, o.outcome, o.side ?? "yes", o.amount, o.price, o.category, `https://polymarket.com/event/${o.market}`, o.yes ?? "Yes", o.no ?? "No", o.minsAgo]);
}

test("/board: visitors see bets 60 minutes late with the live count and Start for $1; members see every bet live, each with Copy", async ({ page, context }) => {
  await context.addCookies([closed]);
  await page.goto("/board");
  await expect(page.getByTestId("board-delay")).toContainText("60 minutes late");
  // Today's count since midnight ET: all six fixture Millionaire bets (8–90 minutes old) once they're all after midnight;
  // just after midnight, the last hour's (never a 0).
  const etMinutes = (() => { const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()); return Number(p.find(x => x.type === "hour")!.value) * 60 + Number(p.find(x => x.type === "minute")!.value); })();
  await expect(page.getByTestId("board-live-count")).toHaveText(/^[1-9]\d*$/);
  if (etMinutes > 95) expect(Number(await page.getByTestId("board-live-count").textContent())).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId("board-start")).toHaveAttribute("href", "/go");
  const visitor = await page.getByTestId("bet-row").evaluateAll(rs => rs.flatMap(r => (r.getAttribute("data-ids") ?? r.getAttribute("data-bet") ?? "").split(" ")));
  // Only the fixtures older than an hour (read from the database: a long run ages them); never a newer one, no Copy, no side.
  const ages = await q<{ id: string; old: boolean }>("select id, at < now() - interval '60 minutes' as old from terminal.millionaire_bets where id like 'e2e:mb%'");
  for (const { id, old } of ages) { if (old) continue; expect(visitor, id).not.toContain(id); }
  // "Wallets up $1M+" means $1M+: the Pro fixture (mb3) only under the Pro filter.
  expect(visitor).toEqual(expect.arrayContaining(["e2e:mb6"]));
  expect(visitor).not.toContain("e2e:mb3");
  await page.goto("/board?tier=pro");
  expect(await page.getByTestId("bet-row").evaluateAll(rs => rs.flatMap(r => (r.getAttribute("data-ids") ?? "").split(" ")))).toContain("e2e:mb3");
  await page.goto("/board");
  await expect(page.getByTestId("bet-copy")).toHaveCount(0);
  const live = await page.request.get("/api/millionaires/live?n=20&board=1");
  const bodyV = await live.json() as { bets: Array<{ id: string; side: string | null }> };
  expect(bodyV.bets.every(b => b.side === null)).toBe(true);
  expect(bodyV.bets.map(b => b.id)).not.toContain("e2e:mb4");
  await signIn(context, "insidir");
  await page.goto("/board");
  await expect(page.getByTestId("board-delay")).toHaveCount(0);
  const member = await page.getByTestId("bet-row").evaluateAll(rs => rs.map(r => r.getAttribute("data-bet")));
  expect(member[0]).toBe("e2e:mb4"); // newest first, 8 minutes ago
  // A written list, not an odds board: Copy shows only on the row you select.
  await expect(page.getByTestId("bet-copy")).toHaveCount(0);
  await page.getByTestId("bet-row").first().locator("button").first().click();
  await expect(page.getByTestId("bet-copy")).toHaveAttribute("href", "/copy/e2e%3Amb4");
  // Category filter.
  await page.goto("/board?cat=tennis");
  for (const id of await page.getByTestId("bet-row").evaluateAll(rs => rs.map(r => r.getAttribute("data-bet")))) expect(["e2e:mb1", "e2e:mb2", "e2e:mb3"]).toContain(id);
});

test("/election: control of the Senate and House first; visitors get the top 3 whole and the rest locked; members every race", async ({ page, context }) => {
  const races: Array<[string, string, number]> = [
    ["0xe2erace1", "Which party will control the Senate after the 2026 midterms?", 400_000], ["0xe2erace2", "Which party will control the House after the 2026 midterms?", 300_000],
    ["0xe2erace3", "Will the Republicans win the Texas Senate race in 2026?", 250_000], ["0xe2erace4", "Will the Democrats win the Georgia governor race?", 200_000],
    ["0xe2erace5", "Will the Republicans win the Ohio Senate race in 2026?", 150_000], ["0xe2erace6", "Will Republicans win Iowa and Kansas, and lose Alaska, Maine, and Ohio?", 900_000],
  ];
  try {
    for (const [id, title, amount] of races) {
      await bet(`e2e:${id}`, { market: id, title, outcome: "Yes", amount, price: 0.55, category: "elections", minsAgo: 30 });
      await q("insert into terminal.market_info (source, market_id, yes_price, updated_at) values ('polymarket', $1, 0.58, now()) on conflict (source, market_id) do update set yes_price = 0.58", [id]);
    }
    await context.addCookies([closed]);
    await page.goto("/election");
    // The headline is computed from the money; the stage is the homepage's (a dusk scene, the masked headline).
    await expect(page.getByTestId("insight")).toBeVisible();
    // The headline and its race card can never disagree: the headline's amount and side ("bet $400K on …") are what
    // the card shows for that candidate in that race.
    // (Candidates come from Polymarket's events; without them, as offline here, there is no candidate claim at all.)
    const lead = page.getByTestId("election-lead");
    const headline = (await page.getByTestId("insight").textContent())!.replace(/\s+/g, " ").trim();
    if (await lead.count()) {
      const [raceKey, candidate, side] = await Promise.all(["data-race", "data-candidate", "data-side"].map(a => lead.getAttribute(a)));
      const amount = headline.match(/\$[\d.,]+[KM]?/)![0];
      expect(headline).toMatch(new RegExp(`^Millionaires bet \\${amount} ${side} `));
      await expect(page.locator(`[data-testid="race-card"][data-race="${raceKey}"] [data-market="${candidate}"] [data-testid="candidate-money"]`)).toContainText(`${amount} ${side}`);
    } else {
      expect(headline).toBe("Tonight. Every race.");
      await expect(page.getByTestId("candidate-money")).toHaveCount(0);
    }
    const free = page.getByTestId("race-card");
    await expect(free).toHaveCount(3);
    await expect(free.nth(0)).toContainText("control the Senate"); // control first, then by money
    await expect(free.nth(1)).toContainText("control the House");
    await expect(free.nth(2)).toContainText("Texas Senate race");
    await expect(free.nth(0)).toContainText("58¢");
    await expect(page.getByTestId("election-locked").locator("li")).toHaveCount(2);
    await expect(page.locator("main")).not.toContainText("Iowa and Kansas"); // a combination bet isn't a race
    await expect(page.getByTestId("election-start")).toBeVisible();
    // The locked rows never carry their split or price.
    const api = await (await page.request.get("/api/millionaires/election")).json() as { free: unknown[]; locked: Array<Record<string, unknown>> };
    expect(api.free).toHaveLength(3);
    expect(Object.keys(api.locked[0]!).sort()).toEqual(["title", "total"]);
    await signIn(context, "insidir");
    await page.goto("/election");
    await expect(page.getByTestId("race-card")).toHaveCount(5);
    await expect(page.getByTestId("election-locked")).toHaveCount(0);
    await expect(page.locator(".b-sidebar")).toHaveCount(0);
  } finally {
    for (const [id] of races) { await q("delete from terminal.millionaire_bets where id = $1", [`e2e:${id}`]); await q("delete from terminal.market_info where market_id = $1", [id]); }
  }
});

test("one-tap copy: Copy on the board opens the ticket; Open on the venue; I placed it → Your copies; it settles with the market, losses included", async ({ page, context }) => {
  const id = `e2e:copy-${page.viewportSize()!.width}`, market = `0xe2ecopy${page.viewportSize()!.width}`;
  const cleanup = async () => { await q("delete from terminal.bet_copies where bet_id = $1", [id]); await q("delete from terminal.millionaire_bets where id = $1", [id]); await q("delete from terminal.market_info where market_id = $1", [market]); };
  await cleanup();
  try {
    await bet(id, { market, title: "Ravens vs. Steelers", outcome: "Ravens", amount: 120_000, price: 0.6, category: "football", minsAgo: 2, yes: "Ravens", no: "Steelers" });
    await q("insert into terminal.market_info (source, market_id, yes_price, updated_at) values ('polymarket', $1, 0.62, now())", [market]);
    // Outside the US: Open on Polymarket, straight to the market.
    await signIn(context, "proIntl");
    await context.addCookies([closed]);
    await page.goto("/board");
    await page.locator(`[data-bet="${id}"]`).locator("button").first().click();
    await page.locator(`[data-bet="${id}"]`).getByTestId("bet-copy").click();
    await expect(page.getByTestId("copy-title")).toHaveText("Ravens vs. Steelers");
    await expect(page.getByTestId("copy-their")).toHaveText("60¢");
    await expect(page.getByTestId("copy-now")).toHaveText("62¢");
    await expect(page.getByTestId("copy-ticket")).toContainText("+$3.1M all-time");
    await expect(page.getByTestId("copy-open")).toHaveText("Open on Polymarket");
    await expect(page.getByTestId("copy-open")).toHaveAttribute("href", `https://polymarket.com/event/${market}`);
    await expect(page.getByTestId("copy-amount")).toHaveValue("10"); // the default from Account
    await page.getByTestId("copy-amount").fill("50");
    await page.getByTestId("copy-placed").click();
    await expect(page.getByTestId("copy-logged")).toContainText("Your copies");
    const row = (await q<{ amount: number; price: number; venue: string; result: string | null }>("select amount, price, venue, result from terminal.bet_copies where bet_id = $1", [id]))[0]!;
    expect(row).toEqual({ amount: 50, price: 0.62, venue: "polymarket", result: null });
    await page.goto("/copies/yours");
    await expect(page.getByTestId("your-copy").first()).toHaveAttribute("data-result", "open");
    // The market settles against them: the copy loses its whole amount, and it's shown.
    await settleBets(db, market, "no", new Date());
    await page.reload();
    await expect(page.locator("[data-testid=your-copy][data-result=lost]").first()).toContainText("−$50");
    await expect(page.getByTestId("copies-net")).toContainText("−$50");
    // A US member never gets a Polymarket link: no Kalshi match here, so the ticket is view-only.
    await q("delete from terminal.millionaire_bets where id = $1", [id]);
    await bet(id, { market, title: "Ravens vs. Steelers", outcome: "Ravens", amount: 120_000, price: 0.6, category: "football", minsAgo: 2, yes: "Ravens", no: "Steelers" });
    await context.clearCookies();
    await signIn(context, "insidir");
    await page.goto(`/copy/${encodeURIComponent(id)}`);
    await expect(page.getByTestId("copy-view-only")).toContainText("Kalshi only");
    expect(await page.content()).not.toContain("polymarket.com/event");
    // Visitors: no side, no ticket; Start for $1.
    await context.clearCookies();
    await page.goto(`/copy/${encodeURIComponent(id)}`);
    await expect(page.getByTestId("copy-start")).toBeVisible();
    await expect(page.getByTestId("copy-their")).toHaveCount(0);
    expect(await page.content()).not.toContain("60¢");
  } finally {
    await cleanup();
  }
});

function runWorker(ms: number): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn("npx", ["tsx", "worker/index.ts"], {
      env: { ...process.env, DATABASE_URL: E2E_DB, APP_URL, INSIDIR_VAPID_PUBLIC_KEY: VAPID.publicKey, INSIDIR_VAPID_PRIVATE_KEY: VAPID.privateKey, VAPID_SUBJECT: "mailto:qa@insidir.com",
        NODE_EXTRA_CA_CERTS: join(OUT, "push-cert.pem"), WORKER_RUN_FOR_MS: String(ms), ALERT_MS: "1000", WHALE_MS: "3600000", SETTLE_MS: "3600000",
        KALSHI_API_URL: "http://127.0.0.1:9", POLYMARKET_GAMMA_URL: "http://127.0.0.1:9", POLYMARKET_CLOB_URL: "http://127.0.0.1:9", POLYMARKET_DATA_URL: "http://127.0.0.1:9",
        POLYMARKET_US_ENABLED: "0", FEATURES_READY: SERVER_ENV.FEATURES_READY },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    p.stdout.on("data", d => (log += d)); p.stderr.on("data", d => (log += d));
    p.on("exit", () => ok(log)); p.on("error", fail);
  });
}

test("pings: the worker pushes a $1M+ wallet's $25K+ bet in the member's categories, once, to the copy ticket", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium");
  test.setTimeout(90_000);
  const ins = E2E_USERS.insidir!, w = page.viewportSize()!.width;
  const id = `e2e:ping-${w}`, small = `e2e:ping-small-${w}`, market = `0xe2eping${w}`;
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const auth = randomBytes(16), endpoint = `https://localhost:${PUSH_PORT}/push/ping-${w}`;
  const cleanup = async () => {
    await q("delete from terminal.alerts_sent where user_id = $1", [ins.id]);
    await q("delete from terminal.push_subscriptions where user_id = $1", [ins.id]);
    await q("delete from terminal.millionaire_bets where id in ($1, $2)", [id, small]);
    await q("delete from terminal.market_info where market_id = $1", [market]);
    await q("update terminal.users set settings = settings || '{\"alertPush\": false}'::jsonb where id = $1", [ins.id]);
  };
  await cleanup();
  try {
    await q("insert into terminal.push_subscriptions (endpoint, user_id, p256dh, auth) values ($1, $2, $3, $4)", [endpoint, ins.id, Buffer.from(ecdh.getPublicKey()).toString("base64url"), auth.toString("base64url")]);
    // Their categories: Football and Politics (/go); quiet hours off for the test (equal start and end: none; null
    // would mean the 11pm–8am default, so this test would fail at night).
    await q(`update terminal.users set settings = settings || '{"alertPush": true, "quietStart": "00:00", "quietEnd": "00:00", "go": {"categories": ["football", "politics"], "where": null, "size": null}}'::jsonb where id = $1`, [ins.id]);
    await bet(id, { market, title: "Ravens vs. Steelers", outcome: "Ravens", amount: 120_000, price: 0.6, category: "football", minsAgo: 1, yes: "Ravens", no: "Steelers" });
    await bet(small, { market, title: "Ravens vs. Steelers", outcome: "Ravens", amount: 20_000, price: 0.6, category: "football", minsAgo: 1, yes: "Ravens", no: "Steelers" });
    await q("insert into terminal.market_info (source, market_id, yes_price, updated_at) values ('polymarket', $1, 0.61, now())", [market]);
    const read = () => JSON.parse(readFileSync(join(OUT, "pushes.json"), "utf8")) as Array<{ path: string; body: string }>;
    const before = read().length;
    const log = await runWorker(8_000);
    const mine = read().slice(before).filter(p => endpoint.endsWith(p.path));
    const payloads = mine.map(m => JSON.parse(ece.decrypt(Buffer.from(m.body, "base64"), { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString("utf8")) as { title: string; body: string; url: string });
    const ravens = payloads.filter(p => p.url.endsWith(encodeURIComponent(id)));
    expect(ravens.length, log).toBe(1);
    expect(ravens[0]!.body).toBe("A +$3.1M wallet just put $120K on Ravens in Ravens vs. Steelers at 60¢ (now 61¢). Copy?");
    expect(ravens[0]!.url).toBe(`${APP_URL}/copy/${encodeURIComponent(id)}`);
    expect(payloads.some(p => p.url.endsWith(encodeURIComponent(small)))).toBe(false); // under $25K: no ping
    expect((await q("select 1 from terminal.alerts_sent where user_id = $1 and opp_id = $2", [ins.id, `mil:${id}`])).length).toBe(1);
    // Run again: never twice.
    const again = read().length;
    await runWorker(4_000);
    expect(read().slice(again).filter(p => endpoint.endsWith(p.path)).length).toBe(0);
  } finally {
    await cleanup();
  }
});
