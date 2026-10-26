/* Railway's health check, and the place to see whether live data is flowing: the database state and each exchange's
 * last scan (lib/status.ts). Always 200 while the web process is up, so a stopped worker never blocks a deploy. */
import { NextResponse } from "next/server";
import { health } from "@/lib/status";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await health(), { headers: { "Cache-Control": "no-store" } });
}
