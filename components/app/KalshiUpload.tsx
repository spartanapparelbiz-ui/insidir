"use client";
/* Kalshi P&L from the CSV the user downloads from their Kalshi account. The browser reads the file and posts the
 * text to /api/pnl/kalshi; nothing is stored and no API keys are asked for. */
import { useState } from "react";
import type { PnlSummary } from "@/lib/pnl";
import { PnlTable } from "./PnlTable";

/** Largest file read in the browser, bytes (matches lib/pnl.ts MAX_CSV_CHARS). */
const MAX_BYTES = 5_000_000;

const isSummary = (v: unknown): v is { summary: PnlSummary } =>
  typeof v === "object" && v !== null && typeof (v as { summary?: unknown }).summary === "object" && (v as { summary: unknown }).summary !== null;

export function KalshiUpload() {
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setSummary(null);
    if (file.size > MAX_BYTES) { setError("That file is too large."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/pnl/kalshi", { method: "POST", headers: { "Content-Type": "text/csv" }, body: await file.text() });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok && isSummary(body)) setSummary(body.summary);
      else setError(typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : "Couldn't read that file.");
    } catch { setError("Couldn't upload the file. Try again."); } finally { setBusy(false); }
  };
  return (
    <div className="upload">
      <label className="btn btn--secondary upload__btn">
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => void onFile(e.target.files?.[0])} />
        {busy ? "Reading…" : "Upload Kalshi CSV"}
      </label>
      {error ? <p className="err small" role="alert">{error}</p> : null}
      {summary ? <PnlTable summary={summary} label="Kalshi P&L" /> : null}
    </div>
  );
}
