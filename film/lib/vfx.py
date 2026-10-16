"""Compositing toolkit for the Insidir films (single-channel luma, float32 in [0, 1], 1920x1080).

Techniques, all computed from the footage itself:
  - optical flow (OpenCV DIS) for retiming, speed ramps, frame interpolation, flow motion blur and flow morphs
  - monocular depth (Depth Anything V2) for 2.5D re-projection of frozen frames, depth-sorted occlusion of type
  - KLT feature tracking + RANSAC homographies for planar tracking and corner pins
  - true 3D plane geometry (rotation + perspective projection) for folding streets and buildings
  - photomosaics matched on luma structure
"""
import os
import subprocess
import functools
import numpy as np
import cv2

W, H, FPS = 1920, 1080, 30
CACHE = os.environ.get("FILM_CACHE", "/tmp/film_cache")
os.makedirs(CACHE, exist_ok=True)


# ------------------------------------------------------------------ io

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", path],
                         capture_output=True, text=True, check=True).stdout
    import json
    j = json.loads(out)
    s = j["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return {"w": s["width"], "h": s["height"], "fps": float(num) / float(den), "dur": float(j["format"]["duration"])}


def to_luma(rgb, mix=(0.30, 0.59, 0.11)):
    """B&W conversion with a chosen channel mix (like a filter on panchromatic film). rgb is uint8 BGR."""
    b, g, r = rgb[..., 0].astype(np.float32), rgb[..., 1].astype(np.float32), rgb[..., 2].astype(np.float32)
    return (r * mix[0] + g * mix[1] + b * mix[2]) / 255.0


class Clip:
    """Memory-mapped luma clip: frames decode on access as float32 [0, 1]."""

    def __init__(self, path_npy):
        self.a = np.load(path_npy, mmap_mode="r")

    def __len__(self):
        return self.a.shape[0]

    def __getitem__(self, i):
        if isinstance(i, slice):
            return [self[k] for k in range(*i.indices(len(self)))]
        i = int(np.clip(i, 0, len(self) - 1))
        return self.a[i].astype(np.float32) / 65535.0

    def at(self, pos):
        """Frame at a fractional position with optical-flow interpolation."""
        pos = float(np.clip(pos, 0, len(self) - 1))
        i = int(pos)
        t = pos - i
        if t < 0.02 or i >= len(self) - 1:
            return self[i]
        if t > 0.98:
            return self[i + 1]
        return interp(self[i], self[i + 1], t)


def load(path, start=0.0, dur=None, fps=FPS, size=(W, H), mix=(0.30, 0.59, 0.11), crop=None, flip=False, speed=1.0):
    """Decode a segment, cover-fit to size, convert to luma; cached on disk and returned memory-mapped.

    crop: optional (x, y, w, h) fractions of the source applied before fitting (reframe / punch in).
    speed: source seconds per output second when resampling to fps (simple frame pick; use Clip.at for
    optical-flow retiming)."""
    import hashlib
    key = f"{os.path.basename(path)}_{start:.3f}_{dur}_{fps}_{size}_{mix}_{crop}_{flip}_{speed}".replace(" ", "")
    cp = os.path.join(CACHE, "clip_" + hashlib.md5(key.encode()).hexdigest()[:16] + ".npy")
    if not os.path.exists(cp):
        vf = []
        if crop:
            x, y, w, h = crop
            vf.append(f"crop=iw*{w}:ih*{h}:iw*{x}:ih*{y}")
        vf.append("setsar=1")
        vf.append(f"scale={size[0]}:{size[1]}:force_original_aspect_ratio=increase:flags=lanczos")
        vf.append(f"crop={size[0]}:{size[1]}")
        if flip:
            vf.append("hflip")
        if speed != 1.0:
            vf.append(f"setpts=PTS/{speed}")
        vf.append(f"fps={fps}")
        cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", path]
        if dur:
            cmd += ["-t", str(dur)]
        cmd += ["-vf", ",".join(vf), "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
        raw = subprocess.run(cmd, capture_output=True, check=True).stdout
        fr = np.frombuffer(raw, np.uint8).reshape(-1, size[1], size[0], 3)
        out = np.stack([(to_luma(f, mix) * 65535).astype(np.uint16) for f in fr])
        tmp = cp + ".tmp.npy"
        np.save(tmp, out)
        os.replace(tmp, cp)
    return Clip(cp)


class Writer:
    def __init__(self, path, fps=FPS, crf=14, size=None):
        w, h = size or (W, H)
        self.p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}",
                                   "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
                                   "-pix_fmt", "yuv420p", "-x264-params", "aq-mode=3", path], stdin=subprocess.PIPE)

    def write(self, img):
        self.p.stdin.write((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes())

    def close(self):
        self.p.stdin.close()
        self.p.wait()


# ------------------------------------------------------------------ easing / timing

def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def ease_in(x, p=3):
    return np.clip(x, 0, 1) ** p


def ease_out(x, p=3):
    return 1 - (1 - np.clip(x, 0, 1)) ** p


def ease_io(x, p=3):
    x = np.clip(x, 0, 1)
    return np.where(x < 0.5, 0.5 * (2 * x) ** p, 1 - 0.5 * (2 - 2 * x) ** p)


def lerp(a, b, t):
    return a + (b - a) * t


def ramp_positions(n_out, speeds):
    """Integrate a per-output-frame speed curve into fractional source positions (speed ramps, freezes, reverse)."""
    s = np.asarray(speeds, float)
    if s.ndim == 0:
        s = np.full(n_out, float(s))
    return np.concatenate([[0], np.cumsum(s[:-1])])


# ------------------------------------------------------------------ optical flow

_dis = None


def flow(a, b, scale=0.5):
    """Dense optical flow a->b in full-res pixel units (DIS, medium preset, computed at `scale`)."""
    global _dis
    if _dis is None:
        _dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    sa = cv2.resize(a, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    sb = cv2.resize(b, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    f = _dis.calc((sa * 255).astype(np.uint8), (sb * 255).astype(np.uint8), None)
    f = cv2.resize(f, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_LINEAR) / scale
    return f


_grid = {}


def grid(h, w):
    if (h, w) not in _grid:
        _grid[(h, w)] = np.indices((h, w)).astype(np.float32)[::-1].transpose(1, 2, 0).copy()
    return _grid[(h, w)]


def warp(img, fl, k=1.0):
    """Backward warp: sample img at p + k*fl(p)."""
    g = grid(*img.shape[:2])
    m = (g + fl * float(k)).astype(np.float32)
    return cv2.remap(np.asarray(img, np.float32), m[..., 0], m[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def interp(a, b, t, fab=None, fba=None):
    """Flow-based in-between frame at fraction t between a and b (bidirectional, occlusion-aware blend)."""
    fab = flow(a, b) if fab is None else fab
    fba = flow(b, a) if fba is None else fba
    wa = warp(a, fab, -t)       # approx: sample a backwards along forward flow
    wb = warp(b, fba, -(1 - t))
    ea = np.abs(warp(b, fab, 1 - t) - wa)
    eb = np.abs(warp(a, fba, t) - wb)
    wA = (1 - t) / (ea + 0.02)
    wB = t / (eb + 0.02)
    return (wa * wA + wb * wB) / (wA + wB)


def retime(frames, positions, flow_cache=None, blur=0.0, speeds=None):
    """Sample a clip at fractional positions with optical-flow interpolation; optional flow motion blur
    proportional to playback speed (blur = shutter fraction)."""
    out = []
    n = len(frames)
    cache = {} if flow_cache is None else flow_cache

    def F(i, j):
        if (i, j) not in cache:
            cache[(i, j)] = flow(frames[i], frames[j])
        return cache[(i, j)]

    for k, p in enumerate(positions):
        p = float(np.clip(p, 0, n - 1))
        i = int(np.floor(p))
        t = p - i
        if t < 1e-3 or i >= n - 1:
            img = frames[min(i, n - 1)]
        elif t > 0.999:
            img = frames[i + 1]
        else:
            img = interp(frames[i], frames[i + 1], t, F(i, i + 1), F(i + 1, i))
        if blur > 0 and speeds is not None and abs(speeds[k]) > 1.2 and i < n - 1:
            img = flow_blur(img, F(i, i + 1) * speeds[k] * blur)
        out.append(img)
    return out


def flow_blur(img, fl, samples=9):
    """Directional motion blur along a flow field (what a real shutter would record)."""
    acc = np.zeros_like(img)
    for s in np.linspace(-0.5, 0.5, samples):
        acc += warp(img, fl, s)
    return acc / samples


def radial_blur(img, amount, center=None, samples=10):
    """Zoom blur toward a vanishing point (for dolly-through moments)."""
    h, w = img.shape
    cx, cy = (w / 2, h / 2) if center is None else center
    acc = np.zeros_like(img)
    for s in np.linspace(0, amount, samples):
        M = cv2.getRotationMatrix2D((cx, cy), 0, 1 + s)
        acc += cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return acc / samples


def spin_blur(img, deg, center=None, samples=10):
    h, w = img.shape
    cx, cy = (w / 2, h / 2) if center is None else center
    acc = np.zeros_like(img)
    for s in np.linspace(-deg / 2, deg / 2, samples):
        M = cv2.getRotationMatrix2D((cx, cy), s, 1)
        acc += cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return acc / samples


def flow_morph(a, b, t, fab=None, fba=None):
    """Morph between two different shots by warping each toward the other along dense correspondence."""
    fab = flow(a, b, 0.25) if fab is None else fab
    fba = flow(b, a, 0.25) if fba is None else fba
    wa = warp(a, fab, t)
    wb = warp(b, fba, 1 - t)
    return wa * (1 - smooth(t)) + wb * smooth(t)


# ------------------------------------------------------------------ geometry

def affine(img, scale=1.0, rot=0.0, tx=0.0, ty=0.0, center=None, border=cv2.BORDER_REFLECT):
    h, w = img.shape[:2]
    cx, cy = (w / 2, h / 2) if center is None else center
    M = cv2.getRotationMatrix2D((cx, cy), rot, scale)
    M[0, 2] += tx
    M[1, 2] += ty
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=border)


def zoom_to(img, scale, center):
    """Scale about a point and bring that point to frame centre (camera pushes into a target)."""
    h, w = img.shape[:2]
    cx, cy = center
    M = np.array([[scale, 0, w / 2 - scale * cx], [0, scale, h / 2 - scale * cy]], np.float32)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def rot3(ax, ay, az):
    cx, sx, cy, sy, cz, sz = np.cos(ax), np.sin(ax), np.cos(ay), np.sin(ay), np.cos(az), np.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def plane_homography(R, t, f=1400.0, w=W, h=H, z0=1.0):
    """Homography that renders an image lying on the plane z=z0 (filling the frame at identity) after the
    plane is rotated by R about its centre and translated by t, seen by a pinhole camera of focal f."""
    K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]])
    # plane points: X = ((u - w/2) z0 / f, (v - h/2) z0 / f, z0)
    S = np.array([[z0 / f, 0, -w / 2 * z0 / f], [0, z0 / f, -h / 2 * z0 / f], [0, 0, 0]])
    c = np.array([0, 0, z0])
    # X' = R (X - c) + c + t ; X = S u + e3 z0
    A = R @ S
    b = R @ (np.array([0, 0, z0]) - c) + c + np.asarray(t, float)
    Hm = K @ np.column_stack([A[:, 0], A[:, 1], A[:, 2] * 0 + b])
    return Hm / Hm[2, 2]


def fold(img, y_fold, angle, f=1300.0, upper=True):
    """Fold the image plane along the horizontal line y=y_fold: the part above (or below) the line rotates
    by `angle` radians about that line, in true perspective. Returns (folded_part, mask)."""
    h, w = img.shape[:2]
    K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]])
    Ki = np.linalg.inv(K)
    yl = (y_fold - h / 2) / f   # fold line on plane z=1
    R = rot3(angle if upper else -angle, 0, 0)

    def P(u, v):
        X = Ki @ np.array([u, v, 1.0])
        X = X - np.array([0, yl, 1])
        X = R @ X + np.array([0, yl, 1])
        x = K @ X
        return x[:2] / x[2]

    if upper:
        src = np.float32([[0, 0], [w, 0], [w, y_fold], [0, y_fold]])
    else:
        src = np.float32([[0, y_fold], [w, y_fold], [w, h], [0, h]])
    dst = np.float32([P(*p) for p in src])
    Hm = cv2.getPerspectiveTransform(src, dst)
    part = cv2.warpPerspective(img, Hm, (w, h), flags=cv2.INTER_CUBIC, borderValue=0)
    m = np.zeros((h, w), np.float32)
    cv2.fillConvexPoly(m, dst.astype(np.int32), 1.0)
    m = cv2.GaussianBlur(m, (0, 0), 1.2)
    return part, m


def lean(img, strength, power=1.6, center_x=None, top=True):
    """Buildings lean in and arc over the camera: horizontal magnification grows toward the top of frame, so
    vertical lines converge and curve (an 'Inception' curl). strength ~0.3-1.5."""
    h, w = img.shape[:2]
    g = grid(h, w)
    cx = w / 2 if center_x is None else center_x
    yy = (1 - g[..., 1] / h) if top else (g[..., 1] / h)
    k = 1 + strength * yy ** power
    mx = cx + (g[..., 0] - cx) * k
    my = g[..., 1] + strength * 40 * yy ** power * ((g[..., 0] - cx) / (w / 2)) ** 2
    return cv2.remap(img, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def tunnel_bend(img, amount, center=None):
    """Radial (barrel/pincushion) remap around a vanishing point: positive pulls walls around the camera."""
    h, w = img.shape[:2]
    g = grid(h, w)
    cx, cy = (w / 2, h / 2) if center is None else center
    x, y = (g[..., 0] - cx) / (w / 2), (g[..., 1] - cy) / (w / 2)
    r = np.sqrt(x * x + y * y)
    k = 1 + amount * r * r
    return cv2.remap(img, (cx + x / k * (w / 2)).astype(np.float32), (cy + y / k * (w / 2)).astype(np.float32),
                     cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def stretch_from(img, vp, amount):
    """Elastic stretch away from a vanishing point (streets lengthening): radial coordinate r -> r^(1-amount)."""
    h, w = img.shape[:2]
    g = grid(h, w)
    x, y = g[..., 0] - vp[0], g[..., 1] - vp[1]
    r = np.sqrt(x * x + y * y) + 1e-3
    R = (w / 2)
    rn = (r / R) ** (1 / (1 - amount)) * R if amount < 0.99 else r
    s = rn / r
    return cv2.remap(img, (vp[0] + x * s).astype(np.float32), (vp[1] + y * s).astype(np.float32),
                     cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


# ------------------------------------------------------------------ depth

@functools.lru_cache(maxsize=1)
def _depth_model():
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    torch.set_num_threads(4)
    name = "depth-anything/Depth-Anything-V2-Small-hf"
    return AutoImageProcessor.from_pretrained(name), AutoModelForDepthEstimation.from_pretrained(name).eval()


def depth(img, key=None):
    """Relative inverse depth (disparity), normalised to [0, 1], 1 = nearest. Cached by key."""
    if key:
        cp = os.path.join(CACHE, f"depth_{key}.npy")
        if os.path.exists(cp):
            return np.load(cp)
    import torch
    from PIL import Image
    proc, model = _depth_model()
    rgb = np.repeat((np.clip(img, 0, 1) * 255).astype(np.uint8)[..., None], 3, 2)
    with torch.no_grad():
        pd = model(**proc(images=Image.fromarray(rgb), return_tensors="pt")).predicted_depth
    d = torch.nn.functional.interpolate(pd[None], size=img.shape[:2], mode="bicubic")[0, 0].numpy()
    lo, hi = np.percentile(d, 1), np.percentile(d, 99.5)
    d = np.clip((d - lo) / (hi - lo + 1e-6), 0, 1).astype(np.float32)
    if key:
        np.save(cp, d)
    return d


def push_pull_fill(img, valid, levels=7):
    """Fill invalid pixels from valid neighbours with a push-pull pyramid (fast, smooth inpainting)."""
    pyr = [(img * valid, valid.astype(np.float32))]
    for _ in range(levels):
        a, w = pyr[-1]
        pyr.append((cv2.pyrDown(a), cv2.pyrDown(w)))
    a, w = pyr[-1]
    fill = a / np.maximum(w, 1e-6)
    for a, w in reversed(pyr[:-1]):
        up = cv2.resize(fill, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_LINEAR)
        cur = a / np.maximum(w, 1e-6)
        k = np.clip(w * 4, 0, 1)
        fill = cur * k + up * (1 - k)
    return np.where(valid > 0.5, img, fill)


def clean_plate(img, disp, q=0.5, far=9.0, near=1.0):
    """Background plate with near content removed: Telea inpainting at half resolution continues the
    surrounding structure into the hole, then the original background is kept untouched outside it."""
    z = far - (far - near) * disp
    hole = (z < np.quantile(z, q)).astype(np.uint8)
    hole = cv2.dilate(hole, np.ones((25, 25), np.uint8))
    h, w = img.shape
    small = cv2.resize((np.clip(img, 0, 1) * 255).astype(np.uint8), (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    hs = cv2.resize(hole, (w // 2, h // 2), interpolation=cv2.INTER_NEAREST)
    fill = cv2.inpaint(small, hs, 12, cv2.INPAINT_TELEA).astype(np.float32) / 255
    fill = cv2.resize(fill, (w, h), interpolation=cv2.INTER_CUBIC)
    m = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 3)
    return img * (1 - m) + fill * m


def reproject(img, disp, cam, f=1400.0, near=1.0, far=9.0, pass_z=0.18, plate=None, max_fp=4, f_out=None):
    """2.5D camera move through a single frozen frame (time frozen while the camera keeps travelling).

    Each pixel is lifted to 3D using monocular depth, transformed into a camera at
    cam=(x, y, z_forward[, yaw, pitch, roll]) and splatted into the new view far-to-near (z-buffer by draw
    order), with footprints scaled by local magnification so close surfaces stay solid. Points the camera has
    flown past are dropped. Disocclusions are filled from a clean plate (near content inpainted away),
    re-projected at background depth."""
    h, w = img.shape
    ds = cv2.bilateralFilter(disp.astype(np.float32), 9, 0.08, 7)
    z = far - (far - near) * ds
    cx, cy, cz = cam[:3]
    yaw, pitch, roll = (cam[3:6] if len(cam) > 3 else (0, 0, 0))
    R = rot3(pitch, yaw, roll)
    g = grid(h, w)
    X = (g[..., 0] - w / 2) / f * z - cx
    Y = (g[..., 1] - h / 2) / f * z - cy
    P = np.stack([X, Y, z - cz], -1).reshape(-1, 3) @ R
    Zc = P[:, 2]
    edge = cv2.morphologyEx(z, cv2.MORPH_GRADIENT, np.ones((5, 5), np.uint8)) / np.maximum(z, 1e-3)
    keep = (Zc > pass_z) & (edge.reshape(-1) < 0.06)      # drop flying pixels on depth discontinuities
    Zs = np.maximum(Zc, 1e-3)
    fo = f if f_out is None else f_out          # a different output focal length gives dolly-zoom (vertigo)
    U = (P[:, 0] / Zs * fo + w / 2).reshape(h, w)
    Vv = (P[:, 1] / Zs * fo + h / 2).reshape(h, w)
    # local spacing of projected neighbours (Jacobian of the reprojection) sets each point's footprint
    J = np.maximum(np.abs(np.gradient(U, axis=1)) + np.abs(np.gradient(U, axis=0)),
                   np.abs(np.gradient(Vv, axis=0)) + np.abs(np.gradient(Vv, axis=1)))
    vals = img.reshape(-1)[keep]
    Zk = Zc[keep]
    u = U.reshape(-1)[keep]
    v = Vv.reshape(-1)[keep]
    mag = np.clip(J.reshape(-1)[keep], 1, max_fp - 0.6)
    fp = np.ceil(mag + 0.6).astype(int)   # >= 2x2 so slight magnification leaves no seams
    I, Vl, Zl = [], [], []
    for s_ in range(1, max_fp + 1):
        sel = fp >= s_
        offs = [(dx, dy) for dx in range(s_) for dy in range(s_) if max(dx, dy) == s_ - 1]
        for dx, dy in offs:
            tx = np.floor(u[sel] - (s_ - 1) / 2 + dx + 0.5).astype(int)
            ty = np.floor(v[sel] - (s_ - 1) / 2 + dy + 0.5).astype(int)
            ok = (tx >= 0) & (tx < w) & (ty >= 0) & (ty < h)
            I.append(ty[ok] * w + tx[ok])
            Vl.append(vals[sel][ok])
            # a point's own centre outranks neighbours' footprints at equal depth
            Zl.append(Zk[sel][ok] + (0 if (dx, dy) == (0, 0) and s_ == 1 else 1e-4 * s_))
    I, Vl, Zl = np.concatenate(I), np.concatenate(Vl), np.concatenate(Zl)
    order = np.argsort(-Zl, kind="stable")       # far first; near (and exact centres) written last win
    out = np.zeros(h * w, np.float32)
    hit = np.zeros(h * w, bool)
    out[I[order]] = Vl[order]
    hit[I] = True
    out = out.reshape(h, w)
    hit = hit.reshape(h, w).astype(np.float32)
    covered = cv2.morphologyEx(hit, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    out = push_pull_fill(out, hit, levels=3)       # leftover splat gaps: fill from neighbouring splats
    hit = covered                                  # big gaps (disocclusions): fall through to the plate
    if plate is None:
        plate = clean_plate(img, ds, far=far, near=near)
    zb = float(np.quantile(z, 0.85))
    K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]])
    K2 = np.array([[fo, 0, w / 2], [0, fo, h / 2], [0, 0, 1]])
    Hm = K2 @ R.T @ (zb * np.eye(3) - np.column_stack([np.zeros(3), np.zeros(3), [cx, cy, cz]])) @ np.linalg.inv(K)
    bg = cv2.warpPerspective(plate, Hm / Hm[2, 2], (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    a = cv2.GaussianBlur(hit, (0, 0), 0.8)
    return out * a + bg * (1 - a)


def depth_layer_mask(disp, threshold, soft=0.03):
    """Mask of everything nearer than `threshold` disparity (1 = in front)."""
    return smooth((disp - threshold) / soft + 0.5)


# ------------------------------------------------------------------ tracking

def track_points(frames, pts0, f0=0, win=31):
    """KLT-track points forward and backward from frame f0. Returns array (n_frames, n_pts, 2), NaN when lost."""
    n = len(frames)
    out = np.full((n, len(pts0), 2), np.nan, np.float32)
    out[f0] = pts0
    lk = dict(winSize=(win, win), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 0.01))
    u8 = [(np.clip(f, 0, 1) * 255).astype(np.uint8) for f in frames]
    for rng in (range(f0, n - 1), range(f0, 0, -1)):
        step = 1 if rng.step == 1 else -1
        p = out[f0].reshape(-1, 1, 2).copy()
        for i in rng:
            j = i + step
            q, st, _ = cv2.calcOpticalFlowPyrLK(u8[i], u8[j], p, None, **lk)
            back, st2, _ = cv2.calcOpticalFlowPyrLK(u8[j], u8[i], q, None, **lk)
            good = (st[:, 0] == 1) & (st2[:, 0] == 1) & (np.linalg.norm(back - p, axis=2)[:, 0] < 1.0)
            q[~good] = np.nan
            out[j] = q[:, 0]
            p = q
            if np.isnan(p).all():
                break
    return out


def planar_track(frames, region, f0=0, max_pts=400):
    """Track a planar region (x, y, w, h at frame f0) through the clip: features inside it are KLT-tracked and a
    RANSAC homography from frame f0 to every frame is fitted. Returns list of 3x3 homographies (f0 -> i)."""
    x, y, w, h = region
    mask = np.zeros(frames[f0].shape, np.uint8)
    mask[int(y):int(y + h), int(x):int(x + w)] = 255
    pts = cv2.goodFeaturesToTrack((frames[f0] * 255).astype(np.uint8), max_pts, 0.005, 6, mask=mask)
    pts = pts[:, 0]
    tr = track_points(frames, pts, f0)
    Hs = []
    last = np.eye(3)
    for i in range(len(frames)):
        ok = ~np.isnan(tr[i]).any(axis=1)
        if ok.sum() >= 8:
            Hm, _ = cv2.findHomography(pts[ok], tr[i][ok], cv2.RANSAC, 2.0)
            if Hm is not None:
                last = Hm
        Hs.append(last)
    return Hs


def smooth_homographies(Hs, sigma=1.5):
    """Temporal smoothing of corner trajectories (removes tracker jitter without lag at the ends)."""
    from scipy.ndimage import gaussian_filter1d
    c = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]]) * 1000
    tr = np.stack([cv2.perspectiveTransform(c[None], Hm)[0] for Hm in Hs])
    tr = gaussian_filter1d(tr, sigma, axis=0, mode="nearest")
    return [cv2.getPerspectiveTransform(c, t) for t in tr]


def corner_pin(base, insert, quad, glow=0.0, feather=1.0):
    """Composite `insert` into quadrilateral `quad` (4 points TL, TR, BR, BL) of `base`."""
    h, w = insert.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    Hm = cv2.getPerspectiveTransform(src, np.float32(quad))
    warped = cv2.warpPerspective(insert, Hm, (base.shape[1], base.shape[0]), flags=cv2.INTER_AREA if w > 2000 else cv2.INTER_CUBIC)
    m = cv2.warpPerspective(np.ones((h, w), np.float32), Hm, (base.shape[1], base.shape[0]))
    if feather:
        m = cv2.GaussianBlur(m, (0, 0), feather)
    out = base * (1 - m) + warped * m
    if glow:
        out = out + cv2.GaussianBlur(warped * m, (0, 0), 40) * glow
    return out, m


# ------------------------------------------------------------------ type

FONT = os.path.join(os.path.dirname(__file__), "..", "assets", "JetBrainsMono.ttf")   # SIL OFL, Insidir's typeface


@functools.lru_cache(maxsize=64)
def text_image(text, size, weight=800, tracking=0.0, pad=40):
    """Render text in JetBrains Mono (variable weight 100-800) to a float alpha image, with letter tracking (em)."""
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype(FONT, size)
    font.set_variation_by_axes([weight])
    widths = [font.getlength(c) for c in text]
    tw = int(sum(widths) + tracking * size * (len(text) - 1)) + 2 * pad
    asc, desc = font.getmetrics()
    im = Image.new("L", (tw, asc + desc + 2 * pad), 0)
    d = ImageDraw.Draw(im)
    x = pad
    for c, cw in zip(text, widths):
        d.text((x, pad), c, font=font, fill=255)
        x += cw + tracking * size
    return np.asarray(im, np.float32) / 255.0


def place(canvas_shape, img, cx, cy, scale=1.0, rot=0.0):
    """Place a (small) image centred at (cx, cy) on a canvas, with scale and rotation."""
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), rot, scale)
    M[0, 2] += cx - w / 2
    M[1, 2] += cy - h / 2
    return cv2.warpAffine(img, M, (canvas_shape[1], canvas_shape[0]), flags=cv2.INTER_CUBIC)


def over(base, layer, alpha, value=1.0):
    """Composite a flat-colour layer (value) through alpha."""
    return base * (1 - alpha) + value * alpha * (layer if layer is not None else 1)


# ------------------------------------------------------------------ mosaic

class TileBank:
    """Small luma tiles sampled from many clips; matched to a target by a 3x3 luma-structure descriptor."""

    def __init__(self, clips, tw=48, th=27, per_clip=40):
        self.tw, self.th = tw, th
        self.src = []      # (clip_index, frame_index)
        tiles = []
        for ci, c in enumerate(clips):
            idx = np.linspace(0, len(c) - 1, min(per_clip, len(c))).astype(int)
            for fi in idx:
                tiles.append(cv2.resize(c[fi], (tw, th), interpolation=cv2.INTER_AREA))
                self.src.append((ci, fi))
        self.clips = clips
        self.tiles = np.stack(tiles)
        self.desc = np.stack([self._desc(t) for t in self.tiles])

    @staticmethod
    def _desc(t):
        d = cv2.resize(t, (3, 3), interpolation=cv2.INTER_AREA).ravel()
        return np.concatenate([d, [t.mean() * 2]])

    def match(self, target, cols, rows, variety=0.02, seed=0):
        """For each cell choose a tile index; small random penalty spreads choices across the bank."""
        rng = np.random.default_rng(seed)
        cw, ch = target.shape[1] / cols, target.shape[0] / rows
        sel = np.zeros((rows, cols), int)
        used = np.zeros(len(self.tiles))
        for r in range(rows):
            for c in range(cols):
                cell = target[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]
                d = self._desc(cv2.resize(cell, (self.tw, self.th), interpolation=cv2.INTER_AREA))
                cost = ((self.desc - d) ** 2).sum(1) + variety * used + rng.random(len(used)) * variety * 0.5
                k = int(np.argmin(cost))
                sel[r, c] = k
                used[k] += 1
        return sel

    def tile_frame(self, k, t_offset, size):
        ci, fi = self.src[k]
        c = self.clips[ci]
        f = c[(fi + t_offset) % len(c)]
        return cv2.resize(f, size, interpolation=cv2.INTER_AREA)


def match_luma(tile, target_cell, amount=1.0):
    """Shift/scale a tile's luma toward the target cell (how photomosaics read as the big picture)."""
    m, s = tile.mean(), tile.std() + 1e-4
    tm, ts = target_cell.mean(), target_cell.std() + 1e-4
    adj = (tile - m) / s * lerp(s, ts, amount) + lerp(m, tm, amount)
    return adj


# ------------------------------------------------------------------ grade

def grade(img, contrast=1.25, black=0.035, white=0.97, gamma=0.95, toe=0.06):
    x = np.clip(img, 0, 1)
    x = x ** gamma
    x = 0.5 + (x - 0.5) * contrast
    x = smooth(np.clip(x, 0, 1)) * 0.35 + np.clip(x, 0, 1) * 0.65          # filmic S
    x = np.clip((x - black) / (white - black), 0, 1)
    return x


def halation(img, thresh=0.82, radius=18, amount=0.35):
    hi = np.clip((img - thresh) / (1 - thresh), 0, 1)
    return img + cv2.GaussianBlur(hi, (0, 0), radius) * amount


def vignette(shape, strength=0.35, power=2.4):
    h, w = shape
    g = grid(h, w)
    x, y = (g[..., 0] - w / 2) / (w / 2), (g[..., 1] - h / 2) / (h / 2)
    r = np.sqrt(x * x * 0.8 + y * y) if w >= h else np.sqrt(x * x + y * y * 0.8)
    return 1 - strength * np.clip(r / 1.3, 0, 1) ** power


_vig = {}


def finish(img, frame, grain=0.035, vig=0.32, halo=0.3, weave=0.0, rng=None):
    """Film finish: halation, vignette, luma-dependent grain, optional gate weave. Works at any frame size."""
    h, w = img.shape[:2]
    if (h, w) not in _vig:
        _vig[(h, w)] = vignette((h, w), vig)
    x = halation(img, amount=halo)
    x = x * _vig[(h, w)]
    rng = rng or np.random.default_rng(frame * 7919 + 13)
    g = rng.standard_normal((h // 2, w // 2)).astype(np.float32)
    g = cv2.resize(g, (w, h), interpolation=cv2.INTER_LINEAR)
    lum = np.clip(x, 0, 1)
    x = x + g * grain * (0.35 + lum * (1 - lum) * 2.6)
    if weave:
        x = affine(x, 1.0, 0, rng.normal(0, weave), rng.normal(0, weave))
    return np.clip(x, 0, 1)


_shake_noise = None


def _noise_track(n=4000, seed=21):
    """Band-limited random walk (what a handheld/body-mounted camera actually does), three channels."""
    global _shake_noise
    if _shake_noise is None:
        from scipy.ndimage import gaussian_filter1d
        r = np.random.default_rng(seed).standard_normal((n, 3))
        hi = gaussian_filter1d(r, 1.2, axis=0)            # jolt
        lo = gaussian_filter1d(r[::-1], 6.0, axis=0) * 2.2  # sway
        _shake_noise = (hi + lo) / np.std(hi + lo, axis=0)
    return _shake_noise


def shake(frame, hits, amp=18.0, decay=6.0, freq=19.0, base=1.2):
    """Camera reaction: always-on subtle handheld drift plus noise jolts after impact frames that decay like a
    real rig settling. Returns (dx, dy, rot)."""
    N = _noise_track()
    nz = N[int(frame) % len(N)]
    e = 0.0
    for h0, a in hits:
        t = (frame - h0) / FPS
        if 0 <= t < 1.0:
            e += a * np.exp(-t * decay) * (1 - np.exp(-t * 60))
    k = base / amp + e
    return float(amp * k * nz[0]), float(amp * 0.7 * k * nz[1]), float(0.25 * k * nz[2])
