"""VIDEO 3 - MONEY NEVER SLEEPS (18 s, 540 frames, 120 BPM = 15 frames per beat).

Every physical action triggers a transformation:
  000-030  1958: a broker on the phone, the NYSE floor in full cry
  030-105  first bass hit: the floor freezes; the camera flies through the frozen crowd (2.5D, people pass the lens)
  105-150  the crowd's shadows open onto a telephone; the receiver is slammed down (slow, then real speed)
  150-200  the slam becomes a black car's headlights racing through a tunnel, out under an elevated road
  200-255  a steel bridge folds up out of frame and the skyscrapers behind it rise into view
  255-300  newspaper presses: the paper web turns into a glass curtain wall
  300-390  trading floors multiply on every beat: 4, 16, 64, 256, 1024 live panels
  390-465  the panels collapse into one enormous night skyline (photomosaic resolve)
  465-540  insidir rises behind the skyline, occluded by the bridge and towers
"""
import os
import numpy as np
import cv2
from lib import vfx as V, shots as S, audio as A, music as M

N_FRAMES = 540
VERTICAL = False
from lib.titles import Titles
TITLES = Titles([
    (15, 105, "NEW YORK STOCK EXCHANGE, 1958", "Markets have always\nrun on information."),
    (150, 240, "TODAY", "Companies and their insiders\nfile it with the SEC."),
    (300, 390, "SIX TOOLS, ONE SUBSCRIPTION", "Company reports, filings,\ninsider activity, people."),
    (480, 560, "COMPANY RESEARCH FROM SEC FILINGS", "Know what moves a company."),
])
PULSE = list(range(135, 465, 15))
MEDIA = os.environ.get("FILM_MEDIA", "/tmp/claude-0/-home-user-insidir/cd4dae8d-ed8d-5424-aa32-92f44807c414/scratchpad/stock")
UI = os.environ.get("FILM_UI", "/tmp/claude-0/-home-user-insidir/cd4dae8d-ed8d-5424-aa32-92f44807c414/scratchpad/ui")
PIX, ARC = MEDIA + "/pix/", MEDIA + "/arc/"
B = 15
W, H = V.W, V.H
_c = {}

FLOORS = ["nyse_floor_crowd_82", "nyse_floor_busy_185", "nyse_floor_overhead_36", "nyse_floor_wide_49", "nyse_floor_wide2_74",
          "nyse_floor_posts_732", "trading_post_crowd_1949_588", "floor_phone_clerks_169", "floor_phone_booths_684",
          "broker_phone_closeup_220", "ticker_tape_projection_584", "ticker_tape_projection2_717", "tape_ticker_running_375",
          "press_web_running_880", "pressroom_wide_911", "operators_office_1951_295", "office_clerks_1928_258",
          "wall_street_flags_1921_112", "broadway_crowd_1921_151", "wall_street_1920_139"]


def C(name):
    if name not in _c:
        p, st, du, kw = {
            "broker": (ARC + "broker_phone_closeup_220.mp4", 2.4, 2.4, {}),
            "crowd": (ARC + "nyse_floor_crowd_82.mp4", 0.5, 5.0, {}),
            "phone": (PIX + "p_bakelitephone119507.mp4", 14.0, 3.0, {}),
            "tunnel": (PIX + "q_tunneldrive194.mp4", 8.0, 6.0, {}),
            "trails": (PIX + "q_nighttrails190483.mp4", 1.0, 6.0, {}),
            "bridge": (PIX + "r_steelbridge167083.mp4", 11.0, 6.0, {}),
            "towers": (PIX + "s_glasstowersup55933.mp4", 2.0, 6.0, {}),
            "press": (ARC + "press_web2_898.mp4", 0.5, 6.0, {}),
            "facade": (PIX + "s_facadereflection214695.mp4", 0.5, 6.0, {}),
            "skyline": (PIX + "i_brooklynbridgenight7260.mp4", 2.0, 6.0, {}),
            "ui_co": (UI + "/ui_company.mp4", 9.5, 4.0, {"mix": (0.33, 0.34, 0.33)}),
        }[name]
        _c[name] = V.load(p, st, du, **kw)
    return _c[name]


_floor_clips = None


def floor_clips():
    global _floor_clips
    if _floor_clips is None:
        _floor_clips = [V.load(ARC + n + ".mp4", 0, 2.4, size=(480, 270)) for n in FLOORS]
    return _floor_clips


def seg(f, a, b):
    return (f - a) / float(b - a)


# ------------------------------------------------------------------ 1. the floor, frozen

FREEZE = 30


def crowd_live(f):
    return C("crowd").at(min(f * 1.2, len(C("crowd")) - 1))


def opening(f):
    if f < 15:
        return C("broker")[int(f * 1.3)]
    return crowd_live(f)


def flythrough(f):
    fr = crowd_live(FREEZE)
    d = V.depth(fr, "v3crowd_freeze")
    t = np.clip(seg(f, FREEZE, 112), 0, 1)
    # a breath of stillness, then the camera accelerates into the crowd and threads between people
    z = 0.7 * t + 2.6 * V.ease_in(t, 2.0)
    cam = (0.35 * np.sin(t * 3.0) * t, -0.15 * t, z, -0.06 * np.sin(t * 3.0), 0.04 * t, 0.05 * np.sin(t * 2))
    out = V.reproject(fr, d, cam, f=1300, near=1.0, far=9.0, pass_z=0.35)
    sp = 0.7 / 82 + 2.6 * V.ease_in(np.clip(t + 1 / 82, 0, 1), 2.0) - 2.6 * V.ease_in(t, 2.0)
    return V.radial_blur(out, sp * 0.5, None, 8)


# ------------------------------------------------------------------ 2. the slam

SLAM = 135          # frame where the receiver hits the cradle (beat 9)
PHONE_HIT = 2.3     # source seconds into the 'phone' clip where the receiver lands


def phone_pos(f):
    """Source frame: slow motion as the hand brings the receiver down, real speed through the hit."""
    hit = PHONE_HIT * 30
    if f < SLAM:
        return hit - (SLAM - f) * 0.45
    return hit + (f - SLAM) * 1.0


def phone(f):
    img = C("phone").at(np.clip(phone_pos(f), 0, len(C("phone")) - 1))
    return V.affine(img, 1.15, 0, -60, 40)


def crowd_to_phone(f):
    t = seg(f, 104, 116)
    a = flythrough(f)
    b = phone(f)
    out, _ = S.luma_reveal(a, b, t, lo=0.0, hi=0.9)              # the phone appears out of the crowd's shadows
    return out


def tunnel(f):
    pos = (f - SLAM) * 2.2 + 90
    return C("tunnel").at(min(pos, len(C("tunnel")) - 1))


def slam_to_car(f):
    """The receiver's downward hit continues as the tunnel's light streaks: both frames are blurred along the
    same measured motion direction and the cut lands on the impact frame."""
    t = seg(f, SLAM - 3, SLAM + 6)
    a = phone(f)
    b = tunnel(f)
    a = V.flow_blur(a, np.dstack([np.zeros((H, W), np.float32), np.full((H, W), 90 * (1 - t), np.float32)]), 7)
    k = V.smooth(t)
    return a * (1 - k) + b * k


def car(f):
    if f < 166:
        img = np.clip(tunnel(f) * 1.6 + 0.02, 0, 1)
        return V.radial_blur(img, 0.05, (700, 720), 6)
    t = seg(f, 166, 180)
    b = C("trails").at(min((f - 166) * 1.5 + 30, len(C("trails")) - 1))
    if t < 1:
        return V.flow_morph(np.clip(tunnel(f) * 1.6 + 0.02, 0, 1), b, V.smooth(t))
    return b


# ------------------------------------------------------------------ 3. the bridge folds into the city

def bridge(f):
    return C("bridge").at(min((f - 190) * 1.6, len(C("bridge")) - 1))


def towers(f):
    img = C("towers").at(min((f - 210) * 1.0, len(C("towers")) - 1))
    return img


def bridge_fold(f):
    if f < 200:
        return car(f)
    t = np.clip(seg(f, 214, 250), 0, 1)
    br = bridge(f)
    tw = towers(f)
    if t <= 0:
        k = V.smooth(seg(f, 200, 206))
        return car(f) * (1 - k) + br * k
    # upper half of the bridge swings up and over the camera, the lower half falls away: the city is behind it
    up, mu = V.fold(br, 540, -1.45 * V.ease_in(t, 1.8), f=1100, upper=True)
    lo, ml = V.fold(br, 540, -1.45 * V.ease_in(t, 1.8), f=1100, upper=False)
    rise = V.affine(tw, 1.0 + 0.35 * (1 - V.ease_out(t)), 0, 0, 260 * (1 - V.ease_out(t)))
    out = rise * (1 - np.maximum(mu, ml)) + up * mu + lo * ml
    shade = 1 - 0.5 * V.smooth(t)
    return np.where(np.maximum(mu, ml) > 0.5, out * shade, out)


# ------------------------------------------------------------------ 4. presses become architecture

_fac_H = None


def facade_tracks():
    global _fac_H
    if _fac_H is None:
        fr = [C("facade")[i] for i in range(len(C("facade")))]
        _fac_H = V.smooth_homographies(V.planar_track(fr, (300, 150, 1100, 800), f0=0), 2.0)
    return _fac_H


def press(f):
    img = C("press").at(min((f - 250) * 1.8, len(C("press")) - 1))
    return V.affine(img, 1.1, 0)


def facade(f):
    i = int(min((f - 270) * 1.0, len(C("facade")) - 1))
    img = C("facade")[max(i, 0)]
    return img


def press_to_facade(f):
    if f < 268:
        return press(f)
    t = seg(f, 268, 280)
    if t < 1:
        a = V.affine(press(f), 1.0, -90 * V.ease_in(t, 2), 0, 0)    # the web swings vertical...
        return V.flow_morph(a, facade(f), V.smooth(t))               # ...and becomes the curtain wall
    return facade(f)


# ------------------------------------------------------------------ 5. multiply, collapse

def panels(f):
    level = 1 + int((f - 300) // B)                    # a new subdivision on every beat
    level = min(level, 5)
    lt = ((f - 300) % B) / B
    clips = floor_clips()
    n = 2 ** level
    out = np.zeros((H, W), np.float32)
    cw, ch = W / n, H / n
    rng = np.random.default_rng(level)
    order = rng.permutation(len(clips) * 64)
    for k in range(n * n):
        r, c = divmod(k, n)
        cl = clips[order[k % len(order)] % len(clips)]
        im = cl[(f * (1 + k % 3) + k * 5) % len(cl)]
        x0, x1, y0, y1 = int(c * cw), int((c + 1) * cw), int(r * ch), int((r + 1) * ch)
        tile = cv2.resize(im, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
        out[y0:y1, x0:x1] = tile
        if n <= 16:
            out[y0:y0 + 2, x0:x1] = 0
            out[y0:y1, x0:x0 + 2] = 0
    # each subdivision lands with a punch-in that settles
    s = 1 + 0.12 * np.exp(-lt * 6)
    return V.affine(out, s, 0)


_bank = None
_mosaic = None


def bank():
    global _bank
    if _bank is None:
        clips = [V.load(ARC + n + ".mp4", 0, 2.4, fps=10, size=(96, 54)) for n in FLOORS]
        _bank = V.TileBank(clips, 48, 27, per_clip=24)
    return _bank


def mosaic():
    global _mosaic
    if _mosaic is None:
        _mosaic = S.Mosaic(bank(), 32, 32, skyline(390), seed=8)
    return _mosaic


def skyline(f):
    img = C("skyline").at(min(max(f - 380, 0) * 0.8, len(C("skyline")) - 1))
    return np.clip(V.affine(img, 1.08, 0, 0, 30) * 1.35, 0, 1)


def collapse(f):
    tgt = skyline(f)
    match = 0.55 + 0.45 * V.smooth(seg(f, 390, 425))
    resolve = V.ease_io(np.clip(seg(f, 418, 462), 0, 1))
    img = mosaic().render(tgt, f - 390, 1.1, match, resolve)
    z = 1.25 - 0.25 * V.ease_out(seg(f, 390, 465), 2)
    return V.affine(img, z, 0) * 1.25


# ------------------------------------------------------------------ 6. insidir behind the skyline

def halftone_word(text, size, gap=9):
    """The landing page's halftone wordmark, rebuilt: a dot per grid cell sized by the letter's coverage."""
    ti = V.text_image(text, size, 800, -0.02)
    h, w = ti.shape
    cov = cv2.resize(cv2.GaussianBlur(ti, (0, 0), gap * 0.4), (w // gap, h // gap), interpolation=cv2.INTER_AREA)
    out = np.zeros_like(ti)
    for (yy, xx), v in np.ndenumerate(cov):
        if v > 0.05:
            cv2.circle(out, (xx * gap + gap // 2, yy * gap + gap // 2), max(1, int(gap * 0.5 * np.sqrt(v))), 1.0, -1, cv2.LINE_AA)
    return out


_hw = None


def sky_index(f):
    return int(min(max(f - 380, 0) * 0.8, len(C("skyline")) - 1))


def reveal(f):
    return skyline(f)


_ht = None
SKY_CX = 1450


def post(f, img, M):
    """insidir rises behind the bridge and the towers, dot by dot, at full vertical resolution."""
    global _ht
    if f < 465:
        return img
    if _ht is None:
        _ht = S.Halftone("insidir", 400, gap=10, seed=3)
    h, w = _ht.shape
    d = V.affine(V.depth(C("skyline")[sky_index(f)], f"v3sky_{sky_index(f)}"), 1.08, 0, 0, 30)
    dv = cv2.warpAffine(d, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    t = np.clip(seg(f, 465, 500), 0, 1)
    if img.shape[1] > img.shape[0]:                           # 16:9
        sc, cx = 1100.0 / w, 960
        y = 700 - 330 * V.ease_out(t, 3)
    else:                                                     # 9:16
        sc, cx = 900.0 / w, 540
        y = 1230 - 420 * V.ease_out(t, 3)                    # rises from behind the skyline
    A_ = np.float32([[sc, 0, cx - sc * w / 2], [0, sc, y - sc * h / 2]])
    dots = _ht.image(V.ease_out(np.clip(seg(f, 465, 495), 0, 1), 2) * 1.08, 0.05)
    a = cv2.warpAffine(dots, A_, (img.shape[1], img.shape[0]), flags=cv2.INTER_AREA)
    a = a * (1 - V.depth_layer_mask(dv, 0.16, 0.05))          # the bridge and near towers stay in front
    glow = cv2.GaussianBlur(a, (0, 0), 8) * 0.3
    return img * (1 - a) + 0.95 * a + glow * (1 - img)


def focus(f):
    from lib.vertical import keyframes
    return keyframes([(0, 1150), (14, 1250), (15, 960), (104, 960), (116, 1000), (135, 1000), (136, 640),
                      (166, 760), (180, 1060), (200, 960), (380, 960), (400, SKY_CX), (540, SKY_CX)], f), 1.0


def frame(f):
    if f < FREEZE:
        img = opening(f)
    elif f < 104:
        img = flythrough(f)
    elif f < 116:
        img = crowd_to_phone(f)
    elif f < SLAM - 3:
        img = phone(f)
    elif f < SLAM + 6:
        img = slam_to_car(f)
    elif f < 200:
        img = car(f)
    elif f < 255:
        img = bridge_fold(f)
    elif f < 300:
        img = press_to_facade(f) if f >= 250 else press(f)
    elif f < 390:
        img = panels(f)
    elif f < 465:
        img = collapse(f)
    else:
        img = reveal(f)
    hits = [(FREEZE, 1.0), (SLAM, 1.3), (200, 0.5), (255, 0.6), (300, 0.7), (315, 0.4), (330, 0.4), (345, 0.4), (360, 0.5), (465, 0.8)]
    dx, dy, r = V.shake(f, [(FREEZE, 0.5), (SLAM, 0.6), (465, 0.3)], amp=8)
    img = V.affine(img, 1.02, r, dx, dy)
    return V.grade(np.asarray(img, np.float32), contrast=1.25).astype(np.float32)


def prepare():
    V.depth(crowd_live(FREEZE), "v3crowd_freeze")
    for f in range(465, 541):
        i = int(min(max(f - 380, 0) * 0.8, len(C("skyline")) - 1))
        V.depth(C("skyline")[i], f"v3sky_{i}")
    facade_tracks()
    floor_clips()
    mosaic()
    for n in ["broker", "crowd", "phone", "tunnel", "trails", "bridge", "towers", "press", "facade"]:
        C(n)


# ------------------------------------------------------------------ score

def score():
    mix = A.Mix(N_FRAMES / 30 + 1.0)
    T = lambda f: f / 30.0
    ir = A.make_ir(2.0, 0.55)
    mix.add(A.crowd(T(FREEZE) + 0.4, 1.0), 0, 0.55, bus="amb")                              # the floor roars...
    mix.add(A.impact(2.2, 38, 1.0), T(FREEZE), 1.0, bus="fx")                                # ...first bass hit: silence
    mix.add(A.sub_drop(1.6, 70, 24), T(FREEZE), 0.8, bus="fx")
    mix.add(A.drone(A.note_hz("D1"), T(80)), T(FREEZE), 0.4, bus="pad")
    mix.add(A.reverse_swell(1.4, 220), T(104) - 1.4, 0.5, bus="fx")
    for k in range(int(T(75) / (A.BEAT / 4))):                                                # clock-like ticks while frozen
        mix.add(A.click(5200, 0.008, 10), T(FREEZE) + k * A.BEAT / 4, 0.12 + 0.002 * k, pan=0.3 * np.sin(k), bus="drums")
    mix.add(A.whoosh(2.0, 120, 6000, 0.9), T(50), 0.45, bus="fx")
    mix.add(A.phone_slam(), T(SLAM), 1.0, bus="fx")
    mix.add(A.impact(1.6, 45, 0.8), T(SLAM), 0.8, bus="fx")
    mix.add(A.car_pass(1.6), T(SLAM) + 0.1, 0.7, bus="fx")
    mix.add(A.rumble(T(60)), T(SLAM), 0.4, bus="amb")
    mix.add(A.whoosh(0.7, 300, 5000), T(182), 0.4, bus="fx")
    mix.add(A.ratchet(1.2, 22, 900), T(214), 0.45, bus="fx")                                 # steel folding
    mix.add(A.impact(1.4, 50, 0.4), T(250), 0.5, bus="fx")
    mix.add(A.press(T(30)), T(250), 0.5, bus="amb")
    for k, f in enumerate((278, 285, 292)):
        mix.add(A.impact(0.8, 70, 0.6), T(f), 0.55, bus="fx")
    # relentless percussive house from the slam to the end
    bass = [(0, "D2", 0.2), (0.5, "D2", 0.35), (1.0, "F2", 0.2), (1.5, "D2", 0.35), (2.5, "A1", 0.35), (3.0, "C2", 0.2), (3.5, "D2", 0.35)]
    st = [(1.5, ["D3", "F3", "A3"]), (2.75, ["D3", "F3", "A3"]), (3.75, ["C3", "E3", "G3"])]
    kicks = M.groove(mix, 9, 26, bass=bass, stabs=st, swing=0.0, ghost_kicks=True, intensity=1.05)
    for b in range(9, 26):                                                                     # extra toms / rims on 16ths
        for s in (1, 3):
            mix.add(A.rim(), T(b * B) + s * A.BEAT / 4, 0.18, pan=0.5 if s == 1 else -0.5, bus="drums")
    for k, f in enumerate((300, 315, 330, 345, 360, 375)):                                     # each multiplication
        mix.add(A.shutter(), T(f), 0.5, bus="fx")
        mix.add(A.click(2400 + 600 * k, 0.02, 4), T(f), 0.4, bus="fx")
    mix.add(A.riser(T(75), 200, 8000), T(390), 0.5, bus="fx")
    kicks += M.groove(mix, 31, 36, bass=bass, stabs=st, ghost_kicks=True, intensity=1.1)
    mix.add(A.impact(3.0, 36, 0.7), T(465), 1.0, bus="fx")
    mix.add(A.sub_drop(1.5, 80, 26), T(465), 0.6, bus="fx")
    mix.add(A.stab([A.note_hz(x) for x in ["D3", "F3", "A3", "C4"]], 2.2, 1500, 0.9), T(465), 0.5, bus="synth")
    mix.sidechain("bass", kicks)
    mix.sidechain("synth", kicks, 0.5)
    mix.sidechain("amb", kicks, 0.4)
    mix.reverb("synth", 0.4, ir)
    mix.reverb("fx", 0.25, ir)
    mix.reverb("drums", 0.05, A.make_ir(0.8, 0.2))
    out = mix.master()
    return out[:, : int(N_FRAMES / 30 * A.SR)]


# ------------------------------------------------------------------ real recordings (replaces the synth score)

def cues(mx):
    from lib.realaudio import cue
    cue(mx, "crowd_trading_floor_1", 0, -4, src=20, length=FREEZE / 30 + 0.02, fade_in=0.05, hit=20, bus="amb")
    cue(mx, "telephone_ring_old_2", 2, -14, src=0.2, length=0.9, fade_out=0.3, hit=0.28)
    cue(mx, "cinematic_impact_1", FREEZE, -6, lp=3500)                                       # time stops
    cue(mx, "heartbeat_1", 45, -9, src=0.5, length=2.5, hit=0.95, bus="amb")
    cue(mx, "phone_hangup_slam_2", SLAM, -3)                                                 # the slam
    cue(mx, "car_pass_1", 160, -5)
    cue(mx, "metal_creak_2", 214, -8, src=90, length=1.6, fade_out=0.4, hit=90)              # the bridge folds
    cue(mx, "printing_press_2", 250, -8, src=150, length=1.8, fade_in=0.05, fade_out=0.3, hit=150)
    cue(mx, "teletype_2", 300, -16, src=10, length=3.0, fade_out=0.2, hit=10)
    cue(mx, "wind_high_2", 455, -14, src=55, length=2.8, fade_in=0.5, hit=55, bus="amb")


HITS_BIG = [FREEZE, SLAM]


def score():                                     # music: Raptom Snig - Vidom (CC BY 4.0), slam on the phone slam
    from lib import realaudio as R
    return R.build(__import__(__name__), "C", 206.25, SLAM, music_from=FREEZE, fade_in=0.01)
