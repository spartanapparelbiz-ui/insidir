"use client";
/* The nav, the hero spec's: the wordmark left; Markets, Board, Record, Pricing, FAQ centred; Log in (panel pill) and
 * Start for $1 (white pill) right. At 1160px the links fold into the burger; its glass panel anchors under it. */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Arrow, Logo } from "./Bits";
import { COMPANY, DATA_COMPANY, GAMBLER } from "@/lib/copy";

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

/** The footer, in --ink-muted at 11.5u: the links, who builds Insidir and how to reach a person, what Insidir is not,
 *  the problem-gambling line, and "Information, not financial or betting advice. Operated by Aethric LLC." Set inside
 *  the bottom of the final stage on the landing (`inline` false), at the end of every other brand page. */
export function BrandFoot({ inline = false }: { inline?: boolean }) {
  return (
    <footer className={`b-foot${inline ? " b-foot--inline" : ""}`} data-testid="brand-foot">
      <nav aria-label="Footer">
        {[["Markets", "/markets"], ["Board", "/board"], ["Record", "/results"], ["FAQ", "/faq"], ["Methodology", "/methodology"], ["Our data", "/data"], ["Status", "/status"], ["Security", "/security"],
          ["Disclosures", "/disclosures"], ["Terms", "/terms"], ["Privacy", "/privacy"], ["Credits", "/credits"], ["Changelog", "/changelog"]].map(([t, h]) => <a key={t} href={h}>{t}</a>)}
      </nav>
      <div className="b-foot__legal">
        <span>{COMPANY.name} · {COMPANY.place} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></span>
        <span>{DATA_COMPANY}</span>
        <span>{GAMBLER}</span>
        <span>Information, not financial or betting advice. Operated by Aethric LLC.</span>
      </div>
    </footer>
  );
}
