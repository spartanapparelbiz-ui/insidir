/* The A/B split assigns both hero variants (and renders the one assigned), and the failure states:
 * "Live data paused, retrying" when the scanner stops, stale deals greyed out, and "found X ago" everywhere. */
import { expect, test } from "@playwright/test";
import { AB_TESTS } from "@/lib/analytics";
import { q, signIn } from "./helpers";

test("A/B: new visitors get both variants, each sees its own headline, landing_view records it", async ({ browser }) => {
  const seen: Record<string, number> = { a: 0, b: 0 };
  for (let i = 0; i < 16; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    const cookie = decodeURIComponent((await ctx.cookies()).find(c => c.name === "insidir_ab")!.value);
    const v = cookie.split(":")[1] as "a" | "b";
    seen[v]!++;
    await expect(page.locator("h1")).toHaveText(AB_TESTS.hero[v].headline);
    const vid = (await ctx.cookies()).find(c => c.name === "insidir_vid")!.value;
    await expect.poll(async () => (await q<{ variant: string }>("select variant from terminal.events where visitor_id = $1 and name = 'landing_view'", [vid]))[0]?.variant).toBe(cookie);
    await ctx.close();
  }
  expect(seen.a).toBeGreaterThan(0);
  expect(seen.b).toBeGreaterThan(0);
});

test("scanner stopped: 'Live data paused, retrying', deals greyed out, nothing called live", async ({ page, context }) => {
  await signIn(context, "pro");
  await page.goto("/terminal");
  await expect(page.getByText(/^Found .+ ago/).first()).toBeVisible();
  await expect(page.getByText("Live data paused, retrying")).toHaveCount(0);
  try {
    await q("insert into terminal.worker_heartbeats (job, last_run_at, ok) values ('e2e:pause', now(), true) on conflict do nothing");
    await q("update terminal.worker_heartbeats set last_run_at = now() - interval '10 minutes' where job like 'scan:%'");
    await q("update terminal.opportunities set last_seen_at = now() - interval '5 minutes'");
    await page.reload();
    await expect(page.getByText("Live data paused, retrying").first()).toBeVisible();
    const rows = page.locator(".deal");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBe(await page.locator(".deal.deal--stale").count());
    await page.screenshot({ path: `qa/screenshots/terminal-paused-${page.viewportSize()!.width}.png`, fullPage: true });
  } finally {
    await q("delete from terminal.worker_heartbeats where job = 'e2e:pause'");
    await q("update terminal.worker_heartbeats set last_run_at = now(), ok = true, error = null where job like 'scan:%'");
    await q("update terminal.opportunities set last_seen_at = now()");
  }
  await page.reload();
  await expect(page.getByText("Live data paused, retrying")).toHaveCount(0);
});
