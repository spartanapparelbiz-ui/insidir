/* The 8 AM brief by email (worker job, every few minutes): at or after BRIEF_HOUR_ET in New York, once per member per
 * ET day, for members who turned on settings.morningBriefEmail (off by default). The same brief as /brief (members'
 * version, with their watched bets), links to /brief?via=email (the Daily Brief "opened" activation event) and the
 * one-click unsubscribe link (lib/alerts/send.ts). Each sent day is logged once (events.dedupe_key
 * brief_email:<user>:<day>), so a restart never sends twice.
 *
 * Insidir has no email transport of its own yet: the worker passes `sendEmail` (whatever sends mail) and nothing goes
 * out without one. Server only; briefDue and briefEmail are pure. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { recordEvent } from "@/lib/analytics";
import { unsubscribeUrl } from "@/lib/alerts/send";
import { hourInNewYork } from "@/lib/moves/alerts";
import { isFreeAccess } from "@/lib/billing/free";
import { buildBrief, type Brief } from "./build";

export const BRIEF_HOUR_ET = 8;

export type SendEmail = (m: { to: string; subject: string; text: string; html: string }) => Promise<boolean>;

const etDay = (now: number) => new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Due at or after 8 AM New York time, once per ET day. Pure. */
export function briefDue(now: number, lastSentDay: string | null): { due: boolean; day: string } {
  const day = etDay(now);
  return { due: hourInNewYork(now) >= BRIEF_HOUR_ET && day !== lastSentDay, day };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email: subject, plain text and HTML. Pure. */
export function briefEmail(b: Brief, appUrl: string, unsubscribe: string): { subject: string; text: string; html: string } {
  const link = `${appUrl}/brief?via=email`;
  const first = b.items[0];
  const subject = first ? `The 8 AM brief: ${first.lines[0].length > 70 ? `${first.lines[0].slice(0, 67)}…` : first.lines[0]}` : "The 8 AM brief";
  const text = [
    "The 5 biggest things the $1M+ money did overnight:", "",
    ...(b.items.length ? b.items.flatMap((it, i) => [`${i + 1}. ${it.lines[0]}`, `   ${it.lines[1]}`, `   ${appUrl}${it.href}`, ""]) : ["Nothing from $1M+ wallets overnight.", ""]),
    ...(b.watched.length ? ["Your watched positions:", "", ...b.watched.flatMap(w => [w.lines[0], w.lines[1], ""])] : []),
    `The whole brief: ${link}`,
    "Information, not advice. Every position we've flagged, losses included: " + `${appUrl}/record`,
    `Stop these emails: ${unsubscribe}`,
  ].join("\n");
  const li = (h: string, a: string, href?: string) => `<li style="margin:0 0 14px"><div>${href ? `<a href="${esc(href)}">${esc(h)}</a>` : esc(h)}</div><div style="color:#666">${esc(a)}</div></li>`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.45;max-width:560px">
<p><strong>The 5 biggest things the $1M+ money did overnight</strong></p>
<ol style="padding-left:18px">${b.items.length ? b.items.map(it => li(it.lines[0], it.lines[1], `${appUrl}${it.href}`)).join("") : "<li>Nothing from $1M+ wallets overnight.</li>"}</ol>
${b.watched.length ? `<p><strong>Your watched trades</strong></p><ul style="padding-left:18px">${b.watched.map(w => li(w.lines[0], w.lines[1], `${appUrl}${w.href}`)).join("")}</ul>` : ""}
<p><a href="${esc(link)}">Open the whole brief</a></p>
<p style="color:#666;font-size:13px">Information, not advice. <a href="${esc(`${appUrl}/record`)}">Every position we've flagged, losses included</a>.<br><a href="${esc(unsubscribe)}">Stop these emails</a></p>
</div>`;
  return { subject, text, html };
}

/** Members who opted in and haven't had today's brief yet. */
async function optedIn(db: Db, day: string): Promise<Array<{ id: string; email: string }>> {
  const r = await db.execute(sql`select u.id, u.email from terminal.users u
    where u.email is not null and (u.settings->>'morningBriefEmail') = 'true'
      and not exists (select 1 from terminal.events e where e.dedupe_key = 'brief_email:' || u.id || ':' || ${day})`);
  return (r.rows as Array<{ id: string; email: string }>).map(x => ({ id: String(x.id), email: String(x.email) }));
}

/** Sends today's brief to every opted-in member, once. Returns how many went out. */
export async function briefEmailOnce(db: Db, now: number, o: { sendEmail: SendEmail | null; appUrl: string; plans?: (ids: string[]) => Promise<Set<string>> }): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  const d = briefDue(now, null);
  if (!d.due || !o.sendEmail) return out;
  const users = await optedIn(db, d.day);
  if (!users.length) return out;
  // Members only: their stored plan (or the free-access list) says so now.
  const paid = o.plans ? await o.plans(users.map(u => u.id)) : await membersNow(db, users.map(u => u.id));
  for (const u of users) {
    if (!paid.has(u.id) && !isFreeAccess(u.email)) { out.skipped++; continue; }
    const b = await buildBrief(db, now, { member: true, userId: u.id });
    const m = briefEmail(b, o.appUrl, unsubscribeUrl(o.appUrl, u.id));
    const ok = await o.sendEmail({ to: u.email, ...m }).catch(() => false);
    if (!ok) { out.failed++; continue; }
    await recordEvent({ name: "brief_email", userId: u.id, props: { items: b.items.length, watched: b.watched.length }, dedupeKey: `brief_email:${u.id}:${d.day}` }).catch(() => undefined);
    out.sent++;
  }
  return out;
}

async function membersNow(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const r = await db.execute(sql`select id from terminal.users where id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) and plan <> 'free'
    and (access_until is null or access_until > now() or membership_status in ('active', 'trialing'))`);
  return new Set((r.rows as Array<{ id: string }>).map(x => String(x.id)));
}

/** Whether the opt-in shows in Settings: only once the worker can send email (BRIEF_EMAIL=on). */
export const briefEmailAvailable = (env: Record<string, string | undefined> = process.env): boolean => (env.BRIEF_EMAIL ?? "").toLowerCase() === "on";
