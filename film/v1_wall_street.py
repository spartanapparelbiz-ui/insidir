"""VIDEO 1 - WALL STREET AFTER DARK (20 s, 600 frames, 120 BPM = 15 frames per beat).

One continuous impossible camera journey:
  000-090  rain street: 3D camera dolly through live footage (per-frame monocular depth re-projection), type in depth
  090-120  the camera hits a rain-covered car window; droplets refract the street, then burst past the lens
  120-165  spinning wheel hub; the tunnel opens in the gaps between the spokes (luma-keyed reveal, rotation matched)
  165-240  subway tunnel at speed; the camera rolls 90 deg and flies through the light at the end
  240-300  up the elevator shaft (hyperlapse, push) and out through the top
  300-375  above the city: towers lean and fold over the camera, AFTER DARK tracked behind the buildings
  375-480  hundreds of live tiles assemble into the Empire State aerial, then melt into the full shot
  480-525  dive into a lit office window on a night facade (planar-tracked)
  525-600  the window glass is Insidir: push in, the interface fills frame, wordmark lockup
"""
import os
import numpy as np
import cv2
from lib import vfx as V, shots as S, audio as A, music as M

N_FRAMES = 600
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
        "ui_co": (UI + "/ui_company.mp4", 9.5, 4.0, {"mix": (0.33, 0.34, 0.33)}),
        "ui_land": (UI + "/ui_landing.mp4", 4.0, 5.0, {"mix": (0.33, 0.34, 0.33)}),
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
    # WALL STREET set in depth at z=5.5 between the near puddle and the far signs; scales with the dolly
    zt = 5.5
    if 18 <= f < 100:
        k = zt / max(zt - cam[2], 0.5)
        a = np.clip(seg(f, 18, 26), 0, 1) * (1 - np.clip(seg(f, 88, 100), 0, 1))
        ti = V.text_image("WALL STREET", 230, 800, -0.04)
        al = V.place((H, W), ti, 1080, 380, 0.95 * k) * a
        # occlusion: anything nearer than the type's plane (high disparity) covers it
        zmap = 10 - (10 - 1.2) * d
        al = al * np.clip((zmap - zt + 0.4) / 0.8, 0, 1)
        out = out * (1 - al) + 0.96 * al
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
    burst = V.ease_in(np.clip(seg(f, 288, 300), 0, 1), 2)
    return img * (1 - burst) + burst * 1.0


def aerial(f, with_type=True):
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
    flash = np.exp(-max(f - 300, 0) / 5) if f >= 300 else 0
    return img * (1 - flash) + flash


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


FAC_Q0 = np.float32([[1312, 868], [1432, 868], [1432, 918], [1312, 918]])   # lit window at facade frame 30
_fac_H = None


def facade_tracks():
    global _fac_H
    if _fac_H is None:
        frames = [C("facade")[i] for i in range(len(C("facade")))]
        Hs = V.planar_track(frames, (1150, 650, 450, 400), f0=30)
        _fac_H = V.smooth_homographies(Hs, 2.0)
    return _fac_H


def window_quad(i):
    Hm = facade_tracks()[int(np.clip(i, 0, len(C("facade")) - 1))]
    return cv2.perspectiveTransform(FAC_Q0[None], Hm)[0]


def ui_company(f):
    pos = max(f - 520, 0) * 1.0
    return C("ui_co")[int(min(pos, len(C("ui_co")) - 1))]


def dive(f):
    """Empire aerial pushes down; a lit window region opens (portal) into the facade shot."""
    t = seg(f, 480, 512)
    a = empire(f)
    i = int(np.clip((f - 480) * 0.9 + 6, 0, len(C("facade")) - 1))
    b = C("facade")[i]
    return S.portal(a, b, np.clip(t * 1.25, 0, 1), (1010, 470), 26, smax=26, blur=0.3)


def window_reveal(f):
    i = int(np.clip((f - 480) * 0.9 + 6, 0, len(C("facade")) - 1))
    base = C("facade")[i]
    q = window_quad(i)
    ui = ui_company(f)
    t = np.clip(seg(f, 512, 562), 0, 1)
    out, q2 = S.quad_push(base, ui, q, t, smax=17)
    # glass reflection of the facade on the window, fading as we pass the glass
    refl = 0.18 * (1 - t)
    return out * (1 - refl) + base * refl


def lockup(f):
    """The interface's own landing page: halftone wordmark answering the pointer, headline set in the same face."""
    t = np.clip(seg(f, 572, 600), 0, 1)
    pos = (f - 560) * 1.4
    img = C("ui_land")[int(min(pos, len(C("ui_land")) - 1))]
    s = 1.18 - 0.12 * V.ease_out(t, 3)
    return V.affine(img, s, 0, 0, -40, center=(960, 700))


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
    elif f < 566:
        img = window_reveal(f)
    else:
        t = seg(f, 566, 574)
        if t < 1:
            # logo-matched: push into the report's header logo, come out of the same logo on the landing page
            img = S.portal(ui_company(f), lockup(f), t, (292, 34), 26, smax=9, blur=0.2, recentre=0.6)
        else:
            img = lockup(f)
    # impact shakes on the big hits
    dx, dy, r = V.shake(f, [(30, 0.6), (90, 0.8), (120, 0.5), (240, 0.6), (300, 1.0), (480, 0.7), (525, 0.6)], amp=14)
    if abs(dx) + abs(dy) > 0.3:
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
