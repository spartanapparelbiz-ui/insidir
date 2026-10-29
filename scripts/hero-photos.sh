#!/usr/bin/env bash
# The site's photos (components/Photo.tsx: the home hero, page header bands, empty states). From full-resolution Unsplash
# originals (fetched once into .cache/photos, 5120px wide at JPEG quality 95) it writes, per photo and in one grade:
#   d  16:9 desktop crop, graded at 3840×2160 (4K) and served at 3840, 2560, 1920 and 1280 wide
#   m  2:3 phone crop that keeps the person in frame, graded at 1720×2580 (sharp on a 3x iPhone, where the photo
#      covers the full screen height) and served at 1720 and 1080 wide
#   b  4:1 header band (200px tall on desktop) at 3840×960 and 1920×480
#   bm 2.8:1 header band for phones (140px tall) at 1680×600 and 1120×400
# each as 10-bit AVIF and WebP, with the width in the file name (so a new size never hits an old cached file).
# The grade: dark and cinematic, muted colour (not black and white), cool blue-teal shadows that sink into the brand
# black #0B0B12, exposure a little under and a soft vignette. No added grain: the photos stay clean at full resolution.
# Bright enough that the person and the action read at a glance; text gets its own soft scrim in CSS.
# Needs ImageMagick 6 (Q16), ffmpeg with libaom-av1 and libwebp, and network access for the first run.
# Run from the repo root: bash scripts/hero-photos.sh [n ...] (no arguments: all fifteen; with numbers: only those).
set -euo pipefail
mkdir -p .cache/photos
cd public/hero
src=../../.cache/photos
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# The Unsplash originals, in photo order (credits: components/Photo.tsx PHOTO_CREDITS). Photo 1 was shot on grainy
# film and is no longer used; its slot stays so the numbers never move.
ID=(_ 1515412512744-6e4adc8b5e55 1459745930869-b3d0d72c3cbb 1647601294667-5a5948b6cd93 1680330386633-fdad7abdf93d
  1556221620-3616894469d9 1789371385079-8bc5be9e1d1f 1664494130837-14e0473ed284 1784050976658-8f60b6bc9b8e
  1744127026559-9d570bbf2c65 1778362950179-88f6c8423f8d 1681211657189-ded0fc1c0d87 1506316940527-4d1c138978a0
  1791063905897-5ef2ff937a29 1789075011898-1871a1edda9d 1418846531910-2b7bb1043512 1759738080643-44944609bc84)

# Where the person is in each original, as fractions of width and height (the crops centre on it).
declare -A FX=([1]=0.61 [2]=0.29 [3]=0.71 [4]=0.31 [5]=0.56 [6]=0.40 [7]=0.52 [8]=0.49 [9]=0.45 [10]=0.53 [11]=0.45 [12]=0.66 [13]=0.66 [14]=0.55 [15]=0.66 [16]=0.55)
declare -A FY=([1]=0.45 [2]=0.50 [3]=0.40 [4]=0.72 [5]=0.50 [6]=0.62 [7]=0.48 [8]=0.50 [9]=0.55 [10]=0.45 [11]=0.62 [12]=0.45 [13]=0.62 [14]=0.62 [15]=0.40 [16]=0.40)
# Snow and sky photos get 0.3 stops less in the highlights; photos that would go too dark get their shadows lifted (gamma).
SNOW=" 3 4 6 10 11 13 "
declare -A LIFT=([7]=1.15 [13]=1.1 [16]=1.35)

# A crop of w×h centred on (cx, cy), kept inside the image.
offset() { awk -v c="$1" -v size="$2" -v full="$3" 'BEGIN { o = int(c - size / 2); if (o < 0) o = 0; if (o > full - size) o = full - size; print o }'; }

# The grade, at the final size so the vignette looks the same on every crop, in 16 bits per channel so the dark
# gradients never band: saturation to ~35% · exposure −0.3 stops (×0.812 in linear light) · contrast up ~30%
# (sigmoidal) · per-channel black and white points: shadows sit near 5% with a blue-teal cast, highlights stop short of
# white with a hint of warmth · 35% vignette · a light sharpen after the downscale.
grade() { # in out width height n
  local snow=() w=$3 h=$4
  [[ "$SNOW" == *" $5 "* ]] && snow=(-fx 'u-0.19*u*pow(max(0,(u-0.5)*2),2)')
  convert -size 320x180 xc: -fx 'r=hypot((i/w-0.5)*2,(j/h-0.5)*2)/1.4142; 1-0.35*pow(min(1,r),2.2)' -resize "${w}x${h}!" "$tmp/vig.png"
  convert "$1" -depth 16 -colorspace RGB -filter Lanczos -resize "${w}x${h}^" -colorspace sRGB -gravity center -extent "${w}x${h}" \
    -modulate 100,35 -colorspace RGB -evaluate multiply 0.812 -colorspace sRGB -gamma "${LIFT[$5]:-1}" "${snow[@]}" \
    -sigmoidal-contrast 7,36% \
    -channel R +level 3.6%,95% -channel G +level 4.6%,94% -channel B +level 6.6%,92% +channel \
    "$tmp/vig.png" -compose multiply -composite -unsharp 0x0.8+0.6+0.01 -depth 16 -strip "PNG48:$2"
}

# One size of a graded master: 10-bit AVIF (crf 24: no visible loss) and WebP at quality 86.
encode() { # png width base
  convert "$1" -filter Lanczos -resize "$2x" -depth 16 "PNG48:$tmp/e.png"
  ffmpeg -loglevel error -y -i "$tmp/e.png" -c:v libaom-av1 -still-picture 1 -crf 24 -cpu-used 4 -row-mt 1 \
    -pix_fmt yuv420p10le -color_primaries bt709 -color_trc iec61966-2-1 -colorspace bt709 "$3-$2.avif"
  convert "$tmp/e.png" -depth 8 -define webp:method=6 -quality 86 "$3-$2.webp"
}

for n in ${@:-$(seq 2 16)}; do
  [ -s "$src/$n.jpg" ] || curl -sfL -o "$src/$n.jpg" "https://images.unsplash.com/photo-${ID[$n]}?fm=jpg&q=95&w=5120"
  convert "$src/$n.jpg" "$tmp/src.png"
  read -r W H < <(identify -format "%w %h\n" "$tmp/src.png")
  cx=$(awk -v f="${FX[$n]}" -v w="$W" 'BEGIN{print f*w}')
  # Desktop: full width, 16:9.
  dh=$(( W * 9 / 16 )); [ "$dh" -gt "$H" ] && dh=$H
  dw=$(( dh * 16 / 9 ))
  dx=$(offset "$cx" "$dw" "$W")
  dy=$(offset "$(awk -v f="${FY[$n]}" -v h="$H" 'BEGIN{print f*h}')" "$dh" "$H")
  convert "$tmp/src.png" -crop "${dw}x${dh}+${dx}+${dy}" +repage "$tmp/d.png"
  grade "$tmp/d.png" "$tmp/d-g.png" 3840 2160 "$n"
  for w in 3840 2560 1920 1280; do encode "$tmp/d-g.png" "$w" "$n-d"; done
  # Header bands: strips of the graded desktop crop, centred on the person.
  c=$(awk -v f="${FY[$n]}" -v h="$H" -v dy="$dy" -v dh="$dh" 'BEGIN { print (f * h - dy) / dh * 2160 }')
  convert "$tmp/d-g.png" -crop "3840x960+0+$(offset "$c" 960 2160)" +repage "$tmp/b.png"
  for w in 3840 1920; do encode "$tmp/b.png" "$w" "$n-b"; done
  convert "$tmp/d-g.png" -crop "3840x1371+0+$(offset "$c" 1371 2160)" +repage "$tmp/bm.png"
  for w in 1680 1120; do encode "$tmp/bm.png" "$w" "$n-bm"; done
  # Mobile: full height, 2:3, centred on the person.
  mw=$(( H * 2 / 3 ))
  mx=$(offset "$cx" "$mw" "$W")
  convert "$tmp/src.png" -crop "${mw}x${H}+${mx}+0" +repage "$tmp/m.png"
  grade "$tmp/m.png" "$tmp/m-g.png" 1720 2580 "$n"
  for w in 1720 1080; do encode "$tmp/m-g.png" "$w" "$n-m"; done
  # Tracker covers (16:9, components/Photo.tsx Cover) and round thumbnails (1:1, centred on the person; Thumb).
  for w in 1440 960 640; do encode "$tmp/d-g.png" "$w" "$n-c"; done
  convert "$tmp/d-g.png" -crop "2160x2160+$(offset "$(awk -v f="${FX[$n]}" -v w="$W" -v dx="$dx" -v dw="$dw" 'BEGIN { print (f * w - dx) / dw * 3840 }')" 2160 3840)+0" +repage "$tmp/t.png"
  for w in 192 96; do encode "$tmp/t.png" "$w" "$n-t"; done
  echo "photo $n done"
done
