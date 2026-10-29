#!/usr/bin/env bash
# The site's photos (components/Photo.tsx, lib/photos.ts): one Unsplash original per subject (every tracker, the home
# columns), fetched once into .cache/photos at 5120px wide and JPEG quality 95. Natural colour: only a resize, a light
# sharpen and a touch of contrast (no desaturation, vignette, tint or darkening). Per photo it writes to public/photos:
#   <name>-c-<w>  4:3 card at 1600, 1200 and 800 wide
#   <name>-h-<w>  21:9 header at 3840, 2560 and 1920 wide
#   <name>-t-<w>  1:1 thumbnail at 192 and 96
# each as 10-bit AVIF and WebP, the width in the file name (a new size never hits an old cached file).
# Needs ImageMagick 6 (Q16), ffmpeg with libaom-av1 and libwebp, and network access to images.unsplash.com for the
# first run. Run from the repo root: bash scripts/hero-photos.sh [name ...] (no arguments: every photo).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache/photos public/photos
src=.cache/photos
out=public/photos
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# name → Unsplash photo id (credits: lib/photos.ts PHOTOS, the same names and photographers).
declare -A ID=(
  [biggest-bets]=1568430328012-21ed450453ea [top-traders]=1651341050677-24dba59ce0fd [top-1-percent]=1561833726-f7edc0273b68
  [underdog-hunters]=1552072092-7f9b8d63efcb [favorites-only]=1507514604110-ba3347c457f6 [early-money]=1749794747527-bcd8999e5fd1
  [late-money]=1728659964407-ed9a942ec2de [steam]=1672545701317-5177e9f41166 [new-wallets]=1579014134953-1580d7f123f3
  [nfl]=1566577739112-5180d4bf9390 [nba]=1546519638-68e109498ffc [mlb]=1475440197469-e367ec8eeb19 [nhl]=1545471977-94cac22e71ed
  [college-football]=1781650104690-a5309d91a26b [college-basketball]=1765924705648-9a0731ac5202 [soccer]=1587329310686-91414b8e3cb7
  [premier-league]=1577214250705-d5c24d76ea0c [champions-league]=1767916732786-a83902ffc25c [la-liga]=1674760726595-d12f5e45482a
  [serie-a]=1693517393451-a71a593c9870 [ufc]=1738982518593-316b17348c30 [tennis]=1554068865-24cecd4e34b8 [golf]=1604608147284-139feed06f4c
  [esports]=1504450758481-7338eba7524a [fed-and-rates]=1633059050703-0f1b50828402 [elections-2026]=1520525003249-2b9cdda513bc
  [geopolitics]=1590274853856-f22d5ee3d228 [tech-and-ai]=1782338938777-908f4e1db3be [culture]=1533174072545-7a4b6ad7a6c3
  [crypto-prices]=1623227413711-25ee4388dae3 [ceo-buys]=1610374792793-f016b77ca51a [cluster-buys]=1722299547563-03e2d21fe289
  [big-funds]=1586815634274-bf5eb51055c9 [home-stocks]=1631216166880-9e9b51577962 [home-markets]=1581097543550-b3cbe2e6ea6e
  [home-sports]=1679391029864-d46f366a456b
)

# A centred crop of the original at the given aspect ratio (w:h), as many pixels as it has.
crop() { # in out aw ah
  local W H cw ch
  read -r W H < <(identify -format "%w %h\n" "$1")
  if [ $(( W * $4 )) -gt $(( H * $3 )) ]; then ch=$H; cw=$(( H * $3 / $4 )); else cw=$W; ch=$(( W * $4 / $3 )); fi
  convert "$1" -gravity center -crop "${cw}x${ch}+0+0" +repage "$2"
}

# One size: resize in linear light, a touch of contrast, a light sharpen; 10-bit AVIF (crf 24) and WebP at 86.
encode() { # png width base
  convert "$1" -depth 16 -colorspace RGB -filter Lanczos -resize "$2x" -colorspace sRGB \
    -sigmoidal-contrast 2,50% -unsharp 0x0.6+0.5+0.01 -depth 16 -strip "PNG48:$tmp/e.png"
  ffmpeg -loglevel error -y -i "$tmp/e.png" -c:v libaom-av1 -still-picture 1 -crf 24 -cpu-used 4 -row-mt 1 \
    -pix_fmt yuv420p10le -color_primaries bt709 -color_trc iec61966-2-1 -colorspace bt709 "$3-$2.avif"
  convert "$tmp/e.png" -depth 8 -define webp:method=6 -quality 86 "$3-$2.webp"
}

names=("$@"); [ ${#names[@]} -gt 0 ] || names=("${!ID[@]}")
for name in "${names[@]}"; do
  id=${ID[$name]:?"unknown photo: $name"}
  [ -s "$src/$name.jpg" ] || curl -sfL -o "$src/$name.jpg" "https://images.unsplash.com/photo-$id?fm=jpg&q=95&w=5120"
  convert "$src/$name.jpg" -depth 16 "PNG48:$tmp/src.png"
  crop "$tmp/src.png" "$tmp/c.png" 4 3;  for w in 1600 1200 800; do encode "$tmp/c.png" "$w" "$out/$name-c"; done
  crop "$tmp/src.png" "$tmp/h.png" 21 9; for w in 3840 2560 1920; do encode "$tmp/h.png" "$w" "$out/$name-h"; done
  crop "$tmp/src.png" "$tmp/t.png" 1 1;  for w in 192 96; do encode "$tmp/t.png" "$w" "$out/$name-t"; done
  echo "photo $name done"
done
