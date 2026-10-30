/* Reading a bet slip (lib/check): a screenshot from any book (DraftKings, FanDuel, BetMGM, Kalshi, Polymarket,
 * Robinhood, …) sent to a vision model through OpenRouter (OPENROUTER_API_KEY; OPENROUTER_MODEL, default
 * anthropic/claude-sonnet-5.5) for each leg's event, pick, kind of market, line, price and stake, as JSON held to a
 * fixed schema; or a Polymarket / Kalshi link; or a stock ticker. Only what the slip shows is read: nothing is guessed,
 * and the image is never stored. A monthly spend cap (CHECK_MONTHLY_USD, default $50) stops new reads before the bill
 * can run away; each call adds the cost OpenRouter returns with it. Server only. */
import { z } from "zod";
import type { Leg, MarketType } from "./match";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";
export const checkModel = (): string => process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
/** OpenRouter's chat completions (OPENROUTER_BASE_URL only so tests can point it at a stand-in). */
const ENDPOINT = () => `${(process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "")}/chat/completions`;
const TYPES = ["moneyline", "spread", "total", "player_prop", "yes_no", "futures", "stock", "other"] as const satisfies readonly MarketType[];

const LegSchema = z.object({
  sport: z.string().nullable(),
  event: z.string(),
  selection: z.string(),
  market_type: z.enum(TYPES),
  line: z.number().nullable(),
  over_under: z.enum(["over", "under"]).nullable(),
  odds: z.string().nullable(),
  stake: z.number().nullable(),
  date: z.string().nullable(),
});
export const SlipSchema = z.object({
  is_bet_slip: z.boolean(),
  book: z.string().nullable(),
  legs: z.array(LegSchema),
  total_stake: z.number().nullable(),
});
export type Slip = z.infer<typeof SlipSchema>;

const PROMPT = `This is a screenshot a person uploaded to check their bet. Read it exactly as shown.

Return each leg (one for a single bet, several for a parlay or same-game parlay):
- sport: the sport or league if shown or obvious from the teams (e.g. "NFL", "MLB", "Premier League"), else null
- event: the game or question as written (e.g. "Milwaukee Brewers @ Chicago Cubs", "Will the Fed cut rates in December?")
- selection: what was picked, as written (a team, "Over", "Under", a player and stat, "Yes", "No", a candidate)
- market_type: moneyline (who wins), spread (a points / run / puck line or handicap), total (over/under on the game), player_prop, yes_no (a yes/no question, e.g. Kalshi or Polymarket), futures (season-long winners), stock (a stock or ETF position), or other
- line: the number of a spread, total or prop (e.g. -1.5, 8.5, 275.5), else null
- over_under: "over" or "under" for totals and props, else null
- odds: the price exactly as printed for that leg (e.g. "+150", "-110", "2.50", "45¢"), else null
- stake: the amount wagered on that leg if the slip shows a per-leg stake, else null
- date: the game date as YYYY-MM-DD if shown, else null

Also: book (the sportsbook or app name if it is written on the slip, else null), total_stake (the total wagered, else null), and is_bet_slip (false if the image is not a bet slip or position).
Never invent a value that isn't on the slip; use null. Ignore account names, balances and IDs.`;

/** The JSON schema the response is held to (all fields required, nulls allowed). */
export const SLIP_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["is_bet_slip", "book", "legs", "total_stake"],
  properties: {
    is_bet_slip: { type: "boolean" }, book: { type: ["string", "null"] }, total_stake: { type: ["number", "null"] },
    legs: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["sport", "event", "selection", "market_type", "line", "over_under", "odds", "stake", "date"],
      properties: {
        sport: { type: ["string", "null"] }, event: { type: "string" }, selection: { type: "string" }, market_type: { type: "string", enum: [...TYPES] },
        line: { type: ["number", "null"] }, over_under: { type: ["string", "null"], enum: ["over", "under", null] }, odds: { type: ["string", "null"] },
        stake: { type: ["number", "null"] }, date: { type: ["string", "null"] },
      },
    } },
  },
} as const;

export const toLeg = (l: Slip["legs"][number]): Leg => ({ sport: l.sport, event: l.event, selection: l.selection, marketType: l.market_type, line: l.line, overUnder: l.over_under, odds: l.odds, stake: l.stake, date: l.date });

export class CheckError extends Error {
  constructor(public readonly code: "not_configured" | "budget" | "not_a_slip" | "unreadable" | "refused", message: string) { super(message); }
}

export const checkConfigured = (): boolean => Boolean(process.env.OPENROUTER_API_KEY);

/** The cost OpenRouter reports for a call (usage.cost, in dollars). Without one, a ceiling estimate from the tokens at
 *  Claude Sonnet's list price ($3 in / $15 out per million), so the cap still counts it. */
export function callCost(usage: { cost?: number | null; prompt_tokens?: number; completion_tokens?: number } | null | undefined): number {
  if (typeof usage?.cost === "number" && Number.isFinite(usage.cost)) return usage.cost;
  return ((usage?.prompt_tokens ?? 1600) * 3 + (usage?.completion_tokens ?? 1000) * 15) / 1e6;
}

export interface SpendStore { month(): Promise<number>; add(usd: number): Promise<void> }

/** The JSON in a model's text: as is, inside a ```json fence, or the outermost {…}. */
export function jsonIn(text: string): unknown {
  const t = text.trim();
  for (const candidate of [t, /```(?:json)?\s*([\s\S]*?)```/i.exec(t)?.[1], t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)]) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch { /* the next form */ }
  }
  return null;
}

interface Completion { choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> | null; refusal?: string | null }; finish_reason?: string | null }>; usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string; code?: number | string } }

/** Reads a slip image. `f` is for tests (a stand-in that answers like OpenRouter). */
export async function readSlip(image: { data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" }, spend: SpendStore, f: typeof fetch = fetch): Promise<Slip> {
  if (!checkConfigured()) throw new CheckError("not_configured", "Slip reading isn't switched on yet.");
  const cap = Number(process.env.CHECK_MONTHLY_USD ?? 50);
  if ((await spend.month()) >= cap) throw new CheckError("budget", "Slip reading is paused for the rest of the month. Paste a market link or a ticker instead.");
  const call = async (structured: boolean): Promise<{ res: Response; body: Completion }> => {
    const res = await f(ENDPOINT(), {
      method: "POST", signal: AbortSignal.timeout(90_000),
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://insidir.com", "X-Title": "Insidir" },
      body: JSON.stringify({
        model: checkModel(), max_tokens: 4000, temperature: 0, usage: { include: true },
        ...(structured ? { response_format: { type: "json_schema", json_schema: { name: "slip", strict: true, schema: SLIP_JSON_SCHEMA } } } : {}),
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
          { type: "text", text: structured ? PROMPT : `${PROMPT}\n\nAnswer with the JSON object only, matching this JSON schema:\n${JSON.stringify(SLIP_JSON_SCHEMA)}` },
        ] }],
      }),
    });
    return { res, body: (await res.json().catch(() => ({}))) as Completion };
  };
  let { res, body } = await call(true);
  // A model that won't take a JSON schema: asked again for plain JSON, which is parsed and held to the same schema.
  if (!res.ok && res.status === 400 && /response_format|json_schema|structured/i.test(body.error?.message ?? "")) ({ res, body } = await call(false));
  if (body.usage || res.ok) await spend.add(callCost(body.usage));
  if (!res.ok) {
    console.log(`check: OpenRouter ${res.status} ${(body.error?.message ?? "").slice(0, 160)}`);
    throw new CheckError("unreadable", "We couldn't read that slip right now. Try again in a minute, or paste a market link or a ticker.");
  }
  const choice = body.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new CheckError("refused", "This image couldn't be read. Try a clearer screenshot of the slip.");
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : (content ?? []).map(c => c.text ?? "").join("");
  const parsed = SlipSchema.safeParse(jsonIn(text));
  if (!parsed.success) throw new CheckError("unreadable", "We couldn't read that slip. Try a clearer screenshot.");
  if (!parsed.data.is_bet_slip || !parsed.data.legs.length) throw new CheckError("not_a_slip", "That doesn't look like a slip. Upload a screenshot of the slip, or paste a market link or a ticker.");
  return parsed.data;
}

/** What was pasted: a Polymarket or Kalshi link, a stock ticker ("$NVDA", "NVDA"), or nothing we read. */
export function readPasted(text: string): { kind: "polymarket"; slug: string; market: string | null } | { kind: "kalshi"; ticker: string } | { kind: "ticker"; ticker: string } | null {
  const t = text.trim();
  const pm = /polymarket\.com\/(?:[a-z]{2}\/)?event\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?/i.exec(t);
  if (pm) return { kind: "polymarket", slug: pm[1]!.toLowerCase(), market: pm[2]?.toLowerCase() ?? null };
  const ks = /kalshi\.com\/markets\/(?:[^/\s?#]+\/)*([a-z0-9][a-z0-9.\-]+)/i.exec(t);
  if (ks) return { kind: "kalshi", ticker: ks[1]!.toUpperCase() };
  const tk = /^\$?([A-Za-z]{1,5}(?:\.[A-Za-z])?)$/.exec(t);
  if (tk) return { kind: "ticker", ticker: tk[1]!.toUpperCase() };
  return null;
}
