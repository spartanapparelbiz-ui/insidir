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
  675-750  the last circle opens onto Insidir: search, the company report, insider activity
"""
import os
import numpy as np
import cv2
from lib import vfx as V, shots as S, audio as A, music as M, pages as P

N_FRAMES = 750
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
            "ui": (UI + "/ui_discovery.mp4", 0.0, None, {"mix": (0.33, 0.34, 0.33)}),
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


def corridor(f, text=True):
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
        _cloud = P.Cloud(n=340, subject_z=SUBJ_Z, seed=9, avoid=(0.0, 0.0, 0.6))
    return _cloud


def pages(f):
    fr = C("walk")[PAGE_SRC]
    d = V.depth(fr, f"v2walk_{PAGE_SRC}")
    t = np.clip(seg(f, 330, 480), 0, 1)
    a = V.ease_io(t, 2)
    roll = np.pi * V.ease_io(np.clip(seg(f, 420, 476), 0, 1), 3)
    cam = (0.55 * np.sin(a * 2.2 - 0.6) + 0.3, -0.08, -0.2 + 0.9 * a, -0.10 * np.sin(a * 2.2 - 0.6), 0.02, roll)
    fo = 1400 * (1.0 + 0.32 * np.sin(roll) ** 2 + 0.2 * (roll > 0.1))
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
    pos = max(f - 496, 0) * 1.0
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
CHAIN = ["post", "dial", "watch", "eye", "hub", "tunnel", "empire", "dial", "watch", "eye", "hub", "tunnel",
         "post", "dial", "watch", "eye", "eye"]
LENS16 = [4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1]      # lengths in 16th notes (sums to 36 = 135 frames)
CUTS = np.round(540 + np.concatenate([[0], np.cumsum(LENS16)]) * 3.75).astype(int)


def chain_angle(f):
    t = np.clip(seg(f, 540, 675), 0, 1)
    return 40 * t + 420 * t ** 3


def chain(f):
    k = int(np.searchsorted(CUTS, f, side="right") - 1)
    k = min(k, len(CHAIN) - 1)
    a0, a1 = CUTS[k], CUTS[k + 1]
    lt = (f - a0) / max(a1 - a0, 1)
    name = CHAIN[k]
    (cx, cy), r = CIRCLES[name]
    clip = C(name)
    img = clip[int((f - 540) * 1.0 + k * 9) % len(clip)]
    R0 = 330                                              # every circle is matched to the same on-screen radius
    s = R0 / r * (1 + 0.45 * lt)                          # and keeps being pushed, so the zoom never stops
    out = V.affine(img, s, chain_angle(f), W / 2 - cx, H / 2 - cy, center=(cx, cy), border=cv2.BORDER_REPLICATE)
    da = chain_angle(f) - chain_angle(f - 1)
    if da > 1.5:
        out = V.spin_blur(out, da * 0.8, samples=8)
    # one-frame exposure kick on each cut (a shutter, not a flash)
    if f == a0 and k > 0:
        out = np.clip(out * 1.25 + 0.05, 0, 1)
    return out


# ------------------------------------------------------------------ 6. discovery

def ui(f):
    clip = C("ui")
    pos = (f - 668) * 1.0 * len(clip) / 82.0               # the captured search -> report -> insiders flow
    return clip.at(np.clip(pos, 0, len(clip) - 1))


def discovery(f):
    t = np.clip(seg(f, 675, 690), 0, 1)
    a = chain(674)
    b = ui(f)
    if t < 1:
        return S.portal(a, b, t, (W / 2, H / 2), 330, smax=5, blur=0.15, recentre=0)
    return b


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
    elif f < 496:
        img = doorway(f)
    elif f < 516:
        img = door_to_floor(f)
    elif f < 540:
        img = floor(f)
    elif f < 675:
        img = chain(f)
    else:
        img = discovery(f)
    dx, dy, r = V.shake(f, [(480, 1.0), (512, 0.5), (540, 0.6), (FREEZE, 0.3), (675, 0.5)], amp=16)
    if abs(dx) + abs(dy) > 0.3:
        img = V.affine(img, 1.02, r, dx, dy)
    return V.grade(np.asarray(img, np.float32), contrast=1.2).astype(np.float32)


def prepare():
    for f in range(0, 128):
        i = int(round(walk_pos(f)))
        V.depth(C("walk")[i], f"v2walk_{i}")
    V.depth(C("walk")[PAGE_SRC], f"v2walk_{PAGE_SRC}")
    V.depth(watch_centered(FREEZE - 165), "v2watch_freeze")
    eye_track()
    for n in set(CHAIN) | {"door", "floor", "ui"}:
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
    for k, c in enumerate("Tesla"):                                                           # keystrokes
        mix.add(A.click(2600 + 300 * k, 0.015, 6), T(684 + k * 3), 0.35, bus="fx")
    mix.add(A.stab([A.note_hz(x) for x in ["C3", "Eb3", "G3", "Bb3"]], 2.0, 1500, 0.8), T(705), 0.45, bus="synth")
    mix.sidechain("bass", kicks)
    mix.sidechain("synth", kicks, 0.5)
    mix.reverb("synth", 0.45, ir)
    mix.reverb("fx", 0.3, ir)
    mix.reverb("drums", 0.12, A.make_ir(1.2, 0.3))
    out = mix.master()
    return out[:, : int(N_FRAMES / 30 * A.SR)]
