"""VIDEO 1 - WALL STREET AFTER DARK (20 s, 600 frames, 120 BPM = 15 frames per beat). 9:16 Reel.

What it says: insiders have to report their own trades; Insidir reads those filings for you.

One continuous impossible camera journey:
  000-090  rain street: 3D camera dolly through live footage (per-frame monocular depth re-projection)
  090-120  the camera hits a rain-covered car window; droplets refract the street, then burst past the lens
  120-165  spinning wheel hub; the tunnel opens in the gaps between the spokes (luma-keyed reveal, rotation matched)
  165-240  subway tunnel at speed; the camera rolls 90 deg and flies through the light at the end
  240-300  up the elevator shaft (hyperlapse, push) and out through the top
  300-375  above the city: towers lean and fold over the camera
  375-480  hundreds of live tiles assemble into the Empire State aerial, then melt into the full shot
  480-512  dive into a night facade (portal)
  512-600  insidir switches on in the tower's own windows, tracked with the building as the camera drifts in
"""
import os
import numpy as np
import cv2
from lib import vfx as V, shots as S, audio as A, music as M

N_FRAMES = 600
VERTICAL = False
from lib.titles import Titles
TITLES = Titles([
    (15, 105, "SEC EDGAR", "Every public company\nfiles with the SEC."),
    (135, 225, "FORM 4", "Officers and directors\nreport their own trades."),
    (255, 345, "THE PUBLIC RECORD", "Every filing is public.\nFew are easy to read."),
    (390, 480, "INSIDIR", "Turns them into clear,\nsourced company research."),
])
PULSE = list(range(90, 525, 15))
MEDIA = os.environ.get("FILM_MEDIA", "/tmp/claude-0/-home-user-insidir/cd4dae8d-ed8d-5424-aa32-92f44807c414/scratchpad/stock")
UI = os.environ.get("FILM_UI", "/tmp/claude-0/-home-user-insidir/cd4dae8d-ed8d-5424-aa32-92f44807c414/scratchpad/ui")
PIX, ARC = MEDIA + "/pix/", MEDIA + "/arc/"
B = 15  # frames per beat
W, H = V.W, V.H

_c = {}


def C(name):
    if name in _c:
        return _c[name]
    spec = {
        "street": (PIX + "v7_timessqrain332901.mp4", 0, 5.0, {}),
        "glass": (PIX + "b_rainywindshield377423.mp4", 5.0, 3.0, {}),
        "wheel": (PIX + "c_wheels5158.mp4", 0.0, 4.0, {}),
        "tunnel": (PIX + "d_tunnelrails25392.mp4", 2.0, 5.0, {}),
        "shaft": (PIX + "e_elevatormall3735.mp4", 0.0, 12.0, {"speed": 4.0}),
        "aerial": (PIX + "f_nycaerialdusk231168.mp4", 0.5, 6.0, {}),
        "empire": (PIX + "f_empirestatedusk272511.mp4", 0.5, 10.0, {}),
        "facade": (PIX + "g_nightfacadewindows303.mp4", 5.15, 2.3, {}),
    }[name]
    p, st, du, kw = spec
    _c[name] = V.load(p, st, du, **kw)
    return _c[name]


BANK_SRC = [
    (PIX + "v7_timessqrain332901.mp4", 0, 5), (PIX + "d_tunnelrails25392.mp4", 2, 4), (PIX + "e_elevatormall3735.mp4", 0, 6),
    (PIX + "f_nycaerialdusk231168.mp4", 0, 7), (PIX + "f_empirestatedusk272511.mp4", 0, 10), (PIX + "g_nightfacadewindows303.mp4", 5.1, 2.3),
    (PIX + "i_brooklynbridgenight7260.mp4", 1, 8), (PIX + "f_citynightskyline3134.mp4", 5, 8), (PIX + "i_downtownskyline30978.mp4", 2, 8),
    (PIX + "v5_onewtc272515.mp4", 0, 8), (PIX + "s_lookupskyscraper106340.mp4", 0, 8), (PIX + "i_nyccrossroads1044.mp4", 0, 8),
    (PIX + "v7_nyctaxisdusk129.mp4", 0, 8), (PIX + "q_nighttrails190483.mp4", 0, 8), (PIX + "i_nycskyscrsunset231405.mp4", 0, 8),
    (PIX + "i_midtownhighrise219337.mp4", 0, 8), (PIX + "f_midtownaerial47335.mp4", 0, 8), (PIX + "i_lowermanhattan272513.mp4", 0, 8),
    (PIX + "s_facadereflection214695.mp4", 0, 7), (PIX + "q_tunneldrive194.mp4", 8, 8), (PIX + "i_broadway10836.mp4", 0, 8),
    (ARC + "wall_street_flags_1921_112.mp4", 0, 8), (ARC + "broadway_crowd_1921_151.mp4", 0, 5), (ARC + "skyline_from_water_1920_38.mp4", 0, 6),
]

_bank = None
_mosaic = None


def bank():
    global _bank
    if _bank is None:
        clips = [V.load(p, s, d, fps=10, size=(96, 54)) for p, s, d in BANK_SRC]
        _bank = V.TileBank(clips, 48, 27, per_clip=30)
    return _bank


def mosaic():
    global _mosaic
    if _mosaic is None:
        _mosaic = S.Mosaic(bank(), 48, 48, C("empire")[0])
    return _mosaic


# ------------------------------------------------------------------ timing helpers

def seg(f, a, b):
    return (f - a) / float(b - a)


def street_pos(f):
    # slow-motion on the raindrop (0.45x) until the first kick at beat 2, then 1.6x
    return 0.45 * min(f, 30) + 1.6 * max(f - 30, 0)


def street_cam(f):
    t = f / 104.0
    return (0.06 * V.smooth(t), 0.03 * np.sin(f / 9) - 0.05 * V.smooth(t), 0.25 * t + 2.2 * V.ease_in(t, 2.2), 0.0, 0.0, -0.03 * V.smooth(t))


def street(f):
    """3D dolly into the live street: each source frame is re-projected through its own depth map."""
    p = street_pos(f)
    i = int(round(p))
    img = C("street")[i]
    d = V.depth(img, f"v1street_{i}")
    cam = street_cam(f)
    out = V.reproject(img, d, cam, f=1500, near=1.2, far=10)
    sp = cam[2] - street_cam(max(f - 1, 0))[2]
    out = V.radial_blur(out, sp * 0.9, (1100, 420), 8)
    return out


def _flowgrid():
    g = V.grid(H, W)
    return g[..., 0], g[..., 1]


def glass_layer(f):
    """Rain-covered glass: droplet relief (high-pass of the glass clip) used as refraction and as highlights."""
    g = C("glass")[int(f) % len(C("glass"))]
    hpass = g - cv2.GaussianBlur(g, (0, 0), 9)
    return hpass


def glass_pass(f):
    t = seg(f, 90, 120)
    behind = street(f) if f < 104 else None
    hp = glass_layer(f)
    s = np.exp(np.log(7.0) * V.ease_in(np.clip((t - 0.45) / 0.55, 0, 1), 2.0))
    hp_s = V.affine(hp, s, 0, center=(1050, 560))
    gx = cv2.Sobel(hp_s, cv2.CV_32F, 1, 0, ksize=5)
    gy = cv2.Sobel(hp_s, cv2.CV_32F, 0, 1, ksize=5)
    fl = np.stack([gx, gy], -1) * 60.0
    wt = wheel(120 + (f - 104) * 1.0) if f >= 98 else None
    if behind is None:
        base = wt
    elif wt is not None:
        k = V.smooth(seg(f, 98, 106))
        base = behind * (1 - k) + wt * k
    else:
        base = behind
    out = V.warp(base, fl, 1.0)
    amt = np.clip(seg(f, 88, 96), 0, 1) * (1 - V.smooth(seg(f, 108, 120)))
    out = out * (1 - 0.25 * amt) + np.clip(hp_s * 3.0, -0.2, 0.6) * amt + 0.06 * amt
    return V.radial_blur(out, 0.03 * V.smooth(t) * (1 - t) * 4, (1050, 560), 8)


WHEEL_C = (333, 535)


def wheel_angle(f):
    # rotation accelerates into the tunnel transition (degrees)
    t = np.clip(seg(f, 104, 180), 0, 1)
    return -(120 * t + 200 * t ** 3)


def wheel(f):
    i = int(np.clip(f - 104, 0, len(C("wheel")) - 1))
    img = C("wheel")[i]
    ang = wheel_angle(f)
    img = V.affine(img, 3.4, ang, W / 2 - WHEEL_C[0], H / 2 - WHEEL_C[1], center=WHEEL_C)
    dw = abs(wheel_angle(f) - wheel_angle(f - 1))
    return V.spin_blur(img, dw * 0.7, samples=8) if dw > 2 else img


def tunnel_angle(f):
    # the wheel's spin carries into the tunnel and decays; then a 90 degree roll toward the shaft
    spin = wheel_angle(180) - wheel_angle(179)
    t = max(f - 150, 0)
    base = wheel_angle(150) + spin * 8 * (1 - np.exp(-t / 8))
    roll = 90 * V.ease_io(np.clip(seg(f, 214, 238), 0, 1))
    return base + roll


def tunnel(f):
    pos = 1.8 * max(f - 140, 0)
    img = C("tunnel").at(pos % (len(C("tunnel")) - 1))
    s = 1.12 + 0.25 * V.ease_in(np.clip(seg(f, 200, 240), 0, 1), 2)
    img = V.affine(img, s, tunnel_angle(f), W / 2 - 960, H / 2 - 528, center=(960, 528))
    return V.radial_blur(img, 0.015 + 0.03 * V.smooth(seg(f, 165, 200)), None, 6)


def shaft(f):
    pos = max(f - 225, 0) * 1.0
    img = C("shaft").at(min(pos, len(C("shaft")) - 1))
    t = np.clip(seg(f, 240, 300), 0, 1)
    s = 1.05 + 1.2 * V.ease_in(t, 2.5)
    img = V.affine(img, s, 0, center=(960, 75))
    img = V.radial_blur(img, 0.04 + 0.2 * V.ease_in(t, 3), (W / 2, 100), 8)
    # exiting the shaft into the open sky: the exposure blows out the way a real sensor clips, image stays
    burst = V.ease_in(np.clip(seg(f, 286, 300), 0, 1), 2)
    return np.clip(img * (1 + 2.2 * burst) + 0.25 * burst, 0, 1)


def aerial(f, with_type=False):
    pos = max(f - 290, 0) * 1.0
    i = int(min(pos, len(C("aerial")) - 1))
    img = C("aerial").at(min(pos, len(C("aerial")) - 1))
    d = V.depth(C("aerial")[i], f"v1aer_{i}")
    t = np.clip(seg(f, 300, 375), 0, 1)
    # beat-locked bend: each beat snaps the curl a little further, released with a spring
    beats = (f - 300) / B
    pulse = sum(np.exp(-max(beats - k, 0) * 5) * (beats >= k) for k in range(0, 6)) * 0.12
    lean = 0.15 + 0.85 * V.ease_io(t) + pulse
    img = V.lean(img, lean, 1.7)
    d = V.lean(d, lean, 1.7)
    # fold the sky down over the camera: the upper city rotates about the horizon line toward the lens
    ang = -0.55 * V.ease_in(np.clip(seg(f, 330, 375), 0, 1), 2)
    if ang < -0.01:
        top, mt = V.fold(img, 430, ang, f=1300, upper=True)
        img = top * mt + img * (1 - mt)
    if with_type and 312 <= f < 372:
        a = np.clip(seg(f, 312, 318), 0, 1)
        img, _ = S.kinetic_word(img, "AFTER", 250, 960, 330 - 30 * t, a, d, 0.72, scale=1 + 0.2 * t)
        if f >= 327:
            a2 = np.clip(seg(f, 327, 333), 0, 1)
            img, _ = S.kinetic_word(img, "DARK", 250, 960, 560 - 30 * t, a2, d, 0.72, scale=1 + 0.2 * t)
    flash = np.exp(-max(f - 300, 0) / 4) if f >= 300 else 0
    return np.clip(img * (1 + 2.0 * flash) + 0.15 * flash, 0, 1)


def empire(f, zoom=1.0):
    pos = max(f - 375, 0) * 0.9
    img = C("empire").at(min(pos, len(C("empire")) - 1))
    return V.affine(img, zoom, 0, center=(960, 300)) if zoom != 1 else img


def mosaic_shot(f):
    tgt = empire(f, 1.0)
    t = seg(f, 375, 480)
    sixteenth = np.floor((f - 375) / 3.75)              # cells snap in on 16th notes
    reveal = np.clip(0.08 + sixteenth / 14.0, 0, 1.05)
    match = 0.55 + 0.45 * V.smooth(seg(f, 400, 445))
    resolve = V.ease_io(np.clip(seg(f, 445, 478), 0, 1))
    img = mosaic().render(tgt, f - 375, reveal, match, resolve)
    z = 1.35 - 0.35 * V.ease_out(t, 2)                   # the camera keeps pulling back as the picture forms
    return V.affine(img, z, 0)


_fac_H = None
FACE = np.float32([[1000, 262], [1322, 222], [1600, 1080], [830, 1080]])   # tower face at facade frame 30


def facade_tracks():
    global _fac_H
    if _fac_H is None:
        frames = [C("facade")[i] for i in range(len(C("facade")))]
        Hs = V.planar_track(frames, (880, 260, 650, 760), f0=30)
        _fac_H = V.smooth_homographies(Hs, 2.5)
    return _fac_H


def fac_pos(f):
    return np.clip((f - 480) * 0.55 + 6, 0, len(C("facade")) - 1)


def facade(f):
    return C("facade").at(fac_pos(f))


def dive(f):
    """Empire aerial pushes down; a lit window region opens (portal) into the facade shot."""
    t = seg(f, 480, 512)
    return S.portal(empire(f), facade(f), np.clip(t * 1.25, 0, 1), (1010, 470), 26, smax=26, blur=0.3)


_ht = None


def lit_word(f):
    """insidir written in the building's own windows: the halftone dots are mapped onto the tower face in
    perspective, carried by the planar track, and switch on like office lights."""
    global _ht
    if _ht is None:
        _ht = S.Halftone("insidir", 400, gap=11, seed=6)
    reveal = V.ease_out(np.clip(seg(f, 524, 566), 0, 1), 2) * 1.08
    dots = _ht.image(reveal, 0.05)
    h, w = dots.shape
    # a band across the face between 34% and 52% of its height, inset from both edges
    def edge(a, b, t):
        return FACE[a] + (FACE[b] - FACE[a]) * t
    v0, v1 = 0.27, 0.49
    L0, L1 = edge(0, 3, v0), edge(0, 3, v1)
    R0, R1 = edge(1, 2, v0), edge(1, 2, v1)
    ins = 0.05
    quad = np.float32([L0 + (R0 - L0) * ins, R0 - (R0 - L0) * ins, R1 - (R1 - L1) * ins, L1 + (R1 - L1) * ins])
    Hq = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), quad)
    Ht = facade_tracks()[int(round(fac_pos(f)))]
    # whole floors go dark: the band runs edge to edge across the face, a few floors taller than the word
    F0, F1 = edge(0, 3, v0 - 0.03), edge(0, 3, v1 + 0.03)
    G0, G1 = edge(1, 2, v0 - 0.03), edge(1, 2, v1 + 0.03)
    floors = np.float32([F0, G0, G1, F1])
    band = np.zeros((H, W), np.float32)
    cv2.fillConvexPoly(band, cv2.perspectiveTransform(floors[None], Ht)[0].astype(np.int32), 1.0, cv2.LINE_AA)
    band = cv2.GaussianBlur(band, (0, 0), 5)
    return cv2.warpPerspective(dots, Ht @ Hq, (W, H), flags=cv2.INTER_AREA), band


def tower_cam(f):
    """The slow drift into the tower, as a 3x3 plate transform."""
    e = V.ease_io(np.clip(seg(f, 512, 600), 0, 1), 2)
    Mc = cv2.getRotationMatrix2D((1230, 560), 0, 1.0 + 0.22 * e)
    Mc[0, 2] += -120 * e
    Mc[1, 2] += 60 * e
    return np.vstack([Mc, [0, 0, 1]])


def tower(f):
    img = facade(f)
    if f >= 520:
        _, band = lit_word(f)
        # those floors go dark first (only the lit windows; glass and mullions stay), then the word switches on
        dark = V.smooth(seg(f, 520, 532)) * 0.72
        lights = V.smooth((img - 0.28) / 0.45)
        img = img * (1 - band * dark * (0.25 + 0.75 * lights))
    return cv2.warpAffine(img, tower_cam(f)[:2], (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def word_quad_H(f):
    """Plate homography of the word's dot image onto the tower face at frame f (track + camera drift)."""
    global _ht
    if _ht is None:
        _ht = S.Halftone("insidir", 400, gap=11, seed=6)
    h, w = _ht.shape
    def edge(a, b, t):
        return FACE[a] + (FACE[b] - FACE[a]) * t
    v0, v1 = 0.27, 0.49
    L0, L1 = edge(0, 3, v0), edge(0, 3, v1)
    R0, R1 = edge(1, 2, v0), edge(1, 2, v1)
    ins = 0.05
    quad = np.float32([L0 + (R0 - L0) * ins, R0 - (R0 - L0) * ins, R1 - (R1 - L1) * ins, L1 + (R1 - L1) * ins])
    Hq = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), quad)
    return tower_cam(f) @ facade_tracks()[int(round(fac_pos(f)))] @ Hq


def post(f, img, M):
    """insidir switches on in the tower's windows, drawn at full vertical resolution."""
    if f < 524:
        return img
    Hv = np.vstack([M, [0, 0, 1]]) @ word_quad_H(f)
    reveal = V.ease_out(np.clip(seg(f, 524, 566), 0, 1), 2) * 1.08
    a = cv2.warpPerspective(_ht.image(reveal, 0.05), Hv, (img.shape[1], img.shape[0]), flags=cv2.INTER_AREA)
    glow = cv2.GaussianBlur(a, (0, 0), 10) * 0.35
    return np.maximum(img, a * 0.97) + glow * (1 - img)


def focus(f):
    """Vertical reframe: crop centre on the plate."""
    from lib.vertical import keyframes
    if f >= 512:
        p = tower_cam(f) @ np.array([1180, 560, 1.0])            # keep the word's floors centred as we drift
        return float(p[0]), 1.0
    return keyframes([(0, 1080), (88, 1060), (90, 1050), (119, 1050), (120, 960), (300, 960), (375, 980),
                      (480, 990), (511, 1010)], f), 1.0


def frame(f):
    if f < 90:
        img = street(f)
    elif f < 120:
        img = glass_pass(f)
    elif f < 150:
        img = wheel(f)
    elif f < 172:
        t = seg(f, 150, 172)
        w = wheel(f)
        w = V.affine(w, 1 + 1.6 * V.ease_in(t, 2), 0)
        img, _ = S.luma_reveal(w, tunnel(f), t, lo=0.05, hi=0.85)
    elif f < 228:
        img = tunnel(f)
    elif f < 246:
        t = seg(f, 228, 246)
        img = S.portal(tunnel(f), shaft(f), t, (960, 540), 30, smax=20, blur=0.3)
    elif f < 300:
        img = shaft(f)
    elif f < 375:
        img = aerial(f)
    elif f < 480:
        img = mosaic_shot(f)
    elif f < 512:
        img = dive(f)
    else:
        img = tower(f)
    # impact shakes on the big hits
    if f < 512:                                       # gentle handheld; the final shot is locked off
        dx, dy, r = V.shake(f, [(90, 0.35), (300, 0.45), (480, 0.35)], amp=8)
        img = V.affine(img, 1.02, r, dx, dy)
    return V.grade(np.asarray(img, np.float32), contrast=1.18).astype(np.float32)


def prepare():
    # depth maps and tracks once in the parent process (the workers then read the cache)
    for f in range(0, 105):
        i = int(round(street_pos(f)))
        V.depth(C("street")[i], f"v1street_{i}")
    for f in range(290, 376):
        i = int(min(max(f - 290, 0), len(C("aerial")) - 1))
        V.depth(C("aerial")[i], f"v1aer_{i}")
    facade_tracks()
    bank()


# ------------------------------------------------------------------ score

HITS = [0, 30, 60, 90, 120, 150, 172, 228, 246, 300, 375, 480, 525, 566, 585]


def score():
    mix = A.Mix(N_FRAMES / 30 + 1.0)
    T = lambda f: f / 30.0
    ir = A.make_ir(2.4, 0.7)
    # intro: rain and a filtered pulse
    mix.add(A.rain(T(120), 1.0), 0, 0.5, bus="amb")
    mix.add(A.drone(A.note_hz("F1"), T(300)), 0, 0.35, bus="pad")
    bass = [(0.5, "F1", 0.45), (1.5, "F1", 0.45), (2.5, "Ab1", 0.4), (3.25, "F1", 0.2), (3.5, "C2", 0.45)]
    st = lambda bar: [(1.5, ["F3", "Ab3", "C4"]), (3.75, ["Eb3", "G3", "C4"] if bar % 2 else ["Db3", "F3", "Ab3"])]
    kicks = []
    kicks += M.groove(mix, 2, 6, clap=False, hats=False, clicks=True, intensity=0.8)              # kick enters on the first drop
    kicks += M.groove(mix, 6, 16, bass=bass, stabs=None, swing=0.1)
    kicks += M.groove(mix, 16, 25, bass=bass, stabs=st, swing=0.1, ghost_kicks=True)
    # breakdown over the mosaic: kicks drop out, 16th clicks keep building
    for k in range(int(T(105) / (A.BEAT / 4))):
        mix.add(A.click(4600 + 300 * (k % 3), 0.01), T(375) + k * A.BEAT / 4, 0.18 + 0.004 * k, pan=((k % 4) - 1.5) / 2, bus="drums")
    mix.add(A.riser(T(105)), T(375), 0.45, bus="fx")
    kicks += M.groove(mix, 32, 40, bass=bass, stabs=st, swing=0.1, ghost_kicks=True, intensity=1.05)
    # transition sound design on every visual action
    mix.add(A.whoosh(0.6, 400, 5000), T(90) - 0.45, 0.5, bus="fx")
    mix.add(A.impact(1.2, 55, 0.5), T(90), 0.55, bus="fx")
    for k in range(10):                                 # glass droplets ticking against the lens
        mix.add(A.click(6000 + 400 * (k % 4), 0.006, 8), T(92) + k * 0.05, 0.25, pan=np.sin(k), bus="fx")
    mix.add(A.ratchet(1.0, 30, 2200), T(120), 0.4, bus="fx")         # the wheel spinning up
    mix.add(A.whoosh(0.7, 200, 3000), T(150), 0.45, bus="fx")
    mix.add(A.rumble(T(80)), T(160), 0.55, bus="amb")                 # tunnel rumble
    mix.add(A.whoosh(0.5, 300, 6000, 0.95), T(228) - 0.45, 0.45, bus="fx")
    mix.add(A.rim(), T(228), 0.7, bus="fx")
    mix.add(A.click(3400, 0.015, 6), T(228), 0.6, bus="fx")
    mix.add(A.impact(1.0, 60, 0.5), T(246), 0.55, bus="fx")                 # out of the tunnel light, into the shaft
    mix.add(A.reverse_swell(1.2, 180), T(300) - 1.2, 0.5, bus="fx")
    mix.add(A.impact(2.0, 42, 0.9), T(300), 0.85, bus="fx")
    mix.add(A.sub_drop(1.2), T(300), 0.6, bus="fx")
    for k, f in enumerate([300, 315, 330, 345, 360]):                 # bends snap with metal creaks
        mix.add(A.downlifter(0.5), T(f), 0.12, pan=0.5 - k * 0.25, bus="fx")
    mix.add(A.impact(1.4, 50, 0.6), T(480), 0.7, bus="fx")
    mix.add(A.whoosh(1.2, 150, 7000, 0.85), T(480), 0.5, bus="fx")
    mix.add(A.impact(1.6, 45, 0.4), T(525), 0.6, bus="fx")
    mix.add(A.shutter(), T(566), 0.6, bus="fx")
    mix.add(A.impact(2.6, 40, 0.3), T(574), 0.75, bus="fx")
    mix.add(A.stab([A.note_hz(x) for x in ["F3", "Ab3", "C4", "Eb4"]], 2.4, 1600, 0.9), T(574), 0.5, bus="synth")
    mix.sidechain("bass", kicks)
    mix.sidechain("synth", kicks, 0.5)
    mix.sidechain("pad", kicks, 0.5)
    mix.reverb("synth", 0.45, ir)
    mix.reverb("fx", 0.25, ir)
    mix.reverb("drums", 0.06, A.make_ir(0.9, 0.2))
    out = mix.master()
    return out[:, : int(N_FRAMES / 30 * A.SR)]


# ------------------------------------------------------------------ real recordings (replaces the synth score)

def cues(mx):
    from lib.realaudio import cue
    cue(mx, "rain_city_2", 0, -8, src=14, length=4.0, fade_out=0.8, bus="amb", hit=14)
    cue(mx, "car_pass_2", 72, -3)                                   # the wet pass-by as we reach the car
    cue(mx, "rain_glass_1", 86, -4, src=10, length=1.4, fade_in=0.1, fade_out=0.3, hit=10)
    cue(mx, "glass_shatter_1", 108, -9)                             # droplets burst past the lens
    cue(mx, "tire_spin_2", 122, -4)
    cue(mx, "tire_spin_1", 140, -9, src=2.7, length=1.3, fade_out=0.4, hit=2.7)
    cue(mx, "subway_train_1", 195, -2, src=8.0, length=3.0, fade_in=0.4, fade_out=0.5, hit=10.1)
    cue(mx, "whoosh_1", 228, -4)
    cue(mx, "elevator_1", 252, -6, src=9.5, length=2.8, fade_in=0.2, hit=9.5)
    cue(mx, "elevator_1", 286, -4, src=11.9, length=1.4, hit=12.12)  # the ding at the top of the shaft
    cue(mx, "wind_high_2", 300, -6, src=42.0, length=3.2, fade_out=0.8, hit=43.7)
    cue(mx, "cinematic_impact_1", 300, -8, lp=4000)
    for k, f in enumerate((315, 330, 345, 360)):                    # the towers bend: real steel groans
        cue(mx, "metal_creak_2", f, -7, src=20 + 4 * k, length=1.2, fade_out=0.4, hit=20 + 4 * k, pan=0.5 - k * 0.3)
    cue(mx, "teletype_2", 375, -14, src=5, length=3.5, fade_in=0.3, fade_out=0.3, hit=5)   # tiles clatter in
    cue(mx, "reverse_cymbal_1", 480, -6, src=5.5, hit=8.45)
    cue(mx, "cinematic_impact_2", 480, -9, lp=5000)
    cue(mx, "whoosh_2", 496, -8, src=3.6, length=1.4, hit=4.3)
    cue(mx, "city_night_ambience_1", 512, -14, src=30, length=3.0, fade_in=0.4, hit=30, bus="amb")
    cue(mx, "door_open_heavy_1", 523, -8)                           # the floors' lights trip off...
    cue(mx, "camera_shutter_2", 532, -10)                           # ...and the word's windows click on


HITS_BIG = [300, 523]


def score():                                     # music: Raptom Snig - Arf (CC BY 4.0), kick returns on the car window
    from lib import realaudio as R
    return R.build(__import__(__name__), "A", 218.90, 90, music_from=0, fade_in=0.4)
