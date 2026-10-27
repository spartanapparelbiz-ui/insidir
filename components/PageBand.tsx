/* The header band at the top of a page: one of the graded photos (lib/photos.ts says which), 200px tall on desktop and
 * 140px on phones, under a 55% black overlay, with the page title in large serif white on it. The photo drifts slowly
 * as the page scrolls (CSS scroll-driven, off under prefers-reduced-motion). Only the title and a short line ever sit on
 * the photo, never numbers. Full bleed, from inside a .wrap or outside one. */
import type { ReactNode } from "react";
import { Photo, type PhotoN } from "./Photo";

export function PageBand({ n, title, kicker, id, eager = true, children }: {
  n: PhotoN; title: ReactNode; kicker?: ReactNode; id?: string; eager?: boolean;
  /** Under the title, on the band (a source link, a short line). */
  children?: ReactNode;
}) {
  return (
    <header className="pband" data-photo={n}>
      <Photo n={n} className="pband__photo" wideOnly eager={eager} />
      <div className="wrap pband__in">
        {kicker ? <p className="pband__kicker">{kicker}</p> : null}
        <h1 id={id} className="pband__h">{title}</h1>
        {children}
      </div>
    </header>
  );
}
