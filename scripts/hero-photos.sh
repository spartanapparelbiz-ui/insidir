#!/usr/bin/env bash
# The site's photos (components/Photo.tsx: the home hero, page header bands, empty states). From the Unsplash
# originals in public/hero/1.jpg … 16.jpg it writes, per photo, a desktop crop (16:9, 1600×900) and a mobile crop (2:3, 828×1242)
# that keeps the person in frame, each as AVIF and WebP, all in one grade: dark and cinematic, muted colour (not black
# and white), cool blue-teal shadows that sink into the brand black #0B0B12, low-key exposure, a vignette and fine grain.
# Needs ImageMagick 6 (convert) and ffmpeg with libaom-av1. Run from the repo root: bash scripts/hero-photos.sh [n ...]
# (no arguments: all sixteen; with numbers: only those).
set -euo pipefail
cd public/hero
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Where the person is in each original, as fractions of width and height (the crops centre on it).
declare -A FX=([1]=0.61 [2]=0.29 [3]=0.71 [4]=0.31 [5]=0.56 [6]=0.40 [7]=0.52 [8]=0.49 [9]=0.45 [10]=0.53 [11]=0.45 [12]=0.66 [13]=0.66 [14]=0.55 [15]=0.66 [16]=0.55)
declare -A FY=([1]=0.45 [2]=0.50 [3]=0.40 [4]=0.72 [5]=0.50 [6]=0.62 [7]=0.48 [8]=0.50 [9]=0.55 [10]=0.45 [11]=0.62 [12]=0.45 [13]=0.62 [14]=0.62 [15]=0.40 [16]=0.40)
# Snow and sky photos get 0.3 stops less in the highlights; photos that would go too dark get their shadows lifted (gamma).
SNOW=" 3 4 6 10 11 13 "
declare -A LIFT=([7]=1.15 [13]=1.1 [16]=1.35)

# A crop of w×h centred on (cx, cy), kept inside the image.
offset() { awk -v c="$1" -v size="$2" -v full="$3" 'BEGIN { o = int(c - size / 2); if (o < 0) o = 0; if (o > full - size) o = full - size; print o }'; }

# The grade, at the final size so the vignette and grain look the same on every crop:
#   saturation to ~36% · exposure −0.7 stops (×0.616 in linear light) · contrast up ~30% (sigmoidal) · per-channel black
#   and white points: shadows sit near 5% with a blue-teal cast, highlights stop short of white with a hint of warmth ·
#   35% vignette · light sharpening · ~4% fine monochrome grain.
grade() { # in out width height n
  local snow=() w=$3 h=$4
  [[ "$SNOW" == *" $5 "* ]] && snow=(-fx 'u-0.19*u*pow(max(0,(u-0.5)*2),2)')
  convert -size 160x90 xc: -fx 'r=hypot((i/w-0.5)*2,(j/h-0.5)*2)/1.4142; 1-0.35*pow(min(1,r),2.2)' -resize "${w}x${h}!" "$tmp/vig.png"
  convert -size "${w}x${h}" xc:gray50 -attenuate 0.28 +noise Gaussian -colorspace Gray "$tmp/grain.png"
  convert "$1" -resize "${w}x${h}^" -gravity center -extent "${w}x${h}" \
    -modulate 100,36 -colorspace RGB -evaluate multiply 0.616 -colorspace sRGB -gamma "${LIFT[$5]:-1}" "${snow[@]}" \
    -sigmoidal-contrast 7,36% \
    -channel R +level 3.6%,95% -channel G +level 4.6%,94% -channel B +level 6.6%,92% +channel \
    "$tmp/vig.png" -compose multiply -composite -unsharp 0x1+0.5+0.02 \
    "$tmp/grain.png" -compose overlay -composite -strip "$2"
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

for n in ${@:-$(seq 1 16)}; do
  read -r W H < <(identify -format "%w %h\n" "$n.jpg")
  # Desktop: full width, 16:9.
  dh=$(( W * 9 / 16 )); [ "$dh" -gt "$H" ] && dh=$H
  dw=$(( dh * 16 / 9 ))
  dx=$(offset "$(awk -v f="${FX[$n]}" -v w="$W" 'BEGIN{print f*w}')" "$dw" "$W")
  dy=$(offset "$(awk -v f="${FY[$n]}" -v h="$H" 'BEGIN{print f*h}')" "$dh" "$H")
  convert "$n.jpg" -crop "${dw}x${dh}+${dx}+${dy}" +repage "$tmp/d.png"
  grade "$tmp/d.png" "$tmp/d-g.png" 1600 900 "$n"
  encode "$tmp/d-g.png" "$n-d"
  # Mobile: full height, 2:3, centred on the person.
  mw=$(( H * 2 / 3 ))
  mx=$(offset "$(awk -v f="${FX[$n]}" -v w="$W" 'BEGIN{print f*w}')" "$mw" "$W")
  convert "$n.jpg" -crop "${mw}x${H}+${mx}+0" +repage "$tmp/m.png"
  grade "$tmp/m.png" "$tmp/m-g.png" 828 1242 "$n"
  encode "$tmp/m-g.png" "$n-m"
done
ls -l ./*-d.* ./*-m.*
for f in ./*-d.* ./*-m.*; do [ "$(stat -c%s "$f")" -lt "$LIMIT" ] || { echo "$f is over 250 KB" >&2; exit 1; }; done
