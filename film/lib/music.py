"""Beat-grid score helpers. Bar/beat positions are converted to seconds on the 120 BPM grid."""
import numpy as np
from . import audio as A

B = A.BEAT          # one beat in seconds (0.5 s = 15 frames)
S16 = B / 4         # sixteenth note


def beat_t(b):
    return b * B


def groove(mix, b0, b1, *, kick=True, clap=True, hats=True, clicks=True, bass=None, stabs=None,
           swing=0.0, ghost_kicks=False, open_hats=True, intensity=1.0, rng=None):
    """Lay a house groove from beat b0 to b1 (exclusive). Returns the kick times for sidechaining.

    bass: list of (beat_offset_in_bar, note, length_beats) repeated every bar, or a callable bar -> list.
    stabs: list of (beat_in_bar, [notes]) repeated every bar.
    """
    rng = rng or np.random.default_rng(11)
    kicks = []
    k = A.kick()
    cl = A.clap()
    for b in range(int(b0), int(b1)):
        t = beat_t(b)
        if kick:
            mix.add(k, t, 0.95 * intensity, bus="drums")
            kicks.append(t)
        if clap and b % 2 == 1:
            mix.add(cl, t, 0.55 * intensity, pan=0.05, bus="drums")
            mix.add(A.snare(), t, 0.25 * intensity, bus="drums")
        for s in range(4):
            ts = t + s * A.BEAT / 4 + (swing * S16 if s % 2 == 1 else 0)
            if hats and s == 2:
                mix.add(A.hat(open_=open_hats), ts, 0.33 * intensity, pan=0.25, bus="drums")
            elif hats and s in (1, 3):
                mix.add(A.hat(), ts, 0.16 * intensity * (0.7 + 0.3 * rng.random()), pan=-0.3, bus="drums")
            if clicks and s in (1, 3) and rng.random() < 0.85:
                mix.add(A.click(rng.choice([3800, 4400, 5200])), ts, 0.22 * intensity, pan=rng.uniform(-0.6, 0.6), bus="drums")
            if clicks and s == 3 and b % 4 == 3:
                mix.add(A.rim(), ts, 0.35 * intensity, pan=0.4, bus="drums")
        if ghost_kicks and b % 4 == 3:
            mix.add(k, t + 3 * S16, 0.45 * intensity, bus="drums")
    bar0, bar1 = int(b0) // 4, (int(b1) + 3) // 4
    for bar in range(bar0, bar1):
        if bass is not None:
            pat = bass(bar) if callable(bass) else bass
            for off, note, ln in pat:
                tb = bar * 4 + off
                if b0 <= tb < b1:
                    f = A.note_hz(note)
                    x = A.reese(f, ln * B) * A.env_exp(ln * B, ln * B * 0.6, 0.004)
                    mix.add(x, beat_t(tb), 0.42 * intensity, bus="bass")
                    mix.add(A.sub(f, ln * B) * A.env_exp(ln * B, ln * B * 0.7, 0.004), beat_t(tb), 0.38 * intensity, bus="bass")
        if stabs is not None:
            for off, notes in (stabs(bar) if callable(stabs) else stabs):
                tb = bar * 4 + off
                if b0 <= tb < b1:
                    mix.add(A.stab([A.note_hz(x) for x in notes]), beat_t(tb), 0.30 * intensity, pan=-0.15, bus="synth")
    return kicks
