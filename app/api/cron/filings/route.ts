/* GET /api/cron/filings: one poll of EDGAR's Form 4 and 8-K feeds (lib/filings/ingest.ts), for a serverless scheduler
 * (Railway cron, Vercel Cron, a Cloudflare cron trigger) instead of the worker's FILINGS_MS loop. Needs
 * `Authorization: Bearer $CRON_SECRET`. ?tickers=1 also refreshes the ticker directory (once a day is plenty).
 * Safe to overlap with the worker: every write is idempotent. */
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { isReady } from "@/lib/features";
import { filingsOnce } from "@/lib/filings/ingest";
import { tickersOnce } from "@/lib/filings/tickers";
import { SecClient } from "@/lib/stocks/sec";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return secret.length >= 24 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isReady("filings")) return NextResponse.json({ error: "Filings is off (FEATURES_READY)." }, { status: 409 });
  const sec = SecClient.fromEnv();
  if (!sec) return NextResponse.json({ error: "SEC_USER_AGENT is not set." }, { status: 500 });
  const db = getDb();
  const tickers = req.nextUrl.searchParams.get("tickers") === "1" ? await tickersOnce(db, sec) : null;
  const run = await filingsOnce(db, sec);
  return NextResponse.json({ ok: true, run, tickers, requests: sec.stats.requests }, { headers: { "Cache-Control": "no-store" } });
}
