/* Every route the QA scripts visit (scripts/smoke.ts, scripts/check-design.ts, qa/contact-sheet.mjs): the public pages,
 * the members' pages, and one of each kind of entity page, found from the running site itself. */
export const PUBLIC = [
  "/", "/trackers", "/open", "/top", "/top?period=all", "/feed", "/results", "/sports", "/markets", "/stocks", "/pricing",
  "/methodology", "/data", "/status", "/security", "/disclosures", "/about", "/terms", "/privacy", "/credits", "/changelog", "/help", "/faq",
  "/login", "/start", "/splits/scorecard",
] as const;
export const MEMBER = ["/following", "/settings", "/alerts", "/check", "/discover", "/onboarding?again=1"] as const;
/** Pages that show figures from the data, so they must say where each comes from and when ("as of"). */
export const DATA_PAGES = ["/", "/sports", "/markets", "/stocks", "/data", "/status"] as const;

/** One tracker, market, trader and company page, from links on the site. */
export async function entityRoutes(base: string, headers: Record<string, string> = {}): Promise<string[]> {
  const html = async (p: string) => (await fetch(new URL(p, base), { headers }).then(r => r.text()).catch(() => ""));
  const first = (s: string, re: RegExp) => s.match(re)?.[0] ?? null;
  const [trackers, feed, stocks] = await Promise.all([html("/trackers"), html("/feed"), html("/stocks")]);
  return [
    first(trackers, /\/trackers\/[a-z0-9-]+(?=")/),
    first(feed, /\/market\/[^"?#]+(?=")/),
    first(feed, /\/p\/0x[0-9a-f]{40}(?=")/i),
    first(stocks, /\/insider-trading\/[A-Z0-9.\-]+(?=")/),
  ].filter((x): x is string => Boolean(x));
}
