import { describe, expect, it, vi } from "vitest";
import { createMemoryUsageStore } from "@/lib/matching/cache";
import { DEFAULT_MODEL, OPENROUTER_URL, buildMessages, createOpenRouterConfirm, llmEnv, monthKey, parseAnswer } from "@/lib/matching/llm";
import { T0, kFedCut25, mk, pFedCut25 } from "./fixtures/matching/markets";
import { answer, openRouterFetch } from "./fixtures/matching/openrouter";


describe("parseAnswer", () => {
  it("accepts strict JSON, fenced JSON and JSON with surrounding text", () => {
    expect(parseAnswer(answer(true))).toEqual({ sameEvent: true, inverted: false, differences: [], confidence: 0.92 });
    expect(parseAnswer("```json\n" + answer(false, true, 0.7, ["x"]) + "\n```")).toMatchObject({ sameEvent: false, inverted: true, differences: ["x"] });
    expect(parseAnswer(`Sure: ${answer(true)}`)?.sameEvent).toBe(true);
  });
  it("rejects anything incomplete or ill-typed", () => {
    expect(parseAnswer("not json")).toBeNull();
    expect(parseAnswer('{"same_event": "yes", "inverted": false, "differences": [], "confidence": 0.9}')).toBeNull();
    expect(parseAnswer('{"same_event": true, "inverted": false, "differences": [], "confidence": 1.5}')).toBeNull();
    expect(parseAnswer('{"same_event": true, "inverted": false, "confidence": 0.9}')).toBeNull();
    expect(parseAnswer('{"same_event": true, "inverted": false, "differences": [1], "confidence": 0.9}')).toBeNull();
    expect(parseAnswer(null)).toBeNull();
  });
});

describe("prompt", () => {
  it("asks only whether the contracts pay out on the same outcome, with both sides' facts", () => {
    const long = mk("kalshi", "k", { title: "T", rules: "x".repeat(5000) });
    const [sys, user] = buildMessages(long, pFedCut25);
    expect(sys?.content).toContain("do these two contracts pay out on the same real-world outcome");
    expect(sys?.content).toContain("Do not predict");
    expect(user?.content).toContain("Contract A (Kalshi)");
    expect(user?.content).toContain("Contract B (Polymarket)");
    expect(user?.content).toContain(`YES label: ${pFedCut25.yesLabel}`);
    expect(user?.content).toContain(new Date(pFedCut25.closeTime!).toISOString());
    // Rules truncated.
    expect(user!.content.length).toBeLessThan(4000);
  });
});

describe("createOpenRouterConfirm", () => {
  const usage = () => createMemoryUsageStore();
  it("sends a strict, cheap request and returns the verdict", async () => {
    const fetch = openRouterFetch(answer(true, false, 0.95, ["Polymarket cites the FOMC statement"]));
    const store = usage();
    const confirm = createOpenRouterConfirm({ apiKey: "k", usage: store, fetch, now: () => T0 });
    const v = await confirm(kFedCut25, pFedCut25);
    expect(v).toMatchObject({ status: "ok", sameEvent: true, inverted: false, confidence: 0.95, differences: ["Polymarket cites the FOMC statement"] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(OPENROUTER_URL);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: DEFAULT_MODEL, temperature: 0, max_tokens: 300 });
    expect((body.response_format as { type: string }).type).toBe("json_schema");
    expect(store.spend.get(monthKey(T0))).toBeCloseTo(0.0002);
  });
  it("records token-priced cost when OpenRouter does not report one", async () => {
    const store = usage();
    const confirm = createOpenRouterConfirm({ apiKey: "k", usage: store, fetch: openRouterFetch(answer(false), { cost: null }), now: () => T0 });
    expect((await confirm(kFedCut25, pFedCut25)).status).toBe("ok");
    expect(store.spend.get(monthKey(T0))).toBeCloseTo((900 * 0.15 + 60 * 0.6) / 1e6, 9);
  });
  it("malformed JSON → unsure (never an accept)", async () => {
    const confirm = createOpenRouterConfirm({ apiKey: "k", usage: usage(), fetch: openRouterFetch("{same_event: maybe"), now: () => T0 });
    expect(await confirm(kFedCut25, pFedCut25)).toMatchObject({ status: "unsure", reason: "malformed" });
  });
  it("HTTP errors and network errors → unsure", async () => {
    const http = createOpenRouterConfirm({ apiKey: "k", usage: usage(), fetch: openRouterFetch("{}", { status: 500, cost: null }), now: () => T0 });
    expect(await http(kFedCut25, pFedCut25)).toMatchObject({ status: "unsure", reason: "http" });
    const net = createOpenRouterConfirm({ apiKey: "k", usage: usage(), fetch: vi.fn(async () => { throw new TypeError("fetch failed"); }), now: () => T0 });
    expect(await net(kFedCut25, pFedCut25)).toMatchObject({ status: "unsure", reason: "network" });
  });
  it("times out → unsure", async () => {
    const hang = vi.fn((_u: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))),
    );
    const confirm = createOpenRouterConfirm({ apiKey: "k", usage: usage(), fetch: hang, now: () => T0, timeoutMs: 20 });
    expect(await confirm(kFedCut25, pFedCut25)).toMatchObject({ status: "unsure", reason: "timeout" });
  });
  it("budget exceeded → no call at all", async () => {
    const fetch = openRouterFetch(answer(true));
    const store = createMemoryUsageStore({ [monthKey(T0)]: 9.99995 });
    const confirm = createOpenRouterConfirm({ apiKey: "k", usage: store, fetch, now: () => T0, monthlyCapUsd: 10 });
    expect(await confirm(kFedCut25, pFedCut25)).toMatchObject({ status: "unsure", reason: "budget" });
    expect(fetch).not.toHaveBeenCalled();
    // Next month starts fresh.
    const next = createOpenRouterConfirm({ apiKey: "k", usage: store, fetch, now: () => Date.UTC(2026, 10, 1), monthlyCapUsd: 10 });
    expect((await next(kFedCut25, pFedCut25)).status).toBe("ok");
  });
  it("no API key → unsure without a call", async () => {
    const fetch = openRouterFetch(answer(true));
    const confirm = createOpenRouterConfirm({ apiKey: "", usage: usage(), fetch, now: () => T0 });
    expect(await confirm(kFedCut25, pFedCut25)).toMatchObject({ status: "unsure", reason: "no_key" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads env", () => {
    expect(llmEnv({})).toEqual({ apiKey: null, model: DEFAULT_MODEL, monthlyCapUsd: 3 });
    expect(llmEnv({ OPENROUTER_API_KEY: " sk ", OPENROUTER_MODEL: "google/gemini-2.0-flash-lite-001", MATCH_LLM_MONTHLY_USD: "5" })).toEqual({ apiKey: "sk", model: "google/gemini-2.0-flash-lite-001", monthlyCapUsd: 5 });
    expect(llmEnv({ MATCH_LLM_MONTHLY_USD: "-1" }).monthlyCapUsd).toBe(3);
  });
});
