"use client";
/* The nav, the hero spec's: the wordmark left; Markets, Board, Record, Pricing, FAQ centred; Log in (panel pill) and
 * Start for $1 (white pill) right; members get their places (Home, Election Day today, Board, Wallets, Markets, Your
 * copies) and Account. At 1160px the links fold into the burger; its panel anchors under it. There is no sidebar. */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Arrow, Logo } from "./Bits";
import { ThemeToggle } from "./ThemeToggle";
import { COMPANY, DATA_COMPANY, DISCLAIMER, GAMBLER, FOOTER } from "@/lib/copy";

/** The hero's entrance for the nav (the spec's timeline): logo .46s, links .54s + .045s each, Log in .68s, Start .73s. */
const q = (on: boolean, kind: "quiet" | "settle", d: number) => (on ? { "data-m": kind, style: { "--d": `${d}s` } as CSSProperties } : {});

const LINKS: Array<[string, string]> = [["Markets", "/markets"], ["Board", "/board"], ["SEC terminal", "/sec"], ["Record", "/record"], ["Pricing", "/#pricing"], ["FAQ", "/#faq"]];
/** Members: the same bar, their places. No sidebar anywhere. */
const MEMBER_LINKS: Array<[string, string]> = [["Home", "/"], ["Brief", "/brief"], ["Watch", "/watch"], ["Ask", "/ask"], ["Autopilot", "/autopilot"], ["Book", "/book"], ["Board", "/board"], ["Wallets", "/wallets"], ["Markets", "/markets"], ["Record", "/record"], ["SEC", "/sec"]];

export function BrandNav({ fixed = false, startHref = "/go", member = false, motion = false, election = false, start = true, autopilot = false }: { autopilot?: boolean; fixed?: boolean; startHref?: string; member?: boolean; motion?: boolean;
  /** The Start for $1 pill (off on /login, which has its own way in). */
  start?: boolean;
  /** Election Day leads the links until the board closes (decided on the server: lib/brand/pulse.ts electionDay). */
  election?: boolean }) {
  // Autopilot shows only while it is switched on (lib/features.ts; the member shell passes it).
  const base = member ? MEMBER_LINKS.filter(([, h]) => autopilot || h !== "/autopilot") : LINKS;
  const links: Array<[string, string]> = election ? (member ? [base[0]!, ["Election Day", "/election"], ...base.slice(1)] : [["Election Day", "/election"], ...base]) : base;
  const [open, setOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLElement>(null);
  // Past the first stage the nav turns solid black with a hairline, so nothing scrolls under the links.
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    if (!fixed) return;
    const first = document.querySelector<HTMLElement>(".b-stage[data-first], .b-stage");
    const read = () => setSolid(first ? first.getBoundingClientRect().bottom <= 72 : window.scrollY > 40);
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => { window.removeEventListener("scroll", read); window.removeEventListener("resize", read); };
  }, [fixed]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !burger.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); burger.current?.focus(); } };
    document.addEventListener("click", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <>
      <header className={`b-nav${fixed ? " b-nav--fixed" : ""}${solid ? " is-solid" : ""}`} data-testid="brand-nav">
        <span {...q(motion, "quiet", 0.46)}><Logo /></span>
        <nav className="b-nav-links" aria-label="Primary">{links.map(([t, h], i) => <a key={t} href={h} {...q(motion, "quiet", 0.54 + 0.045 * i)}>{t}</a>)}</nav>
        <div className="b-nav-actions">
          <span {...q(motion, "settle", 0.66)}><ThemeToggle /></span>
          {member ? <a className="b-btn b-panel-pill" href="/settings" data-testid="nav-account" {...q(motion, "settle", 0.68)}>Account</a> : <a className="b-btn b-panel-pill" href="/login" {...q(motion, "settle", 0.68)}>Log in</a>}
          {member || !start ? null : <a className="b-btn b-nav-start" href={startHref} data-testid="nav-start" data-checkout="nav" data-unlock="nav" {...q(motion, "settle", 0.73)}>Start for $1<Arrow /></a>}
          <button ref={burger} {...q(motion, "settle", 0.68)} className="b-burger" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="b-menu" onClick={e => { e.stopPropagation(); setOpen(!open); }}><span /></button>
        </div>
      </header>
      <nav ref={menu} id="b-menu" className={`b-menu${open ? " open" : ""}`} aria-label="Mobile" onClick={e => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        {links.map(([t, h]) => <a key={t} href={h}>{t}</a>)}
        <div className="b-divider" />
        {member ? <a href="/settings">Account</a> : <a href="/login">Log in</a>}
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
        {[["Markets", "/markets"], ["Board", "/board"], ["Record", "/record"], ["Results", "/results"], ["Daily Brief", "/brief"], ["Bet Briefing", "/briefing"], ["Ask Insidir", "/ask"], ["FAQ", "/faq"], ["Methodology", "/methodology"], ["Our data", "/data"], ["Status", "/status"], ["Security", "/security"],
          ["Disclosures", "/disclosures"], ["Terms", "/terms"], ["Privacy", "/privacy"], ["Credits", "/credits"], ["Changelog", "/changelog"]].map(([t, h]) => <a key={t} href={h}>{t}</a>)}
      </nav>
      <div className="b-foot__legal">
        <span>{COMPANY.name} · {COMPANY.place} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></span>
        <span>{DATA_COMPANY}</span>
        <span>{GAMBLER}</span>
        <span>{FOOTER} Operated by Aethric LLC.</span>
        <span className="b-foot__disclaimer" data-testid="footer-disclaimer">{DISCLAIMER}</span>
      </div>
    </footer>
  );
}
