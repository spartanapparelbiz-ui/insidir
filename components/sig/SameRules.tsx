"use client";
/* The tappable "Same rules?" badge (docs/BRIEF.md §4.6): the badge itself, and a tap opens both rule texts side by
 * side with the words that differ marked (lib/rule-diff). Without rule texts it is the plain badge. */
import { useEffect, useId, useRef, useState } from "react";
import { SAFETY_MEANING, SafetyLight } from "@/components/SafetyLight";
import { ruleDiff, type DiffPart } from "@/lib/rule-diff";
import type { Safety } from "@/lib/types";

export interface RuleText { venue: string; text: string }

function Parts({ parts }: { parts: DiffPart[] }) {
  return <>{parts.map((p, i) => (p.same ? <span key={i}>{p.text}</span> : <mark key={i} className="rdiff">{p.text}</mark>))}</>;
}

export function SameRules({ safety, rules, bare }: { safety: Safety; rules?: readonly [RuleText, RuleText] | null; bare?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  if (!rules) return <SafetyLight safety={safety} bare={bare} />;
  const diff = ruleDiff(rules[0].text, rules[1].text);
  return (
    <>
      <button type="button" className="samerules" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <SafetyLight safety={safety} bare={bare} />
        <span className="sr-only">: compare the two rule texts</span>
      </button>
      {open ? (
        <div className="samerules__sheet" id={id} role="dialog" aria-modal="false" aria-label="Both rule texts" tabIndex={-1} ref={box}>
          <div className="samerules__top">
            <p className="samerules__meaning">{SAFETY_MEANING[safety]}</p>
            <button type="button" className="btn btn--secondary samerules__close" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="samerules__cols">
            {rules.map((r, i) => (
              <section key={r.venue} className="samerules__col" aria-label={`${r.venue} rules`}>
                <h3 className="samerules__venue">{r.venue}</h3>
                <p className="samerules__text">{diff ? <Parts parts={i === 0 ? diff.a : diff.b} /> : r.text}</p>
              </section>
            ))}
          </div>
          {diff ? <p className="samerules__note">Words that differ are <mark className="rdiff">marked</mark>.</p> : null}
        </div>
      ) : null}
    </>
  );
}
