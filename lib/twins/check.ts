/* The twin test: a Polymarket market and a Kalshi market are twins only when ALL of these match:
 *   event     the same game, Fed meeting or race
 *   outcome   the same thing pays (the same team, side, party or Fed move)
 *   line      the same line or strike, exactly (−4.5 is not −5.5; 230.5 is not 232.5)
 *   rules     the same resolution source
 *   close     the same close date (within 36 hours: venues close a game or a meeting hours apart)
 * A different event, outcome or line is not a twin (rejected). Everything else that is not an exact match (a different
 * source, a far close date, equivalent-but-differently-worded outcomes) goes to a person (review). Exact matches are
 * candidates. Nothing is shown to anyone until a person approves it in /admin/twins. Pure. */
import type { VMarket } from "@/lib/types";
import { parseContract, type Contract } from "./contract";

export type TwinVerdict = "candidate" | "review" | "rejected";
export interface TwinChecks { event: boolean; outcome: boolean; line: boolean; rules: boolean; close: boolean }
export interface TwinResult { verdict: TwinVerdict; confidence: number; checks: TwinChecks; notes: string[]; kind: Contract["kind"] }

const CLOSE_MS = 36 * 3_600_000;
const domain = (s: string | null | undefined) => (/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i.exec(s ?? "")?.[1] ?? "").toLowerCase();

function sameOutcome(a: Contract, b: Contract): { ok: boolean; exact: boolean } {
  if (a.kind !== b.kind) return { ok: false, exact: false };
  switch (a.kind) {
    case "winner": { const x = b as typeof a; return { ok: a.team === x.team && a.period === x.period, exact: true }; }
    case "spread": { const x = b as typeof a; return { ok: a.team === x.team && a.period === x.period, exact: true }; }
    case "total": { const x = b as typeof a; return { ok: a.side === x.side && a.period === x.period && a.team === x.team, exact: true }; }
    case "party": { const x = b as typeof a; return { ok: a.party === x.party && a.state === x.state && a.office === x.office, exact: true }; }
    case "fed": { const x = b as typeof a; return { ok: a.move === x.move && a.plus === x.plus, exact: !a.approx && !x.approx }; }
    default: return { ok: false, exact: false };
  }
}

function sameLine(a: Contract, b: Contract): boolean {
  if (a.kind === "spread" || a.kind === "total") return a.line === (b as typeof a).line;
  if (a.kind === "fed") return a.bps === (b as typeof a).bps;
  return true;
}

export function twinCheck(poly: VMarket, kalshi: VMarket): TwinResult {
  const p = parseContract(poly), k = parseContract(kalshi);
  const notes: string[] = [];
  const kind = p.contract.kind;
  const event = p.event !== null && p.event === k.event;
  if (!event) notes.push(`Different event: ${p.event ?? "unreadable"} vs ${k.event ?? "unreadable"}`);
  const o = sameOutcome(p.contract, k.contract);
  if (!o.ok) notes.push("Different outcome");
  else if (!o.exact) notes.push("Same outcome in practice, worded differently (e.g. “>25bps” vs “50+ bps”): confirm");
  const line = o.ok && sameLine(p.contract, k.contract);
  if (o.ok && !line) notes.push("Different line or strike");
  const ds = [domain(poly.resolutionSource), domain(kalshi.resolutionSource)];
  // Games settle on the official league result on both venues, which neither states as a link.
  const sports = kind === "winner" || kind === "spread" || kind === "total";
  const rules = sports ? true : Boolean(ds[0] && ds[1] && (ds[0] === ds[1] || ds[0].endsWith(ds[1]) || ds[1].endsWith(ds[0])));
  if (!rules) notes.push(`Resolution source differs or is missing: ${ds[0] || "none stated"} vs ${ds[1] || "none stated"}`);
  const close = poly.closeTime !== null && kalshi.closeTime !== null && Math.abs(poly.closeTime - kalshi.closeTime) <= CLOSE_MS;
  if (!close) notes.push("Close dates differ by more than 36 hours");
  const checks: TwinChecks = { event, outcome: o.ok, line, rules, close };
  if (!event || !o.ok || !line || kind === "other") return { verdict: "rejected", confidence: 0, checks, notes, kind };
  const soft = [!rules, !close, !o.exact].filter(Boolean).length;
  return soft ? { verdict: "review", confidence: Math.max(0.3, 0.85 - 0.2 * soft), checks, notes, kind } : { verdict: "candidate", confidence: 0.99, checks, notes, kind };
}

/** For each Polymarket market, its Kalshi twin among `kalshi`, if any (the best non-rejected match). */
export function findTwins(poly: readonly VMarket[], kalshi: readonly VMarket[]): Array<{ poly: VMarket; kalshi: VMarket; result: TwinResult }> {
  const parsedK = kalshi.map(m => ({ m, p: parseContract(m) })).filter(x => x.p.event);
  const byEvent = new Map<string, typeof parsedK>();
  for (const x of parsedK) { const l = byEvent.get(x.p.event!) ?? []; l.push(x); byEvent.set(x.p.event!, l); }
  const out: Array<{ poly: VMarket; kalshi: VMarket; result: TwinResult }> = [];
  for (const pm of poly) {
    const pp = parseContract(pm);
    if (!pp.event) continue;
    let best: { kalshi: VMarket; result: TwinResult } | null = null;
    for (const x of byEvent.get(pp.event) ?? []) {
      const r = twinCheck(pm, x.m);
      if (r.verdict === "rejected") continue;
      if (!best || r.confidence > best.result.confidence) best = { kalshi: x.m, result: r };
    }
    if (best) out.push({ poly: pm, ...best });
  }
  return out;
}
