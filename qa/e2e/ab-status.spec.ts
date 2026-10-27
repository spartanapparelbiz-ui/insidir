/* The Price gaps failure states (V2 has one hero, so the old A/B headline test is gone):
 * "Live data paused, retrying" when the scanner stops, stale deals greyed out, and "found X ago" everywhere. */
import { expect, test } from "@playwright/test";
import { q, signIn } from "./helpers";

test("scanner stopped: 'Live data paused, retrying', deals greyed out, nothing called live", async ({ page, context }) => {
  await signIn(context, "pro");
  await page.goto("/gaps");
  await expect(page.locator("tr[data-deal]").first()).toBeVisible();
  await expect(page.getByText("Live data paused, retrying")).toHaveCount(0);
  try {
    await q("insert into terminal.worker_heartbeats (job, last_run_at, ok) values ('e2e:pause', now(), true) on conflict do nothing");
    await q("update terminal.worker_heartbeats set last_run_at = now() - interval '10 minutes' where job like 'scan:%'");
    await q("update terminal.opportunities set last_seen_at = now() - interval '5 minutes' where active");
    await page.reload();
    await expect(page.getByText("Live data paused, retrying").first()).toBeVisible();
    const rows = page.locator("tr[data-deal]");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBe(await page.locator("tr[data-deal].dt-row--stale").count());
    await page.screenshot({ path: `qa/screenshots/terminal-paused-${page.viewportSize()!.width}.png`, fullPage: true });
  } finally {
    await q("delete from terminal.worker_heartbeats where job = 'e2e:pause'");
    await q("update terminal.worker_heartbeats set last_run_at = now(), ok = true, error = null where job like 'scan:%'");
    await q("update terminal.opportunities set last_seen_at = now() where active");
  }
  await page.reload();
  await expect(page.getByText("Live data paused, retrying")).toHaveCount(0);
});
