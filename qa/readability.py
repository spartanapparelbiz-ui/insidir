"""Reading level of every page's visible text, from qa/simple-shots.ts (text.json). Grade 6 or below is the bar for
the Simple view. Each line on screen counts as one sentence (UI text is short lines, not paragraphs); lines with no
words (prices, dates) are skipped. Seed titles ("E2E fixture: ...") are test data, not our copy, and are removed.
Two scores per page: all visible text, and its real sentences only (the stricter one); a page passes when both are
at or under the bar. Flesch-Kincaid grade = 0.39 x words per sentence + 11.8 x syllables per word - 15.59, with a standard vowel-group
syllable count (no dictionary download needed).
    python3 qa/readability.py [qa/screenshots/simple/text.json]
"""
import json
import re
import sys


def syllables(word: str) -> int:
    w = word.lower().strip("'")
    if not w:
        return 0
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|ed|[^laeiouy]e)$", "", w)
    w = re.sub(r"^y", "", w)
    return max(1, len(re.findall(r"[aeiouy]{1,2}", w)))


WORD = re.compile(r"[A-Za-z][A-Za-z']*")


def fk_grade(text: str) -> float:
    sentences = [x for x in re.split(r"[.?!:]+\s+|\n", text) if WORD.search(x)]
    words = WORD.findall(text)
    if not words or not sentences:
        return 0.0
    return 0.39 * len(words) / len(sentences) + 11.8 * sum(map(syllables, words)) / len(words) - 15.59


SIMPLE_BAR = 6.0
# Not Simple view: the Pro view (dense on purpose) and the legal pages.
NOT_SIMPLE = {"10-terminal-pro-view", "16-terms", "17-privacy"}


def clean(text: str) -> str:
    out = []
    for line in text.splitlines():
        line = re.sub(r"E2E fixture:[^.?\n]*[.?]?", " ", line).strip()
        if not re.search(r"[A-Za-z]{2,}", line):
            continue
        out.append(line if re.search(r"[.?!:]$", line) else line + ".")
    return "\n".join(out)


def prose(text: str) -> str:
    """Only the real sentences: lines of six words or more, split on sentence ends. Short labels can't pull it down."""
    return "\n".join(x.strip() for x in re.split(r"(?<=[.?!])\s+|\n", text) if len(WORD.findall(x)) >= 6)


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "qa/screenshots/simple/text.json"
    pages = json.load(open(path))
    worst = 0.0
    print(f"{'page':28} {'all text':>8} {'sentences':>9} {'1st screen':>10} {'words':>6}")
    for name, t in pages.items():
        body, fold = clean(t["page"]), clean(t["fold"])
        g, gp, gf = fk_grade(body), fk_grade(prose(body)), fk_grade(fold)
        simple = name not in NOT_SIMPLE
        top = max(g, gp)
        ok = "ok" if top <= SIMPLE_BAR else "OVER"
        if simple:
            worst = max(worst, top)
        print(f"{name:28} {g:8.1f} {gp:9.1f} {gf:10.1f} {len(WORD.findall(body)):6}  {ok if simple else '(not Simple view)'}")
    print(f"\nWorst Simple-view page: grade {worst:.1f} (bar: {SIMPLE_BAR})")
    return 0 if worst <= SIMPLE_BAR else 1


if __name__ == "__main__":
    sys.exit(main())
