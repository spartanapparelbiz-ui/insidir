/* The one page system for every public page (home, pricing, FAQ, the product pages): a container of at most 1180px
 * with 40px sides (20px on phones), a plain page head (kicker, title, one line) and sections whose header carries the
 * ink rule. Each section and its rows rise in through components/motion (Reveal). Server components. */
import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";

export function PageHead({ kicker, title, sub, id = "page-h", aside }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <header className={`pg pghead${aside ? " pghead--aside" : ""}`}>
      <Reveal className="pghead__main">
        {kicker ? <p className="pghead__kicker">{kicker}</p> : null}
        <h1 id={id} className="pghead__h">{title}</h1>
        {sub ? <p className="pghead__sub">{sub}</p> : null}
      </Reveal>
      {aside ? <Reveal className="pghead__aside" delay={1}>{aside}</Reveal> : null}
    </header>
  );
}

export function Sec({ id, title, sub, className = "", children }: { id: string; title: ReactNode; sub?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`sec3 ${className}`.trim()} aria-labelledby={id}>
      <div className="pg">
        <Reveal as="h2" id={id} className="sec3__h">{title}</Reveal>
        {sub ? <Reveal as="p" className="tcol__note">{sub}</Reveal> : null}
        {children}
      </div>
    </section>
  );
}
