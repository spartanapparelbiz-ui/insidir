/* LLM confirmation for candidates the deterministic matcher is unsure about, via OpenRouter's chat completions
 * API. The model is asked one thing only: do these two contracts pay out on the same real-world outcome. It is
 * never asked to predict anything. Strict JSON out, temperature 0, small max_tokens, a timeout, and a monthly
 * spend cap enforced through an injected usage store. Any failure (network, timeout, HTTP error, malformed or
 * incomplete JSON, budget) returns "unsure", which never accepts a pair. `fetch` and the clock are injected. */
import type { VMarket } from "@/lib/types";
import { VENUE_NAME } from "@/lib/types";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Default model: small and cheap, supports JSON-schema structured output. Override with OPENROUTER_MODEL. */
export const DEFAULT_MODEL = "openai/gpt-4o-mini";
/** Default monthly cap in USD (env MATCH_LLM_MONTHLY_USD). */
export const DEFAULT_MONTHLY_USD = 3;
/** Request timeout. */
const DEFAULT_TIMEOUT_MS = 20_000;
/** The answer is a tiny JSON object. */
const MAX_TOKENS = 300;
/** Rules texts are cut to this many characters each. */
const RULES_MAX_CHARS = 1500;
/** Titles / labels are cut to this many characters. */
const FIELD_MAX_CHARS = 300;
/** At most this many differences are kept from the answer. */
const MAX_DIFFERENCES = 6;
/** Fallback prices (USD per million tokens) when the response carries no cost: gpt-4o-mini list prices. */
const DEFAULT_PRICE_IN_PER_M = 0.15;
const DEFAULT_PRICE_OUT_PER_M = 0.6;
/** Rough characters per token for the pre-call budget estimate (deliberately low, so the estimate is high). */
const CHARS_PER_TOKEN = 3;

export interface LlmUsageStore {
  /** Dollars spent so far in the month ("2026-10"). */
  getMonthSpendUsd(month: string): Promise<number>;
  addSpendUsd(month: string, usd: number): Promise<void>;
}

export type LlmVerdict =
  | { status: "ok"; sameEvent: boolean; inverted: boolean; differences: string[]; confidence: number; costUsd: number; model: string }
  | { status: "unsure"; reason: "budget" | "no_key" | "http" | "timeout" | "network" | "malformed"; detail: string; costUsd: number };

/** Asks whether two markets pay out on the same outcome. */
export type LlmConfirm = (a: VMarket, b: VMarket) => Promise<LlmVerdict>;

export interface OpenRouterOptions {
  apiKey: string | null | undefined;
  model?: string;
  usage: LlmUsageStore;
  monthlyCapUsd?: number;
  timeoutMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Injected clock (epoch ms), for the month key. */
  now: () => number;
  /** USD per million tokens, used when OpenRouter does not report the cost. */
  priceInPerM?: number;
  priceOutPerM?: number;
  /** Sent as HTTP-Referer / X-Title (OpenRouter's app attribution). */
  appUrl?: string;
  appName?: string;
}

/** Reads OPENROUTER_API_KEY, OPENROUTER_MODEL and MATCH_LLM_MONTHLY_USD. */
export function llmEnv(env: Readonly<Record<string, string | undefined>>): { apiKey: string | null; model: string; monthlyCapUsd: number } {
  const cap = Number(env.MATCH_LLM_MONTHLY_USD);
  return {
    apiKey: env.OPENROUTER_API_KEY?.trim() || null,
    model: env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    monthlyCapUsd: env.MATCH_LLM_MONTHLY_USD !== undefined && env.MATCH_LLM_MONTHLY_USD.trim() !== "" && Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_MONTHLY_USD,
  };
}

export function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const cut = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const iso = (t: number | null) => (t === null ? "unknown" : new Date(t).toISOString());

export const SYSTEM_PROMPT = [
  "You compare two prediction-market contracts from different exchanges.",
  "Answer one question only: do these two contracts pay out on the same real-world outcome?",
  "Do not predict, estimate probabilities, or comment on which outcome is likely.",
  "Contract A's YES side pays if its stated outcome happens. Set same_event=true only if, in every realistic",
  "scenario, YES on A and one side of B settle the same way. Set inverted=true if YES on A corresponds to NO",
  "on B (for example A is 'Team X wins' and B's YES is 'Team Y wins' in the same game).",
  "Different dates, games, thresholds, numbers, people, measurement times or conditions mean same_event=false.",
  "List material differences in the resolution rules in plain English (resolution source, cutoff time,",
  "overtime, postponement, ties); use an empty list if there are none.",
  "confidence is your confidence in same_event, from 0 to 1.",
  'Reply with JSON only: {"same_event": boolean, "inverted": boolean, "differences": string[], "confidence": number}.',
].join(" ");

function describeMarket(label: string, m: VMarket): string {
  return [
    `${label} (${VENUE_NAME[m.venue]})`,
    `Title: ${cut(m.title, FIELD_MAX_CHARS)}`,
    m.eventTitle && m.eventTitle !== m.title ? `Event: ${cut(m.eventTitle, FIELD_MAX_CHARS)}` : null,
    `YES label: ${cut(m.yesLabel, FIELD_MAX_CHARS)}`,
    `NO label: ${cut(m.noLabel, FIELD_MAX_CHARS)}`,
    `Closes: ${iso(m.closeTime)}`,
    m.resolutionSource ? `Resolution source: ${cut(m.resolutionSource, FIELD_MAX_CHARS)}` : null,
    `Rules: ${cut(m.rules, RULES_MAX_CHARS) || "(none published)"}`,
  ]
    .filter((x): x is string => x !== null)
    .join("\n");
}

export function buildMessages(a: VMarket, b: VMarket): { role: "system" | "user"; content: string }[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${describeMarket("Contract A", a)}\n\n${describeMarket("Contract B", b)}\n\nDo these two contracts pay out on the same real-world outcome?` },
  ];
}

const RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "market_match",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["same_event", "inverted", "differences", "confidence"],
      properties: {
        same_event: { type: "boolean" },
        inverted: { type: "boolean" },
        differences: { type: "array", items: { type: "string" } },
        confidence: { type: "number" },
      },
    },
  },
} as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parses the model's answer. Null unless every field is present and well-typed. */
export function parseAnswer(content: unknown): { sameEvent: boolean; inverted: boolean; differences: string[]; confidence: number } | null {
  if (typeof content !== "string") return null;
  let text = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) text = fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(first, last + 1));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { same_event, inverted, differences, confidence } = parsed;
  if (typeof same_event !== "boolean" || typeof inverted !== "boolean") return null;
  if (!Array.isArray(differences) || !differences.every(d => typeof d === "string")) return null;
  const conf = typeof confidence === "number" ? confidence : typeof confidence === "string" ? Number(confidence) : NaN;
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) return null;
  return {
    sameEvent: same_event,
    inverted,
    differences: (differences as string[]).map(d => d.trim()).filter(Boolean).slice(0, MAX_DIFFERENCES),
    confidence: conf,
  };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** OpenRouter's confirmation function. Spend is reserved before each call (an upper-bound estimate) so
 *  concurrent calls cannot overshoot the cap, then the actual cost is recorded. */
export function createOpenRouterConfirm(opts: OpenRouterOptions): LlmConfirm {
  const model = opts.model || DEFAULT_MODEL;
  const cap = opts.monthlyCapUsd ?? DEFAULT_MONTHLY_USD;
  const doFetch = opts.fetch ?? globalThis.fetch;
  const priceIn = opts.priceInPerM ?? DEFAULT_PRICE_IN_PER_M;
  const priceOut = opts.priceOutPerM ?? DEFAULT_PRICE_OUT_PER_M;
  let reserved = 0;

  return async (a, b) => {
    if (!opts.apiKey) return { status: "unsure", reason: "no_key", detail: "OPENROUTER_API_KEY is not set", costUsd: 0 };
    const messages = buildMessages(a, b);
    const chars = messages.reduce((n, m) => n + m.content.length, 0);
    const estimate = (chars / CHARS_PER_TOKEN) * (priceIn / 1e6) + MAX_TOKENS * (priceOut / 1e6);
    const month = monthKey(opts.now());
    let spent: number;
    try {
      spent = await opts.usage.getMonthSpendUsd(month);
    } catch (err) {
      return { status: "unsure", reason: "budget", detail: `usage store failed: ${String(err)}`, costUsd: 0 };
    }
    if (spent + reserved + estimate > cap) {
      return { status: "unsure", reason: "budget", detail: `monthly cap $${cap} reached ($${spent.toFixed(4)} spent)`, costUsd: 0 };
    }
    reserved += estimate;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let cost = 0;
    try {
      let res: Response;
      try {
        res = await doFetch(OPENROUTER_URL, {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
            ...(opts.appUrl ? { "HTTP-Referer": opts.appUrl } : {}),
            ...(opts.appName ? { "X-Title": opts.appName } : {}),
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0,
            max_tokens: MAX_TOKENS,
            response_format: RESPONSE_SCHEMA,
            provider: { require_parameters: true },
            usage: { include: true },
          }),
        });
      } catch (err) {
        const aborted = ctrl.signal.aborted || (err instanceof Error && err.name === "AbortError");
        return { status: "unsure", reason: aborted ? "timeout" : "network", detail: String(err), costUsd: 0 };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      // Cost: OpenRouter's reported cost, else tokens × list price, else the estimate (only for a 2xx answer).
      const usage = isRecord(body) && isRecord(body.usage) ? body.usage : null;
      const reportedCost = usage ? num(usage.cost) : null;
      const pt = usage ? num(usage.prompt_tokens) : null;
      const ctoks = usage ? num(usage.completion_tokens) : null;
      cost = reportedCost ?? (pt !== null && ctoks !== null ? pt * (priceIn / 1e6) + ctoks * (priceOut / 1e6) : res.ok ? estimate : 0);
      if (!res.ok) return { status: "unsure", reason: "http", detail: `HTTP ${res.status}`, costUsd: cost };
      const choices = isRecord(body) && Array.isArray(body.choices) ? body.choices : [];
      const first: unknown = choices[0];
      const message = isRecord(first) && isRecord(first.message) ? first.message : null;
      const answer = parseAnswer(message?.content);
      if (!answer) return { status: "unsure", reason: "malformed", detail: "the answer was not the expected JSON", costUsd: cost };
      const servedModel = isRecord(body) && typeof body.model === "string" ? body.model : model;
      return { status: "ok", ...answer, costUsd: cost, model: servedModel };
    } finally {
      clearTimeout(timer);
      if (cost > 0) {
        try {
          await opts.usage.addSpendUsd(month, cost);
        } catch {
          // A failed write must not turn a verdict into an exception; the next read may undercount slightly.
        }
      }
      reserved -= estimate;
    }
  };
}
