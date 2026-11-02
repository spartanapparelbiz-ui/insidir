/* BentoGrid and BentoCard from Magic UI (https://magicui.design, MIT License, Copyright (c) Magic UI; see
 * ./LICENSE.md), adapted: plain CSS classes, a line icon passed in, the call to action always visible (no hover
 * reveal: the grid itself doesn't move), and a `background` slot for the card's live content. */
import { type ComponentPropsWithoutRef, type ReactNode } from "react";

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> { children: ReactNode; className?: string }
interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name: string;
  className?: string;
  background?: ReactNode;
  Icon: (p: { className?: string }) => ReactNode;
  description: string;
  href: string;
  cta: string;
}

export const BentoGrid = ({ children, className, ...props }: BentoGridProps) => (
  <div className={["mu-bento", className].filter(Boolean).join(" ")} {...props}>{children}</div>
);

export const BentoCard = ({ name, className, background, Icon, description, href, cta, ...props }: BentoCardProps) => (
  <div className={["mu-bento__card", className].filter(Boolean).join(" ")} {...props}>
    {background ? <div className="mu-bento__bg">{background}</div> : null}
    <div className="mu-bento__body">
      <Icon className="mu-bento__icon" />
      <h3 className="mu-bento__h">{name}</h3>
      <p className="mu-bento__p">{description}</p>
      <a className="mu-bento__cta" href={href}>{cta} <span aria-hidden="true">→</span></a>
    </div>
  </div>
);
