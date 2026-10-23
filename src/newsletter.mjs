/* The free weekly email: "The 5 biggest insider buys this week". For people who are not ready to pay; the form sits
 * after the receipts on the landing page and on every stock page.
 *
 *   POST /v1/newsletter                 { email, source }  → 202; a confirmation email (double opt-in)
 *   GET  /v1/newsletter/confirm?t=      confirms, then shows a short page
 *   GET  /v1/newsletter/unsubscribe?s=  a page with one button; POST to the same URL unsubscribes (link scanners
 *                                       never unsubscribe anyone). Every weekly email carries this link and the
 *                                       List-Unsubscribe headers (RFC 8058).
 *
 * The weekly worker (sendWeekly) runs hourly and sends once per ISO week, on Monday from 13:00 UTC, to confirmed
 * subscribers: the week's five largest open-market purchases (code P, non-derivative, original filings), each with its
 * SEC filing link. Unsubscribe links are signed with INSIDIR_APP_SECRET; without it nothing weekly is sent. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { enqueueEmail, renderEmail } from "./email.mjs";
import { emailSettings } from "./config.mjs";
import { normalizeEmail } from "./email-code.mjs";
import { sentence, withRole, LINE_SQL } from "./site-v2.mjs";

const sha = s => createHash("sha256").update(s).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
const secretOf = env => { const s = String(env.INSIDIR_APP_SECRET || ""); return s.length >= 32 ? s : null; };
export const unsubscribeSig = (id, env = process.env) => { const s = secretOf(env); return s ? id + "." + createHmac("sha256", s).update("newsletter:" + id).digest("base64url") : null; };
export function verifySig(value, env = process.env) {
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(String(value || ""));
  const expected = m && unsubscribeSig(m[1], env);
  return expected && timingSafeEqual(Buffer.from(expected), Buffer.from(m[0])) ? Number(m[1]) : null;
}

export async function subscribe(query, { email: raw, source = null, ref = null }, { env = process.env } = {}) {
  const email = normalizeEmail(raw);
  if (!email) throw fail(400, "Enter a valid email address.");
  const token = randomBytes(24).toString("hex");
  const row = (await query(`INSERT INTO newsletter_subscribers(email,token_hash,source,ref) VALUES($1,$2,$3,$4)
    ON CONFLICT (email) DO UPDATE SET token_hash=CASE WHEN newsletter_subscribers.confirmed_at IS NULL OR newsletter_subscribers.unsubscribed_at IS NOT NULL THEN EXCLUDED.token_hash ELSE newsletter_subscribers.token_hash END,
      unsubscribed_at=NULL
    RETURNING id,confirmed_at,(xmax=0) AS inserted,token_hash=$2 AS fresh`, [email, sha(token), String(source || "").slice(0, 40) || null, ref])).rows[0];
  if (row.confirmed_at && !row.fresh) return { subscribed: true, alreadyConfirmed: true };
  const site = emailSettings(env).publicUrl;
  const { text, html } = renderEmail({
    heading: "Confirm your weekly insider buys",
    paragraphs: ["Tap the button to get the 5 biggest insider buys every Monday, free. Each one links to its SEC filing.",
      "If you didn't ask for this, ignore this email and nothing will be sent."],
    action: { label: "Yes, send it to me", url: `${site}/v1/newsletter/confirm?t=${token}` },
    footer: ["You received this because someone entered this address on insidir.com."]
  });
  await enqueueEmail(query, { to: email, category: "security", kind: "newsletter_confirm", dedupeKey: "newsletter-confirm:" + sha(token), subject: "Confirm: the 5 biggest insider buys, every week", text, html });
  return { subscribed: true, confirmationSent: true };
}

export async function confirm(query, token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ""))) return false;
  const r = await query("UPDATE newsletter_subscribers SET confirmed_at=COALESCE(confirmed_at,now()),unsubscribed_at=NULL WHERE token_hash=$1 RETURNING id", [sha(token)]);
  return r.rowCount > 0;
}
export async function unsubscribe(query, sig, env = process.env) {
  const id = verifySig(sig, env);
  if (!id) return false;
  await query("UPDATE newsletter_subscribers SET unsubscribed_at=COALESCE(unsubscribed_at,now()) WHERE id=$1", [id]);
  return true;
}

/* The week's five largest open-market purchases, one per trade (a joint filing counts once). */
export const WEEK_BUYS_SQL = `SELECT * FROM (SELECT DISTINCT ON (x.accession,x.transaction_date,x.shares,x.price_per_share) x.* FROM (${LINE_SQL}
  WHERE f.ingest_status='parsed' AND NOT f.is_amendment AND NOT t.derivative AND t.transaction_code='P' AND t.estimated_value IS NOT NULL
    AND f.validation_status IS DISTINCT FROM 'flagged' AND t.transaction_date>=current_date-7) x
  ORDER BY x.accession,x.transaction_date,x.shares,x.price_per_share) y ORDER BY y.estimated_value DESC LIMIT $1`;
export const weekBuys = async (query, limit = 5) => withRole((await query(WEEK_BUYS_SQL, [limit])).rows || []);

const isoWeek = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + "-W" + String(Math.ceil(((t - y) / 864e5 + 1) / 7)).padStart(2, "0"); };

export async function sendWeekly(query, { env = process.env, now = new Date(), limit = 5000, force = false } = {}) {
  if (!secretOf(env)) return { skipped: "INSIDIR_APP_SECRET not set: weekly emails need signed unsubscribe links" };
  if (!force && (now.getUTCDay() !== 1 || now.getUTCHours() < 13)) return { skipped: "not Monday 13:00 UTC yet" };
  const week = isoWeek(now), buys = await weekBuys(query, 5);
  if (!buys.length) return { skipped: "no open-market insider buys this week" };
  const site = emailSettings(env).publicUrl;
  const subs = (await query(`SELECT id,email FROM newsletter_subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL
    AND (last_sent_at IS NULL OR last_sent_at < date_trunc('week',$1::timestamptz)) ORDER BY id LIMIT $2`, [now.toISOString(), limit])).rows;
  let queued = 0;
  for (const s of subs) {
    const unsub = `${site}/v1/newsletter/unsubscribe?s=${unsubscribeSig(s.id, env)}`;
    const { text, html } = renderEmail({
      heading: "The 5 biggest insider buys this week",
      paragraphs: [...buys.map((b, i) => `${i + 1}. ${sentence(b)} Filing: ${b.source_url}`),
        `See any stock's insiders at ${site}. Past trades don't predict future prices. Research, not investment advice.`],
      action: { label: "Get alerts for your stocks: $1 for 7 days", url: site + "/start?ref=newsletter" },
      footer: [`You get this because you signed up on insidir.com. Unsubscribe in one click: ${unsub}`]
    });
    const r = await enqueueEmail(query, { to: s.email, category: "digest", kind: "newsletter_weekly", dedupeKey: `newsletter:${s.id}:${week}`,
      subject: "The 5 biggest insider buys this week", text, html, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    await query("UPDATE newsletter_subscribers SET last_sent_at=$2 WHERE id=$1", [s.id, now.toISOString()]);
    if (r.queued) queued++;
  }
  return { week, subscribers: subs.length, queued };
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} | Insidir</title><link rel="stylesheet" href="/assets/css/ds.css?v=3"></head><body class="ds"><main class="ds-wrap" style="padding:96px 24px;max-width:640px">
<a class="ds-mark" href="/">insidir.</a><h1 class="ds-h2" style="margin-top:48px">${title}</h1>${body}</main></body></html>`;

/* /v1/newsletter* (classified open in paywall.mjs). Returns false when the path is not one of these. */
export async function newsletterRoutes(req, res, url, { query, env = process.env, json, readJson, limited, ref = null }) {
  const p = url.pathname, m = req.method;
  if (p === "/v1/newsletter" && m === "POST") {
    if (await limited()) return json(res, 429, { error: "Too many sign-ups from this connection. Try again later." });
    const x = await readJson();
    return json(res, 202, await subscribe(query, { email: x?.email, source: x?.source, ref }, { env }));
  }
  const html = (status, body) => { res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }); res.end(body); return true; };
  if (p === "/v1/newsletter/confirm" && m === "GET") {
    const ok = await confirm(query, url.searchParams.get("t"));
    return html(ok ? 200 : 400, page(ok ? "You're in." : "That link didn't work.", ok
      ? `<p class="ds-body" style="margin-top:16px">The 5 biggest insider buys arrive every Monday. While you wait, look up any stock.</p><p style="margin-top:32px"><a class="ds-btn" href="/">Search a stock</a></p>`
      : `<p class="ds-body" style="margin-top:16px">It may be old or already used. Sign up again from any page.</p>`));
  }
  if (p === "/v1/newsletter/unsubscribe" && (m === "GET" || m === "POST")) {
    const sig = url.searchParams.get("s");
    if (m === "POST") { const ok = await unsubscribe(query, sig, env); return html(ok ? 200 : 400, page(ok ? "You're unsubscribed." : "That link didn't work.", `<p class="ds-body" style="margin-top:16px">${ok ? "No more weekly emails. You can sign up again anytime." : "Email hello@aethric.llc and we'll remove you."}</p>`)); }
    if (!verifySig(sig, env)) return html(400, page("That link didn't work.", `<p class="ds-body" style="margin-top:16px">Email hello@aethric.llc and we'll remove you.</p>`));
    return html(200, page("Unsubscribe from the weekly email?", `<form method="post" style="margin-top:32px"><button class="ds-btn" type="submit">Unsubscribe</button></form>`));
  }
  return false;
}
