"use client";
/* Research (⌘K / Ctrl+K anywhere, the header's Research link, the home page's bar): a dialog where a question over
 * Insidir's data gets 1–2 sentences and the rows as tables (POST /api/research). Suggested questions fit the page; on
 * an account's page "this account" means that account. Members get Export CSV. Esc or × closes; focus returns. */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { suggestionsFor } from "@/lib/research/suggest";
import type { Answer } from "@/lib/research/run";
import { ResearchAnswer } from "./ResearchTables";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; a: Answer; id: number; member: boolean; remaining: number | null } | { kind: "error"; text: string };

export function openResearch(q?: string) { window.dispatchEvent(new CustomEvent("research:open", { detail: { q } })); }

export function ResearchPalette() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [s, setS] = useState<State>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const wallet = /^\/p\/(0x[0-9a-f]{40})/i.exec(path)?.[1] ?? null;

  const submit = useCallback(async (question: string) => {
    const text = question.trim();
    if (text.length < 3) return;
    setQ(text); setS({ kind: "busy" });
    const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: text, wallet }) }).catch(() => null);
    const b = res ? await res.json().catch(() => null) as { answer?: Answer; id?: number; member?: boolean; remaining?: number | null; error?: string } | null : null;
    if (!res?.ok || !b?.answer) { setS({ kind: "error", text: b?.error ?? "Research didn't answer. Try again in a minute." }); return; }
    setS({ kind: "done", a: b.answer, id: b.id!, member: Boolean(b.member), remaining: b.remaining ?? null });
  }, [wallet]);

  const show = useCallback((preset?: string) => {
    back.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    if (preset) void submit(preset); else setS({ kind: "idle" });
    requestAnimationFrame(() => input.current?.focus());
  }, [submit]);
  const close = useCallback(() => { setOpen(false); back.current?.focus?.(); }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) close(); else show(); }
      else if (e.key === "Escape" && open) close();
    };
    const ev = (e: Event) => show((e as CustomEvent<{ q?: string }>).detail?.q);
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("[data-research-open]");
      if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); show(a.getAttribute("data-q") ?? undefined); }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("research:open", ev);
    document.addEventListener("click", click);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("research:open", ev); document.removeEventListener("click", click); };
  }, [open, show, close]);

  if (!open) return null;
  const tips = suggestionsFor(path);
  return (
    <div className="rpal" role="dialog" aria-modal="true" aria-labelledby="rpal-h" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="rpal__box">
        <div className="rpal__top">
          <h2 id="rpal-h" className="rpal__h">Research</h2>
          <button type="button" className="rpal__x" aria-label="Close research" onClick={close}>×</button>
        </div>
        <form className="rpal__form" role="search" onSubmit={e => { e.preventDefault(); void submit(q); }}>
          <label className="sr-only" htmlFor="rpal-q">Ask about Insidir&apos;s data</label>
          <input id="rpal-q" ref={input} className="input rpal__input" value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about positions, trackers, accounts or filings" autoComplete="off" maxLength={300} />
          <button type="submit" className="btn btn--secondary" disabled={s.kind === "busy"}>{s.kind === "busy" ? "Reading…" : "Ask"}</button>
        </form>
        <div className="rpal__body" aria-live="polite">
          {s.kind === "idle" ? (
            <ul className="rpal__tips" aria-label="Suggested questions">{tips.map(t => <li key={t}><button type="button" className="rpal__tip" onClick={() => void submit(t)}>{t}</button></li>)}</ul>
          ) : s.kind === "busy" ? <p className="rpal__wait">Reading Insidir&apos;s data…</p>
            : s.kind === "error" ? <p className="rpal__err" role="alert">{s.text}</p>
              : <>
                <ResearchAnswer a={s.a} csvHref={s.member ? `/api/research/csv?id=${s.id}` : null} />
                {!s.member ? <p className="rpal__fine">{s.remaining !== null ? `${s.remaining} of 3 questions left today. ` : ""}Visitors see data 30 minutes late; members ask as many as they like, live, with CSV export.</p> : null}
              </>}
        </div>
        <p className="rpal__foot">Answers come from Insidir&apos;s data only. Not advice. <a href="/research">Open Research</a> · <kbd>Esc</kbd> to close</p>
      </div>
    </div>
  );
}
