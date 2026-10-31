"use client";
/* Any page that fails to render (components/WrongTrail.tsx): what happened, a retry that re-renders just this page,
 * and where to check whether it's us. */
import { useEffect } from "react";
import { WrongTrail } from "@/components/WrongTrail";
import { COMPANY } from "@/lib/copy";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <WrongTrail code="500" title="Something went wrong." text={`This page didn't load. Try again; if it keeps happening, check Status or write to ${COMPANY.email}.`}>
      <button type="button" className="btn btn--primary" onClick={reset}>Try again</button>
    </WrongTrail>
  );
}
