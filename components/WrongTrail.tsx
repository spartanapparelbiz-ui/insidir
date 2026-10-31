/* The 404 and 500 pages, in the house style: what happened as the headline, one line on what to do, one black button
 * home and text links to the places people usually want (Trackers, Help, Status). No photo. */
import Link from "next/link";
import type { ReactNode } from "react";

export function WrongTrail({ code, title, text, children }: { code: string; title: string; text: string; children?: ReactNode }) {
  return (
    <main className="wrap trail2">
      <p className="trail2__code">{code}</p>
      <h1 className="trail2__h">{title}</h1>
      <p className="trail2__p">{text}</p>
      <div className="trail2__ctas">
        {children ?? <Link className="btn btn--primary" href="/">Back to home</Link>}
      </div>
      <nav className="trail2__links" aria-label="Elsewhere">
        <Link href="/trackers">Trackers</Link><Link href="/open">Open now</Link><Link href="/help">Help</Link><Link href="/status">Status</Link>
      </nav>
    </main>
  );
}
