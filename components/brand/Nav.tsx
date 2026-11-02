"use client";
/* The nav, the hero spec's: the wordmark left; Markets, Board, Record, Pricing, FAQ centred; Log in (panel pill) and
 * Start for $1 (white pill) right. At 1160px the links fold into the burger; its glass panel anchors under it. */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Arrow, Logo } from "./Bits";

/** The hero's entrance for the nav (the spec's timeline): logo .46s, links .54s + .045s each, Log in .68s, Start .73s. */
const q = (on: boolean, kind: "quiet" | "settle", d: number) => (on ? { "data-m": kind, style: { "--d": `${d}s` } as CSSProperties } : {});

const LINKS: Array<[string, string]> = [["Markets", "/markets"], ["Board", "/board"], ["Record", "/results"], ["Pricing", "/#pricing"], ["FAQ", "/#faq"]];

export function BrandNav({ fixed = false, startHref = "/go", member = false, motion = false }: { fixed?: boolean; startHref?: string; member?: boolean; motion?: boolean }) {
  const [open, setOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !burger.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); burger.current?.focus(); } };
    document.addEventListener("click", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <>
      <header className={`b-nav${fixed ? " b-nav--fixed" : ""}`} data-testid="brand-nav">
        <span {...q(motion, "quiet", 0.46)}><Logo /></span>
        <nav className="b-nav-links" aria-label="Primary">{LINKS.map(([t, h], i) => <a key={t} href={h} {...q(motion, "quiet", 0.54 + 0.045 * i)}>{t}</a>)}</nav>
        <div className="b-nav-actions">
          {member ? <a className="b-btn b-panel-pill" href="/" {...q(motion, "settle", 0.68)}>Home</a> : <a className="b-btn b-panel-pill" href="/login" {...q(motion, "settle", 0.68)}>Log in</a>}
          {member ? null : <a className="b-btn b-nav-start" href={startHref} data-testid="nav-start" data-checkout="nav" {...q(motion, "settle", 0.73)}>Start for $1<Arrow /></a>}
          <button ref={burger} {...q(motion, "settle", 0.68)} className="b-burger" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="b-menu" onClick={e => { e.stopPropagation(); setOpen(!open); }}><span /></button>
        </div>
      </header>
      <nav ref={menu} id="b-menu" className={`b-menu${open ? " open" : ""}`} aria-label="Mobile" onClick={e => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        {LINKS.map(([t, h]) => <a key={t} href={h}>{t}</a>)}
        <div className="b-divider" />
        {member ? <a href="/">Home</a> : <a href="/login">Log in</a>}
        {member ? null : <a className="b-m-start" href={startHref}>Start for $1<Arrow /></a>}
      </nav>
    </>
  );
}

/** The footer, in --ink-muted at 11.5u, set inside the bottom of the final stage. */
export function BrandFoot() {
  return (
    <footer className="b-foot" data-testid="brand-foot">
      <nav aria-label="Footer">
        {[["Markets", "/markets"], ["Board", "/board"], ["Record", "/results"], ["FAQ", "/faq"], ["Log in", "/login"], ["Terms", "/terms"], ["Privacy", "/privacy"], ["Methodology", "/methodology"]].map(([t, h]) => <a key={t} href={h}>{t}</a>)}
      </nav>
      <span>Information, not financial or betting advice. Operated by Aethric LLC.</span>
    </footer>
  );
}
