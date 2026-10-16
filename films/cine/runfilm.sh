#!/usr/bin/env bash
# Crash-proof render: frames to JPG in 60-frame chunks (fresh browser each), resuming after the last frame on disk,
# then one encode with grade + grain. Usage: runfilm.sh <film> <frames> <scale> <sub> <out.mp4>
set -u
film=$1; total=$2; scale=$3; sub=$4; out=$5
dir=/home/user/insidir/films/frames/$film; mkdir -p "$dir"
cd "$(dirname "$0")"
while true; do
  have=$(ls "$dir" | wc -l)
  [ "$have" -ge "$total" ] && break
  end=$((have + 60)); [ $end -gt $total ] && end=$total
  node render.mjs "$film" "$dir/f%04d.jpg" "$have" "$end" 1 "$scale" "$sub" 2>&1 | grep -vE "404" | tail -2
  # drop a possibly truncated last frame after a crash
  last=$(ls "$dir" | tail -1); [ -n "$last" ] && [ ! -s "$dir/$last" ] && rm -f "$dir/$last"
done
ffmpeg -v error -y -framerate 30 -i "$dir/f%04d.jpg" -vf "scale=1920:1080:flags=lanczos,format=gray,noise=c0s=8:c0f=t+u,format=yuv420p" -c:v libx264 -preset medium -crf 14 -r 30 "$out"
echo "encoded $out"
