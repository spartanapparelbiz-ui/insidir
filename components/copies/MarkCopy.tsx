"use client";
/* Placed or skipped, on one copy in My copies (POST /api/copies/status): totals count placed copies only. */
import { useState } from "react";

export function MarkCopy({ id, status: s0 }: { id: number; status: "copied" | "placed" | "skipped" }) {
  const [status, setStatus] = useState(s0), [err, setErr] = useState(false);
  const mark = async (s: "placed" | "skipped") => {
    const r = await fetch("/api/copies/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: s }) }).catch(() => null);
    if (r?.ok) { setStatus(s); setErr(false); location.reload(); } else setErr(true);
  };
  return (
    <span className="cl-mark" data-testid="copy-status" data-status={status}>
      {(["placed", "skipped"] as const).map(s => (
        <button key={s} type="button" className="b-btn b-panel-pill" aria-pressed={status === s} onClick={() => void mark(s)} data-testid={`mark-${s}`}>{s === "placed" ? "Placed" : "Skipped"}</button>
      ))}
      {err ? <span className="b-small" role="alert">That didn&apos;t save. Tap it again.</span> : null}
    </span>
  );
}
