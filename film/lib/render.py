"""Parallel frame renderer: a film module exposes N_FRAMES, frame(f) -> luma image, and score() -> stereo audio."""
import importlib
import os
import subprocess
import sys
import time
import numpy as np
import cv2
from multiprocessing import Pool

from . import vfx as V

OUT = os.environ.get("FILM_OUT", "/tmp/film_out")
os.makedirs(OUT, exist_ok=True)


def _chunk(args):
    modname, a, b, path, finish = args
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    m = importlib.import_module(modname)
    w = V.Writer(path)
    for f in range(a, b):
        img = m.frame(f)
        if finish:
            img = m.finish(img, f) if hasattr(m, "finish") else V.finish(img, f)
        w.write(img)
    w.close()
    return path


def render(modname, out_mp4, frames=None, workers=4, finish=True):
    m = importlib.import_module(modname)
    n = m.N_FRAMES
    lo, hi = frames or (0, n)
    if hasattr(m, "prepare"):
        m.prepare()                         # caches (depth maps, tracks) built once, before forking
    t0 = time.time()
    cuts = np.linspace(lo, hi, workers * 3 + 1).astype(int)
    jobs = [(modname, int(cuts[i]), int(cuts[i + 1]), f"{OUT}/{modname}_{i:03d}.mp4", finish)
            for i in range(len(cuts) - 1) if cuts[i + 1] > cuts[i]]
    with Pool(workers) as p:
        parts = p.map(_chunk, jobs, chunksize=1)
    lst = f"{OUT}/{modname}_parts.txt"
    with open(lst, "w") as fh:
        fh.writelines(f"file '{x}'\n" for x in parts)
    silent = f"{OUT}/{modname}_silent.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent], check=True)
    wav = f"{OUT}/{modname}.wav"
    from . import audio as A
    A.write_wav(wav, m.score())
    deliver(silent, wav, out_mp4)
    print(f"rendered {out_mp4} frames {lo}-{hi} in {time.time() - t0:.0f}s")


def sheet(modname, frames, path, cols=5, width=384, finish=True):
    """Contact sheet of specific frames, each labelled with its frame number and beat."""
    m = importlib.import_module(modname)
    if hasattr(m, "prepare"):
        m.prepare()
    tiles = []
    for f in frames:
        img = m.frame(f)
        if finish:
            img = V.finish(img, f)
        t = cv2.resize((np.clip(img, 0, 1) * 255).astype(np.uint8), (width, int(width * 9 / 16)), interpolation=cv2.INTER_AREA)
        t = cv2.cvtColor(t, cv2.COLOR_GRAY2BGR)
        cv2.putText(t, f"f{f} b{f / 15:.2f}", (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
        tiles.append(t)
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]
    cv2.imwrite(path, np.vstack(rows))


def deliver(video, wav, out_mp4, bitrate="16M"):
    """Two-pass H.264 High at a fixed delivery bitrate (grain-tuned), AAC 320k, 1080p30, faststart."""
    log = out_mp4 + ".2pass"
    base = ["ffmpeg", "-v", "error", "-y", "-i", video]
    enc = ["-c:v", "libx264", "-preset", "slow", "-tune", "grain", "-profile:v", "high", "-b:v", bitrate,
           "-maxrate", "24M", "-bufsize", "32M", "-pix_fmt", "yuv420p", "-r", "30", "-passlogfile", log]
    subprocess.run(base + enc + ["-pass", "1", "-an", "-f", "mp4", "/dev/null"], check=True)
    subprocess.run(base + ["-i", wav] + enc + ["-pass", "2", "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k",
                                           "-ar", "48000", "-shortest", "-movflags", "+faststart", out_mp4], check=True)
