"use client";
/* Any page that fails to render: say what happened and what to do, with a retry that re-renders just this page. */
import Link from "next/link";
import { useEffect } from "react";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="wrap state2">
      <p className="state2__code">Hmm</p>
      <h1 className="state2__h">This page didn&apos;t load.</h1>
      <p className="state2__p">Usually a short network hiccup. Try again. If it keeps happening, write to hello@aethric.llc.</p>
      <div className="state2__ctas">
        <button type="button" className="btn btn--primary" onClick={reset}>Try again</button>
        <Link className="btn btn--secondary" href="/feed">See the live feed</Link>
      </div>
    </main>
  );
}
