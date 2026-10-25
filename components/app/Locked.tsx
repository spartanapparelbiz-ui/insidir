/* A locked section: what it is, and an Unlock button that goes straight to checkout. */
import { PLANS } from "@/lib/plans";

export function Locked({ title, text, href, plan, where }: { title: string; text: string; href: string; plan: "insidir" | "pro"; where: string }) {
  return (
    <section className="card locked" aria-label={title}>
      <p className="locked__h">{title}</p>
      <p className="muted small">{text}</p>
      <a className="btn btn--primary" href={href} data-unlock={where}>Unlock with {PLANS[plan].name} · ${PLANS[plan].price}/mo</a>
    </section>
  );
}
