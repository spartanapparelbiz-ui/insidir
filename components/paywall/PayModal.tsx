"use client";
/* The pay prompt (components/paywall/PayPrompt.tsx opens it): desktop, a centred 720px split, the page's subject photo
 * with one real large position over it (30 minutes late, as visitors see them), and "Follow the big money.", the
 * price, "Start for $1", the Whop line and "Not now"; phones, a bottom sheet with the photo as a 140px header,
 * swipe down to close. role="dialog", focus moves in and stays in, Esc / × / backdrop / Not now close it and focus
 * goes back; the page behind doesn't scroll. No countdowns, scarcity or invented numbers. */
import { useEffect, useRef, useState } from "react";
import { beacon } from "@/components/app/beacon";
import { MoveArt } from "@/components/MoveArt";
import { Photo } from "@/components/Photo";
import { dollars } from "@/lib/money";
import type { FeedItem } from "@/lib/moves/feed";
import { trackerPhoto, type PhotoName } from "@/lib/photos";

/** The subject photo of the page they're on: the tracker's, the market's, the stocks', else Manhattan at night. */
export function photoFor(path: string): PhotoName {
  const t = /^\/trackers\/([a-z0-9-]+)/.exec(path)?.[1];
  if (t) return trackerPhoto(t);
  if (path.startsWith("/sports")) return "home-sports";
  if (path.startsWith("/markets")) return "home-markets";
  if (/^\/(stocks|insider|insiders|funds|company)/.test(path)) return "home-stocks";
  return "top-1-percent";
}

type Pos = Pick<FeedItem, "id" | "art" | "amount" | "headline" | "result">;
const utm = () => { try { return new URLSearchParams(location.search).get("utm_source") ?? ""; } catch { return ""; } };

export function PayModal({ path, variant, onClose }: { path: string; variant: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const back = useRef<Element | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const props = { page: path, utm: utm(), variant };

  const close = (how: string) => { beacon("popup_dismissed", "popup", { ...props, how }); onClose(); };

  useEffect(() => {
    back.current = document.activeElement;
    beacon("popup_shown", "popup", props);
    const html = document.documentElement, prev = html.style.overflow;
    html.style.overflow = "hidden";
    box.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    void fetch("/api/moves?best=24h", { cache: "no-store" }).then(r => r.json() as Promise<{ items?: Pos[] }>).then(b => setPos(b.items?.[0] ?? null)).catch(() => undefined);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close("escape"); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("a[href], button")].filter(x => !x.hasAttribute("disabled"));
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); html.style.overflow = prev; (back.current as HTMLElement | null)?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = `/start?next=${encodeURIComponent(path)}&from=popup`;
  return (
    <div className="paym" data-testid="pay-prompt" onMouseDown={e => { if (e.target === e.currentTarget) close("backdrop"); }}>
      <div ref={box} className="paym__box" role="dialog" aria-modal="true" aria-labelledby="paym-h" style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        onTouchStart={e => { start.current = e.touches[0]!.clientY; }}
        onTouchMove={e => { if (start.current !== null) setDrag(Math.max(0, e.touches[0]!.clientY - start.current)); }}
        onTouchEnd={() => { if (drag > 90) close("swipe"); setDrag(0); start.current = null; }}>
        <div className="paym__photo">
          <Photo name={photoFor(path)} ratio="4:3" sizes="(min-width: 760px) 360px, 100vw" />
          {pos ? (
            <div className="paym__pos" data-testid="pay-position">
              <MoveArt art={pos.art} className="art-mini" />
              <span className="paym__amt">{dollars(pos.amount)}</span>
              <span className="paym__h">{pos.headline}</span>
              <span className="paym__res">{pos.result === "won" ? "Won" : pos.result === "lost" ? "Lost" : "Open"}</span>
            </div>
          ) : null}
        </div>
        <div className="paym__body">
          <button type="button" className="paym__x" aria-label="Close" onClick={() => close("x")}>×</button>
          <h2 id="paym-h" className="paym__title">Follow the big money.</h2>
          <p className="paym__sub">$1 for your first week, then $39/month. Cancel anytime.</p>
          <div className="paym__cta">
            <a className="btn btn--primary btn--big btn--block acta" href={next} data-autofocus onClick={() => { beacon("popup_click", "popup", props); try { sessionStorage.setItem("insidir_pay_from", path); } catch { /* attribution only */ } }}>Start for $1</a>
            <p className="continue__by">Secure sign-in and payments by Whop.</p>
          </div>
          <button type="button" className="paym__not" onClick={() => close("not_now")}>Not now</button>
        </div>
      </div>
    </div>
  );
}
