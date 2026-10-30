/* A company's logo by ticker at 512px, from Logo.dev (used only when LOGO_DEV_TOKEN is set; lib/logos.ts stockLogo).
 * Fetched once per ticker per server and kept in memory, then cached for 30 days by browsers and any CDN in front
 * (immutable). Without a logo from Logo.dev, the 128px file shipped in public/logos/stocks, when there is one. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

const CACHE = new Map<string, { body: ArrayBuffer; type: string }>();
const MAX = 2000;
const HEADERS = { "Cache-Control": "public, max-age=2592000, immutable" };

export async function GET(_req: Request, { params }: { params: Promise<{ t: string }> }) {
  const t = (await params).t.toUpperCase();
  if (!/^[A-Z0-9-]{1,10}$/.test(t)) return new NextResponse(null, { status: 404 });
  const hit = CACHE.get(t);
  if (hit) return new NextResponse(hit.body, { headers: { ...HEADERS, "Content-Type": hit.type } });
  const token = process.env.LOGO_DEV_TOKEN;
  if (token) {
    const res = await fetch(`https://img.logo.dev/ticker/${encodeURIComponent(t)}?token=${encodeURIComponent(token)}&size=512&format=png&retina=false&fallback=404`,
      { signal: AbortSignal.timeout(5000) }).catch(() => null);
    const type = res?.headers.get("content-type") ?? "";
    if (res?.ok && type.startsWith("image/")) {
      const body = await res.arrayBuffer();
      if (CACHE.size >= MAX) CACHE.delete(CACHE.keys().next().value!);
      CACHE.set(t, { body, type });
      return new NextResponse(body, { headers: { ...HEADERS, "Content-Type": type } });
    }
  }
  if (existsSync(join(process.cwd(), "public/logos/stocks", `${t}.webp`))) return NextResponse.redirect(new URL(`/logos/stocks/${t}.webp`, _req.url), 302);
  return new NextResponse(null, { status: 404 });
}
