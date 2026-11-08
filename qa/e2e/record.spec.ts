/* Verify links and the public record, end to end, against the millionaire fixtures (qa/e2e/seed-millionaires.ts: every
 * bet but one has a Polygon transaction; the record job has logged them all).
 *   /record   public: the summary from every row in the filter and its line; losses shown exactly like wins; an open
 *             position's side, prices, move, transaction and wallet never sent to a visitor (any body: HTML, RSC); a
 *             settled one's transaction public. Members see open sides and download the filter as CSV, whose rows
 *             add up to the summary. Visitors can't download it.
 *   Verify    a member's board rows link the trade to Polygonscan and the wallet to its address page; the one bet with
 *             no transaction says "Source pending"; a visitor's open rows say "Trade after it settles". */
import { expect, test } from "@playwright/test";
import { captureBodies, noHorizontalScroll, q, shotName, signIn } from "./helpers";

const closed = { name: "insidir_pay_closed", value: "1", url: "http://localhost:3100" };
/** Wide enough to hold the settled fixtures (10 to 39 days old), losses included. */
const since = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() - 60 * 86_400_000));

test("/record for a visitor: every position, losses included; an open side is never sent", async ({ page, context }) => {
  await context.addCookies([closed]);
  const open = await q<{ id: string; outcome: string; transaction_hash: string | null; wallet: string }>("select id, outcome, transaction_hash, wallet from terminal.record_log where result is null");
  const settled = await q<{ transaction_hash: string }>("select transaction_hash from terminal.record_log where result = 'lost' and transaction_hash is not null limit 1");
  expect(open.length).toBeGreaterThan(0);
  const bodies = await captureBodies(page, async () => { await page.goto(`/record?from=${since()}`); await page.getByTestId("record-rows").waitFor(); });
  await expect(page.getByTestId("record-disclaimer")).toHaveText("Every position we've flagged, losses included. Past results don't predict future ones. Information, not advice.");
  const all = await q<{ n: number; won: number; lost: number }>(`select count(*)::int as n, count(*) filter (where result = 'won')::int as won, count(*) filter (where result = 'lost')::int as lost
    from terminal.record_log where flagged_at >= ($1::date)::timestamp at time zone 'America/New_York'`, [since()]);
  await expect(page.getByTestId("record-logged")).toHaveText(String(all[0]!.n));
  await expect(page.getByTestId("record-won-share")).toHaveText(`${Math.round((all[0]!.won / (all[0]!.won + all[0]!.lost)) * 100)}%`);
  // Losses show exactly like wins.
  await expect(page.locator('[data-testid=record-row][data-result=lost]')).toHaveCount(all[0]!.lost);
  await expect(page.locator('[data-testid=record-row][data-result=lost]').first().getByTestId("verify-tx")).toHaveAttribute("href", `https://polygonscan.com/tx/${settled[0]!.transaction_hash}`);
  // Open rows: no side, no transaction, no wallet address, by link or by any body the browser received.
  const openRows = page.locator('[data-testid=record-row][data-result=open]');
  await expect(openRows.first().locator('[data-locked=side]')).toBeVisible();
  await expect(openRows.getByTestId("verify-tx")).toHaveCount(0);
  await expect(page.getByTestId("verify-wallet")).toHaveCount(0);
  for (const b of bodies) for (const o of open) {
    if (o.transaction_hash) expect(b.body, `${b.url} leaks ${o.id}'s transaction`).not.toContain(o.transaction_hash);
    expect(b.body, `${b.url} leaks ${o.id}'s wallet address`).not.toContain(o.wallet);
  }
  // The CSV is for members.
  expect((await page.request.get(`/record/csv?from=${since()}`)).status()).toBe(401);
  await page.screenshot({ path: shotName("record", page), fullPage: false });
  await noHorizontalScroll(page);
});

test("/record for a member: open sides, and a CSV that adds up to the summary", async ({ page, context }) => {
  await context.addCookies([closed]);
  await signIn(context, "pro");
  await page.goto(`/record?from=${since()}`);
  const openRow = page.locator('[data-testid=record-row][data-result=open]').first();
  await expect(openRow.locator('[data-locked=side]')).toHaveCount(0);
  await expect(page.getByTestId("record-csv")).toBeVisible();
  const res = await page.request.get(`/record/csv?from=${since()}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const lines = (await res.text()).trim().split("\n").slice(1);
  await expect(page.getByTestId("record-logged")).toHaveText(String(lines.length));
  const won = lines.filter(l => l.includes(",Won,")).length, lost = lines.filter(l => l.includes(",Lost,")).length;
  await expect(page.getByTestId("record-won-share")).toHaveText(`${Math.round((won / (won + lost)) * 100)}%`);
});

test("Verify on the board: a member's trade and wallet links, Source pending, and a visitor's locked trade", async ({ page, context }) => {
  await context.addCookies([closed]);
  await signIn(context, "pro");
  await page.goto("/board?tier=pro");
  await page.goto("/board");
  const row = page.getByTestId("bet-row").first();
  await expect(row.getByTestId("verify-tx")).toHaveAttribute("href", /^https:\/\/polygonscan\.com\/tx\/0x[0-9a-e]{64}$/);
  await expect(row.getByTestId("verify-wallet")).toHaveAttribute("href", /^https:\/\/polygonscan\.com\/address\/0xe2e0/);
  await expect(row.getByTestId("verify-fetched")).toContainText(/fetched .* ET/);
  await page.screenshot({ path: shotName("board-verify", page), fullPage: false });
  await page.goto("/board?tier=pro");
  await expect(page.locator('[data-bet="e2e:mb8"]').getByTestId("verify-pending")).toHaveText("Source pending");
  await context.clearCookies({ name: "insidir_session" });
  await page.goto("/board");
  const visitorRow = page.getByTestId("bet-row").first();
  await expect(visitorRow.getByTestId("verify")).toBeVisible();
  await expect(visitorRow.getByTestId("verify-tx")).toHaveCount(0);
  await expect(visitorRow.getByTestId("verify-wallet")).toHaveCount(0);
});
