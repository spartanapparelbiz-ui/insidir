/* The analyst layer's shared shapes (lib/analyst): a position's facts, its note, and the version of the rules that
 * wrote it. */

/** Bump when the facts, prompt, validator or template change in a way that should rewrite notes. */
export const NOTE_VERSION = 1;

/** One fact a note may use: what it is, how it reads (the exact text a note may quote), and where it comes from. */
export interface Fact {
  key: string;
  label: string;
  text: string;
  source?: { label: string; href: string } | null;
}

/** Everything a note may say about one position, computed deterministically from Insidir's data. */
export interface Facts {
  moveId: string;
  kind: "bet" | "insider" | "fund";
  /** Names the note may use: the account, the outcome, the league or topic, the company, the insider. */
  names: string[];
  facts: Fact[];
  at: number;
}

export interface Note {
  moveId: string;
  text: string;
  facts: Facts;
  /** The OpenRouter model that wrote it, or "template". */
  model: string;
  version: number;
  costUsd: number;
  /** How it got there: written by the model and passed the validator, or the template after the model failed twice. */
  origin: "model" | "template";
}
