/* POST /api/watchlists {action, …}: a member's SEC watchlists (docs/INSIDIR-V3.md §3, lib/stocks/watchlists.ts).
 *   create {name} · rename {list, name} · forms {list, forms} · delete {list}
 *   add {list | null, ticker} or {list | null, kind, cik, label}: a null list makes "My watchlist" first. A company added
 *     is read from EDGAR soon after (its filings and financials).
 *   remove {list, kind, cik}
 * GET /api/watchlists?people=<name>: people whose filed name matches, for the add-a-person form.
 * Members only, and only while watchlists are live. */
import { NextResponse, type NextRequest } from "next/server";
import { MEMBERS_ONLY } from "@/lib/copy";
import { memberOrNull } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { isReady } from "@/lib/features";
import { companyByTicker, wantCompanies } from "@/lib/stocks/company";
import { findPeople, personByCik } from "@/lib/stocks/people";
import { addItem, cleanForms, cleanName, createList, deleteList, listsFor, removeItem, updateList } from "@/lib/stocks/watchlists";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const cikOf = (v: unknown): string | null => { const s = String(v ?? ""); return /^\d{1,10}$/.test(s) && Number(s) > 0 ? String(Number(s)) : null; };

async function member() {
  const v = await memberOrNull();
  if (!v?.user) return { res: bad(MEMBERS_ONLY, 401) };
  if (!isReady("watchlists")) return { res: bad("Watchlists are coming soon.", 409) };
  return { userId: v.user.id };
}

export async function GET(req: NextRequest) {
  const m = await member();
  if ("res" in m) return m.res;
  const q = (req.nextUrl.searchParams.get("people") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await findPeople(getDb(), q, 10) });
}

export async function POST(req: NextRequest) {
  const m = await member();
  if ("res" in m) return m.res;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Bad request.");
  const db = getDb(), userId = m.userId;
  const id = Number.isInteger(b.list) ? Number(b.list) : null;
  switch (b.action) {
    case "create": {
      const name = cleanName(b.name);
      if (!name) return bad("Give the watchlist a name.");
      const r = await createList(db, userId, name);
      return "error" in r ? bad(r.error, 409) : NextResponse.json({ ok: true, id: r.id, message: "Watchlist made." });
    }
    case "rename": {
      const name = cleanName(b.name);
      if (!name || id === null) return bad("Bad request.");
      return (await updateList(db, userId, id, { name })) ? NextResponse.json({ ok: true }) : bad("That watchlist isn't yours.", 404);
    }
    case "forms": {
      const forms = cleanForms(b.forms);
      if (!forms || id === null) return bad("Bad request.");
      return (await updateList(db, userId, id, { forms })) ? NextResponse.json({ ok: true, message: "Saved." }) : bad("That watchlist isn't yours.", 404);
    }
    case "delete":
      if (id === null) return bad("Bad request.");
      return (await deleteList(db, userId, id)) ? NextResponse.json({ ok: true }) : bad("That watchlist isn't yours.", 404);
    case "add": {
      let item: { kind: "company" | "person"; cik: string; label: string } | null = null;
      if (typeof b.ticker === "string" && b.ticker.trim()) {
        const t = b.ticker.trim().toUpperCase();
        if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(t)) return bad("That isn't a ticker.");
        const co = await companyByTicker(db, t);
        if (!co) return bad(`No SEC registrant has the ticker ${t}.`, 404);
        item = { kind: "company", cik: co.cik, label: `${co.name} (${t})` };
      } else if (b.kind === "company" || b.kind === "person") {
        const cik = cikOf(b.cik);
        if (!cik) return bad("Bad request.");
        if (b.kind === "person" && !(await personByCik(db, cik))) return bad("No filing names that person.", 404);
        item = { kind: b.kind, cik, label: cleanName(b.label) ?? `CIK ${cik}` };
      }
      if (!item) return bad("Bad request.");
      let list = id;
      if (list === null) {
        const mine = await listsFor(db, userId);
        if (mine[0]) list = mine[0].id;
        else { const r = await createList(db, userId, "My watchlist"); if ("error" in r) return bad(r.error, 409); list = r.id; }
      }
      const r = await addItem(db, userId, list, item);
      if ("error" in r) return bad(r.error, 409);
      if (item.kind === "company") await wantCompanies(db, [item.cik]).catch(() => undefined);
      return NextResponse.json({ ok: true, message: `Added ${item.label}.` });
    }
    case "remove": {
      const cik = cikOf(b.cik);
      if (id === null || !cik || (b.kind !== "company" && b.kind !== "person")) return bad("Bad request.");
      return (await removeItem(db, userId, id, b.kind, cik)) ? NextResponse.json({ ok: true }) : bad("That watchlist isn't yours.", 404);
    }
    default:
      return bad("Bad request.");
  }
}
