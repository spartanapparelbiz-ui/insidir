"use client";
/* The Desk's text actions: Follow this wallet (POST /api/follows; turns into "Following") and Turn on pings (this
 * device's push; once on it reads "Pings on"). Text, never a second white pill. */
import { useEffect, useState } from "react";
import { enablePush, pushState, type PushState } from "@/components/app/push";

export async function vapidKey(): Promise<string | null> {
  const j = await fetch("/api/push/key", { cache: "no-store" }).then(r => r.json() as Promise<{ publicKey?: string }>).catch(() => null);
  return j?.publicKey ?? null;
}

/** Follow a wallet (default) or a market (kind="market", with its own labels). */
export function FollowLink({ wallet, initial = false, short = false, kind = "trader", labels }: { wallet: string | null; initial?: boolean; short?: boolean; kind?: "trader" | "market"; labels?: readonly [string, string] }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!wallet) return null;
  const tap = async () => {
    setBusy(true); setErr(null);
    const r = await fetch("/api/follows", { method: on ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, target: wallet }) }).catch(() => null);
    if (r?.ok) setOn(!on);
    else setErr(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't follow. Try again.");
    setBusy(false);
  };
  return (
    <span className="s-actwrap">
      <button type="button" className="s-link" onClick={tap} disabled={busy} aria-pressed={on} data-testid="desk-follow">{labels ? labels[on ? 1 : 0] : short ? (on ? "Following" : "Follow") : on ? "Following this wallet" : "Follow this wallet"}</button>
      {err ? <span className="b-small" role="status">{err}</span> : null}
    </span>
  );
}

export function PingsLink() {
  const [st, setSt] = useState<PushState | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const read = () => pushState().then(setSt).catch(() => setSt("unsupported"));
    read(); window.addEventListener("insidir:push", read);
    return () => window.removeEventListener("insidir:push", read);
  }, []);
  if (st === null || st === "unsupported") return null;
  if (st === "on") return <span className="b-dim" data-testid="desk-pings">Pings on</span>;
  const tap = async () => {
    if (st === "ios_needs_install" || st === "denied") { location.href = "/settings#alerts"; return; }
    setBusy(true);
    const k = await vapidKey();
    setSt(k ? await enablePush(k).catch(() => "error" as const) : "error");
    setBusy(false); window.dispatchEvent(new Event("insidir:push"));
  };
  return <button type="button" className="s-link" onClick={tap} disabled={busy} data-testid="desk-pings">{st === "error" ? "Try pings again" : "Turn on pings"}</button>;
}
