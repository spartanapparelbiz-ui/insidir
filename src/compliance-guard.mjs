/* Text checks for anything Insidir publishes or would generate: marketing copy, public pages, and any
 * future AI-written explanation. Insidir has no AI features today (see src/capabilities.mjs,
 * aiGeneratedContent: "none"); these checks are the gate any future generated text must pass, and the
 * marketing check already runs over every page the site serves (test/compliance.test.mjs).
 *
 *   personalizedAdviceRequest(text)   a user asking what THEY should buy, sell, hold or allocate
 *   promptInjection(text)             an attempt to override instructions or policy
 *   directiveFindings(text)           generated text telling the reader to buy, sell, hold, short or allocate
 *   guaranteeFindings(text)           promises of returns, safety or regulatory approval (negations allowed)
 *   unsupportedFigures(text, sources) numbers in a text that appear in none of its source documents
 *   reviewGeneratedText({text, sources, retrievedAt}) all of the above for one answer; blocks or passes it
 *
 * Patterns are deliberately conservative: a false block costs a rephrase, a false pass could be advice. */

const norm = text => String(text ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

const ADVICE_REQUEST = [
  /\bshould (i|we)\s+(buy|sell|hold|short|invest|put|keep|dump|trim|add|get (in|out))\b/i,
  /\b(what|which)\s+(stocks?|shares?|etfs?|options?|tickers?|companies)\s+should (i|we)\b/i,
  /\bhow much (money |of my \w+ )?should (i|we)\s+(put|invest|allocate|buy|bet)\b/i,
  /\b(is|are)\s+\$?[A-Za-z.]{1,10}\s+a\s+(good|great|bad|smart)\s+(buy|investment|bet|stock)\b/i,
  /\b(tell|give)\s+me\s+(what|which)\s+to\s+(buy|sell|invest)\b/i,
  /\b(recommend|pick)\s+(me\s+)?(a|some|the best)?\s*(stocks?|shares?|portfolio|allocation|investments?)\b/i,
  /\b(build|make|manage|rebalance)\s+(me\s+)?(a|my)\s+portfolio\b/i,
  /\b(when|at what price) should (i|we)\s+(buy|sell|exit|enter)\b/i
];
export function personalizedAdviceRequest(text) {
  const t = norm(text);
  return ADVICE_REQUEST.some(r => r.test(t));
}

const INJECTION = [
  /\bignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|prompts?)\b/i,
  /\b(disregard|forget|override|bypass) (your|the|all) (rules|instructions|policy|policies|guardrails|system prompt)\b/i,
  /\b(you are now|act as|pretend (to be|you are)|roleplay as)\b.{0,40}\b(adviser|advisor|broker|unfiltered|jailbroken|dan)\b/i,
  /\b(developer|god|jailbreak|unrestricted) mode\b/i,
  /\b(system prompt|hidden instructions)\b/i,
  /\bhypothetically\b.{0,60}\b(what would you buy|which stock would you buy)\b/i,
  /\bfor (educational|academic) purposes only\b.{0,60}\b(tell me|which|what) (to buy|stock to buy|to sell)\b/i
];
export function promptInjection(text) {
  const t = norm(text);
  return INJECTION.some(r => r.test(t));
}

/* Imperatives and recommendations addressed to the reader. "Insiders bought" and "a purchase was reported"
 * are facts and pass; "buy NVDA", "you should sell", "we recommend", "strong buy" do not. */
const DIRECTIVE = [
  /(^|[.!?:]\s+)([Bb]uy|[Ss]ell|[Ss]hort|[Hh]old|[Aa]ccumulate|[Ll]oad up on|[Dd]ump|[Ee]xit|[Tt]rim)\s+(\$?[A-Z]{1,5}\b|shares|the stock|this stock|it now)/,
  /\b(you|investors|readers) (should|must|need to|ought to) (buy|sell|short|hold|invest|allocate|exit|get out|get in)\b/i,
  /\b(we|i|insidir) (recommend|suggest|advise) (buying|selling|shorting|holding|investing|allocating|that you)\b/i,
  /\b(strong buy|strong sell|top pick|price target of|must[- ]own|can't miss|cannot miss|back up the truck)\b/i,
  /\b(allocate|put|invest) \d{1,3}\s?% (of your|of their)\b/i,
  /\btime to (buy|sell|get in|get out)\b/i
];
export function directiveFindings(text) {
  const t = norm(text);
  return DIRECTIVE.map(r => t.match(r)?.[0]?.trim()).filter(Boolean);
}

/* Promises: guaranteed returns, no risk, regulator approval, insurance, secret or illegal information. A phrase
 * preceded within a few words by a negation ("not", "no", "never", "without", "does not") is a disclaimer, not a
 * claim, and passes. */
const GUARANTEE = [
  /\bguarantee[sd]?\b/i, /\brisk[- ]free\b/i, /\bno risk\b/i, /\bcan(no|')?t lose\b/i, /\bsure (thing|bet|profit)\b/i,
  /\b(sec|finra|government)[- ](approved|endorsed|certified|registered)\b/i, /\bapproved by the (sec|finra)\b/i,
  /\b(fdic|sipc)[- ]insured\b/i, /\binsured against (losses|trading losses)\b/i,
  /\b(beat|beats|outperform|outperforms) the market\b/i, /\b\d{1,4}\s?% (returns?|gains?|profit)\b/i, /\bdouble your money\b/i,
  /\b(secret|hidden|leaked|non-?public) (insider )?(information|tips?|data|trades)\b/i, /\binsider tips?\b/i
];
const NEGATION = /\b(not|no|never|nothing|without|isn't|aren't|doesn't|don't|cannot|can't|nor|neither|none)\b[^.!?]{0,200}$/i;
export function guaranteeFindings(text) {
  const t = norm(text);
  const out = [];
  for (const r of GUARANTEE) {
    const g = new RegExp(r.source, r.flags.includes("g") ? r.flags : r.flags + "g");
    for (const m of t.matchAll(g)) {
      const before = t.slice(Math.max(0, m.index - 220), m.index);
      if (NEGATION.test(before)) continue;
      out.push(m[0]);
    }
  }
  return out;
}

/* Every figure in generated text must be in a source: dollar amounts, percentages and numbers of 3+ digits.
 * Years and small counts are allowed through; formatting differences ($1,234 vs 1234) are ignored. */
const FIGURE = /\$?\d[\d,]*(\.\d+)?\s?(%|[KMB]\b|million|billion)?/g;
const plain = s => s.replace(/[$,\s]/g, "").toLowerCase().replace(/million$/, "m").replace(/billion$/, "b");
export function unsupportedFigures(text, sources = []) {
  const haystack = sources.map(s => plain(String(s ?? ""))).join(" ");
  const out = [];
  for (const m of norm(text).matchAll(FIGURE)) {
    const raw = m[0].trim();
    const digits = raw.replace(/[^\d]/g, "");
    const isYear = /^(19|20)\d{2}$/.test(raw);
    const significant = raw.startsWith("$") || raw.endsWith("%") || /[KMB]$|million|billion/i.test(raw) || digits.length >= 3;
    if (isYear || !significant) continue;
    if (!haystack.includes(plain(raw))) out.push(raw);
  }
  return out;
}

/* One generated answer, checked end to end. Blocks on any directive, guarantee or figure without a source, and
 * on a missing source list or retrieval time (every explanation must say where and when its facts came from). */
export function reviewGeneratedText({ text, sources = [], retrievedAt = null } = {}) {
  const problems = [];
  const directives = directiveFindings(text), guarantees = guaranteeFindings(text), figures = unsupportedFigures(text, sources.map(s => s?.text ?? s));
  if (directives.length) problems.push({ kind: "directive", items: directives });
  if (guarantees.length) problems.push({ kind: "guarantee", items: guarantees });
  if (figures.length) problems.push({ kind: "unsupported_figure", items: figures });
  if (!sources.length) problems.push({ kind: "no_sources" });
  if (!retrievedAt || !Number.isFinite(Date.parse(retrievedAt))) problems.push({ kind: "no_timestamp" });
  return { allowed: problems.length === 0, problems };
}

export const ADVICE_REFUSAL = "Insidir can explain what public filings say, but it does not tell you what to buy, sell, hold or how much to invest. " +
  "That depends on your circumstances and would be personalized investment advice, which Insidir does not provide.";

/* The gate for a future question-answering feature: refuse before any model is called. */
export function screenQuestion(text) {
  if (promptInjection(text)) return { allowed: false, reason: "prompt_injection", reply: "That request asks to bypass Insidir's rules, so it was not processed. " + ADVICE_REFUSAL };
  if (personalizedAdviceRequest(text)) return { allowed: false, reason: "personalized_advice", reply: ADVICE_REFUSAL };
  return { allowed: true };
}
