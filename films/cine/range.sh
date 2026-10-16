#!/usr/bin/env bash
# Render frames [A, B) of a film into frames/<film>/, resuming at the first missing frame, 60 frames per browser.
film=$1; A=$2; B=$3; scale=$4; sub=$5
dir=/home/user/insidir/films/frames/$film; mkdir -p "$dir"; cd "$(dirname "$0")"
while true; do
  f=$A; while [ $f -lt $B ] && [ -s "$dir/$(printf 'f%04d.jpg' $f)" ]; do f=$((f + 1)); done
  [ $f -ge $B ] && break
  end=$((f + 60)); [ $end -gt $B ] && end=$B
  node render.mjs "$film" "$dir/f%04d.jpg" "$f" "$end" 1 "$scale" "$sub" 2>&1 | grep -vE "404" | tail -1
done
echo "range $A-$B done"
