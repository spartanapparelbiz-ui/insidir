/* Before/after screenshots for a copy pass (SHOTS_DIR=<dir>, SHOTS_TAG=before|after): the homepage (visitor), Live
 * (the board), the Ledger (/copies, a member) and /methodology, at each project's width. Skipped unless SHOTS_DIR is set. */
import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";
import { signIn } from "./helpers";

const DIR = process.env.SHOTS_DIR, TAG = process.env.SHOTS_TAG ?? "shot";

test("copy pass screenshots", async ({ page, context }) => {
  test.skip(!DIR);
  test.setTimeout(120_000);
  mkdirSync(DIR!, { recursive: true });
  const w = page.viewportSize()!.width;
  const shot = async (name: string, path: string) => {
    await page.goto(path);
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelectorAll("[data-m]").forEach(e => (e as HTMLElement).style.opacity = "1"));
    await page.screenshot({ path: `${DIR}/${TAG}-${name}-${w}.png`, fullPage: true });
  };
  await shot("home", "/");
  await shot("methodology", "/methodology");
  await signIn(context, "insidir");
  await shot("live", "/board");
  await shot("ledger", "/copies");
});
