/* A full-bleed photo section between the home page's white sections: one of the graded photos drifting slowly
 * (parallax and a gentle zoom), one centred serif line, and at most one product element on top of it. The dark
 * scrim sits only behind the words (a soft, centred glow), so the photo itself stays bright and the person and the
 * action read at a glance. */
import type { ReactNode } from "react";
import { Photo, type PhotoN } from "@/components/Photo";

export function PhotoSection({ n, line, id, children }: { n: PhotoN; line: string; id?: string; children?: ReactNode }) {
  return (
    <section className="psec" aria-labelledby={id}>
      <Photo n={n} className="psec__photo" par />
      <div className="wrap psec__in">
        <h2 id={id} className="psec__line rv">{line}</h2>
        {children ? <div className="psec__el rv" style={{ ["--i" as string]: 1 }}>{children}</div> : null}
      </div>
    </section>
  );
}
