"""Write film/SOURCES.md: every source clip the three films use, with its origin, author and licence.

Usage: python3 tools/credits.py <pixabay manifest.json> <archive manifest.json>
The manifests are copied to film/sources/ so the credits can be regenerated without the downloads."""
import json
import os
import re
import shutil
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
FILMS = ["v1_wall_street.py", "v2_obsession.py", "v3_money_never_sleeps.py"]


def used():
    names = {}
    for f in FILMS:
        src = open(os.path.join(ROOT, f)).read()
        for m in set(re.findall(r'([A-Za-z0-9_]+?)(?:\.mp4)"', src)) | set(re.findall(r'"([a-z0-9_]+_\d+)"', src)):
            names.setdefault(m, set()).add(f.split("_")[0].upper())
    return names


def main(pix, arc):
    os.makedirs(os.path.join(ROOT, "sources"), exist_ok=True)
    shutil.copy(pix, os.path.join(ROOT, "sources", "pixabay_manifest.json"))
    shutil.copy(arc, os.path.join(ROOT, "sources", "archive_manifest.json"))
    P = {os.path.splitext(os.path.basename(c["file"]))[0]: c for c in json.load(open(pix))}
    Aa = {os.path.splitext(os.path.basename(c["file"]))[0]: c for c in json.load(open(arc))}
    u = used()
    lines = ["# Source footage", "",
             "Every clip below is real filmed footage (or, where marked in its description, a stock 3D render) used under",
             "its licence. No footage was AI-generated. The films grade everything to black and white.", "",
             "## Pixabay (Pixabay Content License)", "", "| clip | used in | what it is | author | page |", "|---|---|---|---|---|"]
    for k in sorted(P):
        if k in u:
            c = P[k]
            lines.append(f"| {k} | {', '.join(sorted(u[k]))} | {c['description'][:110].replace('|', '/')} | {c['author']} | {c['pageUrl']} |")
    lines += ["", "## Internet Archive (public domain)", "",
              "| clip | used in | what it is | film (year) | licence evidence | source |", "|---|---|---|---|---|---|"]
    for k in sorted(Aa):
        if k in u:
            c = Aa[k]
            lines.append(f"| {k} | {', '.join(sorted(u[k]))} | {c['what'][:90].replace('|', '/')} | {c['title']} ({c['year']}) | "
                         f"{str(c['license_evidence'])[:90].replace('|', '/')} | {c['archive_url']} |")
    lines += ["", "## Insidir interface", "",
              "Screen recordings of this repository's own website (`npm run web`), driven by Playwright in headless Chromium:",
              "the landing page (halftone wordmark answering the pointer), the company report for NVDA, and the picker ->",
              "Tesla report -> Insider activity flow. Prices and filings are live public data (Yahoo Finance delayed prices,",
              "SEC EDGAR) as of the capture date, October 2026.", "",
              "## Music and sound", "",
              "Original. Every sound is synthesized in `lib/audio.py` (oscillators and filtered noise): no samples or loops.", "",
              "## Type", "", "JetBrains Mono (SIL Open Font License), converted from the site's own font files.", ""]
    open(os.path.join(ROOT, "SOURCES.md"), "w").write("\n".join(lines))
    print("wrote SOURCES.md:", sum(1 for k in P if k in u), "Pixabay,", sum(1 for k in Aa if k in u), "archive clips")


if __name__ == "__main__":
    main(*sys.argv[1:3])
