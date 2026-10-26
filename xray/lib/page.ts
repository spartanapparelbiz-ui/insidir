/* What an X-ray page shows, loaded once per request and redacted for the viewer before anything renders.
 * React's cache() memoises by argument identity, so targets are passed as a string key: generateMetadata and
 * the page then share one lookup. (Gamma lookups and X-rays are also cached across requests in lib/cache.ts.) */
import { cookies } from "next/headers";
import { cache } from "react";
import { forViewer, MEMBER_COOKIE } from "./access";
import type { Target } from "./link";
import { resolveTarget, type Resolved } from "./resolve";
import type { EventInfo, Market } from "./types";
import { xray, type Xray } from "./xray";

export type PageData =
  | { kind: "xray"; xray: Xray; event: EventInfo | null }
  | { kind: "list"; event: EventInfo; markets: Market[] }
  | { kind: "missing" }
  | { kind: "unavailable" };

export const targetKey = (t: Target): string => (t.kind === "market" ? `market|${t.slug}` : `event|${t.slug}|${t.market ?? ""}`);
const fromKey = (k: string): Target => {
  const [kind, slug = "", market = ""] = k.split("|");
  return kind === "market" ? { kind: "market", slug } : { kind: "event", slug, market: market || null };
};

const resolveOnce = cache(async (k: string): Promise<Resolved | null | "unavailable"> => {
  try { return await resolveTarget(fromKey(k)); } catch { return "unavailable"; }
});

const loadOnce = cache(async (k: string): Promise<PageData> => {
  const r = await resolveOnce(k);
  if (r === "unavailable") return { kind: "unavailable" };
  if (!r) return { kind: "missing" };
  if (r.type === "list") return { kind: "list", event: r.event, markets: r.markets };
  let x: Xray;
  try { x = await xray(r.market); } catch { return { kind: "unavailable" }; }
  const member = (await cookies()).get(MEMBER_COOKIE)?.value;
  return { kind: "xray", xray: forViewer(x, member), event: r.event };
});

export const loadPage = (t: Target): Promise<PageData> => loadOnce(targetKey(t));

/** Title text for metadata: the market question, or the event title for a list. */
export async function titleFor(t: Target): Promise<string | null> {
  const r = await resolveOnce(targetKey(t));
  if (!r || r === "unavailable") return null;
  return r.type === "list" ? r.event.title : r.market.question;
}
