"use client";
/* The sidebar's only white button: "Turn on pings", shown while push isn't on for this device (and the browser can
 * do it). Once on, nothing. Renders nothing until the device has been checked, so it never flashes. */
import { useEffect, useState } from "react";
import { enablePush, pushState, type PushState } from "@/components/app/push";

export async function vapidKey(): Promise<string | null> {
  const j = await fetch("/api/push/key", { cache: "no-store" }).then(r => r.json() as Promise<{ publicKey?: string }>).catch(() => null);
  return j?.publicKey ?? null;
}

export function PingsPill() {
  const [st, setSt] = useState<PushState | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const read = () => pushState().then(setSt).catch(() => setSt("unsupported"));
    read();
    window.addEventListener("insidir:push", read);
    return () => window.removeEventListener("insidir:push", read);
  }, []);
  if (st === null || st === "on" || st === "unsupported") return null;
  const tap = async () => {
    if (st === "ios_needs_install" || st === "denied") { location.href = "/settings#alerts"; return; }
    setBusy(true);
    const k = await vapidKey();
    const next = k ? await enablePush(k).catch(() => "error" as const) : "error";
    setSt(next); setBusy(false);
    window.dispatchEvent(new Event("insidir:push"));
  };
  return (
    <button type="button" className="b-btn b-btn-lg b-primary d-pings" onClick={tap} disabled={busy} aria-busy={busy} data-testid="side-pings">
      {st === "error" ? "Try pings again" : "Turn on pings"}
    </button>
  );
}
