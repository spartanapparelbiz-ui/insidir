/* One OpenRouter chat call for the analyst layer (notes and Research): the model from OPENROUTER_MODEL, temperature 0,
 * a timeout, optional tools, and the cost OpenRouter returns (usage.include). `f` is injected for tests. */
import { callCost } from "@/lib/check/extract";
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
export interface ChatResult { ok: boolean; text: string; toolCalls: ToolCall[]; costUsd: number; model: string; error?: string }

export async function chat(messages: ChatMessage[], o: { maxTokens?: number; tools?: ToolDef[]; f?: typeof fetch; timeoutMs?: number } = {}): Promise<ChatResult> {
  const model = analystModel();
  if (!analystConfigured()) return { ok: false, text: "", toolCalls: [], costUsd: 0, model, error: "no_key" };
  try {
    const res = await (o.f ?? fetch)(ENDPOINT(), {
      method: "POST", signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://insidir.com", "X-Title": "Insidir" },
      body: JSON.stringify({ model, temperature: 0, max_tokens: o.maxTokens ?? 300, usage: { include: true }, messages, ...(o.tools?.length ? { tools: o.tools, tool_choice: "auto" } : {}) }),
    });
    const body = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>; usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string }; model?: string };
    const costUsd = body.usage ? callCost(body.usage) : 0;
    if (!res.ok) return { ok: false, text: "", toolCalls: [], costUsd, model, error: `http ${res.status} ${(body.error?.message ?? "").slice(0, 120)}` };
    const msg = body.choices?.[0]?.message;
    return { ok: true, text: (msg?.content ?? "").trim(), toolCalls: msg?.tool_calls ?? [], costUsd, model: body.model ?? model };
  } catch (e) {
    return { ok: false, text: "", toolCalls: [], costUsd: 0, model, error: e instanceof Error ? e.name : "network" };
  }
}
