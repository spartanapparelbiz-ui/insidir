"use client";
/* One market, one tap: opens its Read (POST /api/read with pick=<venue>:<id>). */
import { useState } from "react";

export function ReadPick({ venue, id, children, className = "rpick" }: { venue: "polymarket" | "kalshi"; id: string; children: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    const body = new FormData(); body.set("pick", `${venue}:${id}`);
    const r = await fetch("/api/read", { method: "POST", body }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined;
    if (r?.ok && j?.id) { location.assign(`/read/${j.id}`); return; }
    setBusy(false); setErr(j?.error ?? "Couldn't read it now. Try again.");
  };
  return (
    <>
      <button type="button" className={className} onClick={() => void go()} disabled={busy} aria-busy={busy || undefined}>{children}</button>
      {err ? <span className="rpick__err" role="alert">{err}</span> : null}
    </>
  );
}
