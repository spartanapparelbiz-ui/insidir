"""9:16 Instagram Reels output (1080x1920).

Shots are composed on a 1920x1080 plate; each film supplies a per-frame reframe (crop centre x, optional extra
zoom) as eased keyframes. The crop is resampled straight to 1080x1920 with Lanczos, then anything that must be
sharp (the wordmark, captions) is drawn at full vertical resolution, then the film finish (grain, halation,
vignette) is applied at that size so the grain is native, not upscaled.

Captions: short sentence-case lines in JetBrains Mono, placed above Instagram's bottom UI (the caption and
buttons cover roughly the lowest 20% of a Reel), fading in with a small rise.
"""
import numpy as np
import cv2
from . import vfx as V

VW, VH = 1080, 1920


def keyframes(kf, f):
    """Piecewise eased interpolation of [(frame, value), ...]; a pair with equal frames is a hard cut."""
    kf = sorted(kf)
    if f <= kf[0][0]:
        return kf[0][1]
    for (f0, v0), (f1, v1) in zip(kf, kf[1:]):
        if f0 <= f < f1:
            if f1 == f0:
                return v1
            return v0 + (v1 - v0) * float(V.ease_io((f - f0) / (f1 - f0), 2))
    return kf[-1][1]


def crop_matrix(cx, zoom=1.0, cy=540.0):
    """2x3 affine taking plate (1920x1080) pixels to vertical (1080x1920) pixels."""
    ch = 1080.0 / zoom
    s = VH / ch                                   # plate px -> vertical px
    cw = VW / s
    cx = float(np.clip(cx, cw / 2, 1920 - cw / 2))
    cy = float(np.clip(cy, ch / 2, 1080 - ch / 2))
    return np.float32([[s, 0, VW / 2 - s * cx], [0, s, VH / 2 - s * cy]])


def reframe(img, M):
    out = cv2.warpAffine(img, M, (VW, VH), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    blur = cv2.GaussianBlur(out, (0, 0), 1.6)
    return np.clip(out + (out - blur) * 0.35, 0, 1)      # light unsharp to offset the upscale


class Captions:
    def __init__(self, items, size=56, weight=650, y=1340, line=1.38):
        self.items = items                         # [(f_in, f_out, "text\nsecond line"), ...]
        self.size, self.weight, self.y, self.line = size, weight, y, line

    def layer(self, f):
        """Alpha image (VH x VW) of the caption active at frame f."""
        a = np.zeros((VH, VW), np.float32)
        for f0, f1, text in self.items:
            if not (f0 <= f < f1):
                continue
            k = min(V.smooth((f - f0) / 9.0), V.smooth((f1 - f) / 7.0))
            rise = 16 * (1 - V.ease_out(np.clip((f - f0) / 12.0, 0, 1), 3))
            lines = text.split("\n")
            lh = self.size * self.line
            y0 = self.y - (len(lines) - 1) * lh / 2 + rise
            for i, ln in enumerate(lines):
                ti = V.text_image(ln, self.size, self.weight, 0.0, pad=20)
                a = np.maximum(a, V.place((VH, VW), ti, VW / 2, y0 + i * lh, 1.0) * k)
        return a

    def draw(self, img, f, value=0.97):
        a = self.layer(f)
        if a.max() <= 0:
            return img
        shade = np.clip(cv2.GaussianBlur(a, (0, 0), 26) * 1.6, 0, 0.78)  # soft local shade so white type reads anywhere
        img = img * (1 - shade)
        return img * (1 - a) + value * a
