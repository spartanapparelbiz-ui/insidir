/* The owner's free-access list: FREE_ACCESS_EMAILS on the server (comma-separated). An account with one of these emails
 * is a full member with no Whop membership, read on every request, so removing an email ends that access on the next
 * page load (unless the account has a real paid membership too). Emails compare trimmed and case-insensitively. */
const norm = (e: string): string => e.trim().toLowerCase();

export function freeAccessEmails(raw = process.env.FREE_ACCESS_EMAILS ?? ""): Set<string> {
  return new Set(raw.split(/[,\s;]+/).map(norm).filter(e => e.includes("@")));
}

export const isFreeAccess = (email: string | null | undefined, raw?: string): boolean => Boolean(email) && freeAccessEmails(raw).has(norm(email!));
