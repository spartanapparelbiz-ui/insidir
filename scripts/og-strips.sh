#!/usr/bin/env bash
# The thin photo strips on top of share cards, the link preview and emails, cut from the graded desktop crops
# (scripts/hero-photos.sh) so they carry the same grade. Which photo goes where: lib/photos.ts STRIP.
# Share images are drawn by next/og, which reads them from lib/og-assets; the email strip is served from public/brand.
# Run from the repo root: bash scripts/og-strips.sh
set -euo pipefail
strip() { # photo width height y-centre(0..1) out
  local n=$1 w=$2 h=$3 cy=$4 out=$5 ch
  ch=$(( 1920 * h / w ))
  local y; y=$(awk -v c="$cy" -v ch="$ch" 'BEGIN { o = int(c * 1080 - ch / 2); if (o < 0) o = 0; if (o > 1080 - ch) o = 1080 - ch; print o }')
  convert "public/hero/$n-d-1920.webp" -crop "1920x${ch}+0+${y}" +repage -resize "${w}x${h}!" -strip -quality 86 "$out"
}
strip 11 1080 400 0.55 lib/og-assets/strip-move.jpg       # move share card (1080×1920)
strip 16 1200 170 0.44 lib/og-assets/strip-site.jpg       # link preview and receipt cards (1200×630)
strip 15 1080 400 0.36 lib/og-assets/strip-site-tall.jpg  # receipt story card (1080×1920)
strip 4 1120 240 0.58 public/brand/email-strip.jpg        # emails (560px wide, 2x)
ls -l lib/og-assets/strip-*.jpg public/brand/email-strip.jpg
