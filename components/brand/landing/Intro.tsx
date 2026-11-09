"use client";
/* The landing's cinematic intro, once per visit: black, film letterbox bars, the stadium pushing slowly out of the dark
 * in black and white, three lines with today's real numbers coming up one by one, the wordmark, then the bars open onto
 * the hero. About four seconds; a tap, a key or Skip ends it at once.
 * It only plays when the inline script (before paint) says so: not seen this visit, motion allowed, a real browser
 * (never under automation). Otherwise the markup stays display:none and the page is as it always was. */
import { useEffect, useRef } from "react";
import { BrandPicture } from "../BrandPicture";
import { PHOTOS } from "@/lib/brand/images";

const KEY = "insidir_intro";
const LENGTH_MS = 4300;

/** Runs before paint, inline: decide whether the intro plays (html.intro-on). */
export const INTRO_SCRIPT = `(function(){try{var d=document.documentElement;if(sessionStorage.getItem("${KEY}")||navigator.webdriver||matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.classList.add("intro-on");sessionStorage.setItem("${KEY}","1")}catch(e){}})();`;

export function Intro({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("intro-on")) return;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      root.classList.add("intro-out");
      window.setTimeout(() => root.classList.remove("intro-on", "intro-out"), 900);
      removeEventListener("keydown", end);
    };
    const t = window.setTimeout(end, LENGTH_MS);
    addEventListener("keydown", end);
    const el = ref.current;
    el?.addEventListener("click", end);
    return () => { clearTimeout(t); removeEventListener("keydown", end); el?.removeEventListener("click", end); };
  }, []);
  return (
    <div ref={ref} className="intro" aria-hidden="true" data-testid="intro">
      <div className="intro__bg"><BrandPicture src={PHOTOS.stadium.src} priority sizes="100vw" style={{ objectPosition: PHOTOS.stadium.pos }} /></div>
      <div className="intro__grain" />
      <div className="intro__lines">
        {lines.map((l, i) => <p key={i} className="intro__line" style={{ animationDelay: `${0.35 + i * 0.85}s` }}>{l}</p>)}
        <p className="intro__mark" style={{ animationDelay: `${0.35 + lines.length * 0.85 + 0.1}s` }}>INSIDIR</p>
      </div>
      <i className="intro__bar intro__bar--top" /><i className="intro__bar intro__bar--bottom" />
      <button type="button" className="intro__skip">Skip</button>
    </div>
  );
}
