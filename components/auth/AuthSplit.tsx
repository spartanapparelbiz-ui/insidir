/* The sign-up pages' frame (/start, /login, /welcome): desktop, a full-height split, the photo (Manhattan at night)
 * left with a soft dark gradient, the logo in white and the live strip; the form right, white, centred, 400px wide.
 * Phone: the photo is a 220px header with the logo, the form below. Two step dots when there are steps. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Photo } from "@/components/Photo";
import { Wordmark } from "@/components/Wordmark";
import { getDb, hasDatabase } from "@/lib/db";
import { feedFor } from "@/lib/moves/feed";
import { memo } from "@/lib/memo";
import { LiveStrip, type StripItem } from "./LiveStrip";

async function strip(): Promise<StripItem[]> {
  if (!hasDatabase()) return [];
  const now = Date.now();
  return memo("auth:strip", 30_000, async () => (await feedFor(getDb(), "free", "us", { min: 25_000, limit: 3 }, now)).map(m => ({ id: m.id, art: m.art, amount: m.amount, headline: m.headline, result: m.result }))).catch(() => []);
}

export async function AuthSplit({ children, step }: { children: ReactNode; step?: 1 | 2 }) {
  const items = await strip();
  return (
    <main className="asplit" data-testid="auth-split">
      <div className="asplit__photo">
        <Photo name="top-1-percent" ratio="2:3" sizes="(min-width: 900px) 50vw, 100vw" priority />
        <span className="asplit__shade" aria-hidden="true" />
        <Link className="asplit__logo" href="/" aria-label="Insidir home"><Wordmark /></Link>
        <LiveStrip initial={items} />
      </div>
      <div className="asplit__form">
        <div className="asplit__box">
          {step ? <p className="asplit__steps" aria-label={`Step ${step} of 2`}><span className={step === 1 ? "on" : ""} /><span className={step === 2 ? "on" : ""} /></p> : null}
          {children}
        </div>
      </div>
    </main>
  );
}
