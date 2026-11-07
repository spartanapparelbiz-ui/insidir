/* Old /check/<id> and /read/<id> links (the bet checker, now gone): each goes to its market's page when the saved check
 * names one, else to the board. Always a 301. */
import { marketPath } from "@/lib/entities/slug";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { getDb, hasDatabase } from "@/lib/db";

const ID = /^[A-Za-z0-9_-]{4,40}$/;

/** The market a saved Read (terminal.reads) or bet check (terminal.bet_checks) was about: Polymarket first. */
async function oldMarket(kind: "read" | "check", id: string): Promise<string | null> {
  if (!ID.test(id) || !hasDatabase()) return null;
  const db = getDb();
  const r = kind === "read"
    ? await db.execute(sql`select coalesce(data->'polymarket'->>'id', data->'kalshi'->>'id') as m from terminal.reads where id = ${id} limit 1`)
    : await db.execute(sql`select legs->0->'market'->>'marketId' as m from terminal.bet_checks where id = ${id} limit 1`);
  return ((r.rows[0] as { m: string | null } | undefined)?.m ?? null) || null;
}

export async function oldLinkRedirect(kind: "read" | "check", id: string): Promise<NextResponse> {
  const m = await oldMarket(kind, id).catch(() => null);
  return NextResponse.redirect(new URL(m ? marketPath(m, "") : "/board", appUrl()), 301);
}
