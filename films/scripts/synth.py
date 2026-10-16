"""Original score and sound design for the three Insidir films, synthesized from scratch (no samples).

Each film writes three stems to audio/: film<N>_music.wav, film<N>_sfx.wav, film<N>_mix.wav (48 kHz stereo).
Cue times are the same numbers the picture uses (render/film<N>.js), so cuts, hits and actions line up.
Usage: python3 scripts/synth.py [1|2|3 ...]
"""
import sys, wave
import numpy as np
from scipy import signal

SR = 48000
rs = np.random.default_rng(7)

# ---------------------------------------------------------------- primitives
def T(d): return np.arange(int(d * SR)) / SR
def env_exp(d, tau): return np.exp(-T(d) / tau)
def adsr(n, a=.005, r=.05):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr and nr < n: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def noise(d): return rs.standard_normal(int(d * SR))
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, "lowpass", fs=SR, output="sos"), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, "highpass", fs=SR, output="sos"), x)
def lp_sweep(x, f0, f1, block=256):
    """Time-varying one-pole-ish lowpass by blocks (cutoff moves f0 -> f1, exponential)."""
    out = np.zeros_like(x); zi = None; n = len(x)
    for i in range(0, n, block):
        f = f0 * (f1 / f0) ** (i / max(1, n))
        sos = signal.butter(2, min(f, SR * .45), "lowpass", fs=SR, output="sos")
        if zi is None: zi = signal.sosfilt_zi(sos) * 0
        out[i:i + block], zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
    return out
def saw(f, d, detune=0.):
    t = T(d); ph = (f * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + .5))
def sq(f, d, pw=.5):
    t = T(d); ph = (f * t) % 1
    return np.where(ph < pw, 1., -1.)
def sine(f, d, ph=0): return np.sin(2 * np.pi * f * T(d) + ph)
def mtof(m): return 440 * 2 ** ((m - 69) / 12)

class Bus:
    def __init__(self, dur): self.L = np.zeros(int(dur * SR) + SR); self.R = np.zeros_like(self.L); self.dur = dur
    def add(self, t, x, g=1., pan=0.):
        i = int(round(t * SR))
        if i >= len(self.L): return
        if i < 0: x = x[-i:]; i = 0
        x = x[:len(self.L) - i]
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.L[i:i + len(x)] += x * g * l * 1.414; self.R[i:i + len(x)] += x * g * r * 1.414
    def stereo(self): return np.stack([self.L[:int(self.dur * SR)], self.R[:int(self.dur * SR)]], 1)

def delay(x, sec, fb=.35, mix=.3, lpf=4000):
    out = x.copy(); d = int(sec * SR); buf = x.copy()
    for k in range(1, 7):
        buf = lp(np.concatenate([np.zeros(d), buf[:-d]]) * fb, lpf, 1)
        out += buf * mix / fb
    return out
def reverb(st, size=1.6, mix=.25, damp=5000):
    """Cheap stereo convolution reverb from decaying filtered noise."""
    n = int(size * SR); e = np.exp(-np.arange(n) / SR * 6.9 / size)
    out = np.zeros_like(st)
    for ch in range(2):
        ir = lp(rs.standard_normal(n), damp, 1) * e; ir /= np.sqrt((ir ** 2).sum())
        wet = signal.fftconvolve(st[:, ch], ir)[:len(st)]
        out[:, ch] = st[:, ch] + wet * mix
    return out
def duck(st, times, depth=.6, rel=.22):
    g = np.ones(len(st))
    for t in times:
        i = int(t * SR); n = int(rel * SR)
        if i >= len(g): continue
        seg = 1 - depth * np.exp(-np.arange(min(n, len(g) - i)) / SR / (rel / 4))
        g[i:i + len(seg)] = np.minimum(g[i:i + len(seg)], seg)
    return st * g[:, None]
def gate(st, t0, t1, fade=.01):
    """Silence a stem between t0 and t1 (sudden drop-outs)."""
    g = np.ones(len(st)); i0, i1, f = int(t0 * SR), int(t1 * SR), int(fade * SR)
    g[i0:i1] = 0; g[max(0, i0 - f):i0] = np.linspace(1, 0, min(f, i0)); g[i1:i1 + f] = np.linspace(0, 1, f)[:len(g[i1:i1 + f])]
    return st * g[:, None]

# ---------------------------------------------------------------- instruments
def kick(punch=1., d=.45, f0=150, f1=44, drive=1.2):
    t = T(d); f = f1 + (f0 - f1) * np.exp(-t / .028); ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / (.16 * punch)); x[:200] += noise(200 / SR) * np.linspace(.6, 0, 200) * .5
    return np.tanh(x * drive)
def snare(d=.25, tone=190, crack=1.):
    t = T(d); body = np.sin(2 * np.pi * tone * t) * np.exp(-t / .045)
    n = bp(noise(d), 1200, 9000) * np.exp(-t / .07) * crack
    return np.tanh((body * .7 + n * 1.3) * 1.3)
def clap(d=.3):
    t = T(d); n = bp(noise(d), 900, 5000)
    e = np.exp(-t / .09);
    for k in (0, .011, .022): e += (t >= k) * np.exp(-np.maximum(t - k, 0) / .006) * .9
    return n * e * .8
def hat(d=.06, open_=False):
    dd = .3 if open_ else d; t = T(dd); return hp(noise(dd), 7000, 4) * np.exp(-t / (.09 if open_ else .014))
def tick(f=3200, d=.03, q=.004):
    t = T(d); return (bp(noise(d), f * .7, min(f * 1.6, 20000)) * np.exp(-t / q) + np.sin(2 * np.pi * f * 1.7 * t) * np.exp(-t / .003) * .5)
def clock_tick(tock=False):
    a = tick(2600 if tock else 3100, .05, .003)
    body = bp(noise(.05), 500, 1400) * np.exp(-T(.05) / .006) * .5
    return a + body
def shutter():
    a = tick(5200, .04, .003) + bp(noise(.04), 1500, 6000) * np.exp(-T(.04) / .008)
    b = tick(3400, .05, .005) * .9 + bp(noise(.05), 800, 4000) * np.exp(-T(.05) / .01) * .8
    x = np.zeros(int(.12 * SR)); x[:len(a)] += a; x[int(.045 * SR):int(.045 * SR) + len(b)] += b
    return x
def clatter(d, rate=18, f=2600, jitter=.3, g=1.):
    x = np.zeros(int(d * SR)); t = 0.
    while t < d:
        c = tick(f * (.8 + rs.random() * .4), .02, .0025) * (.5 + rs.random() * .5)
        i = int(t * SR); x[i:i + len(c)] += c[:len(x) - i]; t += (1 / rate) * (1 + (rs.random() - .5) * jitter)
    return x * g
def paper(d=.35, bright=1.):
    t = T(d); n = bp(noise(d), 1500, 9000 * bright)
    am = (1 + .8 * np.sin(2 * np.pi * 37 * t + rs.random() * 6)) * np.exp(-((t - d * .35) / (d * .3)) ** 2)
    cr = (rs.random(len(t)) > .9985) * rs.standard_normal(len(t)) * 3
    return (n * am + bp(cr, 2000, 8000)) * .6
def paper_slam():
    t = T(.6); thud = np.sin(2 * np.pi * (60 + 80 * np.exp(-t / .02)) * t) * np.exp(-t / .1)
    return np.tanh(thud * 1.5 + bp(noise(.6), 300, 6000) * np.exp(-t / .06) * 1.2 + paper(.6) * .5)
def impact(d=2.5, f=46, g=1.):
    t = T(d); sub = np.sin(2 * np.pi * (f + 30 * np.exp(-t / .05)) * t) * np.exp(-t / .7)
    body = lp(noise(d), 400) * np.exp(-t / .25) * .8
    crack = bp(noise(d), 1500, 9000) * np.exp(-t / .03) * .6
    return np.tanh((sub * 1.2 + body + crack) * 1.4) * g
def riser(d, f0=300, f1=6000):
    x = noise(d); y = np.zeros_like(x); n = len(x); blk = 512; zi = None
    for i in range(0, n, blk):
        fc = f0 * (f1 / f0) ** (i / n); sos = signal.butter(2, [fc * .8, min(fc * 1.25, SR * .45)], "bandpass", fs=SR, output="sos")
        if zi is None: zi = signal.sosfilt_zi(sos) * 0
        y[i:i + blk], zi = signal.sosfilt(sos, x[i:i + blk], zi=zi)
    return y * np.linspace(0, 1, n) ** 2
def whoosh(d=.5):
    x = riser(d, 200, 3000); return x * np.hanning(len(x)) * 2
def rain(d):
    base = lp(hp(noise(d), 500), 4200) * .09
    drops = (rs.random(int(d * SR)) > .9993) * rs.standard_normal(int(d * SR))
    return base + bp(drops, 1800, 7000) * .7
def traffic(d):
    t = T(d); return lp(noise(d), 180, 2) * (1 + .3 * np.sin(2 * np.pi * .13 * t)) * 1.8
def room(d): return lp(noise(d), 600, 2) * .08
def pen(d):
    t = T(d); n = bp(noise(d), 3000, 6500) * (.35 + .65 * np.abs(np.sin(2 * np.pi * 11 * t))) * .14
    return n * adsr(len(n), .02, .05)
def highlight_squeak(d=.32):
    t = T(d); f = 1900 + 300 * np.sin(2 * np.pi * 7 * t)
    return (bp(noise(d), 2000, 7000) * .5 + np.sin(2 * np.pi * np.cumsum(f) / SR) * .04) * adsr(int(d * SR), .02, .08)
def phone_bell(d=.5):
    t = T(d); trem = (np.sin(2 * np.pi * 20 * t) > 0).astype(float) * .8 + .2
    tone = sum(np.sin(2 * np.pi * f * t) * a for f, a in ((1180, 1), (2360, .4), (3520, .25), (870, .3)))
    return tone * trem * adsr(len(t), .003, .08) * .4
def phone_clack(): return np.tanh(tick(1400, .12, .015) * 2 + bp(noise(.12), 200, 1500) * np.exp(-T(.12) / .02))
def press_thump(): t = T(.25); return np.tanh(np.sin(2 * np.pi * 70 * t) * np.exp(-t / .06) * 1.5 + bp(noise(.25), 400, 3000) * np.exp(-t / .03))
def mouse_click(): return tick(4200, .02, .0015) * .8
def keyclick(): return tick(3800, .025, .002) * .6 + bp(noise(.025), 600, 2500) * np.exp(-T(.025) / .004) * .5
def heartbeat(): return np.tanh(lp(kick(.7, .4, 90, 38), 300) * 1.4)


# ---- voices & foley for the 3D films
VOWELS = [(730, 1090), (270, 2290), (530, 1840), (570, 840), (300, 870), (660, 1700), (440, 1020)]
def voice(d, f0, seed, shout=False):
    """A babbling voice: a glottal pulse train through two formants that change every syllable."""
    rr = np.random.default_rng(seed); t = T(d); n = len(t)
    f = f0 * (1 + .06 * np.sin(2 * np.pi * (.5 + rr.random()) * t) + (.25 if shout else 0) * np.sin(np.pi * np.clip(t / d, 0, 1)))
    ph = np.cumsum(f) / SR; src = (ph % 1) * 2 - 1 + rr.standard_normal(n) * .08
    out = np.zeros(n); seg = int(SR / (4 + rr.random() * 3)); i = 0
    while i < n:
        j = min(n, i + seg); F1, F2 = VOWELS[rr.integers(len(VOWELS))]
        if rr.random() < .82:
            x = bp(src[i:j], F1 * .8, F1 * 1.25) + bp(src[i:j], F2 * .85, F2 * 1.15) * .6
            out[i:j] += x * np.hanning(j - i)
        i = j
    return np.tanh(out * (3 if shout else 1.5)) * (1.4 if shout else 1)
def crowd(d, n=26, seed=1, shouts=4, level=1.):
    rr = np.random.default_rng(seed); out = np.zeros(int(d * SR))
    for k in range(n):
        v = voice(d, 95 + rr.random() * 120, seed * 100 + k) * (.3 + rr.random() * .5)
        sh = int(rr.random() * .3 * SR); out[sh:] += v[:len(out) - sh]
    for k in range(shouts):
        st = rr.random() * max(.01, d - .5); dd = min(d - st, .4 + rr.random() * .6)
        v = voice(dd, 170 + rr.random() * 90, seed * 1000 + k, shout=True); i = int(st * SR); out[i:i + len(v)] += v[:len(out) - i] * .9
    return lp(hp(out, 120), 5000) / max(1, n ** .5) * 2.2 * level
def footstep(heavy=1.):
    t = T(.18); return np.tanh(lp(noise(.18), 300) * np.exp(-t / .03) * 2 * heavy + bp(noise(.18), 1500, 6000) * np.exp(-t / .012) * .6)
def engine(d, f=38):
    t = T(d); x = saw(f, d) + saw(f * 1.5, d) * .4 + sine(f / 2, d)
    return lp(x, 220) * (1 + .2 * np.sin(2 * np.pi * 3 * t)) * .35
def tires(d): return bp(noise(d), 700, 5500) * .25 * (1 + .3 * np.sin(2 * np.pi * .7 * T(d)))
def creak(d=.5, f=90):
    t = T(d); fr = f * (1 + .4 * np.sin(2 * np.pi * 1.3 * t)); ph = np.cumsum(fr) / SR
    pulses = (np.diff(np.floor(ph), prepend=0) > 0).astype(float)
    return bp(pulses, 300, 2800) * adsr(len(t), .05, .1) * 2.5
def hinge(): return creak(.7, 70) * .8
def thunk():
    t = T(.2); x = lp(noise(.2), 500) * np.exp(-t / .02) * 2; c = tick(1200, .05, .006) * .4; x[:len(c)] += c
    return np.tanh(x)

def pluck(f, d=.25, cutoff=2400, decay=.18):
    x = saw(f, d) + saw(f, d, .006) * .7
    return lp(x, cutoff) * np.exp(-T(d) / decay) * adsr(int(d * SR), .002, .02)
def pad(freqs, d, cutoff=1400, amp=.18):
    x = np.zeros(int(d * SR))
    for f in freqs:
        for dt in (-.004, .0, .005): x += saw(f, d, dt)
    x = lp(x, cutoff, 2) / (len(freqs) * 3)
    return x * adsr(len(x), min(1.2, d / 3), min(1.2, d / 3)) * amp * 3
def bass_note(f, d, cutoff=500, drive=1.5, wave="saw"):
    x = saw(f, d) if wave == "saw" else sq(f, d)
    x = x + np.sin(2 * np.pi * f / 2 * T(d)) * .8
    return np.tanh(lp(x, cutoff) * drive) * adsr(int(d * SR), .004, .03)
def dist_bass(f, d, cutoff=900):
    x = saw(f, d) + saw(f * 1.003, d) + sq(f / 2, d) * .6
    return np.tanh(lp(np.tanh(x * 3), cutoff) * 2.2) * adsr(int(d * SR), .002, .02)

# ---------------------------------------------------------------- mastering & IO
def master(st, target_peak=.78):
    st = st - st.mean(0)
    st = np.tanh(st * 1.15) / np.tanh(1.15)
    pk = np.abs(st).max(); return st * (target_peak / pk if pk > 0 else 1)
def write(path, st):
    st = np.clip(st, -1, 1); d = (st * 32767).astype("<i2")
    with wave.open(path, "wb") as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes())
def read_wav(path):
    with wave.open(path) as w:
        n, sr, ch = w.getnframes(), w.getframerate(), w.getnchannels(); x = np.frombuffer(w.readframes(n), "<i2").astype(float) / 32768
    x = x.reshape(-1, ch).mean(1)
    if sr != SR: x = signal.resample_poly(x, SR, sr)
    return x

# ================================================================ FILM 01 — dark hypnotic house, 128 BPM, F minor
def film1():
    D = 20.; B = 60 / 128; b = lambda n: n * B
    mus, sfx = Bus(D), Bus(D)
    # chords: Fm9, Dbmaj7, Ebsus, Cm7 — one bar each
    prog = [[53, 56, 60, 63, 67], [49, 53, 56, 60, 65], [51, 55, 58, 62, 65], [48, 51, 55, 58, 63]]
    bar = 4 * B
    for i in range(6):
        ch = prog[i % 4]; mus.add(i * bar, pad([mtof(m) for m in ch], bar + .3, cutoff=900 + i * 250, amp=.16), .9, (-1) ** i * .15)
    # hypnotic 16th arp (the 'glue'): opens from a muffled pulse to a bright pluck
    arp_notes = [0, 3, 7, 10, 12, 10, 7, 3]
    n16 = int(D / (B / 4))
    for k in range(n16):
        t = k * B / 4
        if t > D - .2: break
        ch = prog[int(t // bar) % 4]; m = ch[0] + 12 + arp_notes[k % 8]
        cut = 500 + 3800 * min(1, t / 8)
        g = .22 if t < b(8) else .3
        if b(28) <= t < b(36): g = 0
        if t >= b(39): g = 0
        mus.add(t, pluck(mtof(m), .22, cut, .12), g, .35 * np.sin(k * .7))
    # sub pulse on every beat from the start; full drums from beat 8
    kicks, claps = [], []
    for k in range(int(D / B) + 1):
        t = b(k)
        if t >= D: break
        if b(28) <= t < b(36) or t >= b(39): continue
        if k < 8: mus.add(t, lp(kick(.8, .35, 90, 42), 200), .45)
        else: mus.add(t, kick(), .95); kicks.append(t)
        if k >= 8 and k % 2 == 1: mus.add(t, clap(), .38, .1); claps.append(t)
        if k >= 8: mus.add(t + B / 2, hat(open_=k % 4 == 3), .22, .3)
        if k >= 22:  # accelerate: 16th hats from the 'someone is still working' push
            for s in (1, 3): mus.add(t + s * B / 4, hat(), .14, -.3)
        if k >= 8:  # rolling offbeat bass
            root = prog[int(t // bar) % 4][0] - 24
            for s in (2, 3): mus.add(t + s * B / 4, bass_note(mtof(root), B / 4 * .9, 380), .32)
    # return of the beat for the reveal
    for k in (36, 37, 38):
        mus.add(b(k), kick(), .95); kicks.append(b(k)); mus.add(b(k) + B / 2, hat(), .2)
        root = prog[0][0] - 24; mus.add(b(k) + B / 2, bass_note(mtof(root), B / 2 * .9, 420), .36)
    # final bass impact + tail
    mus.add(b(39) - 1.2, riser(1.2, 200, 5000), .18)
    m = mus.stereo(); m = duck(m, kicks, .45, .2)
    m = gate(m, b(28), b(36), .004)  # the drop-out before the discovery
    sfx.add(b(39), impact(2.2, 41), 1.0)
    sfx.add(b(39), lp(pad([mtof(41), mtof(48), mtof(53)], 1.8, 600, .3), 900), .9)
    # ---- sound design
    r = rain(D) + traffic(D) * 1.1
    rg = np.ones(len(r)); i0, i1 = int(b(28) * SR), int(b(36) * SR); rg[i0:i1] = .3; rg = lp(rg, 8, 1)
    sfx.add(0, r * rg, .42)
    sfx.add(b(8) - .09, shutter(), .9); sfx.add(b(17) - .09, shutter(), .9)
    sfx.add(b(5), tires(b(3)), .55, .3)   # taxis through the rain
    cut_sfx = {8: "phone", 9: "floor", 10: "press", 11: "floor", 12: "watch", 13: "shout", 14: "press", 15: "floor", 16: "watch", 16.5: "floor"}
    for k, kind in cut_sfx.items():
        t = b(k); dur = B if k != 16 else B / 2
        if kind == "phone": sfx.add(t + .13, phone_clack(), .8, -.2); sfx.add(t, phone_bell(.35), .22, .3)
        if kind in ("floor", "shout"): sfx.add(t - .05, crowd(dur + .15, 22, int(k * 10), 3 if kind == "floor" else 1), .9, .1)
        if kind == "shout": sfx.add(t + .05, voice(dur * .9, 210, 77, shout=True), .7, .2)
        if kind == "watch":
            for s_ in range(int(dur * 8)): sfx.add(t + s_ / 8, tick(4200, .02, .0015), .5)
        if kind == "ticker": sfx.add(t, clatter(dur, 14, 1800, .1), .6, -.2)
        if kind == "press":
            for s in range(4): sfx.add(t + s * B / 4, press_thump(), .5)
            sfx.add(t, bp(noise(dur), 300, 2500) * .25, .6)
    sfx.add(b(22), paper(.5), .6, .2)                               # page under the lamp
    for k in (25, 26, 27): sfx.add(b(k), shutter(), .45); sfx.add(b(k), paper(.25, 1.2), .35)
    sfx.add(b(25), riser(b(28) - b(25), 400, 7000), .22)
    sfx.add(b(28), room(b(36) - b(28)), 1.0)                         # the silence has air in it
    sfx.add(b(28) + .45, pen(1.05), .7, .1)                          # the pen underlines the line
    sfx.add(b(34) - .1, whoosh(.9), .35)                             # pull back
    sfx.add(b(36), impact(.8, 55, .5), .5)
    sfx.add(b(39) + .62, tick(5000, .03, .002), .4)                  # dots lock into the wordmark
    s = sfx.stereo()
    return m, s, 1.0, .85

# ================================================================ FILM 02 — minimal, mechanical, 120 BPM, D minor
def film2():
    D = 25.; B = .5
    mus, sfx = Bus(D), Bus(D)
    # analog arpeggio in 8ths: Dm, Bb, Gm, A (2 bars each)
    prog = [[50, 53, 57, 62], [46, 50, 53, 58], [43, 46, 50, 55], [45, 49, 52, 57]]
    bar = 4 * B
    def chord_at(t): return prog[int(t // (2 * bar)) % 4]
    kicks = []
    for k in range(int(D / (B / 2))):
        t = k * B / 2
        if 16 <= t < 21 or t >= 23.3: continue
        ch = chord_at(t); m = ch[k % 4] + (12 if t >= 10 and k % 8 >= 4 else 0)
        if t >= 2.5:
            cut = 900 if t < 10 else 1800
            mus.add(t, lp(sq(mtof(m), B / 2 * .8, .3) * adsr(int(B / 2 * .8 * SR), .002, .04), cut) * np.exp(-T(B / 2 * .8) / .25), .16, .25 * np.sin(k))
        if k % 1 == 0 and (t < 16 or 21 <= t < 23.3):  # pulse bass in 8ths
            mus.add(t, bass_note(mtof(ch[0] - 12), B / 2 * .7, 260 if t < 10 else 420, 1.3, "sq"), .2 if t < 5 else .28)
    for i in range(int(D / bar)):
        t = i * bar
        if 16 <= t < 21 or t >= 23.3: continue
        mus.add(t, pad([mtof(n) for n in chord_at(t)], bar + .2, 800, .12), .8)
    for k in range(int(D / B)):
        t = k * B
        if 16 <= t < 21 or t >= 23.3: continue
        if t >= 5 and (k % 2 == 0 or t >= 10): mus.add(t, kick(.6, .35, 110, 46, 1.0), .7 if t < 10 else .85); kicks.append(t)
        if t >= 10:
            mus.add(t + B / 2, hat(), .16)
            if t >= 12: mus.add(t + B / 4, hat(), .08); mus.add(t + 3 * B / 4, hat(), .08)
            if k % 4 == 2: mus.add(t, snare(.2, 210, .7), .3)
    m = duck(mus.stereo(), kicks, .35, .2)
    m = reverb(m, 1.4, .18)
    # ---- the clock: one tick per second, on the beat
    for s in range(0, 16): sfx.add(s, clock_tick(s % 2 == 1), .75, -.1)
    for s in (19, 20): sfx.add(s, clock_tick(s % 2 == 1), .18, -.1)     # it comes back, barely
    for s in (21, 22, 23): sfx.add(s, clock_tick(s % 2 == 1), .4, -.1)
    sfx.add(0, room(D), 1.0)
    # pencil taps on beats in the document scene
    for k in range(18): sfx.add(3.0 + k * .105 + (k % 3) * .012, keyclick(), .55, .1)   # he types
    sfx.add(5.0, paper(.45, 1.1), .6)                                                    # the page comes out of the typewriter
    for t in (5.0, 6.0, 7.0, 8.5, 9.0): sfx.add(t, paper(.3, .8), .35)
    sfx.add(7.5, pen(.3), .6); sfx.add(9.5, pen(.3), .6)
    for s in range(4): sfx.add(8.0 + s / 8, tick(4500, .02, .0015), .45)
    # investigation
    for t in (10.0, 11.0): sfx.add(t + .05, highlight_squeak(.35), .55, .15)
    sfx.add(10.5, pen(.45), .7); sfx.add(13.0, pen(.45), .7)
    for t in (11.5, 12.0, 13.5, 14.25, 14.5, 15.0, 15.5): sfx.add(t, paper(.22, 1.1), .4)
    sfx.add(12.45, pen(.3), .5, -.4); sfx.add(12.5, pen(.3), .5, .4)
    for s in range(6): sfx.add(14.0 + s / 24, tick(5200, .015, .001), .45)
    sfx.add(14.75, clock_tick(), .7)
    sfx.add(13.0, riser(3.0, 300, 6000), .16)
    # silence, then one low pulse under the realization
    sfx.add(16.0, impact(1.8, 38, .6), .6); sfx.add(18.5, heartbeat(), .45)
    # the product, the link, the source
    sfx.add(21.0, impact(.6, 60, .35), .5); sfx.add(21.9, whoosh(.4), .25)
    sfx.add(22.35, mouse_click(), .7); sfx.add(22.7, paper(.4), .6); sfx.add(22.7, shutter(), .4)
    sfx.add(23.3, impact(1.6, 42), .9)
    sfx.add(24.88, np.concatenate([tick(2800, .06, .004) * 1.4, np.zeros(10)]), 1.0)   # the last, sharp click
    return m, sfx.stereo(), .95, .9

# ================================================================ FILM 03 — big-beat aggression, 130 BPM, E
def film3():
    D = 18.; B = 60 / 130; q = lambda n: n * B
    mus, sfx = Bus(D), Bus(D)
    quiet0, quiet1, logo = q(26), q(33.5), q(36.5)
    E = mtof(28)
    # bass riff: the stabbing octave figure, 1 bar
    riff = [(0, 1, 0), (.75, .5, 12), (1.5, .5, 0), (2, .75, 7), (3, .25, 0), (3.5, .5, 10)]
    kicks = []
    def groove(t0, t1, dense=False):
        k = 0
        while q(k) + t0 < t1 - 1e-6:
            t = t0 + q(k); beat = k % 4
            mus.add(t, kick(1.1, .45, 170, 42, 1.6), 1.0); kicks.append(t)
            if beat in (1, 3): mus.add(t, snare(.28, 200, 1.3), .7, .05)
            if beat == 2 and k % 8 == 6: mus.add(t + q(.5), kick(1, .4, 160, 44, 1.6), .8)
            for s in range(4): mus.add(t + q(s / 4), hat(), .2 if s % 2 else .11, .35)
            if dense and beat == 3: mus.add(t + q(.5), snare(.2, 230, 1), .45)
            k += 1
        bar = 0
        while t0 + q(bar * 4) < t1 - 1e-6:
            for o, l, st in riff:
                t = t0 + q(bar * 4 + o)
                if t < t1: mus.add(t, dist_bass(E * 2 ** (st / 12), min(q(l), t1 - t) * .95, 1100 if dense else 800), .42)
            bar += 1
    # opening hits: no intro
    for t, g in ((0, 1.0), (q(1.5), .9), (q(3), 1.0)):
        mus.add(t, kick(1.4, .6, 180, 40, 2.0), g); mus.add(t, snare(.4, 180, 1.6), .8 * g); mus.add(t, dist_bass(E, .45, 1300), .6 * g)
        mus.add(t, hp(noise(1.2), 4000) * np.exp(-T(1.2) / .35), .25 * g)
    groove(q(4.5), quiet0 - q(1), dense=False)
    # snare roll into the silence
    k = 0; t = quiet0 - q(2)
    while t < quiet0 - .02:
        mus.add(t, snare(.12, 220, 1), .3 + .5 * (t - (quiet0 - q(2))) / q(2)); k += 1; t += q(1 / 4) if t < quiet0 - q(1) else q(1 / 8)
    groove(quiet1, logo, dense=True)
    for t in (q(18), q(22)): mus.add(t, dist_bass(E / 2 * 2, q(1), 700), .5)
    m = duck(mus.stereo(), kicks, .3, .12)
    m = gate(m, quiet0, quiet1, .003)
    # ---- sound design
    sfx.add(0, impact(1.2, 50), .7)
    for a_, b_ in ((0, q(1.5)), (q(3), q(6.5)), (q(12), q(13)), (q(15), q(16.5)), (q(20.5), q(22))): sfx.add(a_, crowd(b_ - a_ + .1, 28, int(a_ * 100) + 3, 5), 1.0, .1)
    sfx.add(q(3) + .25, voice(.8, 230, 991, shout=True), .9, .1)
    sfx.add(q(1.5) + .05, phone_clack(), 1.0); sfx.add(q(1.5) + .05, paper_slam(), .5)
    sfx.add(q(3), impact(1.0, 55), .8)
    sfx.add(q(6.5) - .06, shutter(), .9); sfx.add(q(15) - .06, shutter(), .9)
    for k in range(4): sfx.add(q(6.5) + k * q(.25), press_thump(), .45)
    sfx.add(q(7.5), whoosh(.45), .4)
    sfx.add(q(8.5), clatter(q(.5), 16, 1800), .5)
    for k in range(10): sfx.add(q(9) + k * .09, footstep(.6), .35, (-1) ** k * .3)
    sfx.add(q(9), traffic(q(1.5)) + tires(q(1.5)), .5)
    sfx.add(q(9.5), whoosh(.4), .35)
    for k in range(2): sfx.add(q(10.5) + k * q(.25), press_thump(), .45)
    sfx.add(q(13), phone_bell(.4), .3, .3); sfx.add(q(13) + .1, phone_clack(), .6)
    sfx.add(q(11) + .1, paper(.5, 1.1), .9)
    for s in range(4): sfx.add(q(14) + s / 8, tick(4200, .02, .0015), .5)
    sfx.add(q(15), paper(.6, .7), .6)
    sfx.add(q(18), impact(.8, 60, .7), .7); sfx.add(q(22), impact(.8, 52, .8), .8)
    # the accelerating montage: a mechanical hit on every cut
    tt, i = q(22), 0
    while tt < quiet0 - 1e-6:
        d = q(.5) if tt < q(24) else q(.25)
        sfx.add(tt, tick(2000 + 600 * (i % 4), .03, .003), .5, (-1) ** i * .4); tt += d; i += 1
    sfx.add(q(22), riser(quiet0 - q(22), 300, 8000), .22)
    # silence: a quiet office, a voice, a pen
    sfx.add(quiet0, room(quiet1 - quiet0), 1.2)
    sfx.add(quiet0 + 1.4, pen(1.0), .45, .1)
    vo = read_wav("audio/vo/vo_f3.wav")
    vbus = Bus(D); vbus.add(quiet0 + .0, vo, 1.0)
    v = reverb(vbus.stereo(), .8, .12, 3500)
    # product: three cuts and the mark
    sfx.add(quiet1, impact(1.2, 44), 1.0); sfx.add(quiet1, shutter(), .6)
    sfx.add(q(34.5), shutter(), .6); sfx.add(q(35.5), shutter(), .6)
    sfx.add(logo, impact(2.2, 40), 1.1); sfx.add(logo, hp(noise(1.8), 3500) * np.exp(-T(1.8) / .5), .3)
    sfx.add(logo + .3, tick(5000, .03, .002), .4)
    return m, sfx.stereo() + v * 1.15, 1.0, .9

FILMS = {"1": film1, "2": film2, "3": film3}
if __name__ == "__main__":
    for n in (sys.argv[1:] or ["1", "2", "3"]):
        mus, sfx, gm, gs = FILMS[n]()
        mus = reverb(mus, 1.8, .14) if n == "1" else mus
        mpk = np.abs(mus).max() or 1; spk = np.abs(sfx).max() or 1
        mus_n, sfx_n = mus / mpk * .8, sfx / spk * .8
        write(f"audio/film{n}_music.wav", mus_n); write(f"audio/film{n}_sfx.wav", sfx_n)
        mix = master(mus_n * gm + sfx_n * gs)
        write(f"audio/film{n}_mix.wav", mix)
        print("film", n, "written", len(mix) / SR, "s")
