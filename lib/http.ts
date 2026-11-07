/* Small request helpers shared by the API routes. */
import type { NextRequest } from "next/server";

/** The caller's IP: the first address Railway's proxy put in X-Forwarded-For, else X-Real-IP. */
export function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0]!.trim() : req.headers.get("x-real-ip")) || null;
}

