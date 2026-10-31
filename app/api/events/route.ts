/* Funnel beacon for the few events only the browser sees (unlock click, checkout start, onboarding). */
import { NextResponse, type NextRequest } from "next/server";
import { CLIENT_EVENTS, recordEvent } from "@/lib/analytics";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const name = typeof body === "object" && body && "name" in body && typeof body.name === "string" ? body.name : "";
  if (!CLIENT_EVENTS.has(name)) return NextResponse.json({ error: "unknown event" }, { status: 400 });
  const where = typeof body === "object" && body && "where" in body && typeof body.where === "string" ? body.where.slice(0, 40) : "";
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  const then = typeof body === "object" && body && "then" in body && typeof body.then === "string" && CLIENT_EVENTS.has(body.then) ? body.then : null;
  // Extra props: only these keys, short strings (the pay prompt's page, UTM source, delay variant and how it closed).
  const raw = typeof body === "object" && body && "props" in body && typeof body.props === "object" && body.props ? body.props as Record<string, unknown> : {};
  const extra = Object.fromEntries(["page", "utm", "variant", "how"].flatMap(k => (typeof raw[k] === "string" ? [[k, (raw[k] as string).slice(0, 80)]] : [])));
  const props = { ...(where ? { where } : {}), ...extra };
  const base = { visitorId: req.cookies.get("insidir_vid")?.value ?? "anon", userId: user?.id ?? null, variant: (extra.variant as string | undefined) ?? req.cookies.get("insidir_ab")?.value ?? null, props: Object.keys(props).length ? props : undefined };
  await recordEvent({ name, ...base }).catch(() => undefined);
  // A second event from the same tap (unlock → checkout), recorded after the first so the funnel's order holds.
  if (then) await recordEvent({ name: then, ...base }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
