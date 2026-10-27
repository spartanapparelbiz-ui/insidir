"use client";
/* Account and Alerts fields that save themselves: toggles and choices save at once, typed numbers and times save
 * ~600ms after the last keystroke once they're valid. Each save is a JSON POST to /api/settings (the same
 * validation as everywhere) and confirms with a "Saved" toast, or says what went wrong. Labels sit above inputs;
 * every row is a 44px+ target. */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/Toast";
import { SAVED } from "@/lib/copy";

export type SaveFn = (patch: Record<string, unknown>, ok?: string) => Promise<boolean>;

/** POST a partial settings change; toast the result. Resolves true when saved. */
export function useSaveSettings(): SaveFn {
  const toast = useToast();
  return useCallback(async (patch, ok = SAVED) => {
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(patch) });
      const body = (await res.json().catch(() => null)) as { errors?: string[]; error?: string } | null;
      if (!res.ok) { toast(body?.errors?.join(" ") ?? body?.error ?? "Not saved. Try again in a moment.", "error"); return false; }
      toast(ok);
      return true;
    } catch {
      toast("Not saved: couldn't reach Insidir. Check your connection and try again.", "error");
      return false;
    }
  }, [toast]);
}

/** A whole-row checkbox that saves as soon as it changes. */
export function Toggle({ name, label, hint, checked: initial, save, onLabel, offLabel, disabled }: {
  name: string; label: ReactNode; hint?: ReactNode; checked: boolean; save: SaveFn; onLabel?: string; offLabel?: string; disabled?: boolean;
}) {
  const [on, setOn] = useState(initial);
  const id = useId();
  const change = async (v: boolean) => {
    setOn(v);
    if (!(await save({ [name]: v }, v ? onLabel : offLabel))) setOn(!v);
  };
  return (
    <div className="arow">
      <label className="arow__check" htmlFor={id}>
        <input id={id} type="checkbox" checked={on} disabled={disabled} onChange={e => void change(e.target.checked)} />
        <span className="arow__text"><span>{label}</span>{hint ? <span className="arow__hint">{hint}</span> : null}</span>
      </label>
    </div>
  );
}

/** One choice from a few, as whole-row radio buttons; saves at once. */
export function Choice<T extends string>({ name, legend, options, value: initial, save, onChange }: {
  name: string; legend: string; options: ReadonlyArray<{ value: T; label: string; hint?: string }>; value: T; save: SaveFn;
  /** Extra fields to send with the choice (e.g. venues that follow the region). */
  onChange?: (v: T) => Record<string, unknown>;
}) {
  const [v, setV] = useState(initial);
  const id = useId();
  const change = async (next: T) => {
    const prev = v;
    setV(next);
    if (!(await save({ [name]: next, ...(onChange?.(next) ?? {}) }))) setV(prev);
  };
  return (
    <fieldset className="afield">
      <legend className="afield__label">{legend}</legend>
      {options.map(o => (
        <label key={o.value} className="arow__check" htmlFor={`${id}-${o.value}`}>
          <input id={`${id}-${o.value}`} type="radio" name={`${id}-${name}`} checked={v === o.value} onChange={() => void change(o.value)} />
          <span className="arow__text"><span>{o.label}</span>{o.hint ? <span className="arow__hint">{o.hint}</span> : null}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A typed value (percent, dollars, a time) with its label above, checked as you type, saved when valid. */
export function Field({ name, label, value: initial, check, save, hint, inputMode = "decimal", type = "text", suffix, extra, width }: {
  name: string; label: string; value: string; check: (v: string) => string | null; save: SaveFn; hint?: string;
  inputMode?: "decimal" | "numeric" | "text"; type?: "text" | "time"; suffix?: string;
  /** Extra fields to send with each save (e.g. the browser's time zone with quiet hours). */
  extra?: () => Record<string, unknown>;
  width?: number;
}) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(initial);
  const timer = useRef<number | null>(null);
  const id = useId();
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const change = (next: string) => {
    setV(next);
    const e = check(next);
    setErr(e);
    if (timer.current) window.clearTimeout(timer.current);
    if (e || next === last.current) return;
    timer.current = window.setTimeout(() => {
      void save({ [name]: next, ...(extra?.() ?? {}) }).then(ok => { if (ok) last.current = next; });
    }, 600);
  };
  return (
    <div className="afield" style={width ? { maxWidth: width } : undefined}>
      <label className="afield__label" htmlFor={id}>{label}</label>
      <div className="afield__box">
        <input id={id} className="input" type={type} inputMode={type === "time" ? undefined : inputMode} value={v} aria-invalid={Boolean(err)}
          aria-describedby={err ? `${id}-err` : hint ? `${id}-hint` : undefined} onChange={e => change(e.target.value)} />
        {suffix ? <span className="afield__suffix" aria-hidden="true">{suffix}</span> : null}
      </div>
      {err ? <p id={`${id}-err`} className="afield__err" role="alert">{err}</p> : hint ? <p id={`${id}-hint`} className="afield__hint">{hint}</p> : null}
    </div>
  );
}

/** Pick any number of categories (none = all); saves on each tap. */
export function Categories({ name, legend, hint, options, value: initial, save }: {
  name: string; legend: string; hint: string; options: ReadonlyArray<{ value: string; label: string }>; value: string[]; save: SaveFn;
}) {
  const [v, setV] = useState(initial);
  const toggle = async (c: string) => {
    const prev = v;
    const next = v.includes(c) ? v.filter(x => x !== c) : [...v, c];
    setV(next);
    if (!(await save({ [name]: next }))) setV(prev);
  };
  return (
    <fieldset className="afield">
      <legend className="afield__label">{legend}</legend>
      <p className="afield__hint">{hint}</p>
      <div className="achips">
        {options.map(o => (
          <label key={o.value} className={`achip${v.includes(o.value) ? " achip--on" : ""}`}>
            <input type="checkbox" checked={v.includes(o.value)} onChange={() => void toggle(o.value)} />{o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
