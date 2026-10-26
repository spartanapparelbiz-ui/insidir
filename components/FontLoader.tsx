"use client";
/* General Sans (Fontshare, free licence) for headlines and prose, loaded after first paint so it never blocks the
 * page: until it arrives, text uses the size-matched system fallback in app/globals.css. JetBrains Mono (numbers)
 * is self-hosted via next/font. */
import { useEffect } from "react";

export const GENERAL_SANS_CSS = "https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap";

export function FontLoader() {
  useEffect(() => {
    if (document.querySelector(`link[href="${GENERAL_SANS_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = GENERAL_SANS_CSS;
    document.head.appendChild(link);
  }, []);
  return null;
}
