"use client";
/* Turn push alerts on or off for this device. Asks for notification permission only when tapped. */
import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, type PushState } from "./push";

const NOTE: Record<PushState | "error", string> = {
  unsupported: "This browser can't show push alerts. Use email alerts below.",
  ios_needs_install: "On iPhone, add Insidir to your Home Screen first, then open it from the icon and turn alerts on there.",
  denied: "Notifications are blocked for this site. Allow them in your browser settings, then tap again.",
  off: "Push alerts are off on this device.",
  on: "Push alerts are on for this device.",
  error: "Couldn't turn push on. Try again.",
};

export function PushButton({ vapidKey, onChange }: { vapidKey: string; onChange?: (on: boolean) => void }) {
  const [state, setState] = useState<PushState | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState("unsupported")); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      const next = state === "on" ? await disablePush() : await enablePush(vapidKey);
      setState(next);
      onChange?.(next === "on");
    } catch { setState("error"); } finally { setBusy(false); }
  };
  if (state === null) return <p className="dim small">Checking this device…</p>;
  const canTap = state === "on" || state === "off" || state === "error" || state === "denied";
  return (
    <div className="pushbtn">
      {canTap ? (
        <button type="button" className={`btn ${state === "on" ? "btn--secondary" : "btn--primary"}`} onClick={toggle} disabled={busy || (!vapidKey && state !== "on")}>
          {busy ? "Working…" : state === "on" ? "Turn off push on this device" : "Turn on push alerts"}
        </button>
      ) : null}
      <p className="muted small" role="status">{!vapidKey && state !== "on" && canTap ? "Push alerts aren't set up on the server yet." : NOTE[state]}</p>
    </div>
  );
}
