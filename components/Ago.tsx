"use client";
/* "found 42s ago", ticking every second. Server renders the first value; the browser keeps it current. */
import { useEffect, useState } from "react";

function text(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Ago({ at, serverNow }: { at: number; serverNow: number }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <time dateTime={new Date(at).toISOString()} suppressHydrationWarning>{text(at, now)}</time>;
}
