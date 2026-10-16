"""Original synthesized music and sound design for the Insidir films.

Everything here is generated from oscillators and filtered noise: no samples, no loops, no licensed audio.
Times are in seconds; at 120 BPM one beat is 0.5 s = 15 frames at 30 fps, so every hit lands on a frame.
"""
import numpy as np
from numba import njit
from scipy import signal

SR = 48000
BPM = 120
BEAT = 60 / BPM
RNG = np.random.default_rng(7)


def n(sec):
    return int(round(sec * SR))


def t_axis(sec):
    return np.arange(n(sec)) / SR


def noise(sec):
    return RNG.uniform(-1, 1, n(sec))


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="high", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="low", fs=SR, output="sos"), x)


def sweep_filter(x, f0, f1, q=4.0, kind="band", curve="exp"):
    """Time-varying state-variable filter (Chamberlin), cutoff glides f0 -> f1 across the buffer."""
    N = len(x)
    if curve == "exp":
        fc = f0 * (f1 / f0) ** (np.arange(N) / max(N - 1, 1))
    else:
        fc = np.linspace(f0, f1, N)
    F = 2 * np.sin(np.pi * np.clip(fc, 20, SR / 6) / SR)
    return _svf(np.asarray(x, float), F, 1 / q, {"band": 0, "low": 1, "high": 2}[kind])


@njit(cache=True)
def _svf(x, F, Q, mode):
    low = 0.0
    band = 0.0
    out = np.empty(len(x))
    for i in range(len(x)):
        high = x[i] - low - Q * band
        band += F[i] * high
        low += F[i] * band
        out[i] = band if mode == 0 else (low if mode == 1 else high)
    return out


def env_exp(sec, decay, attack=0.001):
    t = t_axis(sec)
    a = np.clip(t / attack, 0, 1)
    return a * np.exp(-t / decay)


def sat(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


# ---------------------------------------------------------------- drums

def kick(length=0.45, f_hi=160, f_lo=44, punch=0.035, decay=0.22, click=0.5, drive=2.2):
    t = t_axis(length)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / punch)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env_exp(length, decay, 0.0008)
    c = hp(noise(0.006), 3000) * np.linspace(1, 0, n(0.006)) * click
    body[: len(c)] += c
    return sat(body, drive) * 0.95


def clap(length=0.35, tone=1400):
    out = np.zeros(n(length))
    for k, off in enumerate([0, 0.009, 0.018, 0.026]):
        burst = bp(noise(0.02), tone * 0.7, tone * 1.6) * env_exp(0.02, 0.006)
        i = n(off)
        out[i:i + len(burst)] += burst * (1.0 if k < 3 else 0.6)
    tail = bp(noise(length), tone * 0.6, tone * 2.2) * env_exp(length, 0.09)
    out += tail * 0.7
    return out / (np.abs(out).max() + 1e-9) * 0.8


def snare(length=0.3, tone=185):
    t = t_axis(length)
    body = np.sin(2 * np.pi * tone * t * (1 + 0.4 * np.exp(-t / 0.01))) * env_exp(length, 0.05)
    nz = bp(noise(length), 1800, 9000) * env_exp(length, 0.08)
    return sat(body * 0.6 + nz * 0.8, 1.5) * 0.8


def hat(open_=False, bright=8000):
    length = 0.22 if open_ else 0.045
    x = hp(noise(length), bright, 4) * env_exp(length, 0.07 if open_ else 0.012)
    return x * 0.5


def click(freq=4200, length=0.012, q=12):
    """Tight 'clicky' transient: resonant ping of a single impulse."""
    x = np.zeros(n(length))
    x[0] = 1.0
    x = sweep_filter(x, freq, freq, q=q)
    return x / (np.abs(x).max() + 1e-9) * 0.7


def rim(length=0.06):
    t = t_axis(length)
    x = (np.sin(2 * np.pi * 1650 * t) + 0.6 * np.sin(2 * np.pi * 820 * t)) * env_exp(length, 0.008)
    x += hp(noise(length), 2500) * env_exp(length, 0.004) * 0.5
    return x * 0.6


def tick(pitch=3100, length=0.05, metal=True):
    """Mechanical watch/clock tick: a bright escapement ping plus a dull wooden thunk."""
    t = t_axis(length)
    ping = sum(np.sin(2 * np.pi * pitch * r * t) * a for r, a in [(1, 1), (2.76, 0.5), (5.4, 0.25)])
    ping *= env_exp(length, 0.006 if metal else 0.003)
    thunk = lp(noise(length), 900) * env_exp(length, 0.01) * 0.6
    return (ping * 0.5 + thunk) * 0.7


def ratchet(length=0.4, rate=38, pitch=2600):
    out = np.zeros(n(length))
    k = 0
    while k / rate < length - 0.02:
        tk = tick(pitch * (1 + 0.04 * RNG.standard_normal()), 0.02)
        i = n(k / rate)
        out[i:i + len(tk)] += tk * (0.6 + 0.4 * RNG.random())
        k += 1
    return out


def shutter():
    a = click(5200, 0.01, 8)
    b = click(3100, 0.02, 6)
    out = np.zeros(n(0.09))
    out[: len(a)] += a
    out[n(0.045): n(0.045) + len(b)] += b * 0.8
    return out


# ---------------------------------------------------------------- tonal

def saw(f, t):
    return 2 * ((f * t) % 1.0) - 1


def reese(freq, length, detune=0.012, cutoff=320, drive=1.6):
    t = t_axis(length)
    x = saw(freq * (1 - detune), t) + saw(freq * (1 + detune), t) + 0.5 * saw(freq / 2, t)
    x = lp(x, cutoff, 4)
    return sat(x * 0.5, drive)


def sub(freq, length, glide_to=None):
    t = t_axis(length)
    f = np.full_like(t, freq) if glide_to is None else freq * (glide_to / freq) ** (t / length)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def stab(freqs, length=0.4, cutoff=2200, decay=0.16):
    t = t_axis(length)
    x = sum(saw(f * d, t) for f in freqs for d in (0.996, 1.004))
    x = lp(x, cutoff, 2) * env_exp(length, decay, 0.003)
    return x / (len(freqs) * 2) * 1.2


def pad(freqs, length, cutoff=900):
    t = t_axis(length)
    x = sum(saw(f * d, t) for f in freqs for d in (0.993, 1.0, 1.007))
    x = lp(x, cutoff, 2)
    fade = np.minimum(1, np.minimum(t / 0.8, (length - t) / 0.8))
    return x / (len(freqs) * 3) * fade


def drone(freq, length):
    t = t_axis(length)
    x = sub(freq, length) * 0.6 + lp(saw(freq * 1.002, t) + saw(freq * 1.5, t) * 0.4, 260, 2) * 0.4
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.13 * t)
    fade = np.minimum(1, np.minimum(t / 1.5, (length - t) / 0.3))
    return x * lfo * fade


def note_hz(name):
    names = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
             "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
    p, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((names[p] + 12 * (o + 1) - 69) / 12)


# ---------------------------------------------------------------- transitions / fx

def whoosh(length=0.6, f0=300, f1=4000, peak=0.6):
    x = noise(length)
    x = sweep_filter(x, f0, f1, q=2.2)
    t = t_axis(length)
    e = np.where(t < peak * length, (t / (peak * length)) ** 2, np.exp(-(t - peak * length) / (0.18 * length)))
    return x * e * 1.2


def riser(length=2.0, f0=200, f1=7000):
    x = sweep_filter(noise(length), f0, f1, q=3.0)
    t = t_axis(length)
    tone = np.sin(2 * np.pi * np.cumsum(110 * (16 ** (t / length))) / SR) * 0.25
    return (x + tone) * (t / length) ** 2.2


def downlifter(length=1.2):
    x = sweep_filter(noise(length), 6000, 150, q=2.5)
    return x * np.exp(-t_axis(length) / (length * 0.4))


def impact(length=1.6, f=48, crack=0.6):
    t = t_axis(length)
    boom = np.sin(2 * np.pi * np.cumsum(f + 70 * np.exp(-t / 0.05)) / SR) * env_exp(length, 0.45, 0.001)
    cr = hp(noise(0.25), 1200) * env_exp(0.25, 0.04) * crack
    out = sat(boom * 1.4, 2.0)
    out[: len(cr)] += cr
    return out


def sub_drop(length=1.0, f0=90, f1=28):
    return sub(f0, length, f1) * env_exp(length, length * 0.6, 0.002) * 0.9


def reverse_swell(length=0.8, f=200):
    x = bp(noise(length), f, f * 12) + 0.3 * np.sin(2 * np.pi * f * t_axis(length))
    return x * (t_axis(length) / length) ** 3


def rain(length, density=1.0):
    bed = lp(hp(noise(length), 400), 6000) * 0.12 * density
    drops = np.zeros(n(length))
    for _ in range(int(160 * length * density)):
        i = RNG.integers(0, len(drops) - 400)
        d = click(RNG.uniform(2500, 7000), 0.006, 6) * RNG.uniform(0.02, 0.12)
        drops[i:i + len(d)] += d
    return bed + drops


def rumble(length, f=38):
    x = lp(noise(length), 140, 4) * 2.5 + 0.4 * sub(f, length)
    t = t_axis(length)
    return x * np.minimum(1, np.minimum(t / 0.3, (length - t) / 0.3))


def crowd(length, intensity=1.0):
    """Trading-floor roar: many band-limited 'voices' with syllabic amplitude modulation."""
    out = np.zeros(n(length))
    t = t_axis(length)
    for _ in range(24):
        f = RNG.uniform(250, 1400)
        v = bp(noise(length), f * 0.8, f * 1.3)
        am = 0.5 + 0.5 * np.sin(2 * np.pi * RNG.uniform(3, 7) * t + RNG.uniform(0, 6.28))
        out += v * am ** 2
    out = bp(out, 180, 3800)
    out /= np.abs(out).max() + 1e-9
    return out * intensity * np.minimum(1, t / 0.2)


def press(length, rate=9.0):
    """Rotary printing press: rolling drum rumble plus a periodic clatter."""
    out = rumble(length, 50) * 0.5
    k = 0
    while k / rate < length - 0.05:
        c = bp(noise(0.05), 900, 5000) * env_exp(0.05, 0.01)
        i = n(k / rate)
        out[i:i + len(c)] += c * 0.6
        k += 1
    return out


def phone_slam():
    a = impact(0.9, 70, 0.3) * 0.7
    b = bp(noise(0.12), 600, 3500) * env_exp(0.12, 0.02)
    bell = sum(np.sin(2 * np.pi * f * t_axis(0.5)) for f in (1180, 1630, 2400)) * env_exp(0.5, 0.12) * 0.12
    out = np.zeros(n(0.9))
    out += a
    out[: len(b)] += b
    out[n(0.01): n(0.01) + len(bell)] += bell
    return out


def car_pass(length=1.4):
    t = t_axis(length)
    f = 85 * (1.25 - 0.5 * (t / length))
    eng = sat(np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * saw(f * 2, t), 2) * 0.3
    road = bp(noise(length), 200, 2500) * 0.4
    e = np.exp(-((t - length * 0.45) / (length * 0.22)) ** 2)
    return (eng + road) * e


# ---------------------------------------------------------------- mixing

def make_ir(length=2.2, decay=0.6, damp=5000, seed=3):
    r = np.random.default_rng(seed)
    t = t_axis(length)
    out = []
    for _ in range(2):
        x = r.uniform(-1, 1, len(t)) * np.exp(-t / decay)
        out.append(lp(x, damp))
    ir = np.stack(out)
    return ir / np.abs(ir).sum(axis=1, keepdims=True).max() * 6


class Mix:
    def __init__(self, seconds):
        self.N = n(seconds)
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.N))
        return self.buses[name]

    def add(self, x, at, gain=1.0, pan=0.0, bus="main"):
        b = self.bus(bus)
        if x.ndim == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            x = np.stack([x * l, x * r]) * np.sqrt(2)
        i = n(at)
        if i < 0:
            x = x[:, -i:]
            i = 0
        m = min(x.shape[1], self.N - i)
        if m > 0:
            b[:, i:i + m] += x[:, :m] * gain

    def sidechain(self, bus, hits, depth=0.75, release=0.16):
        env = np.ones(self.N)
        t = np.arange(self.N) / SR
        for h in hits:
            i = n(h)
            seg = t[i:] - h
            env[i:] = np.minimum(env[i:], 1 - depth * np.exp(-seg / release) * (seg < release * 5))
        self.bus(bus)[:] *= env

    def reverb(self, bus, send, ir):
        dry = self.bus(bus)
        wet = np.stack([signal.fftconvolve(dry[0], ir[0])[: self.N], signal.fftconvolve(dry[1], ir[1])[: self.N]])
        self.bus("verb")[:] += wet * send

    def master(self, target_peak=0.93):
        out = sum(self.buses.values())
        out = hp(out, 25)
        peak = np.abs(out).max() + 1e-9
        out = out / peak * 1.6
        out = np.tanh(out) / np.tanh(1.6)
        return out * target_peak


def write_wav(path, stereo):
    import soundfile as sf
    sf.write(path, stereo.T.astype(np.float32), SR, subtype="PCM_24")
