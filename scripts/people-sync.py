#!/usr/bin/env python3
"""Candidate headshots for every candidate in Polymarket's open Senate, governor and House races: self-hosted in
public/people/<slug>-{512,192,96}.webp and recorded in lib/brand/people.json with the source and license of each.

Sources, in order:
  1. the official congressional portrait (unitedstates/images, public domain), by bioguide ID: the candidate matched
     to a current member of Congress by full name AND state;
  2. Polymarket's candidate image, verified as now: its file name carries the candidate's name AND the race;
  3. Wikimedia Commons (public domain, CC BY, CC BY-SA only), from the Wikidata item for a politician of that name
     (exactly one), with its author and license.
Each portrait is cropped by face detection (YuNet, scripts/models) so every face has the same eye line and the same
eye distance, i.e. the same head size; natural colour, no filters. A source whose face is too small (under 192px of
crop), blurry, has no face or two, is skipped. Nobody gets a face that isn't verified: no portrait means initials.

  pip install opencv-python-headless numpy pillow   (build-time only)
  python3 scripts/people-sync.py
"""
import io, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public/people")
REG = os.path.join(ROOT, "lib/brand/people.json")
MODEL = os.path.join(ROOT, "scripts/models/face_detection_yunet_2023mar.onnx")
UA = {"User-Agent": "InsidirPortraits/1.0 (https://insidir.com/credits)"}
BOX, EYE_Y, EYE_D, MIN_CROP = 512, 0.40, 0.185, 192
STATES = {"AL": "alabama", "AK": "alaska", "AZ": "arizona", "AR": "arkansas", "CA": "california", "CO": "colorado", "CT": "connecticut", "DE": "delaware", "FL": "florida", "GA": "georgia", "HI": "hawaii", "ID": "idaho", "IL": "illinois", "IN": "indiana", "IA": "iowa", "KS": "kansas", "KY": "kentucky", "LA": "louisiana", "ME": "maine", "MD": "maryland", "MA": "massachusetts", "MI": "michigan", "MN": "minnesota", "MS": "mississippi", "MO": "missouri", "MT": "montana", "NE": "nebraska", "NV": "nevada", "NH": "new-hampshire", "NJ": "new-jersey", "NM": "new-mexico", "NY": "new-york", "NC": "north-carolina", "ND": "north-dakota", "OH": "ohio", "OK": "oklahoma", "OR": "oregon", "PA": "pennsylvania", "RI": "rhode-island", "SC": "south-carolina", "SD": "south-dakota", "TN": "tennessee", "TX": "texas", "UT": "utah", "VT": "vermont", "VA": "virginia", "WA": "washington", "WV": "west-virginia", "WI": "wisconsin", "WY": "wyoming"}
BY_NAME = {v: k for k, v in STATES.items()}
LICENSE_OK = re.compile(r"^(public domain|pd\b.*|cc0.*|cc by(-sa)? ?\d?(\.\d)?.*)$", re.I)


def get(url, binary=False):
    """GET with retries; Wikimedia's 429s are waited out (its rate limits ask for slow, serial requests)."""
    req = urllib.request.Request(url, headers=UA)
    wiki = "wikimedia.org" in url or "wikidata.org" in url
    for i in range(6):
        if wiki:
            time.sleep(1.0)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                b = r.read()
                return b if binary else json.loads(b)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(min(60, 5 * 2 ** i) if e.code == 429 else 2)
        except Exception:
            time.sleep(2)
    return None


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def race_of(event_slug):
    """'texas-senate-election-winner' → ('TX', 'senate', None); 'ca-13-house-election-winner' → ('CA', 'house', 13)."""
    m = re.match(r"^([a-z]{2})-(\d+)-house-election-winner", event_slug)
    if m and m.group(1).upper() in STATES:
        return m.group(1).upper(), "house", int(m.group(2))
    m = re.match(r"^([a-z-]+?)-(senate|governor)-(?:election-)?winner", event_slug)
    if m and m.group(1) in BY_NAME:
        return BY_NAME[m.group(1)], m.group(2), None
    return None


def candidates():
    evs, off = [], 0
    while True:
        page = get(f"https://gamma-api.polymarket.com/events?tag_slug=midterms&closed=false&limit=100&offset={off}") or []
        evs += page
        if len(page) < 100:
            break
        off += 100
    people = {}
    for e in evs:
        race = race_of(e.get("slug", ""))
        if not race:
            continue
        for m in e.get("markets", []):
            g = re.match(r"^(.+?)\s*\(([DRI])\)\s*$", m.get("groupItemTitle") or "")
            if not g:
                continue
            name = re.sub(r"\s+", " ", g.group(1)).strip()
            key = f"{slug(name)}|{race[0]}"
            people.setdefault(key, {"name": name, "party": g.group(2), "state": race[0], "office": race[1], "district": race[2], "race": e["title"], "eventSlug": e["slug"], "polyImage": m.get("image") or ""})
    return list(people.values())


_legis = None
def legislators():
    global _legis
    if _legis is None:
        _legis = get("https://unitedstates.github.io/congress-legislators/legislators-current.json") or []
    return _legis


def norm(s):
    return re.sub(r"[^a-z ]", "", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).split()


def bioguide_for(p):
    """A current member of Congress with this full name (official, or first/nickname + last) AND this state. Exactly one."""
    want = norm(p["name"])
    hits = []
    for l in legislators():
        n = l["name"]
        names = [n.get("official_full", ""), f"{n.get('first','')} {n.get('last','')}", f"{n.get('nickname','')} {n.get('last','')}"]
        if any(norm(x) == want for x in names if x.strip()) and any(t.get("state") == p["state"] for t in l["terms"]):
            hits.append(l["id"]["bioguide"])
    return hits[0] if len(hits) == 1 else None


def poly_verified(p):
    """Polymarket's image only when its file name carries the candidate's name AND the race (state and office)."""
    f = slug(urllib.parse.unquote(p["polyImage"].split("/")[-1]))
    state = STATES[p["state"]] if p["office"] != "house" else p["state"].lower()
    return bool(p["polyImage"]) and slug(p["name"]) in f and state in f and p["office"] in f


_commons = {}
def prefetch_commons(names):
    """Wikidata, in batches (its rate limits ask for few, large requests): for each name, the one US politician with
    that exact English label and a Commons image, then each image's license and author from Commons (50 per call)."""
    picks = {}
    for i in range(0, len(names), 80):
        chunk = names[i:i + 80]
        values = " ".join('"%s"@en' % n.replace('"', "") for n in chunk)
        q = ("SELECT ?label ?item ?img WHERE { VALUES ?label { %s } ?item rdfs:label ?label; wdt:P31 wd:Q5; wdt:P18 ?img; wdt:P27 wd:Q30. "
             "{ ?item wdt:P106 wd:Q82955 } UNION { ?item wdt:P39 ?pos } }" % values)
        r = get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}))
        rows = (r or {}).get("results", {}).get("bindings", [])
        by = {}
        for row in rows:
            by.setdefault(row["label"]["value"], {}).setdefault(row["item"]["value"], row["img"]["value"])
        for label, items in by.items():
            if len(items) == 1:  # exactly one politician of that name
                picks[label] = urllib.parse.unquote(next(iter(items.values())).split("/")[-1])
    files = list(set(picks.values()))
    meta = {}
    for i in range(0, len(files), 50):
        ii = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "titles": "|".join("File:" + f for f in files[i:i + 50]), "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1024, "format": "json"}))
        for page in ((ii or {}).get("query", {}).get("pages", {}) or {}).values():
            info = (page.get("imageinfo") or [{}])[0]
            m = info.get("extmetadata", {})
            lic = re.sub(r"<[^>]+>", "", m.get("LicenseShortName", {}).get("value", "")).strip()
            author = re.sub(r"<[^>]+>", "", m.get("Artist", {}).get("value", "")).strip() or "Wikimedia Commons"
            meta[page.get("title", "")[5:].replace("_", " ")] = {"url": info.get("thumburl") or info.get("url"), "source": info.get("descriptionurl"), "license": lic, "author": author[:120]}
    for name, f in picks.items():
        c = meta.get(f.replace("_", " "))
        if c and c["url"] and LICENSE_OK.match(c["license"]):
            _commons[name] = c


def commons_for(p):
    return _commons.get(p["name"])


_det = None
def crop(buf):
    """Face-aligned 512×512 crop: eyes level at 40% height, eye distance 18.5% of the width. None when unsure."""
    global _det
    try:
        im = Image.open(io.BytesIO(buf)).convert("RGB")
    except Exception:
        return None, "unreadable"
    a = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    h, w = a.shape[:2]
    # The detector works best at ~640px: find the face on a smaller copy, crop from the full photo.
    k = min(1.0, 640 / max(w, h))
    small = cv2.resize(a, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA) if k < 1 else a
    if _det is None:
        _det = cv2.FaceDetectorYN.create(MODEL, "", (small.shape[1], small.shape[0]), 0.8)
    _det.setInputSize((small.shape[1], small.shape[0]))
    _, faces = _det.detect(small)
    if faces is None or len(faces) == 0:
        return None, "no face"
    faces = faces.copy()
    faces[:, :14] /= k
    faces = sorted(faces, key=lambda f: -f[2] * f[3])
    if len(faces) > 1 and faces[1][2] * faces[1][3] > 0.35 * faces[0][2] * faces[0][3]:
        return None, "two faces"
    f = faces[0]
    (rx, ry), (lx, ly) = (f[4], f[5]), (f[6], f[7])
    d = float(np.hypot(lx - rx, ly - ry))
    if d < 8:
        return None, "face too small"
    scale = BOX * EYE_D / d
    side = BOX / scale
    if side < MIN_CROP:
        return None, f"face too small ({side:.0f}px crop)"
    cx, cy = (rx + lx) / 2, (ry + ly) / 2
    # Blur: the variance of the Laplacian over the face, scaled to the crop.
    x0, y0 = max(0, int(f[0])), max(0, int(f[1]))
    face = cv2.cvtColor(a[y0:y0 + int(f[3]), x0:x0 + int(f[2])], cv2.COLOR_BGR2GRAY)
    if face.size and cv2.Laplacian(cv2.resize(face, (160, 160)), cv2.CV_64F).var() < 25:
        return None, "blurry"
    M = np.float32([[scale, 0, BOX / 2 - cx * scale], [0, scale, BOX * EYE_Y - cy * scale]])
    out = cv2.warpAffine(a, M, (BOX, BOX), flags=cv2.INTER_LANCZOS4 if scale > 1 else cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    # Too much of the crop outside the photo (replicated edge): not a portrait we can frame.
    left, top = cx - BOX / 2 / scale, cy - BOX * EYE_Y / scale
    over = max(0, -left) + max(0, left + side - w) + max(0, -top) + max(0, top + side - h)
    if over > 0.06 * side:
        return None, "photo too tight to frame"
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)), None


# Portraits a person reviewed on /admin/art and turned down (name|state → why). That source is skipped; the next one, or
# initials, takes its place.
REJECTED = {
    "Marquita Bradshaw|TN": "wearing a face mask",
    "Mark Teixeira|TX": "a game photo in a batting helmet, not a portrait",
    "Jason Clark|CO": "looking up and away, the top of the head cut off",
    "Micah Lasher|NY": "a side-on close-up",
    "Eric Barlow|WY": "a side-on close-up",
    "Luke Bronin|CT": "too close: the top of the head cut off",
}


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, f"{name}-512.webp"), "WEBP", quality=84, method=6)
    for s in (192, 96):
        img.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f"{name}-{s}.webp"), "WEBP", quality=88, method=6)


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    prev = {f"{x['file']}": x for x in (json.load(open(REG)) if os.path.exists(REG) else [])}
    people = [p for p in candidates() if not only or only.lower() in p["name"].lower()]
    prefetch_commons(sorted({p['name'] for p in people}))
    print('commons candidates', len(_commons), flush=True)
    out, stats = [], {"congress": 0, "polymarket": 0, "commons": 0, "none": 0}
    for p in sorted(people, key=lambda x: (x["state"], x["office"], x["district"] or 0, x["name"])):
        file = f"{slug(p['name'])}-{p['state'].lower()}"
        tries, notes = [], []
        bg = bioguide_for(p)
        if bg:
            tries.append({"kind": "congress", "url": f"https://unitedstates.github.io/images/congress/original/{bg}.jpg", "source": f"https://github.com/unitedstates/images (bioguide {bg})", "license": "public domain", "author": "U.S. Congress (official portrait)"})
        if poly_verified(p):
            tries.append({"kind": "polymarket", "url": p["polyImage"], "source": p["polyImage"], "license": "Polymarket candidate image", "author": "Polymarket"})
        done = None
        if f"{p['name']}|{p['state']}" in REJECTED:
            tries, notes = [], [f"reviewed: {REJECTED[p['name'] + '|' + p['state']]}"]
        for t in tries + (["commons"] if f"{p['name']}|{p['state']}" not in REJECTED else []):
            if t == "commons":
                c = commons_for(p)
                if not c:
                    notes.append("commons: none usable"); break
                t = {"kind": "commons", **c}
            buf = get(t["url"], binary=True)
            if not buf:
                notes.append(f"{t['kind']}: download failed"); continue
            img, why = crop(buf)
            if not img:
                notes.append(f"{t['kind']}: {why}"); continue
            save(img, file)
            done = t
            break
        office = {"senate": f"{p['state']} Senate", "governor": f"{p['state']} Governor", "house": f"{p['state']}-{p['district']} House"}[p["office"]]
        entry = {"name": p["name"], "party": p["party"], "office": office, "race": p["race"], "state": p["state"], "bioguide": bg, "file": file if done else None,
                 "kind": done["kind"] if done else None, "source": done["source"] if done else None, "license": done["license"] if done else None, "author": done["author"] if done else None}
        if not done:
            entry["note"] = "; ".join(notes)
        stats[done["kind"] if done else "none"] += 1
        out.append(entry)
    if only:
        keep = [x for x in prev.values() if not any(o["name"] == x["name"] and o["state"] == x["state"] for o in out)]
        out = keep + out
    json.dump(out, open(REG, "w"), indent=1, ensure_ascii=False)
    print(json.dumps(stats), len(out))


if __name__ == "__main__":
    main()
