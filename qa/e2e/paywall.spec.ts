/* Paid data never reaches a free browser: every response body (HTML, React Server Component payloads, /api/feed
 * JSON) is scanned while a signed-out visitor and a signed-in free member use the site. Fresh deals (under 30
 * minutes old) must not appear at all; delayed deals must not carry their size, cost, fees or profit. */
import { expect, test } from "@playwright/test";
import { captureBodies, dealId, q, signIn } from "./helpers";

interface Paid { id: string; title: string; profit: number; cost: number; fees: number; sets: number }

async function seeded(): Promise<{ fresh: Paid[]; old: Paid[] }> {
  const rows = await q<{ id: string; data: { title: string; profit: number; cost: number; fees: number; sets: number }; age: number }>(
    "select id, data, extract(epoch from now() - first_seen_at)::int as age from terminal.opportunities");
  const all = rows.map(r => ({ id: r.id, title: r.data.title, profit: r.data.profit, cost: r.data.cost, fees: r.data.fees, sets: r.data.sets, age: r.age }));
  return { fresh: all.filter(r => r.age < 30 * 60), old: all.filter(r => r.age >= 30 * 60) };
}

/** Ways a number can appear: raw JSON and as shown on screen. */
const shapes = (v: number): string[] => [JSON.stringify(v), `$${v.toFixed(2)}`];

for (const who of ["visitor", "free member"] as const) {
  test(`no paid fields reach a ${who}`, async ({ page, context }) => {
    if (who === "free member") await signIn(context, "freeUs");
    const { fresh, old } = await seeded();
    expect(fresh.length).toBeGreaterThan(0);
    const bodies = await captureBodies(page, async () => {
      for (const path of ["/", "/terminal", "/receipts", "/pricing", `/deal/${await dealId("Jets")}`, `/deal/${await dealId("Hawks")}`, `/deal/${await dealId("award")}`]) {
        await page.goto(path);
        await page.waitForTimeout(300);
      }
      await page.goto("/terminal");
      await page.evaluate(() => fetch("/api/feed").then(r => r.text()));
    });
    expect(bodies.length).toBeGreaterThan(5);
    const leaks: string[] = [];
    for (const { url, body } of bodies) {
      for (const f of fresh) {
        if (body.includes(f.id)) leaks.push(`${url}: fresh deal id ${f.id}`);
        if (body.includes(f.title.replace("E2E fixture: ", ""))) leaks.push(`${url}: fresh deal title ${f.title}`);
      }
      for (const o of old) {
        for (const [k, v] of [["profit", o.profit], ["cost", o.cost], ["fees", o.fees]] as const) {
          for (const s of shapes(v)) if (v > 0 && body.includes(s)) leaks.push(`${url}: ${k} ${s} of ${o.title}`);
        }
        if (body.includes(`"sets":${o.sets}`)) leaks.push(`${url}: sets of ${o.title}`);
      }
    }
    expect(leaks).toEqual([]);
    // And the API says so explicitly.
    const feed = await (await page.request.get("/api/feed")).json() as { rows: Array<{ profit: unknown; cost: unknown; fees: unknown; sets: unknown; locked: boolean }> };
    expect(feed.rows.length).toBeLessThanOrEqual(3);
    for (const r of feed.rows) expect([r.profit, r.cost, r.fees, r.sets, r.locked]).toEqual([null, null, null, null, true]);
  });
}

test("a paid member does get the live numbers", async ({ page, context }) => {
  await signIn(context, "pro");
  const feed = await (await page.request.get("/api/feed")).json() as { rows: Array<{ title: string; profit: number | null }> };
  const hawks = feed.rows.find(r => r.title.includes("Hawks"));
  expect(hawks?.profit).toBeCloseTo(2.06, 2);
});
