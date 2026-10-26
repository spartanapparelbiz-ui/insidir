"use client";
/* "found 12s ago", ticking every second from the server's clock. */
import { useEffect, useRef, useState } from "react";
import { ago } from "@/lib/format";

export function Ago({ at, now, prefix = "" }: { at: number; now: number; prefix?: string }) {
  const offset = useRef(now - Date.now());
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now() + offset.current), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{prefix}{ago(at, t)}</span>;
}
