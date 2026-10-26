"use client";
/* "2m ago" that keeps itself current: the server's text first (no hydration mismatch), then recomputed every 30s.
 * The full Eastern time is in the title and the machine-readable time in dateTime. */
import { useEffect, useState } from "react";
import { agoText, dateTimeET } from "@/lib/moves/copy";

export function TimeAgo({ at, initial, className, suffix = "" }: { at: number; initial: string; className?: string; suffix?: string }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const tick = () => setText(agoText(at, Date.now()));
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, [at]);
  return <time className={className} dateTime={new Date(at).toISOString()} title={dateTimeET(at)}>{text}{suffix}</time>;
}
