"use client";
/* A live number that rolls: when the value changes, only the characters that changed drop in with a brief violet
 * glow ("55¢" → "57¢" moves the 7, not the 5). Aligned from the right, so "9" → "10" rolls both digits. The first
 * render is still. Reduced motion: the new value, no movement (globals.css). Screen readers read the plain text. */
import { useEffect, useRef, useState } from "react";

export function RollNumber({ text, className, testId }: { text: string; className?: string; testId?: string }) {
  const prev = useRef(text);
  const [state, setState] = useState<{ text: string; changed: boolean[]; n: number }>({ text, changed: [], n: 0 });
  useEffect(() => {
    if (text === prev.current) return;
    const a = prev.current, b = text;
    const changed = [...b].map((ch, i) => a[a.length - b.length + i] !== ch);
    prev.current = text;
    setState(s => ({ text, changed, n: s.n + 1 }));
  }, [text]);
  const shown = state.text === text ? state : { text, changed: [], n: state.n };
  return (
    <span className={`rolln${className ? ` ${className}` : ""}`} data-testid={testId} aria-label={text}>
      {[...shown.text].map((ch, i) => (
        <span key={shown.changed[i] ? `${shown.n}-${i}` : i} aria-hidden="true" className={`rolln__d${shown.changed[i] ? " rolln__d--new" : ""}`}>{ch}</span>
      ))}
    </span>
  );
}
