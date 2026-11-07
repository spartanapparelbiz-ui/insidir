"use client";
/* Tells the signed-in account its browser's time zone, so quiet hours, the Book's daily push and Autopilot's daily caps
 * run on the member's own clock (until then they run on New York time, lib/alerts/quiet.ts). Sent once per browser, and
 * again only if the zone changes (travel). Mounted by the member nav. */
import { useEffect } from "react";

const KEY = "insidir:tz";

export function TimeZoneSync() {
  useEffect(() => {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return; }
    if (!tz) return;
    try { if (localStorage.getItem(KEY) === tz) return; } catch { return; }
    fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ timeZone: tz }) })
      .then(r => { if (r.ok) { try { localStorage.setItem(KEY, tz); } catch { /* private mode: try again next visit */ } } })
      .catch(() => undefined);
  }, []);
  return null;
}
