"""Editorial title graphics for the 16:9 cut.

Each title is a small tracked kicker (e.g. "SEC FORM 4") over one or two lines of sentence-case copy, set in
JetBrains Mono and aligned to a left margin in the lower third. On its in-frame (always a beat) a thin rule draws
out from the margin, the kicker fades up, and the copy is revealed by a left-to-right wipe with a short rise; on the
out-frame everything fades together. A soft, wide shade sits behind the block so it reads over any shot without a
box.
"""
import numpy as np
import cv2
from . import vfx as V


class Titles:
    def __init__(self, items, x=150, y=812, size=58, kicker_size=26, line=1.3, out_size=(1920, 1080)):
        self.items = items                       # [(f_in, f_out, kicker, "line one\nline two"), ...]
        self.x, self.y, self.size, self.ks, self.line = x, y, size, kicker_size, line
        self.W, self.H = out_size

    def _blit(self, canvas, img, x0, y0):
        h, w = img.shape
        x1, y1 = min(x0 + w, canvas.shape[1]), min(y0 + h, canvas.shape[0])
        if x1 > x0 and y1 > y0:
            canvas[y0:y1, x0:x1] = np.maximum(canvas[y0:y1, x0:x1], img[: y1 - y0, : x1 - x0])

    def layer(self, f):
        a = np.zeros((self.H, self.W), np.float32)
        rule = np.zeros_like(a)
        for f0, f1, kicker, text in self.items:
            if not (f0 <= f < f1):
                continue
            fade = V.smooth((f1 - f) / 8.0)
            lines = text.split("\n")
            lh = int(self.size * self.line)
            top = int(self.y - (len(lines) - 1) * lh)
            # rule: draws out over 6 frames on the beat
            r = V.ease_out(np.clip((f - f0) / 6.0, 0, 1), 3)
            ky = top - int(self.size * 0.95) - int(self.ks * 1.9)        # kicker sits clear above the copy's caps
            ry = ky + int(self.ks * 0.95)
            cv2.line(rule, (self.x, ry), (self.x + int(64 * r), ry), 1.0, 2, cv2.LINE_AA)
            # kicker
            ki = V.text_image(kicker, self.ks, 700, 0.16, pad=8) * V.smooth((f - f0 - 2) / 6.0) * 0.92
            self._blit(a, ki, self.x - 8 + 84, ky - 8 + int(self.ks * 0.35))
            # copy: left-to-right wipe + rise
            for i, ln in enumerate(lines):
                t = np.clip((f - f0 - 3 - 2 * i) / 9.0, 0, 1)
                ti = V.text_image(ln, self.size, 600, -0.01, pad=10)
                wipe = int(ti.shape[1] * V.ease_out(t, 3))
                ti = ti.copy()
                ti[:, wipe:] = 0
                rise = int(12 * (1 - V.ease_out(t, 3)))
                self._blit(a, ti, self.x - 10, top + i * lh - int(self.size * 0.8) + rise)
            a *= fade
            rule *= fade
        return np.maximum(a, rule)

    def draw(self, img, f, value=0.96):
        a = self.layer(f)
        if a.max() <= 0:
            return img
        shade = np.clip(cv2.GaussianBlur(a, (0, 0), 60) * 2.2, 0, 0.55)
        img = img * (1 - shade)
        return img * (1 - a) + value * a


def letterbox(img, ratio=2.2, f=None, open_from=None):
    """Cinematic bars (2.2:1 inside 16:9); optionally they slide in over the first frames."""
    h, w = img.shape
    bar = int(round((h - w / ratio) / 2))
    if open_from is not None and f is not None:
        bar = int(bar * V.ease_out(np.clip((f - open_from) / 12.0, 0, 1), 3))
    if bar > 0:
        img = img.copy()
        img[:bar] = 0
        img[h - bar:] = 0
    return img


def beat_pulse(f, kicks, amount=0.014, decay=5.0):
    """Zoom factor that kicks out on each beat frame and settles (a camera 'breathing' with the drums)."""
    z = 1.0
    for k in kicks:
        d = (f - k) / 30.0
        if 0 <= d < 0.6:
            z += amount * np.exp(-d * decay * 4) * (1 - np.exp(-d * 120))
    return z
