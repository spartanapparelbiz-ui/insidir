/* The site's top bar on every brand page (Frame, Shell, the landing, /login): the clean nav (components/brand/Nav.tsx
 * BrandNav: the mark, the places, search with ⌘K, Log in / Account, Start for $1), sticky at the top. Server. The
 * earlier terminal chrome's ticker, function keys and status bar are retired (clean visuals, not a trading screen);
 * their components stay in components/terminal for reference. */
import type { ComponentProps } from "react";
import { BrandNav } from "@/components/brand/Nav";

export async function TerminalChrome(props: ComponentProps<typeof BrandNav>) {
  return <div className="t-chrome c-chrome" data-testid="t-chrome"><BrandNav {...props} /></div>;
}

/** Kept for callers; renders nothing (the status bar is retired with the terminal chrome). */
export function StatusBar(_: { asOf: number }) {
  void _;
  return null;
}
