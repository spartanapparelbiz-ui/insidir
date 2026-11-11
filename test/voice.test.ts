/* The voice (2026-11-11): no customer-facing text says bet, gamble, odds, lock, guaranteed, free money, insane, secret,
 * cheat code or pov, ends a sentence with an exclamation mark, uses an emoji, names the payment provider, or shows a
 * timer, a "trusted by" row or an urgency line. Text = string literals that read as prose and JSX text
 * (test/voice-scan.ts). */
import { describe, expect, it } from "vitest";
import { pieces, voiceViolations } from "./voice-scan";

describe("the voice", () => {
  it("no banned word, exclamation mark or emoji in customer-facing text", () => {
    expect(voiceViolations().map(v => `${v.word} · ${v.file}:${v.line} · ${v.text.slice(0, 80)}`)).toEqual([]);
  });
  it("no payment-provider name, timer, 'trusted by' row or urgency line", () => {
    const bad = pieces().filter(p => /\bwhop\b|trusted by|countdown|spots? left|only \d+ left|hurry|act now|limited time|offer ends/i.test(p.text) && !/^lib\/auth\/callback\.ts$/.test(p.file));
    expect(bad.map(p => `${p.file}:${p.line} · ${p.text.slice(0, 80)}`)).toEqual([]);
  });
  it("the scanner reads real copy (it finds the homepage's headline)", () => {
    expect(pieces().some(p => p.text.includes("We track every Polymarket wallet up $1M+"))).toBe(true);
  });
});
