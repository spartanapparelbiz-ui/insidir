"""VIDEO 2 - THE OBSESSION (25 s, 750 frames, 120 BPM = 15 frames per beat; beat switch at frame 480).

  000-105  the protagonist walks in clockwork time (holds, then lurches on every tick, flow-retimed) while a
           depth-based dolly-zoom stretches the corridor around him; WHO SOLD? is set in depth behind him
  105-165  the camera pushes into his eye (tracked), the eye becomes an extreme macro iris
  165-225  through the pupil into a watch dial (portal, centre/radius matched)
  225-330  the second hand sweeps... and freezes; the camera keeps orbiting the frozen watch (2.5D)
  330-420  frozen protagonist; hundreds of filing pages halt mid-air around him (3D quads, depth-occluded)
  420-480  the room rolls 180 degrees around him
  480-540  DROP. A figure walks into a doorway of light; the light becomes the 1958 NYSE floor
  540-675  accelerating chain of circle-matched transformations (dial, iris, hub, tunnel...) on 16th notes
  675-750  the last iris opens back onto him; insidir assembles in ink on the glass hall behind him
"""
import os
import numpy as np
import cv2
from lib import vfx as V, shots as S, audio as A, music as M, pages as P

N_FRAMES = 750
VERTICAL = False
from lib.titles import Titles
TITLES = Titles([
    (15, 105, "THE HEADLINE", "Headlines tell you\nwhat happened."),
    (120, 225, "THE FILING", "Filings tell you\nwho did what."),
    (240, 330, "FORM 4", "When executives trade their own\ncompany's stock, they report it."),
    (345, 465, "SEC EDGAR", "Insider trades. Financials. Filings.\nAll on the public record."),
    (555, 645, "INSIDIR", "Every number linked\nto the document it came from."),
    (690, 770, "COMPANY RESEARCH FROM SEC FILINGS", "Know what moves a company."),
])
PULSE = list(range(480, 660, 15))
MEDIA = os.environ.get("FILM_MEDIA", "/tmp/claude-0/-home-user-insidir/cd4dae8d-ed8d-5424-aa32-92f44807c414/scratchpad/stock")
UI = os.environ.get("FILM_UI", "/tmp/claude-0/-home-user-insidir/cd4dae8d-ed8d-5424-aa32-92f44807c414/scratchpad/ui")
PIX, ARC = MEDIA + "/pix/", MEDIA + "/arc/"
B = 15
W, H = V.W, V.H
_c = {}


def C(name):
    if name not in _c:
        p, st, du, kw = {
            "walk": (PIX + "j_mansuitwalk199623.mp4", 0.0, 12.0, {}),
            "eye": (PIX + "k_eyemacro34848.mp4", 3.2, 4.5, {}),
            "watch": (PIX + "l_watchticking15615.mp4", 2.0, 6.0, {}),
            "door": (PIX + "n_doorlight203363.mp4", 1.0, 8.0, {}),
            "floor": (ARC + "nyse_floor_crowd_82.mp4", 0.0, 6.3, {}),
            "post": (ARC + "nyse_floor_overhead_36.mp4", 0.0, 5.9, {}),
            "dial": (PIX + "p_bakelitephone119507.mp4", 6.0, 6.0, {}),
            "hub": (PIX + "c_wheels5158.mp4", 0.0, 4.0, {}),
            "tunnel": (PIX + "d_tunnelrails25392.mp4", 2.0, 4.0, {}),
            "empire": (PIX + "f_empirestatedusk272511.mp4", 0.5, 4.0, {}),
            "ticker": (ARC + "ticker_tape_projection2_717.mp4", 0.0, 3.4, {}),
        }[name]
        _c[name] = V.load(p, st, du, **kw)
    return _c[name]


def seg(f, a, b):
    return (f - a) / float(b - a)


# ------------------------------------------------------------------ 1. clockwork corridor

def walk_pos(f):
    """Hold ten frames, lurch on the tick: each beat advances the source 15 frames in the last 5 output frames."""
    beat, k = divmod(f, B)
    step = V.ease_io(np.clip((k - 10) / 5.0, 0, 1), 2)
    return 20 + (beat + step) * 15 * 0.9


def walk(f):
    p = walk_pos(f)
    return C("walk").at(p), p


SUBJ_Z = 2.4


def corridor_cam(t):
    cz = -0.75 * V.ease_io(t, 2)                                  # camera retreats from him...
    fo = 1400 * (1.06 + 0.32 * V.ease_io(t, 2)) * (SUBJ_Z - cz) / SUBJ_Z   # ...zooming in: he holds size, the hall warps
    return (0, -0.05 * t, cz), fo


def corridor(f, text=False):
    img, p = walk(f)
    i = int(round(p))
    d = V.depth(C("walk")[i], f"v2walk_{i}")
    t = np.clip(f / 105.0, 0, 1)
    cam, fo = corridor_cam(t)
    out = V.reproject(img, d, cam, f=1400, near=1.0, far=9.0, f_out=fo)
    if text and 28 <= f < 104:
        a = np.clip(seg(f, 28, 33), 0, 1) * (1 - V.smooth(seg(f, 92, 104)))
        dz = V.reproject(d, d, cam, f=1400, near=1.0, far=9.0, f_out=fo)
        out, _ = S.kinetic_word(out, "WHO SOLD?", 300, 960, 430, a, dz, 0.62, scale=1 + 0.35 * t, value=0.03)
    return out


SUBJ_SCALE = 1.38      # corridor_cam(1) magnifies the subject plane by this much about the frame centre


# ------------------------------------------------------------------ 2. into the eye

_eye_track = None


def eye_track():
    """His eye, measured on the push-start frame, template-tracked through the stutter."""
    global _eye_track
    if _eye_track is None:
        p0 = walk_pos(105)
        f0 = C("walk").at(p0)
        u8 = (np.clip(f0, 0, 1) * 255).astype(np.uint8)
        e0 = np.array([1035.0, 332.0])      # measured on the push-start frame (iris radius ~8 px)
        tpl = u8[int(e0[1]) - 20:int(e0[1]) + 20, int(e0[0]) - 30:int(e0[0]) + 30]
        tr = {}
        for f in range(105, 170):
            im = (np.clip(C("walk").at(walk_pos(f)), 0, 1) * 255).astype(np.uint8)
            y0, x0 = int(e0[1]) - 80, int(e0[0]) - 100
            win = im[y0:y0 + 160, x0:x0 + 200]
            r = cv2.matchTemplate(win, tpl, cv2.TM_CCOEFF_NORMED)
            _, _, _, mx = cv2.minMaxLoc(r)
            tr[f] = np.array([x0 + mx[0] + 30, y0 + mx[1] + 20], float)
        ks = sorted(tr)
        arr = np.array([tr[k] for k in ks])
        from scipy.ndimage import gaussian_filter1d
        arr = gaussian_filter1d(arr, 2, axis=0, mode="nearest")
        _eye_track = {k: arr[i] for i, k in enumerate(ks)}
    return _eye_track


EYE_MACRO = (820, 490, 170)     # pupil centre and iris radius in the macro shot


def into_eye(f):
    t = np.clip(seg(f, 105, 160), 0, 1)
    s = np.exp(np.log(26.0) * V.ease_in(t, 2.0))
    e = eye_track()[min(f, 169)]
    e = np.array([W / 2, H / 2]) + (e - np.array([W / 2, H / 2])) * SUBJ_SCALE   # through the corridor camera
    img = corridor(f, text=False) if f < 128 else V.affine(walk(f)[0], SUBJ_SCALE, 0)
    if 120 <= f < 128:                                    # hand-off from 3D to 2D while the face fills frame
        k = V.smooth(seg(f, 120, 128))
        img = img * (1 - k) + V.affine(walk(f)[0], SUBJ_SCALE, 0) * k
    A_, c2 = S.push(img, s, e, V.smooth(t))
    A_ = V.radial_blur(A_, 0.06 * V.ease_in(t, 2) * 2, c2, 8)
    # the macro iris, placed so its iris matches his iris (about 8 px radius at 1x), takes over through a matte
    # that starts at the iris and grows past the frame
    k = V.smooth(seg(f, 136, 160))
    if k > 0:
        r_now = 8 * SUBJ_SCALE * s
        sm = r_now / EYE_MACRO[2]
        macro = C("eye")[int(np.clip(f - 130, 0, len(C("eye")) - 1))]
        Bm = V.affine(macro, sm, 0, c2[0] - EYE_MACRO[0], c2[1] - EYE_MACRO[1], center=EYE_MACRO[:2],
                      border=cv2.BORDER_REFLECT)
        m = S.circle(c2, r_now * (1.2 + 9 * k ** 2), r_now * 0.8 + 10)
        A_ = A_ * (1 - m) + Bm * m
    return A_


WATCH = (750, 500, 520)


def watch_centered(i, scale=1.15):
    w = C("watch")[i]
    return V.affine(w, scale, 0, W / 2 - WATCH[0], H / 2 - WATCH[1], center=WATCH[:2], border=cv2.BORDER_REPLICATE)


def eye_to_watch(f):
    t = seg(f, 165, 226)
    macro_i = int(np.clip(f - 130, 0, len(C("eye")) - 1))
    macro = C("eye")[macro_i]
    s_prev = (8 * SUBJ_SCALE * np.exp(np.log(26.0))) / EYE_MACRO[2]
    a = V.affine(macro, s_prev, 0, W / 2 - EYE_MACRO[0], H / 2 - EYE_MACRO[1], center=EYE_MACRO[:2], border=cv2.BORDER_REPLICATE)
    b = watch_centered(int(np.clip(f - 165, 0, 80)))
    pupil_r = 60 * s_prev
    return S.portal(a, b, np.clip(t, 0, 1), (W / 2, H / 2), pupil_r * 0.75, smax=16, blur=0.2, recentre=0.0)


FREEZE = 255


def watch_shot(f):
    if f < FREEZE:
        return watch_centered(int(np.clip(f - 165, 0, len(C("watch")) - 1)))
    # time stops; the camera does not
    fr = watch_centered(FREEZE - 165)
    d = V.depth(fr, "v2watch_freeze")
    t = np.clip(seg(f, FREEZE, 330), 0, 1)
    a = V.ease_io(t, 2)
    cam = (0.32 * np.sin(a * 1.6), -0.12 * a, 0.55 * a, -0.08 * np.sin(a * 1.6), 0.05 * a, 0.12 * a)
    out = V.reproject(fr, d, cam, f=1400, near=1.0, far=5.0)
    return out


# ------------------------------------------------------------------ 3. pages, frozen time, the room rolls

PAGE_SRC = 200                    # walk-clip frame used as the frozen protagonist
_cloud = None


def cloud():
    global _cloud
    if _cloud is None:
        _cloud = P.Cloud(n=380, subject_z=SUBJ_Z, seed=9, avoid=(0.0, 0.0, 0.42), xr=1.9, zr=(1.25, 4.4))
    return _cloud


def pages(f):
    fr = C("walk")[PAGE_SRC]
    d = V.depth(fr, f"v2walk_{PAGE_SRC}")
    t = np.clip(seg(f, 330, 480), 0, 1)
    a = V.ease_io(t, 2)
    roll = np.radians(30) * V.ease_io(np.clip(seg(f, 400, 480), 0, 1), 2)      # a slow, gentle turn
    cam = (0.10 * np.sin(a * 2.0 - 0.5) + 0.04, -0.02, -0.18 + 0.20 * a, -0.025 * np.sin(a * 2.0 - 0.5), 0.01, roll)
    fo = 1400 * (1.06 + 0.10 * np.sin(roll))
    img = V.reproject(fr, d, cam, f=1400, near=1.0, far=9.0, f_out=fo)
    dz = V.reproject(d, d, cam, f=1400, near=1.0, far=9.0, f_out=fo)
    # pages fly in, then lock in place on the beat (frame 345): time freezes around him
    drift = (1 - V.ease_out(np.clip(seg(f, 330, 345), 0, 1), 3)) * 6.0
    camp = cam
    out = cloud().render(img, camp, dz, f=fo, focus=SUBJ_Z - cam[2], drift=drift, exposure=0.95)
    return out


# ------------------------------------------------------------------ 4. the doorway and the floor

def doorway(f):
    pos = max(f - 470, 0) * 2.0
    img = C("door").at(min(pos, len(C("door")) - 1))
    t = np.clip(seg(f, 488, 512), 0, 1)
    s = np.exp(np.log(6.0) * V.ease_in(t, 2))
    img, c2 = S.push(img, s, (1000, 600), V.smooth(t))
    # the open door blooms until the light is the whole frame
    bloom = cv2.GaussianBlur(np.clip(img - 0.6, 0, 1), (0, 0), 30) * (1.5 + 3 * t)
    return np.clip(img + bloom, 0, 0.92)


def floor(f):
    pos = max(f - 478, 0) * 1.0
    return C("floor").at(min(pos, len(C("floor")) - 1))


def door_to_floor(f):
    t = np.clip(seg(f, 496, 516), 0, 1)
    a = doorway(f)
    b = floor(f)
    out, _ = S.luma_reveal(a, b, t, lo=0.0, hi=1.0, invert=True)     # the light itself becomes the floor
    return out


# ------------------------------------------------------------------ 5. accelerating transformations

CIRCLES = {
    "post": ((1080, 200), 260), "dial": ((960, 630), 220), "watch": ((750, 500), 520), "eye": ((820, 490), 170),
    "hub": ((333, 535), 150), "tunnel": ((960, 528), 330), "empire": ((980, 330), 300),
}
CHAIN = ["watch", "dial", "hub", "tunnel", "watch", "dial", "eye"]
CHAIN_START, CHAIN_LEN = 555, 15                     # one shot per beat: calm, not strobing
CUTS = CHAIN_START + np.arange(len(CHAIN) + 1) * CHAIN_LEN


def chain_angle(f):
    t = np.clip(seg(f, CHAIN_START, CUTS[-1]), 0, 1)
    return 50 * t                                     # one slow continuous roll across every cut


def chain(f):
    k = int(np.clip(np.searchsorted(CUTS, f, side="right") - 1, 0, len(CHAIN) - 1))
    lt = (f - CUTS[k]) / CHAIN_LEN
    name = CHAIN[k]
    (cx, cy), r = CIRCLES[name]
    clip = C(name)
    img = clip.at(min((f - CHAIN_START) * 0.8 + k * 9, len(clip) - 1))
    R0 = 330                                          # every circle matched to the same on-screen radius...
    s = R0 / r * (1 + 0.22 * lt)                      # ...and pushed at the same rate, so the move never breaks
    return V.affine(img, s, chain_angle(f), W / 2 - cx, H / 2 - cy, center=(cx, cy), border=cv2.BORDER_REPLICATE)


# ------------------------------------------------------------------ 6. the door

DOOR = (1003, 520)          # centre of the lit doorway on the plate (before the push)
FIN = 660


def door_cam(f):
    e = V.ease_out(np.clip(seg(f, FIN, 750), 0, 1), 2)
    M = cv2.getRotationMatrix2D(DOOR, 0, 1.0 + 0.30 * e)
    return np.vstack([M, [0, 0, 1]])


def door_final(f):
    img = C("door").at(min(14 + (f - FIN) * 0.9, len(C("door")) - 1))
    return cv2.warpAffine(img, door_cam(f)[:2], (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def to_door(f):
    t = np.clip(seg(f, FIN, 676), 0, 1)
    return S.portal(chain(FIN - 1), door_final(f), t, (W / 2, H / 2), 330 * 0.35, smax=6, blur=0.12, recentre=0)


_ht = None


def post(f, img, M):
    """insidir in the doorway's light, inked in dot by dot; his silhouette stays in front of it."""
    global _ht
    if f < 684:
        return img
    if _ht is None:
        _ht = S.Halftone("insidir", 400, gap=12, seed=12)
    h, w = _ht.shape
    dots = _ht.image(V.ease_out(np.clip(seg(f, 684, 716), 0, 1), 2) * 1.08, 0.05)
    sc = 300.0 * float(M[0, 0]) / w                    # ~264 plate px wide, inside the door's light
    c = np.vstack([M, [0, 0, 1]]) @ door_cam(f) @ np.array([DOOR[0], DOOR[1] - 60, 1.0])
    A_ = np.float32([[sc, 0, c[0] - sc * w / 2], [0, sc, c[1] - sc * h / 2]])
    a = cv2.warpAffine(dots, A_, (img.shape[1], img.shape[0]), flags=cv2.INTER_AREA)
    figure = cv2.dilate((img < 0.5).astype(np.float32), np.ones((5, 5), np.uint8))
    figure = cv2.GaussianBlur(figure, (0, 0), 1.5)
    a = a * (1 - figure)
    img = img * (1 - a * 0.92)
    # the line under it is set in the same ink, in the same light
    k = V.smooth(seg(f, 700, 710)) if img.shape[0] > img.shape[1] else 0.0   # 9:16 only; 16:9 uses a title
    if k > 0:
        ti = V.text_image("Know what moves a company.", max(16, int(40 * float(M[0, 0]) / 1.778)), 600, 0.0, pad=20)
        t = V.place(img.shape, ti, c[0], c[1] + sc * h / 2 + 34 * float(M[0, 0]) / 1.778, 1.0) * k * (1 - figure)
        img = img * (1 - t * 0.9)
    return img


def frame(f):
    if f < 105:
        img = corridor(f)
    elif f < 165:
        img = into_eye(f)
    elif f < 226:
        img = eye_to_watch(f) if f < 224 else watch_shot(f)
    elif f < 330:
        img = watch_shot(f)
    elif f < 480:
        img = pages(f)
    elif f < 494:
        t = seg(f, 480, 494)                          # on the drop the frozen room gives way to the floor
        img, _ = S.luma_reveal(pages(479), floor(f), t, lo=0.0, hi=1.0)
    elif f < CHAIN_START:
        img = floor(f)
    elif f < FIN:
        img = chain(f)
    elif f < 676:
        img = to_door(f)
    else:
        img = door_final(f)
    if f < FIN:
        dx, dy, r = V.shake(f, [(480, 0.4)], amp=8)
        img = V.affine(img, 1.02, r, dx, dy)
    return V.grade(np.asarray(img, np.float32), contrast=1.2).astype(np.float32)


def focus(f):
    from lib.vertical import keyframes
    if f >= FIN:
        p = door_cam(f) @ np.array([DOOR[0], DOOR[1], 1.0])
        return float(p[0]), 1.0
    return keyframes([(0, 975), (104, 975), (105, 975), (160, 960), (330, 960), (480, 960), (555, 960)], f), 1.0


def prepare():
    for f in range(0, 128):
        i = int(round(walk_pos(f)))
        V.depth(C("walk")[i], f"v2walk_{i}")
    V.depth(C("walk")[PAGE_SRC], f"v2walk_{PAGE_SRC}")
    V.depth(watch_centered(FREEZE - 165), "v2watch_freeze")
    eye_track()
    for n in set(CHAIN) | {"door", "floor"}:
        C(n)


# ------------------------------------------------------------------ score

def score():
    mix = A.Mix(N_FRAMES / 30 + 1.0)
    T = lambda f: f / 30.0
    ir = A.make_ir(2.8, 0.8)
    # suspense: the clock is the rhythm. A tick on every beat, the escapement 'tock' on the lurch
    for b in range(0, 17):
        mix.add(A.tick(3200), T(b * B), 0.55, pan=-0.2, bus="drums")
        mix.add(A.tick(1900, 0.06, metal=False), T(b * B + 10), 0.35, pan=0.2, bus="drums")
    mix.add(A.drone(A.note_hz("C2"), T(FREEZE)), 0, 0.4, bus="pad")
    mix.add(A.pad([A.note_hz(n) for n in ["C3", "Eb3", "G3", "B3"]], T(FREEZE)), 0, 0.18, bus="pad")
    for b in range(0, 7):
        mix.add(A.sub(48, 0.25) * A.env_exp(0.25, 0.08), T(b * 2 * B), 0.5, bus="bass")    # heartbeat
    mix.add(A.ratchet(1.8, 26, 2400), T(105), 0.35, bus="fx")                               # winding into the eye
    mix.add(A.whoosh(1.0, 120, 4000), T(130), 0.4, bus="fx")
    mix.add(A.reverse_swell(1.0, 300), T(165) - 1.0, 0.4, bus="fx")
    for b in range(11, 17):                                                                   # the watch ticks...
        mix.add(A.tick(4200, 0.04), T(b * B), 0.6, bus="drums")
    mix.add(A.impact(2.0, 60, 0.2), T(FREEZE), 0.5, bus="fx")                                # ...and stops
    mix.add(A.pad([A.note_hz(n) for n in ["G4", "C5"]], T(225)), T(FREEZE), 0.08, bus="pad")
    mix.add(A.drone(A.note_hz("G1"), T(225)), T(FREEZE), 0.45, bus="pad")
    mix.add(A.whoosh(0.5, 2000, 9000), T(330) - 0.35, 0.5, bus="fx")                         # pages fly in...
    mix.add(A.shutter(), T(330), 0.55, bus="fx")
    mix.add(A.impact(1.2, 70, 0.7), T(345), 0.7, bus="fx")                                    # ...and lock mid-air
    for k in range(40):
        mix.add(A.click(5200 + 600 * (k % 5), 0.008, 10), T(330) + k * 0.012, 0.12, pan=np.sin(k * 1.3), bus="fx")
    mix.add(A.ratchet(1.9, 18, 1400), T(420), 0.35, bus="fx")                                # the room turns
    mix.add(A.riser(T(60)), T(420), 0.55, bus="fx")
    # beat switch
    mix.add(A.impact(2.4, 40, 0.9), T(480), 0.95, bus="fx")
    mix.add(A.sub_drop(1.4, 80, 26), T(480), 0.7, bus="fx")
    bass = [(0, "C2", 0.25), (0.5, "C2", 0.4), (1.5, "Eb2", 0.4), (2.5, "C2", 0.4), (3.0, "G1", 0.25), (3.5, "Bb1", 0.4)]
    st = [(1.5, ["C3", "Eb3", "G3"]), (3.75, ["Bb2", "D3", "F3"])]
    kicks = M.groove(mix, 32, 45, bass=bass, stabs=st, swing=0.08, ghost_kicks=True, intensity=1.05)
    mix.add(A.crowd(T(60), 1.0), T(500), 0.35, bus="amb")
    for k in range(len(CUTS) - 1):                                                            # every cut has a hit
        f = CUTS[k]
        mix.add(A.rim(), T(f), 0.4, pan=((k % 3) - 1) * 0.4, bus="fx")
        mix.add(A.click(3000 + 200 * k, 0.012), T(f), 0.35, bus="fx")
    mix.add(A.riser(T(135), 300, 9000), T(540), 0.4, bus="fx")
    mix.add(A.impact(2.6, 42, 0.5), T(675), 0.8, bus="fx")
    mix.add(A.shutter(), T(675), 0.6, bus="fx")
    mix.add(A.stab([A.note_hz(x) for x in ["C3", "Eb3", "G3", "Bb3"]], 2.0, 1500, 0.8), T(705), 0.45, bus="synth")
    mix.sidechain("bass", kicks)
    mix.sidechain("synth", kicks, 0.5)
    mix.reverb("synth", 0.45, ir)
    mix.reverb("fx", 0.3, ir)
    mix.reverb("drums", 0.12, A.make_ir(1.2, 0.3))
    out = mix.master()
    return out[:, : int(N_FRAMES / 30 * A.SR)]


# ------------------------------------------------------------------ real recordings (replaces the synth score)

def cues(mx):
    from lib.realaudio import cue
    for b in range(0, 17):                                          # a real mechanical clock: tick on the beat,
        cue(mx, "clock_tick_2", b * B, -2, src=0.0, length=0.45, hit=0.07)
        cue(mx, "clock_tick_2", b * B + 10, -9, src=1.05, length=0.4, hit=1.11, lp=2500)   # tock on the lurch
    cue(mx, "heartbeat_2", 0, -12, src=30, length=8.5, fade_in=1.0, fade_out=0.6, hit=30, bus="amb")
    cue(mx, "watch_wind_1", 118, -8, src=36, length=2.2, fade_out=0.3, hit=36)                # winding into the eye
    cue(mx, "watch_wind_1", 168, -7, src=5, length=2.9, fade_in=0.2, fade_out=0.05, hit=5)    # the watch ticks...
    cue(mx, "wind_high_1", FREEZE, 8, src=20, length=7.5, fade_in=1.5, fade_out=1.0, hit=20, bus="amb")  # ...and stops
    cue(mx, "paper_flutter_1", 330, -5, src=0.2, length=1.4, fade_out=0.3, hit=0.2)
    cue(mx, "riser_1", 478, -9, src=6, hit=16)
    cue(mx, "door_open_heavy_2", 480, -6)                                                     # the drop
    cue(mx, "crowd_trading_floor_1", 482, -10, src=10, length=2.4, fade_in=0.2, fade_out=0.6, hit=10, bus="amb")
    cue(mx, "door_open_heavy_1", FIN + 8, -10)                                                # into the doorway
    cue(mx, "teletype_2", 686, -16, src=5, length=1.2, fade_in=0.1, fade_out=0.3, hit=5)      # the word inks in


HITS_BIG = [480]


def score():                                     # music: Insanity Circle - Climax (CC BY-SA 4.0), drop on the doorway
    from lib import realaudio as R
    return R.build(__import__(__name__), "B", 137.94, 480, music_from=150, fade_in=1.2)
