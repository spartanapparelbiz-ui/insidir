/* /admin/posts (docs/INSIDIR-V2.md §7): who may open it, and the ready-to-copy caption for each move. Pure. */
import { moveSentence, payoutLine, recordLine, stockNote } from "./copy";
import type { Move, TraderRecord } from "./types";

/** POSTS_ADMIN_EMAILS: a comma list of the emails (the Whop account email) allowed to open /admin/posts. */
export function postsAllowed(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const list = (env.POSTS_ADMIN_EMAILS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return Boolean(email) && list.includes(email!.trim().toLowerCase());
}

/** "A top trader put $412,000 on Chiefs to win. Pays $161 on every $100 if Chiefs win. Won 41 of 63 · +$1.2M all-time." + sign-off. */
export function postCaption(m: Move, record: TraderRecord | null): string {
  const rec = recordLine(record);
  const result = m.result === "won" ? "It won." : m.result === "lost" ? "It lost." : null;
  return [
    [moveSentence(m, record, false), payoutLine(m), m.detail ? stockNote(m.detail) : null, rec ? `${rec}.` : null, result].filter(Boolean).join(" "),
    ...(m.detail ? ["", `The filing: ${m.url}`] : []),
    "",
    "See the big money as it moves: insidir.com",
    "Public trading data. Not financial advice.",
  ].join("\n");
}
