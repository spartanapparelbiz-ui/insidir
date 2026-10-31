"use client";
/* The home page's Research bar: an input whose placeholder cycles through real suggested questions; submitting (or a
 * click on a suggestion) opens the Research palette with it. Without JavaScript it's a GET form to /research. */
import { useEffect, useState } from "react";
import { openResearch } from "./ResearchPalette";

export function ResearchBar({ suggestions }: { suggestions: string[] }) {
  const [i, setI] = useState(0);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI(x => (x + 1) % suggestions.length), 3500);
    return () => clearInterval(t);
  }, [suggestions.length]);
  return (
    <form className="rbar" action="/research" method="get" role="search" onSubmit={e => { e.preventDefault(); openResearch(q.trim() || suggestions[i]); }}>
      <label className="sr-only" htmlFor="rbar-q">Ask Research</label>
      <input id="rbar-q" name="q" className="input rbar__input" value={q} onChange={e => setQ(e.target.value)} placeholder={suggestions[i]} autoComplete="off" maxLength={300} />
      <button type="submit" className="rbar__go">Ask</button>
    </form>
  );
}
