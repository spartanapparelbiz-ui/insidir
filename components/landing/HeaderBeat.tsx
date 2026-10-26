"use client";
/* The scanner's heartbeat, small, in the header: "Live · scanned 3s ago" while the worker is scanning, "Live data
 * paused" when it isn't. Real times from the stream's status events (and the server's on first paint). */
import { useLiveContext, useServerNow } from "@/components/live/LiveProvider";

export function HeaderBeat({ serverNow, scanner }: { serverNow: number; scanner: { live: boolean; lastScanAt: number | null } }) {
  const live = useLiveContext();
  const now = useServerNow(serverNow);
  const scan = live.scanner ?? scanner;
  const on = scan.live && scan.lastScanAt !== null;
  return (
    <p className={`hbeat${on ? "" : " hbeat--paused"}`} role="status">
      <span className="hbeat__dot" aria-hidden="true" />
      {on ? <>Live<span className="hbeat__ago"> · scanned <span className="mono">{Math.max(0, Math.floor((now - scan.lastScanAt!) / 1000))}s</span> ago</span></> : "Live data paused"}
    </p>
  );
}
