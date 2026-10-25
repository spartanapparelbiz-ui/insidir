"use client";
/* The phone's sticky CTA bar: hidden until the visitor first scrolls, then slides up. It is position: fixed, so
 * showing it causes no layout shift. Hidden at 900px+ by .stickycta in globals.css. */
import Link from "next/link";
import { useEffect, useState } from "react";

export function Sticky({ label, href }: { label: string; href: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = () => { if (window.scrollY > 8) { setShown(true); window.removeEventListener("scroll", on); } };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className={`stickycta lp-sticky${shown ? " lp-sticky--on" : ""}`} role="region" aria-label="Get started" aria-hidden={!shown}>
      <Link className="btn btn--primary" href={href} tabIndex={shown ? 0 : -1}>{label}</Link>
    </div>
  );
}
