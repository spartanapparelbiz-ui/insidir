"use client";
/* The Ask Insidir box: a question in, a short answer and the rows behind it out (lib/ask/run.ts). */
import { useState, type FormEvent } from "react";

interface Cell { text: string; href?: string; tone?: "pos" | "neg" }
interface Table { tool: string; title: string; columns: string[]; numeric: number[]; rows: Cell[][]; note?: string | null }
interface Answer { question: string; text: string; tables: Table[] }

export function AskBox({ examples, member }: { examples: readonly string[]; member: boolean }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }).catch(() => null);
    const body = res ? await res.json().catch(() => null) as { answer?: Answer; error?: string; remaining?: number | null } | null : null;
    setBusy(false);
    if (!res || !res.ok || !body?.answer) { setError(body?.error ?? "That didn't work. Try again in a moment."); return; }
    setAnswer(body.answer); setLeft(body.remaining ?? null);
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(q); };

  return (
    <div data-testid="ask-box">
      <form className="ask-form" onSubmit={submit}>
        <input className="s-input" name="q" value={q} onChange={e => setQ(e.target.value)} maxLength={300} placeholder="Ask about the wallets, a market or your bet" aria-label="Your question" data-testid="ask-input" />
        <button type="submit" className="b-btn b-primary" disabled={busy} data-testid="ask-submit">{busy ? "Looking…" : "Ask"}</button>
      </form>
      <div className="ask-try">
        {examples.map(x => <button key={x} type="button" onClick={() => { setQ(x); void ask(x); }}>{x}</button>)}
      </div>
      {error ? <p className="b-small" role="alert" data-testid="ask-error">{error}</p> : null}
      {answer ? (
        <div className="ask-answer" data-testid="ask-answer" aria-live="polite">
          <p className="ask-text" data-testid="ask-text">{answer.text}</p>
          {answer.tables.map((t, i) => (
            <div key={i} className="ask-scroll">
              <p className="b-label">{t.title}</p>
              <table className="ask-table">
                <thead><tr>{t.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{t.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={t.numeric.includes(k) ? "num" : undefined}>{c.href ? <a href={c.href}>{c.text}</a> : c.text}</td>)}</tr>)}</tbody>
              </table>
              {t.note ? <p className="b-small">{t.note}</p> : null}
            </div>
          ))}
          {!member && left !== null ? <p className="b-small">{left} free {left === 1 ? "question" : "questions"} left today. <a href="/go">Members ask as many as they like.</a></p> : null}
        </div>
      ) : null}
    </div>
  );
}
