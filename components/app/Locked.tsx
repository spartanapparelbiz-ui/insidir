/* A members-only feature, said plainly, with the one way to get it. `quiet` makes the button secondary when the page
 * already has its primary action (one primary per page). */
import { UNLOCK, UNLOCK_PRO } from "@/lib/copy";

export function Locked({ title, text, href, plan, where, quiet = false }: { title: string; text: string; href: string; plan: "insidir" | "pro"; where: string; quiet?: boolean }) {
  return (
    <section className="card locked" aria-label={title}>
      <p className="locked__h">{title}</p>
      <p className="muted small">{text}</p>
      <a className={`btn ${quiet ? "btn--secondary" : "btn--primary"}`} href={href} data-unlock={where}>{plan === "pro" ? UNLOCK_PRO : UNLOCK}</a>
    </section>
  );
}
