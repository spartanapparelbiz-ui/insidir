/* The home page (the insidir system, app/sky.css).
 *   Visitors  the landing (components/sky/Landing.tsx, data from lib/sky/landing.ts): the ask box beside the 3D money
 *             skyline, live markets, the Read as an answer, the ticker, the record, pricing. One free Read.
 *   Members   the dashboard home (components/sky/Shell.tsx, MemberHome.tsx, lib/nx/member.ts).
 * Every number is live from the database. */
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { unlockHref } from "@/components/app/links";
import { FAQ, Landing } from "@/components/sky/Landing";
import { MemberHome } from "@/components/sky/MemberHome";
import { Shell } from "@/components/sky/Shell";
import { AB_COOKIE, readUtm, recordEvent, UTM_COOKIE } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { WHAT_IS } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { cleanRef, REF_COOKIE } from "@/lib/home/ref";
import { electionMode } from "@/lib/nx/data";
import { greeting, hello, memberCats, memberHomeData, type MemberHomeData } from "@/lib/nx/member";
import { isPaid } from "@/lib/plans";
import { dedupeChips, landingData, type LandingData } from "@/lib/sky/landing";
import { skyBets } from "@/lib/sky/skyline";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "insidir: where's the smart money?" }, description: WHAT_IS };
export const viewport: Viewport = { themeColor: "#070B14" };

const faqLd = () => JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const [jar, viewer, sp] = await Promise.all([cookies(), getViewer(), searchParams]);
  const clients = { polymarket: new PolymarketClient(), kalshi: new KalshiClient() };
  if (isPaid(viewer.plan) && viewer.user) {
    const u = viewer.user, cats = memberCats(u.settings.betOn ?? []);
    const [d, sky] = hasDatabase() ? await Promise.all([
      memberHomeData(getDb(), clients, u.id, u.settings.betOn ?? [], now),
      skyBets(getDb(), now, { cats: cats.length ? cats : null }).catch(() => []),
    ]) : [{ tabs: [], chips: [], mine: [], week: { right: 0, of: 0, lines: [] } } as MemberHomeData, []];
    return (
      <Shell current="home">
        <MemberHome d={{ ...d, chips: dedupeChips(d.chips) }} hello={hello(greeting(now), u.name)} sky={sky} cats={cats} now={now} focus={sp.ask === "1"} />
      </Shell>
    );
  }
  const ref = cleanRef(typeof sp.ref === "string" ? sp.ref : null) ?? cleanRef(jar.get(REF_COOKIE)?.value);
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  // The post they came from (per-post funnel on /admin): this link's UTM tags, else the first-touch ones kept in the cookie.
  const fromLink = Object.fromEntries((["utm_source", "utm_campaign", "utm_content"] as const).flatMap(k => typeof sp[k] === "string" && sp[k] ? [[k, (sp[k] as string).slice(0, 100)]] : []));
  const utm = Object.keys(fromLink).length ? fromLink : readUtm(jar.get(UTM_COOKIE)?.value) ?? {};
  const tags = Object.fromEntries((["utm_source", "utm_campaign", "utm_content"] as const).flatMap(k => utm[k] ? [[k, utm[k]!]] : []));
  const props = { ...(ref ? { ref } : {}), ...tags };
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null, props: Object.keys(props).length ? props : undefined }).catch(() => undefined));
  const us = viewer.region !== "non_us";
  const d: LandingData = hasDatabase() ? await landingData(getDb(), clients, now, us)
    : { now, election: electionMode(now), us, sky: [], chips: [], proof: null, cards: {}, featured: null, ticker: [], record: { "1w": [], "1m": [], "3m": [], all: [] } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd() }} />
      <Landing d={d} startHref={unlockHref()} />
    </>
  );
}
