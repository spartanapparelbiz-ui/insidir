"""Builds the three films from real footage.

Each film is an edit decision list on its beat grid. A shot is either
  - real footage: a source file, an in-point (seconds), a push-in, speed, optional reverse/crop, or
  - "v1": frames kept from the first version (the real Form 4, the Insidir product and the end card).
Every shot is rendered to an exact frame count, graded to the same monochrome print look, then the shots are
concatenated, captions are laid over, and the picture is written to renders/realN_picture.mp4.
Usage: python3 scripts/build_real.py [1|2|3 ...]
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
S, A = f"{ROOT}/stock", f"{ROOT}/archive"
VISTA = f"{A}/0803_Vista_Stock_Shots_New_York_Stock_Exchange_13_00_55_00.mp4"   # NYSE floor, 1960s (Prelinger Archives)
NEWS = f"{A}/NewspaperSto.mp4"                                                # Newspaper Story, 1950 (public domain)
DAYS = f"{A}/17DaysTh1945.mp4"                                                # 17 Days, 1945 (public domain)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit("ffmpeg failed:\n" + " ".join(cmd) + "\n" + r.stderr[-2000:])

def frames(t0, t1): return round(t1 * FPS) - round(t0 * FPS)

def shot(out, t0, t1, src, at=0., z=(1.0, 1.06), speed=1.0, reverse=False, ox=.5, oy=.5, look="night", letterbox=False, fade_in=0.):
    """Render one real-footage shot to exactly the frames between t0 and t1 on the timeline."""
    n = frames(t0, t1); d = n / FPS
    z0, z1 = z
    span = d * speed + .5
    pre = []
    if src.startswith(A): pre.append("crop=iw:iw*9/16:0:(ih-iw*9/16)/2")              # 4:3 archive film → 16:9
    pre.append("scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080")
    if speed != 1: pre.append(f"setpts=PTS/{speed}")
    if reverse: pre.append("reverse")
    pre.append("fps=30")
    # slow push-in, centred on (ox, oy)
    pre.append(f"scale=w='trunc(1920*({z0}+({z1}-{z0})*t/{d})/2)*2':h=-2:eval=frame:flags=lanczos")
    pre.append(f"crop=1920:1080:(iw-1920)*{ox}:(ih-1080)*{oy}")
    grade = {"night": "eq=contrast=1.28:brightness=-0.06:gamma=0.92", "day": "eq=contrast=1.18:brightness=-0.02:gamma=0.98",
             "archive": "eq=contrast=1.16:brightness=0.03:gamma=1.32"}[look]
    post = ["format=gray", grade, "vignette=PI/4.2", "noise=c0s=7:c0f=t+u"]
    if letterbox: post += ["drawbox=x=0:y=0:w=iw:h=138:color=black:t=fill", "drawbox=x=0:y=ih-138:w=iw:h=138:color=black:t=fill"]
    if fade_in: post.append(f"fade=t=in:st=0:d={fade_in}")
    post.append("format=yuv420p")
    vf = ",".join(pre + post)
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, at)}", "-t", f"{span + (d if reverse else 0)}", "-i", src, "-an", "-vf", vf,
         "-frames:v", str(n), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "14", out])
    return n

def keep(out, t0, t1, film):
    """Frames t0..t1 of the first version (document, product and end card sections)."""
    a, b = round(t0 * FPS), round(t1 * FPS)
    run(["ffmpeg", "-v", "error", "-y", "-i", f"{ROOT}/renders/v1/f{film}.mp4", "-an", "-vf", f"select='between(n,{a},{b - 1})',setpts=N/30/TB",
         "-frames:v", str(b - a), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "14", out])
    return b - a

def build(film, edl, captions, total):
    tmp = f"{ROOT}/renders/real{film}"; os.makedirs(tmp, exist_ok=True)
    edl = sorted(edl, key=lambda s: s[0]); parts, count = [], 0
    for i, (t0, t1, kind, kw) in enumerate(edl):
        out = f"{tmp}/s{i:03d}.mp4"
        n = keep(out, t0, t1, film) if kind == "v1" else shot(out, t0, t1, kind, **kw)
        parts.append(out); count += n
    assert abs(edl[0][0]) < 1e-9 and abs(edl[-1][1] - total) < 1e-9, "edit must cover the whole film"
    for (a0, a1, _, _), (b0, _, _, _) in zip(edl, edl[1:]): assert abs(a1 - b0) < 1e-9, f"gap/overlap at {a1} vs {b0}"
    lst = f"{tmp}/list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    cat = f"{tmp}/cat.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", cat])
    # captions: transparent type plates in the site's JetBrains Mono, faded in and out
    inputs, chains, last = ["-i", cat], [], "[0:v]"
    for k, (png, c0, c1) in enumerate(captions):
        inputs += ["-loop", "1", "-t", f"{total}", "-i", png]
        chains.append(f"[{k + 1}:v]format=rgba,fade=t=in:st={c0:.3f}:d=0.3:alpha=1,fade=t=out:st={c1 - .3:.3f}:d=0.3:alpha=1[c{k}]")
        chains.append(f"{last}[c{k}]overlay=0:0:enable='between(t,{c0:.3f},{c1:.3f})'[v{k}]"); last = f"[v{k}]"
    out = f"{ROOT}/renders/real{film}_picture.mp4"
    fc = ";".join(chains) if chains else "[0:v]null[vout]"
    if chains: fc += f";{last}format=yuv420p[vout]"
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[vout]", "-frames:v", str(round(total * FPS)), "-r", "30",
         "-c:v", "libx264", "-preset", "medium", "-crf", "14", out])
    print(f"film {film}: {len(edl)} shots, {count} frames -> {out}")

# ======================================================================== FILM 01 — 128 BPM, night
def film1():
    B = 60 / 128; b = lambda n: n * B
    N = dict(look="night", letterbox=True)
    e = [
        (0, b(5), f"{S}/1a_nyc-dusk-aerial.mp4", dict(at=.5, z=(1.02, 1.1), fade_in=.9, **N)),
        (b(5), b(8), f"{S}/1b_times-sq-rain-puddle.mp4", dict(at=.3, z=(1.0, 1.05), **N)),
        # the financial machine, one shot per beat: real NYSE floor, real presses, real phones and watches
        (b(8), b(9), f"{S}/1e_hand-picks-up-desk-phone.mp4", dict(at=2.15, z=(1.08, 1.12), **N)),
        (b(9), b(10), VISTA, dict(at=61, z=(1.05, 1.12), look="archive", letterbox=True)),
        (b(10), b(11), NEWS, dict(at=800.5, z=(1.05, 1.1), look="archive", letterbox=True)),
        (b(11), b(12), VISTA, dict(at=461, z=(1.0, 1.05), look="archive", letterbox=True)),
        (b(12), b(13), f"{S}/1g_pocket-watches-table.mp4", dict(at=4, z=(1.08, 1.14), **N)),
        (b(13), b(14), VISTA, dict(at=763.0, z=(1.05, 1.1), look="archive", letterbox=True)),
        (b(14), b(15), NEWS, dict(at=931, z=(1.05, 1.1), look="archive", letterbox=True)),
        (b(15), b(16), VISTA, dict(at=1100.5, z=(1.05, 1.1), look="archive", letterbox=True)),
        (b(16), b(16.5), f"{S}/1g_pocket-watch-movement.mp4", dict(at=4, z=(1.1, 1.14), **N)),
        (b(16.5), b(17), VISTA, dict(at=921, z=(1.05, 1.1), look="archive", letterbox=True)),
        # someone is still working
        (b(17), b(22), f"{S}/1h_man-working-late-office.mp4", dict(at=1.5, z=(1.0, 1.1), **N)),
        (b(22), b(24), f"{S}/1i_backlit-laptop-typing.mp4", dict(at=4, z=(1.05, 1.1), **N)),
        (b(24), b(26), f"{S}/1j_fountain-pen-writing-night.mp4", dict(at=2, z=(1.05, 1.12), **N)),
        # the real Form 4, the discovery, the product, the mark — kept from the first version
        (b(26), 20.0, "v1", {}),
    ]
    build(1, e, [], 20.0)

# ======================================================================== FILM 02 — 120 BPM, the deskman (Newspaper Story, 1950)
def film2():
    AR = dict(look="archive")
    e = [
        (0, 2.0, NEWS, dict(at=333.5, z=(1.0, 1.06), fade_in=.8, **AR)),          # the newsroom
        (2.0, 3.0, NEWS, dict(at=324.2, z=(1.15, 1.2), **AR)),                    # the wall clock
        (3.0, 5.0, NEWS, dict(at=320.0, z=(1.05, 1.12), **AR)),                   # he types
        (5.0, 6.5, NEWS, dict(at=300.0, z=(1.05, 1.1), **AR)),                    # he pulls the page from the typewriter
        (6.5, 8.0, NEWS, dict(at=472.0, z=(1.05, 1.12), **AR)),                   # the page in his hands
        (8.0, 9.0, NEWS, dict(at=310.6, z=(1.1, 1.16), oy=.35, **AR)),            # his face, reading
        (9.0, 10.0, NEWS, dict(at=328.0, z=(1.1, 1.18), **AR)),                   # the lines on the page
        # the investigation: his pencil and the page, against the real Form 4 being marked
        (10.0, 10.5, "v1", {}),
        (10.5, 11.0, NEWS, dict(at=416.0, z=(1.1, 1.15), **AR)),
        (11.0, 11.5, "v1", {}),
        (11.5, 12.0, NEWS, dict(at=312.0, z=(1.15, 1.2), oy=.35, **AR)),
        (12.0, 13.0, "v1", {}),
        (13.0, 13.5, NEWS, dict(at=420.0, z=(1.1, 1.15), **AR)),
        (13.5, 14.0, "v1", {}),
        (14.0, 14.25, NEWS, dict(at=405.0, z=(1.1, 1.15), **AR)),
        (14.25, 14.5, "v1", {}),
        (14.5, 14.75, NEWS, dict(at=313.0, z=(1.25, 1.3), oy=.35, **AR)),
        (14.75, 15.0, NEWS, dict(at=324.5, z=(1.25, 1.3), **AR)),
        (15.0, 16.0, "v1", {}),
        # the realization: silence, his face, then the line
        (16.0, 17.0, NEWS, dict(at=311.0, z=(1.12, 1.24), oy=.33, **AR)),
        (17.0, 25.0, "v1", {}),
    ]
    P = f"{ROOT}/brand"
    build(2, e, [(f"{P}/cap2_headline.png", 1.0, 4.7), (f"{P}/cap2_filing.png", 7.0, 9.85)], 25.0)

# ======================================================================== FILM 03 — 130 BPM, the floor
def film3():
    B = 60 / 130; q = lambda n: n * B
    AR = dict(look="archive"); DY = dict(look="day")
    e = [
        (0, q(1.5), VISTA, dict(at=1620.5, z=(1.12, 1.2), **AR)),
        (q(1.5), q(3), f"{S}/1e_hand-picks-up-desk-phone.mp4", dict(at=1.4, speed=1.8, reverse=True, z=(1.1, 1.14), **DY)),   # receiver slammed down
        (q(3), q(4.5), VISTA, dict(at=1700.5, z=(1.1, 1.22), **AR)),            # a man on the floor faces the camera
        (q(4.5), q(6.5), VISTA, dict(at=1140.5, z=(1.0, 1.08), **AR)),
        (q(6.5), q(7.5), NEWS, dict(at=860.5, z=(1.05, 1.12), **AR)),
        (q(7.5), q(8.5), NEWS, dict(at=940.0, z=(1.05, 1.1), **AR)),
        (q(8.5), q(9), VISTA, dict(at=1300.5, z=(1.05, 1.1), **AR)),
        (q(9), q(10), DAYS, dict(at=420.5, z=(1.05, 1.1), **AR)),               # New York crowds, 1945
        (q(10), q(10.5), f"{S}/3f_looking-up-towers.mp4", dict(at=3, z=(1.05, 1.1), **DY)),
        (q(10.5), q(11), NEWS, dict(at=600.5, z=(1.05, 1.1), **AR)),
        (q(11), q(12), f"{S}/3g_paper-stack-fanned.mp4", dict(at=1.2, z=(1.05, 1.1), **DY)),
        (q(12), q(13), VISTA, dict(at=1560.5, z=(1.05, 1.12), **AR)),
        (q(13), q(14), f"{S}/1e_hand-picks-up-desk-phone.mp4", dict(at=2.0, z=(1.08, 1.12), **DY)),
        (q(14), q(15), VISTA, dict(at=1880.5, z=(1.05, 1.1), **AR)),
        # different eras, same information
        (q(15), q(16.5), DAYS, dict(at=470.5, z=(1.0, 1.06), **AR)),
        (q(16.5), q(18), f"{S}/3e_soho-crossing-bw.mp4", dict(at=4, z=(1.0, 1.05), **DY)),
        (q(18), q(19.5), NEWS, dict(at=900.5, z=(1.05, 1.1), **AR)),
        (q(19.5), q(20.5), f"{S}/1i_backlit-laptop-typing.mp4", dict(at=6, z=(1.05, 1.1), **DY)),
        (q(20.5), q(22), VISTA, dict(at=1145.5, z=(1.05, 1.1), **AR)),
    ]
    # the accelerating run: half beats, then quarter beats, old and new alternating
    run_ = [(VISTA, 70.5, AR), (f"{S}/3e_midtown-42nd-pedestrians.mp4", 2, DY), (NEWS, 862, AR), (f"{S}/1i_mechanical-keyboard-typing.mp4", 5, DY),
            (VISTA, 500.5, AR), (f"{S}/3e_crowd-feet-walking.mp4", 3, DY), (NEWS, 870, AR), (DAYS, 615, AR), (VISTA, 1105, AR),
            (f"{S}/1g_pocket-watch-movement.mp4", 10, DY), (VISTA, 805.5, AR), (NEWS, 925, AR), (f"{S}/3e_feet-cobblestone.mp4", 4, DY), (VISTA, 1160.5, AR)]
    t, i = q(22), 0
    while t < q(26) - 1e-9:
        d = B / 2 if t < q(24) - 1e-9 else B / 4
        src, at, look = run_[i % len(run_)]
        e.append((t, min(q(26), t + d), src, dict(at=at, z=(1.06, 1.1), **look))); t += d; i += 1
    e += [
        (q(26), q(28.5), f"{S}/2c_pen-writing-window-light.mp4", dict(at=8, z=(1.0, 1.04), **DY)),    # the quiet: one person, one page
        (q(28.5), 18.0, "v1", {}),                                                                    # the real Form 4, the product, the mark
    ]
    P = f"{ROOT}/brand"
    build(3, e, [(f"{P}/cap3_fast.png", q(18), q(20.5)), (f"{P}/cap3_faster.png", q(22), q(25.5))], 18.0)

if __name__ == "__main__":
    for n in (sys.argv[1:] or ["1", "2", "3"]): {"1": film1, "2": film2, "3": film3}[n]()
