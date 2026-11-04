/* The Book's exports: a CSV of every entry, and a monthly statement PDF (pdf-lib, Helvetica). Pure apart from pdf-lib. */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { summarize, type Entry } from "./book";

const DAY = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" });
const iso = (ms: number) => { const [m, d, y] = DAY.format(new Date(ms)).split("/"); return `${y}-${m}-${d}`; };
const esc = (v: string | number | null) => { const s = v === null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const resultText = (e: Entry) => e.result ?? "open";

/** Every entry as CSV, oldest first. Dates are US Eastern (YYYY-MM-DD); prices in dollars per contract. Pure. */
export function bookCsv(entries: readonly Entry[]): string {
  const head = ["date", "type", "market", "outcome", "side", "venue", "category", "contracts", "fill_price", "cost", "result", "settled", "pnl", "kalshi_now", "live_pnl"];
  const rows = [...entries].sort((a, b) => a.at - b.at).map(e => [iso(e.at), e.kind === "copy" ? "copy" : "autopilot", e.title, e.outcome, e.side, e.venue, e.category,
    e.contracts, e.price.toFixed(2), e.cost.toFixed(2), resultText(e), e.settledAt ? iso(e.settledAt) : "", e.pnl === null ? "" : e.pnl.toFixed(2),
    e.mark === null ? "" : e.mark.toFixed(2), e.live === null ? "" : e.live.toFixed(2)].map(esc).join(","));
  return [head.join(","), ...rows].join("\n") + "\n";
}

/** "2026-11" → [start, end) in ms, US Eastern month (midnight at 05:00 UTC; an hour off in summer, like the dates printed). Pure. */
export function monthRange(month: string): [number, number] | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  return [Date.UTC(y, mo - 1, 1, 5), Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1, 5)];
}

/** The entries a month's statement covers: placed that month, or settled that month. Pure. */
export function inMonth(entries: readonly Entry[], [start, end]: [number, number]): Entry[] {
  return entries.filter(e => (e.at >= start && e.at < end) || (e.settledAt !== null && e.settledAt >= start && e.settledAt < end));
}

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

export async function statementPdf(o: { month: string; email: string | null; entries: readonly Entry[]; generatedAt: number }): Promise<Uint8Array> {
  const range = monthRange(o.month)!;
  const list = inMonth(o.entries, range).sort((a, b) => a.at - b.at);
  const s = summarize(list);
  const doc = await PDFDocument.create();
  doc.setTitle(`Insidir statement ${o.month}`); doc.setProducer("Insidir"); doc.setCreator("Insidir");
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 48;
  let page = doc.addPage([W, H]), y = H - M;
  const text = (t: string, x: number, size = 9, f = font) => page.drawText(t, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  const clip = (t: string, max: number, size: number) => { let c = t; while (c.length > 1 && font.widthOfTextAtSize(c + "...", size) > max) c = c.slice(0, -1); return c === t ? t : c + "..."; };
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(o.month.slice(0, 4)), Number(o.month.slice(5)) - 1, 15)));
  text("Insidir", M, 16, bold); y -= 22;
  text(`Statement - ${monthName}`, M, 12, bold); y -= 16;
  text(`${o.email ?? "Member"} - generated ${iso(o.generatedAt)}`, M, 9); y -= 24;
  text(`${list.length} ${list.length === 1 ? "bet" : "bets"} placed or settled this month: ${s.won} won, ${s.lost} lost${s.void ? `, ${s.void} void` : ""}, ${s.open} open.`, M, 10); y -= 14;
  text(`Settled net at your own prices: ${money(s.net)} on ${money(s.staked)} staked. Open: ${money(s.exposure)} at risk.`, M, 10); y -= 24;
  const cols: Array<[string, number]> = [["Date", M], ["Market", M + 62], ["Side", M + 292], ["Contracts", M + 330], ["Fill", M + 384], ["Cost", M + 418], ["Result", M + 466], ["P&L", M + 508]];
  const header = () => {
    for (const [h, x] of cols) text(h, x, 8, bold);
    y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); y -= 12;
  };
  header();
  for (const e of list) {
    if (y < M + 40) { page = doc.addPage([W, H]); y = H - M; header(); }
    const vals = [iso(e.at), clip(`${e.title} - ${e.outcome}`, 222, 8), e.side === "yes" ? "Yes" : "No", String(Math.round(e.contracts * 100) / 100),
      `${Math.round(e.price * 100)}c`, money(e.cost), resultText(e), e.pnl === null ? "" : money(e.pnl)];
    vals.forEach((v, i) => text(v, cols[i]![1], 8));
    y -= 13;
  }
  if (!list.length) { text("Nothing placed or settled this month.", M, 9); y -= 13; }
  const grey = rgb(0.4, 0.4, 0.4);
  page.drawText("Information, not advice. Insidir doesn't place trades or hold funds. Logged by you; settled at your own fill prices, losses included; fees not included.", { x: M, y: M + 10, size: 7, font, color: grey });
  page.drawText("Insidir is operated by Aethric LLC - Pompano Beach, FL - hello@aethric.llc - 18+ only.", { x: M, y: M, size: 7, font, color: grey });
  return doc.save();
}
