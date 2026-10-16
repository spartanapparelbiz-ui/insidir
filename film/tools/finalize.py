"""Mux a rendered picture with the film's current score (video stream copied, AAC 320k), into media/films/."""
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import importlib
from lib import audio as A

NAMES = {"v1_wall_street": "insidir_reel_01_wall_street_after_dark", "v2_obsession": "insidir_reel_02_the_obsession",
         "v3_money_never_sleeps": "insidir_reel_03_money_never_sleeps"}


def main(mod, picture):
    m = importlib.import_module(mod)
    wav = f"/tmp/film_out/{mod}_final.wav"
    A.write_wav(wav, m.score())
    out = os.path.join(os.path.dirname(__file__), "..", "..", "media", "films", NAMES[mod] + ".mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", picture, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out], check=True)
    print("wrote", os.path.normpath(out))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
