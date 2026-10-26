"use client";
/* Any page that fails to render: say what happened and what to do, with a retry that re-renders just this page. */
import Link from "next/link";
import { useEffect } from "react";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="wrap state-page">
      <p className="state-page__code mono">Error</p>
      <h1 className="state-page__h">This page didn&apos;t load</h1>
      <p className="state-page__p">Insidir couldn&apos;t load its data just now, usually a brief network problem. Try again; if it keeps happening, the Terminal shows whether live data is paused.</p>
      <div className="row-gap">
        <button type="button" className="btn btn--primary" onClick={reset}>Try again</button>
        <Link className="btn btn--secondary" href="/terminal">Open the Terminal</Link>
      </div>
    </main>
  );
}
