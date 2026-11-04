/* The /autopilot form's fields → a rule (cleanSpec clamps every field). */
import { cleanSpec } from "./rules";

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[\n,]+/).map(x => x.trim()).filter(Boolean);

export function specFromForm(f: FormData) {
  const n = (k: string) => (f.get(k) === null || f.get(k) === "" ? undefined : Number(f.get(k)));
  return cleanSpec({
    wallets: { from: f.get("from"), follow: list(f.get("follow")), minSettled: n("minSettled") },
    markets: { categories: f.getAll("categories").map(String), leagues: f.getAll("leagues").map(String), races: list(f.get("races")), exclude: list(f.get("exclude")) },
    triggers: { minBet: n("minBet"), firstEntry: f.get("firstEntry") === "on", consensus: f.get("consensus") === "on" },
    price: { max: n("maxCents") === undefined ? undefined : n("maxCents")! / 100, maxMoveCents: n("maxMoveCents") },
    stake: { perBet: n("perBet"), daily: n("daily"), weekly: n("weekly") },
    quiet: { start: f.get("quietStart") || null, end: f.get("quietEnd") || null },
  });
}

