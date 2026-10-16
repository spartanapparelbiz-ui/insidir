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
            shape = np.where(d < 0, np.exp(np.maximum(d, -1) / attack), np.exp(-np.maximum(d, 0) / release))
            env = np.minimum(env, 1 - g * shape)
        self.bus(bus)[:] *= env

    def master(self, lufs=-11.0, ceiling_db=-1.6):
        out = sum(self.buses.values())
        out = signal.sosfilt(signal.butter(2, 28, "high", fs=SR, output="sos"), out).astype(np.float32)
        for _ in range(3):                                  # loudness-normalise, then limit, re-measure
            out = out * 10 ** ((lufs - integrated_lufs(out)) / 20)
            out = limit(out, ceiling_db)
        return out


def integrated_lufs(x):
    """ITU-R BS.1770 integrated loudness (K-weighting, 400 ms blocks, absolute and relative gates)."""
    pre = signal.sosfilt(np.array([[1.53512485958697, -2.69169618940638, 1.19839281085285, 1.0, -1.69065929318241,
                                    0.73248077421585]]), x)
    k = signal.sosfilt(np.array([[1.0, -2.0, 1.0, 1.0, -1.99004745483398, 0.99007225036621]]), pre)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([np.mean(k[:, i:i + blk] ** 2, axis=1).sum() for i in range(0, k.shape[1] - blk, hop)])
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[l > -70]
    rel = -0.691 + 10 * np.log10(g.mean() + 1e-12) - 10
    g = g[(-0.691 + 10 * np.log10(g + 1e-12)) > rel]
    return float(-0.691 + 10 * np.log10(g.mean() + 1e-12))


def limit(x, ceiling_db=-1.0, look=0.005, release=0.08):
    """Look-ahead brickwall limiter: gain = ceiling/peak, minimum over the look-ahead window, smoothed release."""
    from scipy.ndimage import minimum_filter1d
    c = 10 ** (ceiling_db / 20)
    pk = np.abs(x).max(axis=0)
    g = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    n = int(look * SR)
    g = minimum_filter1d(g, 2 * n + 1)
    a = np.exp(-1 / (release * SR))
    return (x * _release(g.astype(np.float64), a)).astype(np.float32)


from numba import njit


@njit(cache=True)
def _release(g, a):
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):                             # instant attack (already looked ahead), smooth release
        v = g[i]
        cur = v if v < cur else a * cur + (1 - a) * v
        out[i] = cur
    return out


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


def grid_phase(mus, after_frame):
    """Seconds to shift the music so its kick-driven beats (measured after `after_frame`) sit on the beat grid."""
    import librosa
    lo = signal.sosfilt(signal.butter(4, 120, "low", fs=SR, output="sos"), mus.mean(0))
    i0 = int(after_frame / FPS * SR)
    env = librosa.onset.onset_strength(y=lo[i0:], sr=SR, hop_length=128)
    _, beats = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=128, start_bpm=BPM, tightness=400,
                                       units="time")
    if len(beats) < 4:
        return 0.0
    beat = 60 / BPM
    ph = ((beats + i0 / SR) % beat) / beat * 2 * np.pi
    mean = np.angle(np.mean(np.exp(1j * ph)))            # circular mean phase of the beats
    return float(-mean / (2 * np.pi) * beat)


def build(module, film_key, src_time, frame, music_from=None, fade_in=0.02, music_db=-1.5, duck_db=-6.0):
    """Full score: the film's music pick conformed to the grid (src_time lands on frame), silent before
    music_from (frame) with a fade, the module's recorded SFX cues, music ducked under the big hits."""
    secs = module.N_FRAMES / FPS
    p = music_pick(film_key)
    mus = conform(p["file"], p["bpm"], src_time, frame, secs, music_db)
    shift = grid_phase(mus, frame)                       # phase-lock the kicks to the 15-frame grid
    if abs(shift) > 0.002:
        mus = conform(p["file"], p["bpm"], src_time, frame + shift * FPS, secs, music_db)
    if music_from is not None:
        t = np.arange(mus.shape[1]) / SR - music_from / FPS
        mus *= np.clip(t / max(fade_in, 1e-3), 0, 1)
    k = int(0.25 * SR)                                   # tail: let the last bar breathe out
    mus[:, -k:] *= np.linspace(1, 0.15, k)
    mx = Mixer(secs)
    mx.bus("music")[:] += mus
    module.cues(mx)
    mx.duck("music", module.HITS_BIG, duck_db)
    return mx.master()
