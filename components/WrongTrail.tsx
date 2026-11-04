/* The 404 and 500 pages, as a homepage stage: dusk scenery, what happened as the masked headline, one line on what to do,
 * the white pill home and panel pills to the places people usually want. Client-safe (the 500 page is a client
 * component), so it writes the stage's markup itself rather than using components/brand/Stage (which reads the disk).
 * The caller supplies the frame (the nav). */
import { BrandPicture } from "@/components/brand/BrandPicture";
import type { CSSProperties, ReactNode } from "react";
import { Lines } from "@/components/brand/Lines";
import { PHOTOS } from "@/lib/brand/images";

export function WrongTrail({ code, title, text, children }: { code: string; title: string; text: string; children?: ReactNode }) {
  return (
    <section className="b-stage" data-first="" data-testid="wrong-trail" aria-labelledby="trail-h">
      <div className="b-stage__bg" style={{ "--dark": 0.6 } as CSSProperties}><BrandPicture src={PHOTOS.hero.src} priority /></div>
      <div className="b-stage__in">
        <div className="b-head">
          <p className="b-label">{code}</p>
          <Lines as="h1" id="trail-h" lines={[title]} size={64} />
          <p className="b-sub">{text}</p>
        </div>
        <div className="b-center"><div className="b-ctas">{children ?? <a className="b-btn b-btn-lg b-primary" href="/">Back to home</a>}<a className="b-btn b-btn-lg b-ghost" href="/board">The board</a></div></div>
        <nav className="s-filters" aria-label="Elsewhere">
          {[["Markets", "/markets"], ["Election Day", "/election"], ["Help", "/help"], ["Status", "/status"]].map(([t, h]) => <a key={h} className="b-btn b-panel-pill" href={h}>{t}</a>)}
        </nav>
      </div>
    </section>
  );
}
