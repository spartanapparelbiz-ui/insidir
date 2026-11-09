/* Attribution and /admin/metrics, end to end:
 *   a bio link (/tt1?utm_content=reel9) lands on the home page with ?ref=tt1, keeps the post tag, sets the first-touch
 *   and last-touch cookies and logs one "touch" for the visitor (source tt1); a later visit from another link replaces
 *   only the last touch;
 *   /admin/metrics (owner only) groups accounts and visits by account and by post, and its CSV adds up to the table. */
import { expect, test } from "@playwright/test";
import { ADMIN_COOKIE, adminCookieValue } from "@/lib/admin";
import { SERVER_ENV } from "./env";
import { q, shotName } from "./helpers";

const BASE = "http://localhost:3100";
// A real browser's user agent: headless Chrome is skipped as a bot when visits are counted (middleware.ts).
test.use({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" });

test("a bio link: /tt1 → /?ref=tt1 with the post tag; first and last touch kept; the visit logged under tt1", async ({ page, context }) => {
  await page.goto("/tt1?utm_content=reel9");
  await expect(page).toHaveURL(/\/\?ref=tt1&utm_content=reel9$/);
  const jar = async () => Object.fromEntries((await context.cookies()).map(c => [c.name, c.value]));
  const c1 = await jar();
  const first = JSON.parse(decodeURIComponent(c1.insidir_ft!)), last1 = JSON.parse(decodeURIComponent(c1.insidir_lt!));
  expect(first).toMatchObject({ ref: "tt1", utm_content: "reel9", source: "tt1", landing: "/" });
  expect(last1.source).toBe("tt1");
  const vid = c1.insidir_vid!;
  await expect.poll(async () => (await q<{ source: string }>("select props->>'source' as source from terminal.events where name = 'touch' and visitor_id = $1 and props->>'kind' = 'first'", [vid]))[0]?.source, { timeout: 10_000 }).toBe("tt1");
  // Another account's link later: the last touch moves, the first stays.
  await page.goto("/ig2?utm_content=story3");
  const c2 = await jar();
  expect(JSON.parse(decodeURIComponent(c2.insidir_ft!)).source).toBe("tt1");
  expect(JSON.parse(decodeURIComponent(c2.insidir_lt!))).toMatchObject({ ref: "ig2", utm_content: "story3" });
  // Real pages at short paths are untouched.
  expect((await page.request.get("/go", { maxRedirects: 0 })).status()).not.toBe(307);
});

test("/admin/metrics: owner only, by account and by post, with a CSV that matches", async ({ page, context }) => {
  expect((await page.request.get("/admin/metrics/csv")).status()).toBe(401);
  // Two accounts from tt1 (one paying past its trial), one from ig1, one direct, made just now.
  await q("delete from terminal.events where user_id like 'usr_e2e_attr%' or visitor_id like 'attr%'");
  await q("delete from terminal.users where id like 'usr_e2e_attr%'");
  const day = 86_400_000, now = Date.now();
  const users: Array<[string, string, string | null, boolean]> = [["1", "tt1", "reel9", true], ["2", "tt1", "reel10", false], ["3", "ig1", null, false], ["4", "direct", null, false]];
  for (const [i, src, content, paying] of users) {
    await q(`insert into terminal.users (id, email, plan, membership_status, source, first_touch, created_at) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [`usr_e2e_attr${i}`, `attr${i}@example.test`, paying ? "insidir" : "free", paying ? "active" : null, src, JSON.stringify({ source: src, ...(content ? { utm_content: content } : {}) }), new Date(now - 5 * day)]);
    await q(`insert into terminal.events (visitor_id, name, props, at) values ($1, 'touch', $2::jsonb, $3)`, [`attr${i}`.padEnd(32, "0"), JSON.stringify({ kind: "first", source: src, ...(content ? { utm_content: content } : {}) }), new Date(now - 5 * day)]);
  }
  await q(`insert into terminal.events (visitor_id, user_id, name, props, at, dedupe_key) values
    ('server', 'usr_e2e_attr1', 'trial_start', '{"source":"tt1"}', $1, 'e2e:t1'), ('server', 'usr_e2e_attr1', 'trial_convert', '{"source":"tt1"}', $2, 'e2e:c1'),
    ('server', 'usr_e2e_attr2', 'trial_start', '{"source":"tt1"}', $1, 'e2e:t2'), ('server', 'usr_e2e_attr1', 'brief_open', '{}', $1, 'e2e:b1')`, [new Date(now - 5 * day), new Date(now - day)]);
  await context.addCookies([{ name: ADMIN_COOKIE, value: adminCookieValue(SERVER_ENV.ADMIN_TOKEN!, now + 3_600_000), url: BASE }]);
  await page.goto("/admin/metrics?days=30");
  const tt1 = page.locator('[data-testid=metrics-row][data-source="tt1"]');
  await expect(tt1).toBeVisible();
  // tt1: 2 signups, 2 trials, 1 paid, 1 of 2 trials past 3 days converted, $39 MRR, 1 of 2 activated.
  await expect(tt1.locator("td")).toHaveText([/tt1\s*\(tiktok\)/, /\d+/, "2", "2", "1", "50%", "$39", "0%", "50%"]);
  await expect(page.getByTestId("metrics-retention")).toBeVisible();
  await page.screenshot({ path: shotName("admin-metrics", page), fullPage: false });
  await page.goto("/admin/metrics?days=30&by=post");
  await expect(page.locator('[data-testid=metrics-row][data-source="tt1 · reel9"]')).toBeVisible();
  const csv = await (await page.request.get("/admin/metrics/csv?days=30&by=source")).text();
  const row = csv.split("\n").find(l => l.split(",")[2] === "tt1")!.split(",");
  expect(row.slice(4, 8)).toEqual(["2", "2", "1", "2"]);
  expect(row[11]).toBe("39");
  await q("delete from terminal.events where user_id like 'usr_e2e_attr%' or visitor_id like 'attr%'");
  await q("delete from terminal.users where id like 'usr_e2e_attr%'");
});
