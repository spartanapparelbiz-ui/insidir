/* "Live data paused, retrying": shown when the scanner has stopped (nothing is presented as live), or naming the
 * venues whose data stopped. Only the viewer's own venues are named. No hooks: used by server and client. */
import type { DataStatus } from "@/lib/status";
import type { Venue } from "@/lib/types";
import { VENUE_NAME } from "@/lib/types";

export function statusText(status: DataStatus, venues: readonly Venue[], offline = false): string | null {
  if (offline) return "Lost the connection to Insidir. Retrying automatically; the deals below may be out of date.";
  if (!status.live) return "Live data paused, retrying. The scanner hasn't reported lately, so nothing below is shown as live.";
  const paused = status.paused.filter(v => venues.includes(v));
  if (!paused.length) return null;
  const names = paused.map(v => VENUE_NAME[v]);
  return `Couldn't reach ${names.length > 1 ? names.slice(0, -1).join(", ") + " or " + names[names.length - 1] : names[0]}. Retrying automatically; its deals may be out of date.`;
}

export function StatusBanner({ status, venues, offline = false }: { status: DataStatus; venues: readonly Venue[]; offline?: boolean }) {
  const text = statusText(status, venues, offline);
  if (!text) return null;
  return <p className="banner banner--warn" role="status">{text}</p>;
}
