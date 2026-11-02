/* /go: the onboarding funnel (components/brand/go/Funnel.tsx). Every Start button, DM link and ad lands here; UTM tags
 * are kept (middleware's first-touch cookie, the go_view event's props). Full screen, no nav. ?step= picks up where
 * a pop-up, the checkout or the Whop sign-in left them. Members who are set up go home. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { Funnel, type Step } from "@/components/brand/go/Funnel";
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
export const metadata: Metadata = { title: "Bet with the millionaires", robots: { index: false } };

const STEPS = new Set<Step>(["hook", "cats", "where", "size", "building", "aha", "paywall", "checkout", "unlocked", "save", "follow", "push"]);
const EMPTY = (now: number): GoData => ({ now, paid: false, pulse: { count: 0, window: "hour", wallets: 0, millionaires: 0, today: 0 }, hook: null, build: { wallets: 0, perCat: {} }, aha: { cards: [], more: 0 }, proof: null, wallets: [] });

export default async function GoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const [sp, viewer, jar] = await Promise.all([searchParams, getViewer(), cookies()]);
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
