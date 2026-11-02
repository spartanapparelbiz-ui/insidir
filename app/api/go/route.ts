/* The /go funnel's API.
 *   GET  ?build=wallets|bets|pricing   one building-screen line (a real count), so each ticks in as it returns
 *   GET  ?aha=1                        the 3 cards (members right after paying: all unlocked) and the stake line
 *   POST {answers}                     keeps the quiz in the insidir_go cookie (7 days)
 *   POST {step}                        records a step shown (go_step), with the visitor's UTM source, for /admin/go
 *   POST {step, ms}                    records the time spent on a step when they moved on (go_time) */
import { NextResponse, type NextRequest } from "next/server";
import { readUtm, recordEvent, UTM_COOKIE } from "@/lib/analytics";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { getDb, hasDatabase } from "@/lib/db";
import { ahaData, buildLine } from "@/lib/go/data";
import { GO_COOKIE, GO_DAYS, readAnswers, writeAnswers, type Answers } from "@/lib/go/answers";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
const STEPS = new Set(["hook", "topics", "venue", "stake", "building", "aha", "paywall", "checkout", "unlocked", "follow"]);

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const now = Date.now(), sp = req.nextUrl.searchParams;
  const a: Answers = readAnswers(req.cookies.get(GO_COOKIE)?.value, now) ?? { topics: [], venue: null, stake: null, at: now };
  const line = sp.get("build");
  if (line === "wallets" || line === "bets" || line === "pricing") return NextResponse.json({ n: await buildLine(getDb(), now, line, a).catch(() => 0) }, { headers: { "Cache-Control": "no-store" } });
  if (sp.get("aha")) {
    const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
    const member = Boolean(user && isPaid(user.plan));
    return NextResponse.json(await ahaData(getDb(), now, a, member ? 3 : 1), { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "bad_input" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { answers?: Partial<Answers>; step?: string; ms?: number };
  const now = Date.now();
  if (body.answers) {
    const a = readAnswers(writeAnswers({ topics: body.answers.topics ?? [], venue: body.answers.venue ?? null, stake: body.answers.stake ?? null, at: now, ...(body.answers.remind === false ? { remind: false } : {}) }), now)!;
    const res = NextResponse.json({ ok: true, answers: a });
    res.cookies.set(GO_COOKIE, writeAnswers(a), { maxAge: GO_DAYS * 86_400, path: "/", sameSite: "lax", httpOnly: false });
    return res;
  }
  if (body.step && STEPS.has(body.step)) {
    const visitorId = req.cookies.get(VISITOR_COOKIE)?.value ?? null;
    const utm = readUtm(req.cookies.get(UTM_COOKIE)?.value) ?? {};
    const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
    const timed = typeof body.ms === "number" && Number.isFinite(body.ms);
    const props = { step: body.step, source: utm.utm_source ?? "direct", ...(timed ? { ms: Math.max(0, Math.min(3_600_000, Math.round(body.ms!))) } : {}) };
    if (visitorId || user) await recordEvent({ name: timed ? "go_time" : "go_step", visitorId, userId: user?.id ?? null, props }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "bad_input" }, { status: 400 });
}
