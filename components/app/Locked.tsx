/* A locked section: what it is, and one button that goes straight to checkout and says what it costs. */
import { PLANS } from "@/lib/plans";

export function Locked({ title, text, href, plan, where }: { title: string; text: string; href: string; plan: "insidir" | "pro"; where: string }) {
  return (
    <section className="card locked" aria-label={title}>
      <p className="locked__h">{title}</p>
      <p className="muted small">{text}</p>
      <a className="btn btn--primary" href={href} data-unlock={where}>Start {plan === "pro" ? "Pro" : PLANS[plan].name} for ${PLANS[plan].price} a month</a>
    </section>
  );
}
