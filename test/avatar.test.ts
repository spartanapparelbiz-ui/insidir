/* Trader pictures (lib/moves/avatar.ts): only Polymarket's own public picture, only from its own image host, never for a
 * blocked username; a black-and-white monogram everywhere else, the same size and shape; and the store's rules
 * (an admin's hide sticks through every daily re-read) against a real Postgres when E2E_DATABASE_URL is set. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "@/next.config";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { PolymarketClient } from "@/lib/exchanges";
import { AVATAR_HOST, AVATAR_SIZE, monogram, moveFace, profileAvatar, profileBlocked, safeAvatarUrl, shownAvatar, tickerMonogram, walletFace } from "@/lib/moves/avatar";
import { adminAvatars, avatarsFor, saveAvatar, setAvatarHidden, walletsDueForAvatar } from "@/lib/moves/avatar-store";
import { avatarsOnce } from "@/lib/moves/jobs";
import { readLeaderboard } from "@/lib/moves/sources";
import { upsertMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { Avatar } from "@/components/v2/Avatar";

const W = "0xabc0000000000000000000000000000000000001";
const PIC = `https://${AVATAR_HOST}/profile-image-123.png`;
const OPT = `https://${AVATAR_HOST}/profile-image-123_optimized.webp`;

const move = (o: Partial<Move> = {}): Move => ({
  id: "pm:1", source: "polymarket", marketId: "0xm", eventTitle: "E", marketTitle: "M", outcome: "Yes", outcomeSide: "yes", amount: 50_000,
  avgPrice: 0.5, wallet: W, walletName: "kch123", at: 0, lastAt: 0, fills: 1, tab: "markets", league: null, category: "politics", url: null,
  result: null, settledAt: null, ...o,
});

describe("the picture's URL", () => {
  it("only https on Polymarket's own image host", () => {
    expect(safeAvatarUrl(PIC)).toBe(PIC);
    expect(safeAvatarUrl(`http://${AVATAR_HOST}/a.png`)).toBeNull();
    expect(safeAvatarUrl("https://evil.example.com/a.png")).toBeNull();
    expect(safeAvatarUrl(`https://${AVATAR_HOST}.evil.com/a.png`)).toBeNull();
    expect(safeAvatarUrl(`https://evil.com/${AVATAR_HOST}/a.png`)).toBeNull();
    expect(safeAvatarUrl(`https://x@${AVATAR_HOST}/a.png`)).toBeNull();
    expect(safeAvatarUrl(`https://${AVATAR_HOST}:8443/a.png`)).toBeNull();
    expect(safeAvatarUrl(`https://${AVATAR_HOST}/`)).toBeNull();
    expect(safeAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(safeAvatarUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(safeAvatarUrl("")).toBeNull();
    expect(safeAvatarUrl(null)).toBeNull();
    expect(safeAvatarUrl(42)).toBeNull();
  });

  it("next/image may fetch from that host and no other", () => {
    const patterns = config.images?.remotePatterns ?? [];
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({ protocol: "https", hostname: AVATAR_HOST });
    expect(config.images?.unoptimized).toBeFalsy();
    expect(config.images?.dangerouslyAllowSVG).toBe(false);
    // Both sizes (and their 2x) are widths the optimizer serves.
    const widths = [...(config.images?.deviceSizes ?? []), ...(config.images?.imageSizes ?? [])];
    for (const px of Object.values(AVATAR_SIZE)) { expect(widths).toContain(px); expect(widths).toContain(px * 2); }
  });

  it("from Polymarket's profile row: the optimized picture first, then the original, else none", () => {
    expect(profileAvatar({ name: "kch123", profileImage: PIC, profileImageOptimized: OPT })).toBe(OPT);
    expect(profileAvatar({ name: "kch123", profileImage: PIC, profileImageOptimized: "" })).toBe(PIC);
    expect(profileAvatar({ name: "kch123", profileImage: PIC, profileImageOptimized: "https://cdn.example.com/x.webp" })).toBe(PIC);
    expect(profileAvatar({ name: "kch123", profileImage: "https://i.imgur.com/x.png" })).toBeNull();
    expect(profileAvatar({ name: "kch123" })).toBeNull();
    expect(profileAvatar({ pseudonym: "Quiet-Fox", profileImage: PIC })).toBe(PIC);
  });

  it("a blocked username never brings its picture", () => {
    expect(profileAvatar({ name: "Aryan88", profileImage: PIC })).toBeNull();
    expect(profileAvatar({ userName: "heil_hitler", profileImageOptimized: OPT })).toBeNull();
    expect(profileBlocked({ name: "Aryan88" })).toBe(true);
    expect(profileBlocked({ name: "kch123" })).toBe(false);
    expect(readLeaderboard([{ proxyWallet: W, userName: "Aryan88", profileImage: PIC }])[0]).toMatchObject({ name: null, avatar: null, blocked: true });
    expect(readLeaderboard([{ proxyWallet: W, userName: "kch123", profileImage: PIC }])[0]).toMatchObject({ name: "kch123", avatar: PIC, blocked: false });
  });

  it("a stored picture is shown only when not hidden, not blocked and still on the host", () => {
    expect(shownAvatar({ url: PIC, blocked: false, hiddenAt: null })).toBe(PIC);
    expect(shownAvatar({ url: PIC, blocked: false, hiddenAt: new Date() })).toBeNull();
    expect(shownAvatar({ url: PIC, blocked: true, hiddenAt: null })).toBeNull();
    expect(shownAvatar({ url: "https://evil.example.com/a.png", blocked: false, hiddenAt: null })).toBeNull();
    expect(shownAvatar({ url: PIC, blocked: false, hiddenAt: null }, "Aryan88")).toBeNull();
    expect(shownAvatar(null)).toBeNull();
  });
});

describe("monograms", () => {
  it("the first two letters of the name, or of the 0x address", () => {
    expect(monogram("kch123")).toBe("KC");
    expect(monogram("Theo4")).toBe("TH");
    expect(monogram("_x")).toBe("X");
    expect(monogram("0xe1…30")).toBe("E1");
    expect(monogram(W)).toBe("AB");
    expect(monogram("Someone")).toBe("SO");
    expect(monogram("Élan")).toBe("ÉL");
    expect(monogram("")).toBe("?");
    expect(monogram(null)).toBe("?");
  });
  it("SEC insiders and funds: the company's ticker", () => {
    expect(tickerMonogram("NVDA")).toBe("NVDA");
    expect(tickerMonogram("brk.b")).toBe("BRKB");
    expect(tickerMonogram("GOOGL")).toBe("GOOG");
    expect(tickerMonogram(null, "Apple Inc")).toBe("AP");
  });
  it("the face on each kind of move", () => {
    const pics = new Map([[W, PIC]]);
    expect(moveFace(move(), pics)).toEqual({ src: PIC, mono: "KC" });
    expect(moveFace(move(), new Map())).toEqual({ src: null, mono: "KC" });
    expect(moveFace(move({ walletName: null }), new Map())).toEqual({ src: null, mono: "AB" });
    // A blocked name: no picture even if one were stored, and the address's monogram (never the name's letters).
    expect(moveFace(move({ walletName: "Aryan88" }), pics)).toEqual({ src: null, mono: "AB" });
    expect(walletFace(W, "Aryan88", pics)).toEqual({ src: null, mono: "AB" });
    expect(moveFace(move({ id: "ks:1", source: "kalshi", wallet: null, walletName: null }), pics)).toEqual({ src: null, mono: "SO" });
    const insider = { kind: "insider", company: "NVIDIA Corp", ticker: "NVDA", issuerCik: "1", role: "director", ownerName: "HUANG JEN HSUN", ownerCik: "2",
      shares: 1, pricePerShare: 1, tradeDate: null, filedAt: 0, accession: "a" } as const;
    expect(moveFace(move({ source: "sec", wallet: null, walletName: null, detail: insider }), pics)).toEqual({ src: null, mono: "NVDA" });
    const fund = { kind: "fund", company: "Apple Inc", cusip: "c", fund: "Big Fund", fundCik: "3", period: null, filedOn: "2026-10-01", addedShares: 1,
      prevShares: 0, curShares: 1, curValue: 1, newPosition: true, accession: "a", prevAccession: "b" } as const;
    expect(moveFace(move({ source: "sec", wallet: null, walletName: null, detail: fund }), pics)).toEqual({ src: null, mono: "AP" });
  });
});

describe("<Avatar>", () => {
  const html = (face: { src: string | null; mono: string }, size?: "card" | "profile") => renderToStaticMarkup(createElement(Avatar, { face, size }));
  it("a picture: round, sized, lazy, through next/image, no alt text (the name is next to it)", () => {
    const h = html({ src: PIC, mono: "KC" });
    expect(h).toContain('class="avatar avatar--card"');
    expect(h).toContain('loading="lazy"');
    expect(h).toContain('width="40"');
    expect(h).toContain('alt=""');
    expect(h).toContain("/_next/image?url=" + encodeURIComponent(PIC));
    expect(html({ src: PIC, mono: "KC" }, "profile")).toContain('width="96"');
  });
  it("without one: the monogram, same box", () => {
    const h = html({ src: null, mono: "KC" }, "profile");
    expect(h).toContain("avatar--profile");
    expect(h).toContain("avatar--mono");
    expect(h).toContain(">KC<");
    expect(h).not.toContain("<img");
    expect(html({ src: null, mono: "NVDA" })).toContain("avatar--long");
  });
  it("is the same 40px circle on every card and 96px on every profile", () => {
    const css = readFileSync(join(__dirname, "../app/v2.css"), "utf8");
    expect(css).toMatch(/\.avatar \{[^}]*border-radius: 50%;[^}]*width: 40px; height: 40px;/);
    expect(css).toMatch(/\.avatar--profile \{ width: 96px; height: 96px; \}/);
  });
});

const URL0 = process.env.E2E_DATABASE_URL;
const NAME = `terminal_avatar_${process.pid}`;
let admin: pg.Client, pool: pg.Pool, db: Db;

describe.skipIf(!URL0)("pictures in Postgres", () => {
  const NOW = Date.UTC(2026, 9, 28, 12);
  const w = (n: number) => `0x${String(n).padStart(40, "0")}`;
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL0 });
    await admin.connect();
    await admin.query(`drop database if exists ${NAME}`);
    await admin.query(`create database ${NAME}`);
    const u = new URL(URL0!); u.pathname = `/${NAME}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "terminal" });
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${NAME}`);
    await admin?.end();
  });

  it("the daily job reads each wallet's public profile; a hide sticks through re-reads; blocked and off-host never show", async () => {
    await upsertMoves(db, [1, 2, 3, 4, 5].map(n => move({ id: `pm:${n}`, wallet: w(n), walletName: `t${n}`, at: NOW - 3_600_000, lastAt: NOW - 3_600_000 })));
    const profiles: Record<string, unknown> = {
      [w(1)]: { name: "one", profileImage: PIC, profileImageOptimized: OPT },
      [w(2)]: { name: "Aryan88", profileImage: PIC },
      [w(3)]: { name: "three", profileImage: "https://evil.example.com/x.png" },
      [w(4)]: null, // Polymarket has no profile for it
    };
    const seen: string[] = [];
    const poly = { getPublicProfile: async (a: string) => {
      seen.push(a);
      if (a === w(5)) throw new Error("timeout");
      return profiles[a] ?? null;
    } } as unknown as PolymarketClient;

    expect(await walletsDueForAvatar(db, NOW, 100)).toHaveLength(5);
    expect(await avatarsOnce(db, poly, NOW)).toBe(4); // w(5)'s read failed: retried next run
    expect([...await avatarsFor(db, [1, 2, 3, 4, 5].map(w))]).toEqual([[w(1), OPT]]);
    expect(await walletsDueForAvatar(db, NOW, 100)).toEqual([w(5)]);

    // /admin: Hide picture, at once; the next day's re-read doesn't bring it back.
    await setAvatarHidden(db, w(1), true, NOW);
    expect((await avatarsFor(db, [w(1)])).size).toBe(0);
    const tomorrow = NOW + 25 * 3_600_000;
    expect(await walletsDueForAvatar(db, tomorrow, 100)).toContain(w(1));
    await avatarsOnce(db, poly, tomorrow);
    expect((await avatarsFor(db, [w(1)])).size).toBe(0);
    expect((await adminAvatars(db)).find(a => a.wallet === w(1))?.hiddenAt).toBe(NOW);
    await setAvatarHidden(db, w(1), false, NOW);
    expect(await avatarsFor(db, [w(1)])).toEqual(new Map([[w(1), OPT]]));

    // A picture removed on Polymarket is removed here on the next read.
    profiles[w(1)] = { name: "one" };
    await avatarsOnce(db, poly, tomorrow + 25 * 3_600_000);
    expect((await avatarsFor(db, [w(1)])).size).toBe(0);

    // Hiding a wallet never read yet sticks once it is read.
    await setAvatarHidden(db, w(9), true, NOW);
    await saveAvatar(db, w(9), { url: PIC, blocked: false }, NOW);
    expect((await avatarsFor(db, [w(9)])).size).toBe(0);
    // The blocked wallet is never offered to the admin list either (nothing to show).
    expect((await adminAvatars(db)).some(a => a.wallet === w(2))).toBe(false);
  });
});

describe("/api/admin/avatars", () => {
  const post = async (fields: Record<string, string>, cookie?: string) => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/admin/avatars/route");
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return POST(new NextRequest("http://localhost/api/admin/avatars", { method: "POST", body, headers: cookie ? { cookie } : {} }));
  };
  it("refuses anyone not signed in to /admin", async () => {
    const r = await post({ wallet: W, action: "hide" });
    expect(r.status).toBe(401);
  });
  it("takes only a wallet address and hide or show", async () => {
    const { ADMIN_COOKIE, adminCookieValue } = await import("@/lib/admin");
    const token = "t".repeat(40);
    const prev = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = token;
    try {
      const cookie = `${ADMIN_COOKIE}=${adminCookieValue(token, Date.now() + 60_000)}`;
      const bad = await post({ wallet: "not-a-wallet", action: "hide" }, cookie);
      expect(bad.status).toBe(303);
      expect(decodeURIComponent(bad.headers.get("location") ?? "")).toContain("isn't a Polymarket wallet");
      const odd = await post({ wallet: W, action: "delete" }, cookie);
      expect(decodeURIComponent(odd.headers.get("location") ?? "")).toContain("Unknown action");
    } finally { process.env.ADMIN_TOKEN = prev; }
  });
});
