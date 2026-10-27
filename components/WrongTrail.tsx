/* The 404 and 500 pages: the misty forest (photo 1) full bleed, "Wrong trail." in the serif, one line on what happened,
 * and the way back to the feed. Only words and buttons sit on the photo, over a dark scrim, never data or forms. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Photo } from "./Photo";
import { BAND } from "@/lib/photos";

export function WrongTrail({ code, text, children }: { code: string; text: string; children?: ReactNode }) {
  return (
    <main className="trail">
      <Photo n={BAND.notFound} className="trail__photo" par eager />
      <div className="wrap trail__in">
        <p className="trail__code">{code}</p>
        <h1 className="trail__h">Wrong trail.</h1>
        <p className="trail__p">{text}</p>
        <div className="trail__ctas">
          <Link className="btn btn--onDark btn--big" href="/feed">Back to the feed</Link>
          {children}
        </div>
      </div>
    </main>
  );
}
