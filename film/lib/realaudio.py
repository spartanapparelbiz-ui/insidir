"""Score assembly from real recordings: licensed music conformed to the film's 120 BPM frame grid, plus
recorded sound effects whose transients land on their picture frames.

- Music is time-stretched with Rubber Band (pitch preserved) from its own tempo to exactly 120 BPM, so every
  beat falls on a 15-frame boundary, then positioned so a chosen source moment (a downbeat or the drop) lands on a
  chosen film frame.
- Each SFX is placed so its measured transient (hit_time) lands exactly on its frame.
"""
import json
import os
import subprocess
import numpy as np
from scipy import signal

SR = 48000
FPS = 30
BPM = 120
MUSIC = os.environ.get("FILM_MUSIC", "/tmp/claude-0/-home-user-insidir/cd4dae8d-ed8d-5424-aa32-92f44807c414/scratchpad/music")
SFX = os.environ.get("FILM_SFX", "/tmp/claude-0/-home-user-insidir/cd4dae8d-ed8d-5424-aa32-92f44807c414/scratchpad/sfx")


def decode(path, af=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path]
    if af:
        cmd += ["-af", af]
    cmd += ["-f", "f32le", "-ac", "2", "-ar", str(SR), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy()


def conform(path, src_bpm, src_time, film_frame, film_seconds, gain_db=0.0):
    """Music stretched to 120 BPM, positioned so source time `src_time` (s) plays at `film_frame`.
    Returns a stereo buffer the length of the film (silence where the track does not reach)."""
    ratio = BPM / float(src_bpm)                      # tempo factor (>1 = faster)
    x = decode(path, f"rubberband=tempo={ratio:.6f}:transients=crisp:detector=percussive:window=short")
    t_stretched = src_time / ratio                    # where src_time lands in the stretched audio
    offset = int(round((film_frame / FPS - t_stretched) * SR))
    n = int(film_seconds * SR)
    out = np.zeros((2, n), np.float32)
    a0 = max(0, -offset)
    b0 = max(0, offset)
    m = min(x.shape[1] - a0, n - b0)
    if m > 0:
        out[:, b0:b0 + m] = x[:, a0:a0 + m]
    return out * 10 ** (gain_db / 20)


_sfx_cache = {}


def sfx(name):
    """Load an SFX by manifest 'need' or file stem; returns (stereo, hit_time_seconds)."""
    if not _sfx_cache:
        man = json.load(open(os.path.join(SFX, "manifest.json")))
        for e in man:
            _sfx_cache.setdefault(e["need"], e)
            _sfx_cache[os.path.splitext(os.path.basename(e["file"]))[0]] = e
    e = _sfx_cache[name]
    path = e["file"] if os.path.isabs(e["file"]) else os.path.join(SFX, e["file"])
    return decode(path), float(e.get("hit_time") or 0.0)


class Mixer:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n), np.float32)
        return self.buses[name]

    def put(self, x, frame=None, at=None, gain_db=0.0, bus="sfx", hit=0.0, fade_in=0.0, fade_out=0.0, length=None,
            pan=0.0, hp=None, lp=None):
        """Place stereo x so its hit time lands at `frame` (or absolute seconds `at`)."""
        x = x.copy()
        if length is not None:
            x = x[:, : int(length * SR)]
        if hp or lp:
            if hp:
                x = signal.sosfilt(signal.butter(2, hp, "high", fs=SR, output="sos"), x)
            if lp:
                x = signal.sosfilt(signal.butter(2, lp, "low", fs=SR, output="sos"), x)
        if fade_in:
            k = min(int(fade_in * SR), x.shape[1])
            x[:, :k] *= np.linspace(0, 1, k)
        if fade_out:
            k = min(int(fade_out * SR), x.shape[1])
            x[:, -k:] *= np.linspace(1, 0, k)
        if pan:
            x[0] *= np.sqrt(1 - max(pan, 0))
            x[1] *= np.sqrt(1 + min(pan, 0))
        t = (frame / FPS if frame is not None else at) - hit
        i = int(round(t * SR))
        a0 = max(0, -i)
        b0 = max(0, i)
        m = min(x.shape[1] - a0, self.n - b0)
        if m > 0:
            self.bus(bus)[:, b0:b0 + m] += x[:, a0:a0 + m] * 10 ** (gain_db / 20)

    def duck(self, bus, frames, depth_db=-8, attack=0.01, release=0.35):
        """Dip a bus (the music) under big hits so they read, like a mixer riding the fader."""
        env = np.ones(self.n, np.float32)
        tt = np.arange(self.n) / SR
        g = 1 - 10 ** (depth_db / 20)
        for f in frames:
            t0 = f / FPS
            d = tt - t0
            shape = np.where(d < 0, np.exp(d / attack), np.exp(-d / release))
            env = np.minimum(env, 1 - g * shape)
        self.bus(bus)[:] *= env

    def master(self, ceiling_db=-1.0, drive=1.3):
        out = sum(self.buses.values())
        out = signal.sosfilt(signal.butter(2, 28, "high", fs=SR, output="sos"), out)
        peak = np.abs(out).max() + 1e-9
        out = out / peak * drive
        out = np.tanh(out) / np.tanh(drive)                      # gentle bus saturation / limiting
        return (out * 10 ** (ceiling_db / 20)).astype(np.float32)


def music_pick(film):
    """picks.json from the music sourcing pass: film key 'A' | 'B' | 'C' -> primary pick dict."""
    p = json.load(open(os.path.join(MUSIC, "picks.json")))
    v = p[film]
    return v.get("primary", v) if isinstance(v, dict) else v


def cue(mx, name, frame, gain_db=0.0, src=0.0, length=None, hit=None, bus="sfx", **kw):
    """Place recording `name` (manifest stem, e.g. 'car_pass_2') from source second `src` so that its event
    lands on `frame`. hit: the event's time in the source file (default: manifest hit_time, else src)."""
    x, h = sfx(name)
    i = int(src * SR)
    x = x[:, i:]
    hh = (h if h else src) if hit is None else hit
    mx.put(x, frame=frame, gain_db=gain_db, hit=hh - src, length=length, bus=bus, **kw)
