/* Small request helpers shared by the API routes. */
import type { NextRequest } from "next/server";

/** The caller's IP: the first address Railway's proxy put in X-Forwarded-For, else X-Real-IP. */
export function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0]!.trim() : req.headers.get("x-real-ip")) || null;
}

/** A JSON or form body as plain strings. */
export async function readBody(req: NextRequest): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const b: unknown = await req.json();
      return typeof b === "object" && b ? Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === "string" ? v : ""])) : {};
    }
    const f = await req.formData();
    return Object.fromEntries([...f.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  } catch { return {}; }
}
