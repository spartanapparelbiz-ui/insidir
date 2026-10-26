/* A mocked OpenRouter chat-completions endpoint for the matching tests. */
import { vi } from "vitest";

/** A fetch mock returning an OpenRouter-shaped completion with `content`. */
export function openRouterFetch(content: string | ((body: unknown) => string), opts: { status?: number; cost?: number | null } = {}) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body: unknown = JSON.parse(String(init?.body ?? "{}"));
    const text = typeof content === "function" ? content(body) : content;
    const usage: Record<string, number> = { prompt_tokens: 900, completion_tokens: 60, total_tokens: 960 };
    if (opts.cost !== null) usage.cost = opts.cost ?? 0.0002;
    return new Response(JSON.stringify({ id: "gen-1", model: "openai/gpt-4o-mini", choices: [{ message: { role: "assistant", content: text } }], usage }), {
      status: opts.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}
/** The model's JSON answer. */
export const answer = (same: boolean, inverted = false, confidence = 0.92, differences: string[] = []) =>
  JSON.stringify({ same_event: same, inverted, differences, confidence });
