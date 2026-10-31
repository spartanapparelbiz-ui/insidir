/* Paid data never reaches someone without a plan (visitors and members without a plan see the 30-minute-delayed view): every response body (HTML, React Server Component payloads, /api/feed
 * JSON) is scanned while a signed-out visitor and a signed-in free member use the site. Fresh deals (under 30
 * minutes old) must not appear at all; delayed deals must not carry their size, cost, fees or profit. */
import { expect, test } from "@playwright/test";
import { captureBodies, dealId, q, signIn } from "./helpers";

interface Paid { id: string; title: string; profit: number; cost: number; fees: number; sets: number }

async function seeded(): Promise<{ fresh: Paid[]; old: Paid[] }> {
  const rows = await q<{ id: string; data: { title: string; profit: number; cost: number; fees: number; sets: number }; age: number }>(
    // The deals in play (the last day). Older deals have settled: their results are the public receipts log.
    "select id, data, extract(epoch from now() - first_seen_at)::int as age from terminal.opportunities where last_seen_at > now() - interval '1 day'");
  const all = rows.map(r => ({ id: r.id, title: r.data.title, profit: r.data.profit, cost: r.data.cost, fees: r.data.fees, sets: r.data.sets, age: r.age }));
  return { fresh: all.filter(r => r.age < 30 * 60), old: all.filter(r => r.age >= 30 * 60) };
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Ways a paid number can appear: as a JSON field ("profit":6.92, or \"profit\":6.92 inside the page's RSC payload), as a standalone decimal, or as dollars on screen.
 *  Whole numbers only count as JSON fields (a bare "90" appears in any stylesheet or SVG path). */
function leaks(body: string, field: string, v: number): string | null {
  const json = JSON.stringify(v);
  const pats = [new RegExp(`\\\\?"${field}\\\\?":${esc(json)}(?![\\d.])`), new RegExp(`(?<![\\d.])${esc("$" + v.toFixed(2))}(?!\\d)`)];
  if (!Number.isInteger(v)) pats.push(new RegExp(`(?<![\\d.])${esc(json)}(?![\\d])`));
  const hit = pats.find(r => r.test(body));
  return hit ? body.match(hit)![0] : null;
}

for (const who of ["visitor", "member without a plan"] as const) {
  test(`no paid fields reach a ${who}`, async ({ page, context }) => {
    if (who === "member without a plan") await signIn(context, "freeUs");
    const { fresh, old } = await seeded();
    expect(fresh.length).toBeGreaterThan(0);
    const bodies = await captureBodies(page, async () => {
      for (const path of ["/", "/pricing", "/sports", "/markets", "/feed", "/whales", "/market/0xe2emarket1", "/gaps", "/receipts", `/deal/${await dealId("Jets")}`, `/deal/${await dealId("Hawks")}`]) {
        await page.goto(path);
        await page.waitForTimeout(300);
      }
      await page.evaluate(() => fetch("/api/feed").then(r => r.text()));
    });
    expect(bodies.length).toBeGreaterThan(5);
    const found: string[] = [];
    for (const { url, body } of bodies.filter(b => !b.url.includes("/_next/static/"))) {
      for (const f of fresh) {
        if (body.includes(f.id) && !url.includes(`/deal/${f.id}`) && !url.includes("next=")) found.push(`${url}: fresh deal id ${f.id}`);
        if (body.includes(f.title.replace("E2E fixture: ", ""))) found.push(`${url}: fresh deal title ${f.title}`);
      }
      for (const o of old) {
        for (const [k, v] of [["profit", o.profit], ["cost", o.cost], ["fees", o.fees], ["sets", o.sets]] as const) {
          const hit = v > 0 ? leaks(body, k, v) : null;
          if (hit) found.push(`${url}: ${k} ${hit} of ${o.title}`);
        }
      }
    }
    expect(found).toEqual([]);
    expect((await page.request.get("/api/feed")).status()).toBe(200);
  });
}

test("a paid member does get the live numbers", async ({ page, context }) => {
  await signIn(context, "pro");
  const feed = await (await page.request.get("/api/feed")).json() as { rows: Array<{ title: string; profit: number | null }> };
  const hawks = feed.rows.find(r => r.title.includes("Hawks"));
  expect(hawks?.profit).toBeCloseTo(2.06, 2);
});
