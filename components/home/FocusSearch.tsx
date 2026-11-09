"use client";
/* "/?search=1" opens the search: the terminal's command line in the top bar (components/brand/Nav.tsx) gets focus; on a
 * phone, its search button opens the line first. */
import { useEffect } from "react";

export function FocusSearch({ on }: { on: boolean }) {
  useEffect(() => {
    if (!on) return;
    const input = document.getElementById("t-cmd-q") as HTMLInputElement | null;
    if (input && input.offsetParent === null) document.querySelector<HTMLButtonElement>(".t-searchbtn")?.click();
    setTimeout(() => (document.getElementById("t-cmd-q") as HTMLInputElement | null)?.focus(), 0);
  }, [on]);
  return null;
}
