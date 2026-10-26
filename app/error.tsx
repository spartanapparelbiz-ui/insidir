"use client";
/* Any page that fails to render: "Wrong trail." over the misty forest, what to do, a retry that re-renders just this
 * page, and the way back to the feed. */
import { useEffect } from "react";
import { WrongTrail } from "@/components/WrongTrail";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <WrongTrail code="Something broke" text="This page didn't load. Usually a short network hiccup. Try again; if it keeps happening, write to hello@aethric.llc.">
      <button type="button" className="btn btn--secondary btn--big" onClick={reset}>Try again</button>
    </WrongTrail>
  );
}
