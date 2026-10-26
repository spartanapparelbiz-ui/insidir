"use client";
/* A caption box with a Copy button (/admin/posts). */
import { useState } from "react";

export function CopyCaption({ text, id }: { text: string; id: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="post__caption">
      <label className="afield__label" htmlFor={id}>Caption</label>
      <textarea id={id} className="input post__text" readOnly value={text} rows={6} />
      <button type="button" className="btn btn--secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { setDone(false); }
      }}>{done ? "Copied" : "Copy caption"}</button>
    </div>
  );
}
