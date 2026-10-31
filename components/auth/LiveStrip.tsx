"use client";
/* The sign-up pages' live strip, over the photo: 3 real large positions (artwork, amount, outcome, result), 30 minutes
 * late as visitors see them (GET /api/moves), refreshed every 30 seconds. */
import { useEffect, useState } from "react";
import { MoveArt } from "@/components/MoveArt";
import { dollars } from "@/lib/money";
import type { FeedItem } from "@/lib/moves/feed";

export type StripItem = Pick<FeedItem, "id" | "art" | "amount" | "headline" | "result">;

export function LiveStrip({ initial }: { initial: StripItem[] }) {
  const [items, setItems] = useState(initial);
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await fetch("/api/moves?limit=3&min=25000", { cache: "no-store" }).then(x => x.json() as Promise<{ items?: StripItem[] }>).catch(() => null);
      if (r?.items?.length) setItems(r.items.slice(0, 3));
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!items.length) return null;
  return (
    <div className="astrip" aria-label="Live large positions, 30 minutes late">
      <p className="astrip__label">Live · 30-min delay</p>
      <ul className="astrip__list">
        {items.map(m => (
          <li key={m.id} className="astrip__row">
            <MoveArt art={m.art} className="art-mini astrip__art" />
            <span className="astrip__amt">{dollars(m.amount)}</span>
            <span className="astrip__h">{m.headline}</span>
            <span className="astrip__res">{m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : "Open"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
