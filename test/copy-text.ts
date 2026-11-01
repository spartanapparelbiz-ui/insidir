/* Telling copy from code names in a source file's strings, for the copy-rule tests. Not a test itself. */
const NAME = /^[a-z0-9]+(?:[_-]{1,2}[a-z0-9]+)*$/;

/** A string that is a code name, not words anyone reads: an import path, a key or test id, a class list. */
export function isIdentifier(raw: string): boolean {
  const t = raw.trim(), words = t.split(/\s+/);
  if (/^[@./]/.test(t)) return true;
  if (words.length === 1) return NAME.test(t);
  return words.every(w => NAME.test(w)) && /__|--/.test(t);
}
