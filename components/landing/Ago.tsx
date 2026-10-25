"use client";
/* "found 3m ago", re-rendered every second. Only the elapsed time ticks; prices never pretend to move. */
import { useEffect, useState } from "react";
import { ago } from "@/lib/format";

export function Ago({ at, now }: { at: number; now: number }) {
  const [t, setT] = useState(now);
  useEffect(() => {
    setT(Date.now());
    const id = window.setInterval(() => setT(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <time dateTime={new Date(at).toISOString()} suppressHydrationWarning>{ago(at, t)}</time>;
}
