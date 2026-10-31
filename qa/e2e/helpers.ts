/* Shared helpers for the end-to-end specs. */
import { expect, type BrowserContext, type Page, type Response } from "@playwright/test";
import { Pool } from "pg";
import { APP_URL, E2E_DB } from "./env";
import { E2E_USERS } from "./seed";

export const pool = new Pool({ connectionString: E2E_DB, max: 2 });
export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, params)).rows as T[];
}

export type SeedUser = keyof typeof E2E_USERS;
export async function signIn(context: BrowserContext, who: SeedUser): Promise<void> {
  await context.addCookies([{ name: "insidir_session", value: E2E_USERS[who]!.token, url: APP_URL, httpOnly: true, sameSite: "Lax" }]);
}

/** The id of the seeded deal whose title contains `part`. */
export async function dealId(part: string): Promise<string> {
  const rows = await q<{ id: string }>("select id from terminal.opportunities where data->>'title' like $1 and kind <> 'second_opinion' order by id limit 1", [`%${part}%`]);
  if (!rows[0]) throw new Error(`no seeded deal like ${part}`);
  return rows[0].id;
}

/** Every same-site response body (HTML, RSC payloads, JSON) the page receives while `fn` runs. */
export async function captureBodies(page: Page, fn: () => Promise<void>): Promise<Array<{ url: string; body: string }>> {
  const out: Array<{ url: string; body: string }> = [];
  const pending: Promise<void>[] = [];
  const on = (r: Response) => {
    if (!r.url().startsWith(APP_URL) || /\.(png|svg|woff2?|ico|css)(\?|$)/.test(r.url())) return;
    // The live stream never ends, so its body never resolves: it's read separately below.
    if ((r.headers()["content-type"] ?? "").includes("text/event-stream")) return;
    pending.push(r.text().then(body => { out.push({ url: r.url(), body }); }, () => undefined));
  };
  page.on("response", on);
  await fn();
  // The page keeps the live stream open, so the network never goes idle; give late requests a moment instead.
  await page.waitForTimeout(500);
  page.off("response", on);
  await Promise.all(pending);
  out.push({ url: `${APP_URL}/api/live`, body: await readLive(page) });
  return out;
}

/** What the live stream sends this browser in its first few seconds (hello, status and the backlog of events), as
 *  raw text, so tests can scan it like any other response. */
export async function readLive(page: Page, ms = 3000): Promise<string> {
  return page.evaluate(async (wait) => {
    const ctl = new AbortController();
    const res = await fetch("/api/live", { signal: ctl.signal, headers: { Accept: "text/event-stream" } });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    const stop = setTimeout(() => ctl.abort(), wait);
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); }
    } catch { /* aborted after `wait` ms */ }
    clearTimeout(stop);
    return text;
  }, ms);
}

/** Pages every visitor can open, and the ones a signed-in Pro member adds. */
export const PUBLIC_PAGES = ["/", "/open", "/top", "/results", "/pricing", "/sports", "/markets", "/stocks", "/methodology", "/faq", "/help", "/data", "/status", "/security", "/disclosures", "/credits", "/changelog", "/terms", "/privacy", "/about", "/login", "/start"];
/** Members only: a visitor is sent to log in, a member without a plan to /start. */
export const MEMBER_PAGES = ["/feed", "/following", "/alerts", "/p/0xe2e00000000000000000000000000000000000aa", "/market/0xe2emarket1", "/receipts", "/gaps", "/whales", "/pnl"];
export const PRO_PAGES = ["/feed", "/results", "/top", "/following", "/gaps", "/settings", "/alerts", "/pnl", "/whales", "/market/0xe2emarket1"];

export async function noHorizontalScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "page scrolls sideways").toBeLessThanOrEqual(0);
}

export async function footerOk(page: Page): Promise<void> {
  const footer = page.locator("footer").last();
  await expect(footer).toContainText("Aethric LLC · Pompano Beach, FL · hello@aethric.llc");
  await expect(footer).toContainText("Insidir is a data company. It is not a broker, exchange, sportsbook or investment adviser, and isn't affiliated with Polymarket, Kalshi or the SEC.");
  await expect(footer).toContainText("Gambling problem? Call 1-800-GAMBLER.");
  await expect(footer.locator('a[href="mailto:hello@aethric.llc"]')).toHaveCount(1);
  for (const href of ["/methodology", "/data", "/status", "/security", "/disclosures", "/terms", "/privacy", "/credits", "/changelog"]) await expect(footer.locator(`a[href="${href}"]`), href).toHaveCount(1);
}

export const shotName = (name: string, page: Page): string => `qa/screenshots/${name}-${page.viewportSize()!.width}.png`;
