/* Who is looking: a signed-in user, or an anonymous visitor with an optional region cookie. Server components only. */
import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_SETTINGS } from "@/lib/db/schema";
import type { FeedViewer } from "@/lib/feed";
import type { Plan, Region } from "@/lib/types";
import { REGION_COOKIE, SESSION_COOKIE, userForToken, type SessionUser } from "./session";

export interface Viewer {
  user: SessionUser | null;
  plan: Plan;
  region: Region | null;
}

const readRegion = (v: string | undefined): Region | null => (v === "us" || v === "non_us" ? v : null);

/** `freshAccess` asks Whop past the 60-second cache: the Terminal does it once right after checkout. */
export const getViewer = cache(async (freshAccess = false): Promise<Viewer> => {
  const jar = await cookies();
  let user: SessionUser | null = null;
  try { user = await userForToken(jar.get(SESSION_COOKIE)?.value, { freshAccess }); } catch { user = null; }
  return { user, plan: user?.plan ?? "free", region: user?.region ?? readRegion(jar.get(REGION_COOKIE)?.value) };
});

export function feedViewer(v: Viewer): FeedViewer {
  const s = v.user?.settings ?? DEFAULT_SETTINGS;
  return { plan: v.plan, region: v.region, minRoi: v.user ? s.minRoi : 0, minSizeUsd: s.minSizeUsd, categories: v.user ? s.categories : [],
    venues: s.venues, showYellow: s.showYellow, showRed: s.showRed };
}
