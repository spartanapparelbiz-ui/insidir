/* Who is looking: a signed-in user, or an anonymous visitor with an optional region cookie. Server components only. */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";
import type { FeedViewer } from "@/lib/feed";
import type { Plan, Region } from "@/lib/types";
import { REGION_COOKIE, SESSION_COOKIE, userForToken, VIEW_AS_COOKIE, type SessionUser } from "./session";

export interface Viewer {
  user: SessionUser | null;
  plan: Plan;
  region: Region | null;
  /** A free-access account looking at the site as a visitor: who they really are, for the header's View as switch. */
  previewing?: SessionUser | null;
}

const readRegion = (v: string | undefined): Region | null => (v === "us" || v === "non_us" ? v : null);

export const getViewer = cache(async (): Promise<Viewer> => {
  const jar = await cookies();
  let user: SessionUser | null = null;
  try { user = await userForToken(jar.get(SESSION_COOKIE)?.value); } catch { user = null; }
  const region = user?.region ?? readRegion(jar.get(REGION_COOKIE)?.value);
  // Free-access accounts can look at the site exactly as a logged-out visitor sees it.
  if (user?.freeAccess && jar.get(VIEW_AS_COOKIE)?.value === "visitor") return { user: null, plan: "free", region, previewing: user };
  return { user, plan: user?.plan ?? "free", region };
});

export function feedViewer(v: Viewer): FeedViewer {
  const s = v.user?.settings ?? DEFAULT_SETTINGS;
  return { plan: v.plan, region: v.region, minRoi: v.user ? s.minRoi : 0, minSizeUsd: s.minSizeUsd, categories: v.user ? s.categories : [],
    venues: s.venues, showYellow: s.showYellow, showRed: s.showRed };
}

/** The app is for members only (feed, profiles, Top, Results, Following, alerts, markets): someone logged out goes to
 *  log in and comes back; someone logged in without an active plan goes to "Get Insidir". */
export async function requireMember(next: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (v.plan === "free") redirect("/start");
  return v;
}

/** For API routes: the member behind the session cookie, or null. */
export async function memberOrNull(): Promise<Viewer | null> {
  const v = await getViewer();
  return v.user && v.plan !== "free" ? v : null;
}
