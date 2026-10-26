"use client";
/* The "?" next to a number: one tap opens a one-line plain explanation (lib/simple.ts HELP). Built on the browser's
 * own popover, so it opens without the app's JavaScript, closes on Escape or a tap outside, and sits in the top
 * layer above sheets and stretched links. */
import { useId } from "react";
import { HELP, type HelpKey } from "@/lib/simple";

export function Help({ k, label }: { k: HelpKey; label?: string }) {
  const id = useId().replace(/:/g, "");
  const text = HELP[k];
  const name = label ?? text.split(" = ")[0] ?? "this";
  return (
    <span className="help">
      <button type="button" className="help__q" popoverTarget={`h${id}`} aria-label={`What does “${name}” mean?`}>?</button>
      <span id={`h${id}`} className="help__tip" popover="auto" role="tooltip">{text}</span>
    </span>
  );
}
