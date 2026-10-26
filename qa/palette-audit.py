"""Monochrome check for screenshots: the share of pixels that are not black, white or grey, and which colours they are.
    python3 qa/palette-audit.py qa/screenshots/monochrome/after/*.png
A pixel counts as coloured when its channels differ by more than 24 (anti-aliased grey text stays grey). The brief:
95%+ of the screen is black, white or grey, and the only colours are the safety lights (green, amber, red)."""
import sys
from collections import Counter
from PIL import Image

SAFETY = {"green": (0x30, 0xD1, 0x58), "amber": (0xFF, 0x9F, 0x0A), "red": (0xFF, 0x45, 0x3A)}

def nearest(px):
    name, d = min(((n, sum((a - b) ** 2 for a, b in zip(px, c))) for n, c in SAFETY.items()), key=lambda t: t[1])
    return name if d < 90 ** 2 else "other"

worst = 0.0
for path in sys.argv[1:]:
    im = Image.open(path).convert("RGB")
    im.thumbnail((im.width // 2, im.height // 2))
    px = list(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())
    coloured = [p for p in px if max(p) - min(p) > 24]
    share = 100 * len(coloured) / len(px)
    worst = max(worst, share)
    kinds = Counter(nearest(p) for p in coloured)
    print(f"{share:6.3f}% coloured  {dict(kinds)}  {path.split('/')[-1]}")
print(f"worst page: {worst:.3f}% coloured (limit 5%)")
sys.exit(1 if worst > 5 else 0)
