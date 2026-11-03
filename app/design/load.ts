/* The design previews (/design/desk-a|b|c): dev only (404 in production unless DESIGN_PREVIEW=1), the signed-in
 * member's real Desk data. */
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { deskDesign } from "@/lib/design/desk";

export async function loadDesign() {
  if (process.env.NODE_ENV === "production" && process.env.DESIGN_PREVIEW !== "1") notFound();
  if (!hasDatabase()) notFound();
  const viewer = await getViewer();
  const now = Date.now();
  return deskDesign(getDb(), viewer.user?.id ?? "usr_dev", viewer.user?.settings ?? {}, now);
}

/** "Today: $1.3M from 9 millionaire wallets across 67 bets." Only the figures that exist. */
export function todayLine(k: Array<{ key: string; value: number }>): string | null {
  const v = (key: string) => k.find(x => x.key === key)?.value ?? 0;
  const money = v("money"), wallets = v("wallets"), bets = v("bets");
  if (!money) return null;
  const usd = money >= 1e6 ? `$${(money / 1e6).toFixed(1)}M` : `$${Math.round(money / 1e3)}K`;
  return `Today: ${usd} from ${wallets} millionaire ${wallets === 1 ? "wallet" : "wallets"} across ${bets} ${bets === 1 ? "bet" : "bets"}.`;
}
