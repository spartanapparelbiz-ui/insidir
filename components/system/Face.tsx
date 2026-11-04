"use client";
/* A candidate's face: the self-hosted, face-cropped portrait at the right file size (96 for avatars up to 48px, 192 up
 * to 96px; never the optimizer, never 3840), loaded eagerly when above the fold. While it loads the disc is a neutral
 * skeleton; if it fails, the candidate's initials on a neutral disc. Never an empty circle. No portrait: initials. */
import { useState } from "react";

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).filter(w => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).map(w => w[0]!.toUpperCase()).filter((_, i, a) => i === 0 || i === a.length - 1).join("");

export function Face({ name, src, size = 48, eager = false }: { name: string; src: string | null; size?: number; eager?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "failed">(src ? "loading" : "failed");
  const sz = size <= 32 ? "s" : size <= 56 ? "m" : "l";
  return (
    <span className={`s-face s-face--${sz}${state === "loading" ? " is-loading" : ""}`} style={{ width: size, height: size }} data-testid="face" data-face={state === "failed" ? "initials" : "photo"}>
      {state === "failed" ? <span className="s-face__ini" aria-label={name} role="img">{initialsOf(name)}</span> : (
        // eslint-disable-next-line @next/next/no-img-element -- self-hosted, pre-sized portraits (scripts/people-sync.py)
        <img src={src!} alt={name} width={size} height={size} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} decoding="async"
          ref={el => { if (el?.complete && state === "loading") setState(el.naturalWidth ? "ok" : "failed"); }}
          onLoad={() => setState("ok")} onError={() => setState("failed")} />
      )}
    </span>
  );
}
