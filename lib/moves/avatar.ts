/* Trader pictures, pure. Only where the source already shows one publicly:
 *   - Polymarket wallets: the profile picture from Polymarket's own public profile (profileImageOptimized, else
 *     profileImage; the same rows that carry the username, lib/moves/sources.ts publicUsername), and only when it is
 *     served from Polymarket's own image host (AVATAR_HOST). Anything else is dropped, never fetched.
 *   - Everyone else (no picture, Kalshi's anonymous trades, SEC insiders and funds): a black-and-white monogram. No
 *     photo of a real person is ever pulled from anywhere else.
 * A wallet whose public username is blocked (lib/moves/names.ts) never shows its picture, and /admin can hide any
 * wallet's picture (terminal.trader_avatars.hidden_at). */
import { isBlockedName } from "./names";
import { shortWallet, walletLabel } from "./records";
import type { Move } from "./types";

/** Polymarket's own image host for profile pictures. The only host a picture may come from (next.config.ts allows the
 *  same one, and nothing else, for next/image). */
export const AVATAR_HOST = "polymarket-upload.s3.us-east-2.amazonaws.com";
/** Pictures are re-read from Polymarket once a day. */
export const AVATAR_STALE_MS = 24 * 3_600_000;
/** Card and profile sizes, CSS pixels. */
export const AVATAR_SIZE = { card: 40, profile: 96 } as const;

/** The URL as given when it is an https link on AVATAR_HOST (no port, no credentials, a real path), else null. */
export function safeAvatarUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 600) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== AVATAR_HOST || u.port || u.username || u.password || u.pathname.length < 2) return null;
  return u.href;
}

/** A profile row's picture (Polymarket public-profile, /trades, /v1/leaderboard): the optimized one when it's on
 *  Polymarket's host, else the original; null when it has none, it's elsewhere, or the username is blocked. */
export function profileAvatar(r: Record<string, unknown>): string | null {
  const name = [r.name, r.userName, r.username].find((x): x is string => typeof x === "string" && x.trim() !== "");
  if (name && isBlockedName(name)) return null;
  return safeAvatarUrl(r.profileImageOptimized) ?? safeAvatarUrl(r.profileImage);
}

/** True when a profile row's public username is blocked: its picture is never shown either. */
export function profileBlocked(r: Record<string, unknown>): boolean {
  return [r.name, r.userName, r.username].some(x => typeof x === "string" && isBlockedName(x));
}

/** The first two letters or digits of a name, upper case ("kch123" → "KC"); an address uses the two characters after
 *  0x ("0xe1…30" → "E1"). */
export function monogram(label: string | null | undefined): string {
  const s = (label ?? "").trim();
  const hex = /^0x([0-9a-f]{2})/i.exec(s);
  if (hex) return hex[1]!.toUpperCase();
  const chars = [...s.normalize("NFKC")].filter(c => /[\p{L}\p{N}]/u.test(c));
  return chars.length ? chars.slice(0, 2).join("").toUpperCase() : "?";
}

/** A company's ticker as its monogram (up to 4 letters, "BRK.B" → "BRKB"); the company's initials without one. */
export function tickerMonogram(ticker: string | null | undefined, company?: string | null): string {
  const t = (ticker ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return t || monogram(company);
}

/** What stands for a trader: their picture (or null) and the monogram shown without one, or when it fails to load. */
export interface Face { src: string | null; mono: string }

/** One stored picture as it may be shown: not hidden by an admin, not from a blocked username, on Polymarket's host. */
export function shownAvatar(row: { url: string | null; blocked: boolean; hiddenAt: Date | number | null } | null | undefined, name?: string | null): string | null {
  if (!row || row.hiddenAt || row.blocked || isBlockedName(name)) return null;
  return safeAvatarUrl(row.url);
}

/** A Polymarket wallet's face. */
export function walletFace(wallet: string, name: string | null, avatars: ReadonlyMap<string, string>): Face {
  const blocked = isBlockedName(name);
  return { src: blocked ? null : avatars.get(wallet) ?? null, mono: monogram(blocked ? shortWallet(wallet) : walletLabel(wallet, name)) };
}

/** The face on a move: the wallet's picture or monogram; "Someone" (Kalshi); the company's ticker (SEC insiders and
 *  funds' adds). */
export function moveFace(m: Move, avatars: ReadonlyMap<string, string>): Face {
  const d = m.detail;
  if (d?.kind === "insider") return { src: null, mono: tickerMonogram(d.ticker, d.company) };
  if (d?.kind === "fund") return { src: null, mono: tickerMonogram(null, d.company) };
  if (m.source !== "polymarket" || !m.wallet) return { src: null, mono: monogram("Anonymous") };
  return walletFace(m.wallet, m.walletName, avatars);
}
