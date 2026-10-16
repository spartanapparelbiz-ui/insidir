"""Hundreds of document pages suspended in 3D around a frozen subject.

Pages are real 3D quads (A4 proportions) with procedurally typeset form textures. They are projected with the
same pinhole camera as vfx.reproject, so parallax, roll and occlusion against the subject's depth are
consistent: pages behind the protagonist are hidden by him, pages in front cover him. Each page is shaded by
its orientation to a key light and defocused by distance from the focal plane."""
import functools
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from . import vfx as V

W, H = V.W, V.H

HEADERS = [
    ("FORM 4", "UNITED STATES SECURITIES AND EXCHANGE COMMISSION", "STATEMENT OF CHANGES IN BENEFICIAL OWNERSHIP"),
    ("FORM 10-K", "UNITED STATES SECURITIES AND EXCHANGE COMMISSION", "ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d)"),
    ("FORM 8-K", "UNITED STATES SECURITIES AND EXCHANGE COMMISSION", "CURRENT REPORT"),
    ("SCHEDULE 13D", "UNITED STATES SECURITIES AND EXCHANGE COMMISSION", "INFORMATION TO BE INCLUDED IN STATEMENTS"),
    ("FORM 10-Q", "UNITED STATES SECURITIES AND EXCHANGE COMMISSION", "QUARTERLY REPORT"),
]


@functools.lru_cache(maxsize=8)
def texture(kind, seed):
    """A typeset filing page: title block, rule lines, a transaction table and paragraph greys."""
    w, h = 420, 594
    im = Image.new("L", (w, h), 238)
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(seed)
    big = ImageFont.truetype(V.FONT, 30)
    big.set_variation_by_axes([800])
    small = ImageFont.truetype(V.FONT, 9)
    small.set_variation_by_axes([500])
    t, l1, l2 = HEADERS[kind % len(HEADERS)]
    d.text((24, 22), t, font=big, fill=20)
    d.text((24, 62), l1, font=small, fill=40)
    d.text((24, 76), l2, font=small, fill=40)
    d.line((24, 96, w - 24, 96), fill=30, width=2)
    y = 110
    for _ in range(int(rng.integers(3, 6))):                 # paragraph blocks of 'text' (fine grey dashes)
        for _ in range(int(rng.integers(3, 7))):
            x = 24
            while x < w - 40:
                ln = int(rng.integers(14, 60))
                d.line((x, y, min(x + ln, w - 24), y), fill=int(rng.integers(70, 120)), width=2)
                x += ln + 6
            y += 9
        y += 10
    # table of transactions
    d.rectangle((24, y, w - 24, y + 150), outline=40, width=1)
    for k in range(1, 8):
        d.line((24, y + k * 18, w - 24, y + k * 18), fill=120, width=1)
    for xk in (110, 180, 250, 320):
        d.line((xk, y, xk, y + 150), fill=120, width=1)
    for r in range(1, 8):
        for xk in (30, 116, 186, 256, 326):
            d.line((xk, y + r * 18 - 7, xk + int(rng.integers(20, 55)), y + r * 18 - 7), fill=60, width=3)
    y += 165
    while y < h - 30:
        d.line((24, y, int(rng.integers(200, w - 24)), y), fill=110, width=2)
        y += 9
    return np.asarray(im, np.float32) / 255.0


class Cloud:
    def __init__(self, n=340, subject_z=2.6, seed=5, avoid=(0.0, 0.0, 0.55)):
        rng = np.random.default_rng(seed)
        P = []
        while len(P) < n:
            x, y, z = rng.uniform(-3.6, 3.6), rng.uniform(-2.2, 2.0), rng.uniform(1.1, 8.5)
            # keep a column around the protagonist clear so pages float around him, not through him
            if np.hypot(x - avoid[0], (z - subject_z) * 0.8) < avoid[2] and y > -1.6:
                continue
            P.append((x, y, z))
        self.pos = np.array(P)
        self.rot = rng.uniform(-np.pi, np.pi, (n, 3)) * np.array([0.6, 0.9, 1.0])
        self.size = rng.uniform(0.16, 0.24, n)
        self.kind = rng.integers(0, len(HEADERS), n)
        self.tex = rng.integers(0, 3, n)
        self.spin = rng.normal(0, 0.15, (n, 3))
        self.vel = rng.normal(0, 0.06, (n, 3)) + np.array([0, 0.05, 0])   # they were falling when time stopped

    def render(self, base, cam, disp_out=None, t=0.0, f=1400.0, near=1.0, far=9.0, focus=2.6, drift=0.0,
               light=(0.3, -0.6, -0.75), exposure=1.0):
        cx, cy, cz = cam[:3]
        yaw, pitch, roll = (cam[3:6] if len(cam) > 3 else (0, 0, 0))
        R = V.rot3(pitch, yaw, roll)
        K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
        L = np.array(light, float)
        L /= np.linalg.norm(L)
        zscene = None if disp_out is None else far - (far - near) * disp_out
        order = np.argsort(-(self.pos[:, 2] - cz))
        out = base.copy()
        corners = np.array([[-0.5, -0.707, 0], [0.5, -0.707, 0], [0.5, 0.707, 0], [-0.5, 0.707, 0]])
        for i in order:
            Rp = V.rot3(*(self.rot[i] + self.spin[i] * drift))
            Xw = (corners * self.size[i]) @ Rp.T + self.pos[i] + self.vel[i] * drift
            Xc = (Xw - np.array([cx, cy, cz])) @ R
            if (Xc[:, 2] < 0.15).any():
                continue
            uv = (Xc[:, :2] / Xc[:, 2:3]) * f + np.array([W / 2, H / 2])
            x0, y0 = np.floor(uv.min(0)).astype(int)
            x1, y1 = np.ceil(uv.max(0)).astype(int)
            if x1 < 0 or y1 < 0 or x0 >= W or y0 >= H or (x1 - x0) * (y1 - y0) < 4:
                continue
            bx0, by0, bx1, by1 = max(x0, 0), max(y0, 0), min(x1 + 1, W), min(y1 + 1, H)
            tex = texture(int(self.kind[i]), int(self.tex[i]))
            th, tw = tex.shape
            src = np.float32([[0, 0], [tw, 0], [tw, th], [0, th]])
            Hm = cv2.getPerspectiveTransform(src, np.float32(uv - [bx0, by0]))
            size = (bx1 - bx0, by1 - by0)
            pt = cv2.warpPerspective(tex, Hm, size, flags=cv2.INTER_LINEAR)
            pa = cv2.warpPerspective(np.ones_like(tex), Hm, size, flags=cv2.INTER_LINEAR)
            n = Rp @ np.array([0, 0, 1.0])
            shade = 0.35 + 0.65 * abs(n @ L)
            zc = float(Xc[:, 2].mean())
            pt = pt * shade * exposure
            dof = min(abs(zc - focus) * 2.2, 9)
            if dof > 0.6:
                pt = cv2.GaussianBlur(pt, (0, 0), dof)
                pa = cv2.GaussianBlur(pa, (0, 0), dof)
            if zscene is not None:
                zs = zscene[by0:by1, bx0:bx1]
                pa = pa * np.clip((zs - zc + 0.15) / 0.3, 0, 1)        # hidden behind nearer scene geometry
            reg = out[by0:by1, bx0:bx1]
            out[by0:by1, bx0:bx1] = reg * (1 - pa) + pt * pa
        return out
