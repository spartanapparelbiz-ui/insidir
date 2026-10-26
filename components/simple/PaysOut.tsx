"use client";
/* "Pays out Sunday night": the server sends "in 3 days" (the same in every time zone); the browser swaps in the
 * day and time of day in the viewer's own zone. */
import { useEffect, useState } from "react";
import { paysOutLocal, paysOutRough } from "@/lib/simple";

export function PaysOut({ closeTime, now }: { closeTime: number | null; now: number }) {
  const [text, setText] = useState(() => paysOutRough(closeTime, now));
  useEffect(() => setText(paysOutLocal(closeTime, Date.now())), [closeTime]);
  return <span suppressHydrationWarning>{text}</span>;
}
