/* /go: the onboarding funnel (components/brand/go/Funnel.tsx). Every Start button, DM link and ad lands here; UTM tags
 * are kept (middleware's first-touch cookie, the go_view event's props). Full screen, no nav. ?step= picks up where
 * a pop-up, the checkout or the Whop sign-in left them. Members who are set up go home.
 * ?status= is where the checkout lands (it was /welcome): pay first, then sign in. A buyer who paid signed out goes
 * straight through Whop's sign-in and lands back here signed in; it waits for Whop to say the account has Insidir
 * (components/auth/Welcome.tsx), then goes back to ?next. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { Welcome } from "@/components/auth/Welcome";
import { Funnel, type Step } from "@/components/brand/go/Funnel";
import { Stage as SystemStage } from "@/components/system";
import { PHOTOS } from "@/lib/brand/images";
import { safeNext } from "@/lib/auth/next";
import { Stage } from "@/components/brand/Stage";
import { StageMotion } from "@/components/brand/StageMotion";
import { readUtm, recordEvent, UTM_COOKIE } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { ELEMENTS_URL } from "@/lib/billing/whop";
import { getDb, hasDatabase } from "@/lib/db";
import { goData, paidByVisitor, type GoData } from "@/lib/go/data";
import { vapidPublicKey } from "@/lib/alerts/vapid";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bet with the millionaires", description: "See every bet from Polymarket wallets up $1M+, live, with the side they took. $1 for 3 days, then $39/month.", alternates: { canonical: "/go" } };

const STEPS = new Set<Step>(["hook", "cats", "where", "size", "building", "aha", "paywall", "checkout", "unlocked", "save", "follow", "push"]);
const EMPTY = (now: number): GoData => ({ now, paid: false, pulse: { count: 0, window: "hour", wallets: 0, millionaires: 0, today: 0, sinceMidnight: 0, countToday: 0 }, hook: null, build: { wallets: 0, perCat: {} }, aha: { cards: [], more: 0 }, proof: null, wallets: [] });

export default async function GoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const [sp, viewer, jar] = await Promise.all([searchParams, getViewer(), cookies()]);
  // The checkout's return (Whop adds ?status=; a redirect from Whop's own return carries from=checkout).
  const st = Array.isArray(sp.status) ? sp.status[sp.status.length - 1] : sp.status;
  if (typeof st === "string" || sp.from === "checkout") {
    const status = st ?? "succeeded", next = typeof sp.next === "string" ? safeNext(sp.next) : "/";
    const failed = status === "failed" || status === "canceled";
    if (!failed && !viewer.user) redirect(`/login/start?next=${encodeURIComponent(`/go?${new URLSearchParams({ status, ...(next !== "/" ? { next } : {}) }).toString()}`)}`);
    return (
      <main className="b-root" data-testid="welcome">
        <SystemStage bg={{ kind: "photo", photo: PHOTOS.hero, dark: 0.55, priority: true }} first testid="welcome-band">
          <Welcome status={status} next={next} />
          <p className="b-small b-center">Information, not advice. Insidir never places a bet or holds money.</p>
        </SystemStage>
      </main>
    );
  }
  const asked = typeof sp.step === "string" && STEPS.has(sp.step as Step) ? (sp.step as Step) : "hook";
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  // A member who is set up has nothing to do here, unless they are finishing the funnel's last steps.
  if (member && !["save", "follow", "push", "unlocked"].includes(asked)) redirect("/");
  // The last steps need the account: back through Whop's sign-in.
  if ((asked === "save" || asked === "follow" || asked === "push") && !viewer.user) redirect(`/login/start?next=${encodeURIComponent(`/go?step=${asked}`)}`);
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  const db = hasDatabase() ? getDb() : null;
  const paid = member || (db ? await paidByVisitor(db, visitorId).catch(() => false) : false);
  const initial = db ? await goData(db, [], now, paid).catch(() => EMPTY(now)) : EMPTY(now);
  const utm = readUtm(jar.get(UTM_COOKIE)?.value) ?? {};
  after(() => recordEvent({ name: "go_view", visitorId, userId: viewer.user?.id ?? null, props: { step: asked, ...Object.fromEntries(Object.entries(utm).filter(([, v]) => v)) } as Record<string, string> }).catch(() => undefined));
  let key: string | null = null;
  try { key = vapidPublicKey() || null; } catch { key = null; }
  const bg = <div className="b-fixed-bg" aria-hidden="true"><Stage bg={{ kind: "globe", dark: 0.6 }} inner={false}><span /></Stage></div>;
  return (
    <>
      <Funnel initial={initial} start={asked} now={now} elementsUrl={ELEMENTS_URL} signedIn={Boolean(viewer.user)} ageConfirmed={Boolean(viewer.user?.ageConfirmed)} vapidKey={key} bg={bg} />
      <StageMotion />
    </>
  );
}
