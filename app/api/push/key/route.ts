/* GET /api/push/key: the web-push public key, from the server at run time (lib/alerts/vapid.ts), so the browser never
 * depends on a key fixed at build time. { publicKey: "" } when push isn't set up. */
import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/alerts/vapid";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}
