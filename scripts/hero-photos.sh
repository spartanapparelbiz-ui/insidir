#!/usr/bin/env bash
# The home hero's photos (app/page.tsx, components/home/HeroPhotos.tsx). From the six Unsplash originals in
# public/hero/1.jpg … 6.jpg it writes, per photo, a desktop crop (16:9, 1600×900) and a mobile crop (2:3, 828×1242)
# that keeps the person in frame, each as AVIF and WebP, black and white with high contrast and light grain.
# Needs ImageMagick 6 (convert) and ffmpeg with libaom-av1. Run from the repo root: bash scripts/hero-photos.sh
set -euo pipefail
cd public/hero
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Where the person is in each original, as fractions of width and height (the crops centre on it).
declare -A FX=([1]=0.61 [2]=0.29 [3]=0.71 [4]=0.31 [5]=0.56 [6]=0.40)
declare -A FY=([1]=0.45 [2]=0.50 [3]=0.40 [4]=0.72 [5]=0.50 [6]=0.62)

# A crop of w×h centred on (cx, cy), kept inside the image.
offset() { awk -v c="$1" -v size="$2" -v full="$3" 'BEGIN { o = int(c - size / 2); if (o < 0) o = 0; if (o > full - size) o = full - size; print o }'; }

# Black and white, high contrast, light grain (added at the final size so it looks the same on every crop).
grade() { # in out width height
  convert "$1" -colorspace Gray -sigmoidal-contrast 6,50% -level 4%,96% -resize "$3x$4^" -gravity center -extent "$3x$4" \
    -attenuate 0.2 +noise Gaussian -colorspace Gray -strip "$2"
}

# AVIF and WebP, each stepped down in quality until it is under 250 KB.
LIMIT=250000
encode() { # png base
  for crf in 36 40 44 48; do
    ffmpeg -loglevel error -y -i "$1" -c:v libaom-av1 -still-picture 1 -crf "$crf" -cpu-used 4 -pix_fmt yuv420p "$2.avif"
    [ "$(stat -c%s "$2.avif")" -lt "$LIMIT" ] && break
  done
  for q in 62 56 50 44 38; do
    ffmpeg -loglevel error -y -i "$1" -c:v libwebp -quality "$q" -compression_level 6 -pix_fmt yuv420p "$2.webp"
    [ "$(stat -c%s "$2.webp")" -lt "$LIMIT" ] && break
  done
}

for n in 1 2 3 4 5 6; do
  read -r W H < <(identify -format "%w %h\n" "$n.jpg")
  # Desktop: full width, 16:9.
  dh=$(( W * 9 / 16 )); [ "$dh" -gt "$H" ] && dh=$H
  dw=$(( dh * 16 / 9 ))
  dx=$(offset "$(awk -v f="${FX[$n]}" -v w="$W" 'BEGIN{print f*w}')" "$dw" "$W")
  dy=$(offset "$(awk -v f="${FY[$n]}" -v h="$H" 'BEGIN{print f*h}')" "$dh" "$H")
  convert "$n.jpg" -crop "${dw}x${dh}+${dx}+${dy}" +repage "$tmp/d.png"
  grade "$tmp/d.png" "$tmp/d-g.png" 1600 900
  encode "$tmp/d-g.png" "$n-d"
  # Mobile: full height, 2:3, centred on the person.
  mw=$(( H * 2 / 3 ))
  mx=$(offset "$(awk -v f="${FX[$n]}" -v w="$W" 'BEGIN{print f*w}')" "$mw" "$W")
  convert "$n.jpg" -crop "${mw}x${H}+${mx}+0" +repage "$tmp/m.png"
  grade "$tmp/m.png" "$tmp/m-g.png" 828 1242
  encode "$tmp/m-g.png" "$n-m"
done
ls -l ./*-d.* ./*-m.*
for f in ./*-d.* ./*-m.*; do [ "$(stat -c%s "$f")" -lt "$LIMIT" ] || { echo "$f is over 250 KB" >&2; exit 1; }; done
