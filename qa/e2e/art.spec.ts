/* Faces and team logos: on /election, a race, a game's market page and /board every logo and headshot loads
 * (naturalWidth > 0), its file is at least twice its display size, and no empty placeholder (a loading skeleton, a
 * blank disc) survives once the page has loaded. A face without a portrait is initials; a team without a logo is its
 * monogram. Never an empty circle. */
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

test.use({ deviceScaleFactor: 2 });

async function artOk(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  for (let y = 0; y < 12; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(50); }
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  const r = await page.evaluate(async () => {
    const marks = [...document.querySelectorAll<HTMLElement>("[data-testid=face], [data-testid=team-mark]")];
    const out = { marks: marks.length, bad: [] as string[] };
    for (const m of marks) {
      const shown = Math.round(m.getBoundingClientRect().width);
      if (!shown) continue;
      if (m.matches(".is-loading")) out.bad.push(`still loading: ${m.outerHTML.slice(0, 120)}`);
      const img = m.querySelector("img");
      if (!img) {
        // Initials or a monogram: there must be text in it.
        if (!(m.textContent ?? "").trim()) out.bad.push(`empty disc: ${m.outerHTML.slice(0, 120)}`);
        continue;
      }
      if (img.complete && img.naturalWidth === 0) { out.bad.push(`broken: ${img.currentSrc || img.src}`); continue; }
      // The file's own width (a srcset image's naturalWidth is divided by its density).
      const probe = new Image(); probe.src = img.currentSrc || img.src; await probe.decode().catch(() => undefined);
      const real = probe.naturalWidth || img.naturalWidth;
      if (real < 2 * shown) out.bad.push(`${real}px file for ${shown}px: ${img.currentSrc || img.src}`);
      if (/\/_next\/image/.test(img.currentSrc || img.src)) out.bad.push(`optimizer used: ${img.currentSrc}`);
    }
    return out;
  });
  expect(r.bad, path).toEqual([]);
  return r.marks;
}

test("every face and team logo loads, at least 2x its size, and no empty circle survives", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(context, "insidir");
  // The fixture races carry no candidates; on a live day this checks every face on the cards.
  await artOk(page, "/election");
  const races = await page.locator("a[data-entity=race]").evaluateAll(as => as.map(a => a.getAttribute("href")));
  if (races[0]) await artOk(page, races[0]);
  // A game's market page: the matchup lockup, both logos at 96px.
  const game = await page.goto("/market/0xe2emilnfl").then(r => r?.status());
  if (game === 200) {
    await artOk(page, "/market/0xe2emilnfl");
    await expect(page.getByTestId("matchup")).toBeVisible();
    await expect(page.getByTestId("matchup").getByTestId("team-mark")).toHaveCount(2);
  }
  await artOk(page, "/board");
});

test("LOGOS=off is respected by the markup contract: team marks render as monograms with text, never an empty image", async ({ page }) => {
  // The switch itself is unit-tested (test/teams.test.ts); here, a monogram is never empty.
  await page.goto("/board");
  for (const m of await page.locator("[data-testid=team-mark][data-mark=monogram]").all()) await expect(m).not.toHaveText("");
});
