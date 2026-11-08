"use client";
/* The landing's demo player: recordings of the live site (qa/record-site.ts), big. Desktop recordings (16:10, in a
 * browser frame) on wide screens, phone recordings (in a phone frame, the full width of the screen) on phones. Chapters
 * play one after another; a chapter tab jumps to it; the corner button plays it full screen with controls. It only
 * loads and plays while it's on screen. */
import { useEffect, useRef, useState } from "react";
import { WATCH } from "@/lib/brand/copy";

export function Demo() {
  const [i, setI] = useState(0);
  const [phone, setPhone] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const box = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null);
  const c = WATCH[i]!, kind = phone ? "phone" : "desk", src = `/media/site-${c.id}-${kind}`;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const set = () => setPhone(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(!!e?.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (onScreen && !paused) void v.play().catch(() => {});
    else v.pause();
  }, [onScreen, paused, i, phone]);

  const go = (n: number) => { setProgress(0); setPaused(false); setI((n + WATCH.length) % WATCH.length); };
  const full = () => {
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    v.controls = true;
    if (v.requestFullscreen) void v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
    const off = () => { if (!document.fullscreenElement) { v.controls = false; document.removeEventListener("fullscreenchange", off); } };
    document.addEventListener("fullscreenchange", off);
  };

  return (
    <div className="b-demo" ref={box} data-kind={kind} data-testid="demo">
      <div className="b-demo__tabs" role="tablist" aria-label="What the recording shows">
        {WATCH.map((w, n) => (
          <button key={w.id} type="button" role="tab" aria-selected={n === i} className="b-demo__tab" onClick={() => go(n)} data-testid="demo-tab">
            <span className="b-demo__bar" aria-hidden="true"><span style={{ transform: `scaleX(${n === i ? progress : n < i ? 1 : 0})` }} /></span>
            <b>{w.t}</b><span>{w.d}</span>
          </button>
        ))}
      </div>
      <div className="b-demo__frame">
        {phone ? null : (
          <div className="b-demo__chrome" aria-hidden="true"><i /><i /><i /><span>{c.url}</span></div>
        )}
        <video key={src} ref={video} className="b-demo__video" muted playsInline preload={onScreen ? "auto" : "none"} poster={`${src}-poster.jpg`}
          aria-label={`${c.t}: a recording of the live site`} data-testid="demo-video"
          onTimeUpdate={e => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
          onEnded={() => { if (!document.fullscreenElement) go(i + 1); }}
          onClick={() => setPaused(p => !p)}>
          <source src={`${src}.webm`} type="video/webm" />
          <source src={`${src}.mp4`} type="video/mp4" />
        </video>
        <div className="b-demo__ctl">
          <button type="button" className="b-demo__btn" onClick={() => setPaused(p => !p)} aria-label={paused ? "Play" : "Pause"}>{paused ? "▶" : "❚❚"}</button>
          <button type="button" className="b-demo__btn" onClick={full} aria-label="Play full screen" data-testid="demo-full">⤢ Full screen</button>
        </div>
      </div>
    </div>
  );
}
