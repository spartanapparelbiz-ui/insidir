/* Marquee from Magic UI (https://magicui.design, MIT License, Copyright (c) Magic UI; see ./LICENSE.md), adapted:
 * plain CSS classes (app/open.css .mu-marquee) instead of Tailwind. Copies after the first are hidden from screen
 * readers; under reduced motion it stops and scrolls by hand. */
import { type ComponentPropsWithoutRef, type ReactNode } from "react";

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  children: ReactNode;
  vertical?: boolean;
  repeat?: number;
}

export function Marquee({ className, reverse = false, pauseOnHover = false, children, vertical = false, repeat = 4, ...props }: MarqueeProps) {
  const cls = ["mu-marquee", vertical ? "mu-marquee--v" : "", pauseOnHover ? "mu-marquee--pause" : "", reverse ? "mu-marquee--rev" : "", className].filter(Boolean).join(" ");
  return (
    <div {...props} className={cls}>
      {Array(repeat).fill(0).map((_, i) => <div key={i} className="mu-marquee__track" aria-hidden={i > 0 || undefined}>{children}</div>)}
    </div>
  );
}
