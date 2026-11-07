/* One OpenRouter chat call for the analyst layer (notes, the Read's line, Research): the model from OPENROUTER_MODEL,
 * temperature 0, a timeout, optional tools, and the cost OpenRouter returns (usage: { include: true } → usage.cost).
 * Reasoning models (openai/gpt-6-luna) spend completion tokens thinking before they answer, so a tight max_tokens came
 * back empty. Each call asks for low-effort reasoning with the reasoning left out of the reply, and gets
 * REASONING_HEADROOM tokens on top of the answer's own budget. A reply with no text (and no tool calls) is asked again
 * once; if it is still empty the result says so (`empty`), so callers count it instead of validating "". `f` is
 * injected for tests. */
import { DEFAULT_MODEL } from "@/lib/matching/llm";

export const analystModel = (): string => process.env.OPENROUTER_ANALYST_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
export const analystConfigured = (): boolean => Boolean(process.env.OPENROUTER_API_KEY);
const ENDPOINT = () => `${(process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "")}/chat/completions`;

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface ToolDef { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }
interface ChatResult {
  ok: boolean; text: string; toolCalls: ToolCall[]; costUsd: number; model: string; error?: string;
  /** Replies that came back with no text and no tool calls (0, 1 or 2: one retry). */
  empties: number;
  /** Still empty after the retry. */
  empty: boolean;
}

/** Tokens for the model's (excluded) reasoning, on top of the caller's budget for the answer. */
export const REASONING_HEADROOM = 1024;
const REASONING = { effort: "low", exclude: true } as const;

type Usage = { cost?: number | string | null; prompt_tokens?: number; completion_tokens?: number };
/** OpenRouter's own cost (usage.cost, dollars; a number, sometimes sent as a string); else estimated from tokens. */
export function usageCost(u: Usage | null | undefined): number {
  const c = typeof u?.cost === "string" ? Number(u.cost) : u?.cost;
  return typeof c === "number" && Number.isFinite(c) ? c : callCost(u ? { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens } : null);
}

export async function chat(messages: ChatMessage[], o: { maxTokens?: number; tools?: ToolDef[]; f?: typeof fetch; timeoutMs?: number } = {}): Promise<ChatResult> {
  const model = analystModel();
  if (!analystConfigured()) return { ok: false, text: "", toolCalls: [], costUsd: 0, model, error: "no_key", empties: 0, empty: false };
  let costUsd = 0, empties = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await once(messages, model, o);
    costUsd += r.costUsd;
    if (!r.ok) return { ...r, costUsd, empties, empty: false };
    if (r.text || r.toolCalls.length) return { ...r, costUsd, empties, empty: false };
    empties++;
  }
  return { ok: true, text: "", toolCalls: [], costUsd, model, empties, empty: true };
}

async function once(messages: ChatMessage[], model: string, o: { maxTokens?: number; tools?: ToolDef[]; f?: typeof fetch; timeoutMs?: number }): Promise<Omit<ChatResult, "empties" | "empty">> {
  try {
    const res = await (o.f ?? fetch)(ENDPOINT(), {
      method: "POST", signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://insidir.com", "X-Title": "Insidir" },
      body: JSON.stringify({ model, temperature: 0, max_tokens: (o.maxTokens ?? 300) + REASONING_HEADROOM, reasoning: REASONING, usage: { include: true }, messages,
        ...(o.tools?.length ? { tools: o.tools, tool_choice: "auto" } : {}) }),
    });
    const body = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>; usage?: Usage; error?: { message?: string }; model?: string };
    const costUsd = body.usage ? usageCost(body.usage) : 0;
    if (!res.ok) return { ok: false, text: "", toolCalls: [], costUsd, model, error: `http ${res.status} ${(body.error?.message ?? "").slice(0, 120)}` };
    const msg = body.choices?.[0]?.message;
    return { ok: true, text: (msg?.content ?? "").trim(), toolCalls: msg?.tool_calls ?? [], costUsd, model: body.model ?? model };
  } catch (e) {
    return { ok: false, text: "", toolCalls: [], costUsd: 0, model, error: e instanceof Error ? e.name : "network" };
  }
}

/** What one model call cost, in dollars: the provider's own figure, else from the tokens at $3 / $15 per million. */
function callCost(usage: { cost?: number | null; prompt_tokens?: number; completion_tokens?: number } | null | undefined): number {
  if (typeof usage?.cost === "number" && Number.isFinite(usage.cost)) return usage.cost;
  return ((usage?.prompt_tokens ?? 1600) * 3 + (usage?.completion_tokens ?? 1000) * 15) / 1e6;
}
