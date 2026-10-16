"""Reusable shot-level transitions built on vfx primitives."""
import numpy as np
import cv2
from . import vfx as V

W, H = V.W, V.H
DIAG = np.hypot(W / 2, H / 2)


def push(img, s, c, recentre=0.0):
    """Camera push of scale s about point c; recentre in [0,1] slides c toward frame centre as we push."""
    cx, cy = c
    tx = (W / 2 - cx) * recentre
    ty = (H / 2 - cy) * recentre
    M = np.array([[s, 0, cx - s * cx + tx], [0, s, cy - s * cy + ty]], np.float32)
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT), (cx + tx, cy + ty)


def circle(c, r, feather=6.0):
    g = V.grid(H, W)
    d = np.hypot(g[..., 0] - c[0], g[..., 1] - c[1])
    return np.clip((r - d) / max(feather, 1e-3) + 0.5, 0, 1).astype(np.float32)


def portal(a, b, t, c, r0, smax=14.0, blur=0.25, recentre=1.0, b_spin=0.0):
    """Fly through a circular region of shot A (pupil, vanishing point, hub) into shot B.

    A is pushed exponentially about c; the region (radius r0 at t=0) grows with the push and shows B, which is
    scaled so its whole frame sits inside the region and grows to full frame as the region swallows the screen.
    Both get zoom blur proportional to the push speed, so the motion reads as one camera move."""
    e = V.ease_in(t, 2.2)
    s = np.exp(np.log(smax) * e)
    A, c2 = push(a, s, c, recentre * V.smooth(t))
    r = r0 * s
    sb = np.clip(r / (H / 2), 0.02, 1.0)          # B's frame always covers the opening (no empty corners)
    B = V.affine(b, sb, b_spin, c2[0] - W / 2, c2[1] - H / 2, center=(W / 2, H / 2), border=cv2.BORDER_REPLICATE)
    speed = np.log(smax) * 2.2 * max(e, 1e-3) ** (1 - 1 / 2.2) / 30
    if blur:
        A = V.radial_blur(A, blur * speed * 6, c2, 8)
    m = circle(c2, r, 3 + r * 0.04)
    return A * (1 - m) + B * m


def luma_reveal(a, b, t, lo=0.15, hi=0.55, invert=False, soft=0.12):
    """B appears first through A's darkest (or brightest) regions, then everywhere: a structure-following
    dissolve that uses the picture itself as the matte (e.g. a tunnel opening between a wheel's spokes)."""
    key = cv2.GaussianBlur(a, (0, 0), 2)
    key = 1 - key if invert else key
    th = V.lerp(lo, hi + soft, V.smooth(t))
    m = np.clip((th - key) / soft, 0, 1)
    return a * (1 - m) + b * m, m


def quad_push(base, insert, quad, t, smax):
    """Corner-pin `insert` into `quad` of `base`, while the camera pushes into the quad's centre until it fills."""
    q = np.float32(quad)
    c = q.mean(0)
    s = np.exp(np.log(smax) * V.ease_in(t, 2.0))
    M = np.array([[s, 0, c[0] - s * c[0] + (W / 2 - c[0]) * V.smooth(t)],
                  [0, s, c[1] - s * c[1] + (H / 2 - c[1]) * V.smooth(t)]], np.float32)
    B = cv2.warpAffine(base, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    q2 = (np.c_[q, np.ones(4)] @ M.T).astype(np.float32)
    out, m = V.corner_pin(B, insert, q2, glow=0.15)
    return out, q2


def grid_split(frames, level, t_offsets=None, gap=2):
    """Tile a list of images into an n x n grid (n = 2**level) with hairline gaps."""
    n = 2 ** level
    cw, ch = W // n, H // n
    out = np.zeros((H, W), np.float32)
    for k in range(n * n):
        r, c = divmod(k, n)
        im = frames[k % len(frames)]
        t = cv2.resize(im, (cw, ch), interpolation=cv2.INTER_AREA)
        out[r * ch + gap // 2:(r + 1) * ch - gap // 2, c * cw + gap // 2:(c + 1) * cw - gap // 2] = \
            t[gap // 2:ch - gap // 2, gap // 2:cw - gap // 2]
    return out


class Mosaic:
    """Beat-driven photomosaic. Cells reveal in a centre-out order over [t_in0, t_in1], tiles are live (each plays
    its own clip), each tile's luma is pulled toward the target, then cells resolve to the target picture."""

    def __init__(self, bank, cols, rows, target0, seed=3):
        self.bank, self.cols, self.rows = bank, cols, rows
        self.sel = bank.match(target0, cols, rows, variety=0.03, seed=seed)
        rng = np.random.default_rng(seed)
        rr, cc = np.mgrid[0:rows, 0:cols]
        d = np.hypot((cc - cols / 2) / cols, (rr - rows / 2) / rows)
        self.order = (d + rng.random(d.shape) * 0.35)
        self.order = (self.order - self.order.min()) / (self.order.max() - self.order.min())
        self.res_order = rng.random(d.shape) * 0.6 + d * 0.4
        self.res_order = (self.res_order - self.res_order.min()) / (self.res_order.max() - self.res_order.min())

    def render(self, target, frame, reveal, match, resolve, gap=1):
        cw, ch = W / self.cols, H / self.rows
        out = np.zeros((H, W), np.float32)
        for r in range(self.rows):
            y0, y1 = int(round(r * ch)), int(round((r + 1) * ch))
            for c in range(self.cols):
                if self.order[r, c] > reveal:
                    continue
                x0, x1 = int(round(c * cw)), int(round((c + 1) * cw))
                cell = target[y0:y1, x0:x1]
                k = self.sel[r, c]
                tile = self.bank.tile_frame(k, frame // 2 + (r * 7 + c * 3), (x1 - x0, y1 - y0))
                tile = V.match_luma(tile, cell, match)
                rs = np.clip((resolve - self.res_order[r, c] * 0.7) / 0.3, 0, 1)
                pop = np.clip((reveal - self.order[r, c]) / 0.06, 0, 1)     # cells snap in, slightly overexposed
                v = tile * (1 - rs) + cell * rs
                v = v * (0.6 + 0.4 * pop) + (1 - pop) * 0.35
                out[y0:y1, x0:x1] = v
                if gap and rs < 1:
                    g = gap * (1 - rs)
                    if g >= 0.5:
                        out[y0:y0 + 1, x0:x1] *= 0.25 + 0.75 * rs
                        out[y0:y1, x0:x0 + 1] *= 0.25 + 0.75 * rs
        return out


def kinetic_word(base, word, size, cx, cy, t, disp=None, occl=None, weight=800, tracking=-0.03, scale=1.0, rot=0.0, value=0.97):
    """Massive word composited into the scene; with disp/occl it sits *behind* everything nearer than occl
    (depth-sorted against the plate), so buildings and people pass in front of it."""
    ti = V.text_image(word, size, weight, tracking)
    a = V.place((H, W), ti, cx, cy, scale, rot) * np.clip(t, 0, 1)
    if disp is not None:
        a = a * (1 - V.depth_layer_mask(disp, occl, 0.04))
    return base * (1 - a) + value * a, a
