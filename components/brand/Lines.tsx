/* The masked-line headline (the homepage's HeroLine behaviour), on its own so client components can use it. */
import { Fragment, type CSSProperties } from "react";

/** A headline as masked lines (behaviour A). `k` sizes it on phones from its longest line, so no line ever wraps. */
export function Lines({ lines, as: Tag = "h2", size, id, className = "", testid }: { lines: readonly string[]; as?: "h1" | "h2" | "p"; size?: number; id?: string; className?: string; testid?: string }) {
  const longest = Math.max(...lines.map(l => l.length));
  const style = { "--k": (longest * 0.56).toFixed(2), ...(size ? { "--hs": size } : {}) } as CSSProperties;
  return (
    <Tag id={id} className={`${Tag === "h1" ? "b-h1" : "b-h2"} ${className}`} style={style} data-testid={testid}>
      {lines.map((l, i) => <Fragment key={i}>{i ? " " : null}<span className="ln"><span className="ln-i" style={{ "--i": i } as CSSProperties}>{l}</span></span></Fragment>)}
    </Tag>
  );
}
