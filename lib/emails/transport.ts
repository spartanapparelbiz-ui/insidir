/* Sending one email (server only), through Resend's HTTP API: RESEND_API_KEY, from EMAIL_FROM (default
 * "Insidir <alerts@insidir.com>", a sender on a domain verified in Resend). Without a key nothing is sent and the
 * caller is told so (it logs it; /status shows the failure either way). Plain text only. */
export interface Email { to: string; subject: string; text: string }
export type SendOutcome = "sent" | "not_configured" | "failed";

export async function sendEmail(e: Email, f: typeof fetch = fetch): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "not_configured";
  const res = await f("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Insidir <alerts@insidir.com>", to: [e.to], subject: e.subject.slice(0, 200), text: e.text }),
  }).catch(() => null);
  return res?.ok ? "sent" : "failed";
}
