/* "Live data paused, retrying": shown when the scanner has stopped (nothing is presented as live), or naming the
 * venues whose data stopped. Only the viewer's own venues are named. No hooks: used by server and client. */
import type { DataStatus } from "@/lib/status";
import type { Venue } from "@/lib/types";
import { VENUE_NAME } from "@/lib/types";

export function statusText(status: DataStatus, venues: readonly Venue[], offline = false): string | null {
  if (offline) return "Connection lost, retrying";
  if (!status.live) return "Live data paused, retrying";
  const paused = status.paused.filter(v => venues.includes(v));
  if (!paused.length) return null;
  const names = paused.map(v => VENUE_NAME[v]);
  return `${names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0]} data paused, retrying`;
}

export function StatusBanner({ status, venues, offline = false }: { status: DataStatus; venues: readonly Venue[]; offline?: boolean }) {
  const text = statusText(status, venues, offline);
  if (!text) return null;
  return <p className="banner banner--warn" role="status">{text}</p>;
}
