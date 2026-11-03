/* The home page.
 *   Visitors  the landing: a scroll of stages in the brand's language (components/brand/landing/Landing.tsx).
 *   Members   the Desk (components/desk/Desk.tsx): the tape, today's KPIs, the live flow of millionaire bets with
 *             EdgeChart, their desk (pings, follows, copies), the wallets active today and, on Election Day, the races.
 * Everything else Insidir has stays live by URL. */
import { cookies } from "next/headers";
import { after } from "next/server";
import { AB_COOKIE, readUtm, recordEvent, UTM_COOKIE } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { cleanRef, REF_COOKIE } from "@/lib/home/ref";
import { Landing } from "@/components/brand/landing/Landing";
import { Desk } from "@/components/desk/Desk";
import { deskData } from "@/lib/desk/data";
import { edgeFor } from "@/lib/desk/edge";
import { electionDay } from "@/lib/brand/pulse";
import { PolymarketClient } from "@/lib/exchanges";
import { emptyLanding, landingFor } from "@/lib/brand/landing";

export const dynamic = "force-dynamic";
let poly: PolymarketClient | null = null;

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const [jar, viewer, sp] = await Promise.all([cookies(), getViewer(), searchParams]);
  const member = isPaid(viewer.plan);
  if (member) {
    const db = hasDatabase() ? getDb() : null, u = viewer.user;
    if (!db || !u) return <Landing d={emptyLanding(now)} />;
    const d = await deskData(db, u.id, u.settings, now, electionDay(now));
    // EdgeChart opens on today's biggest bet in the flow that's still live (priced 2–98¢), else today's biggest, else
    // the newest.
    const day = d.flow.filter(b => b.at >= now - 86_400_000).sort((a, b) => b.amount - a.amount);
    const big = day.find(b => b.priceNow !== null && b.priceNow > 0.02 && b.priceNow < 0.98) ?? day[0] ?? d.flow[0];
    const edge = big ? await edgeFor(db, (poly ??= new PolymarketClient()), big.id, now).catch(() => null) : null;
    return <Desk d={d} edge={edge} search={sp.search === "1"} />;
  }
  const ref = cleanRef(typeof sp.ref === "string" ? sp.ref : null) ?? cleanRef(jar.get(REF_COOKIE)?.value);
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  // The post they came from (per-post funnel on /admin): this link's UTM tags, else the first-touch ones kept in the cookie.
  const fromLink = Object.fromEntries((["utm_source", "utm_campaign", "utm_content"] as const).flatMap(k => typeof sp[k] === "string" && sp[k] ? [[k, (sp[k] as string).slice(0, 100)]] : []));
  const utm = Object.keys(fromLink).length ? fromLink : readUtm(jar.get(UTM_COOKIE)?.value) ?? {};
  const tags = Object.fromEntries((["utm_source", "utm_campaign", "utm_content"] as const).flatMap(k => utm[k] ? [[k, utm[k]!]] : []));
  const props = { ...(ref ? { ref } : {}), ...tags };
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null, props: Object.keys(props).length ? props : undefined }).catch(() => undefined));
  // The whole landing in one response (complete at load, never revealed later); visitors share it for 15 s, so the
  // first byte is quick (lib/brand/landing.ts landingFor).
  const d = hasDatabase() ? await landingFor(getDb(), now) : emptyLanding(now);
  return <Landing d={d} />;
}
