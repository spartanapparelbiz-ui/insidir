/* The home page (new design system, app/nx.css).
 *   Visitors  Kalshi's live market cards and ticker with Perplexity's one ask box and answers with sources
 *             (components/nx/Landing.tsx, data from lib/nx/landing.ts). One free Read, no account needed.
 *   Members   the member home inside the member frame (components/nx/Shell.tsx, MemberHome.tsx, lib/nx/member.ts).
 * Every number is live from the database. */
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { unlockHref } from "@/components/app/links";
import { Landing, NX_FAQ } from "@/components/nx/Landing";
import { MemberHome } from "@/components/nx/MemberHome";
import { Shell } from "@/components/nx/Shell";
import { AB_COOKIE, readUtm, recordEvent, UTM_COOKIE } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { cleanRef, REF_COOKIE } from "@/lib/home/ref";
import { CATS, electionMode } from "@/lib/nx/data";
import { heroPhoto, landingData } from "@/lib/nx/landing";
import { greeting, memberHomeData } from "@/lib/nx/member";
import { isPaid } from "@/lib/plans";
import { WHAT_IS } from "@/lib/copy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Insidir: where's the smart money?" }, description: WHAT_IS };
export const viewport: Viewport = { themeColor: "#0A0C10" };

const faqLd = () => JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: NX_FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const [jar, viewer, sp] = await Promise.all([cookies(), getViewer(), searchParams]);
  const clients = { polymarket: new PolymarketClient(), kalshi: new KalshiClient() };
  if (isPaid(viewer.plan) && viewer.user) {
    const u = viewer.user;
    const d = hasDatabase() ? await memberHomeData(getDb(), clients, u.id, u.settings.betOn ?? [], now)
      : { tabs: [], chips: [], mine: [], week: { right: 0, of: 0, lines: [] } };
    const first = u.name?.trim().split(/\s+/)[0] ?? null;
    return (
      <Shell current="home">
        <MemberHome d={d} first={first} greet={greeting(now)} photo={heroPhoto(now)} now={now} focus={sp.ask === "1"} />
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
  const d = hasDatabase() ? await landingData(getDb(), clients, now, viewer.region !== "non_us")
    : { now, election: electionMode(now), photo: heroPhoto(now), chips: [], proof: null, cards: Object.fromEntries(CATS.map(c => [c.key, []])) as never, featured: null, ticker: [], record: { "1w": [], "1m": [], "3m": [], all: [] }, us: viewer.region !== "non_us" };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd() }} />
      <Landing d={d} startHref={unlockHref()} />
    </>
  );
}
