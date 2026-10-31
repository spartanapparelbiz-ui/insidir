/* The shared scroll reveal (app/motion.css, run by components/motion/Motion.tsx):
 *   <Reveal>       one element fades and rises 24px into place as it enters the screen, 0.7s, once.
 *   <RevealGroup>  the same for each direct child, 60ms apart (rows, cards, tiles, table rows).
 * Server components: they only mark the markup, so without JS (or under prefers-reduced-motion) everything is simply
 * there. Transform and opacity only; nothing moves layout. */
import type { CSSProperties, ElementType, ReactNode } from "react";

type Props = { as?: ElementType; className?: string; id?: string; delay?: number; style?: CSSProperties; children?: ReactNode; [k: `data-${string}`]: string | undefined };

export function Reveal({ as: As = "div", className = "", delay = 0, style, children, ...rest }: Props) {
  return <As className={`rv ${className}`.trim()} style={delay ? { ...style, ["--i" as string]: delay } : style} {...rest}>{children}</As>;
}

export function RevealGroup({ as: As = "div", className = "", style, children, ...rest }: Props) {
  return <As className={className || undefined} style={style} data-reveal="group" {...rest}>{children}</As>;
}
