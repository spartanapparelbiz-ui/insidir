"use client";
/* Turn push alerts on or off for this device. Asks for notification permission only when tapped. While it checks
 * the device it shows a placeholder the size of the button (no jump); each change confirms with a toast ("Alerts on",
 * "Alerts off"), and anything that blocks it says what to do. Primary while off (it's the page's main action),
 * secondary once on. */
import { useEffect, useState } from "react";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { disablePush, enablePush, pushState, type PushState } from "./push";

const NOTE: Record<PushState | "error", string> = {
  unsupported: "This browser can't show push alerts. Turn on email alerts below instead.",
  ios_needs_install: "On iPhone, add Insidir to your Home Screen first, then open it from the icon and turn alerts on there.",
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then tap again.",
  off: "Alerts are off on this device.",
  on: "Alerts are on for this device.",
  error: "Couldn't turn alerts on. Check your connection and tap again.",
};

export function PushButton({ vapidKey, onChange }: { vapidKey: string; onChange?: (on: boolean) => void }) {
  const toast = useToast();
  const [state, setState] = useState<PushState | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState("unsupported")); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      const next = state === "on" ? await disablePush() : await enablePush(vapidKey);
      setState(next);
      onChange?.(next === "on");
      if (next === "on") toast("Alerts on");
      else if (state === "on" && next === "off") toast("Alerts off");
      else if (next === "error" || next === "denied") toast(NOTE[next], "error");
    } catch { setState("error"); toast(NOTE.error, "error"); } finally { setBusy(false); }
  };
  if (state === null) {
    return <div className="pushbtn" role="status" aria-label="Checking this device"><SkeletonLine w={220} h={44} /><SkeletonLine w={180} h={14} /></div>;
  }
  const canTap = state === "on" || state === "off" || state === "error" || state === "denied";
  return (
    <div className="pushbtn">
      {canTap ? (
        <button type="button" className={`btn uibtn ${state === "on" ? "btn--secondary" : "btn--primary"}${busy ? " uibtn--busy" : ""}`} onClick={toggle}
          disabled={busy || (!vapidKey && state !== "on")} aria-busy={busy}>
          <span className="uibtn__label">{state === "on" ? "Turn off alerts on this device" : "Turn on alerts"}</span>
          {busy ? <span className="uibtn__spin" aria-hidden="true" /> : null}
        </button>
      ) : null}
      <p className="muted small" role="status">{!vapidKey && state !== "on" && canTap ? "Push alerts aren't set up on the server yet." : NOTE[state]}</p>
    </div>
  );
}
