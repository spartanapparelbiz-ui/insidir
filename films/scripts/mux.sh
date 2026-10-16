#!/usr/bin/env bash
# Muxes each rendered picture with its mixed soundtrack into the final deliverable.
set -euo pipefail
cd "$(dirname "$0")/.."
declare -A NAME=([1]=insidir_city_never_sleeps [2]=insidir_one_who_looked_closer [3]=insidir_price_of_information)
declare -A DUR=([1]=20 [2]=25 [3]=18)
films=("$@"); [ ${#films[@]} -eq 0 ] && films=(1 2 3)
for n in "${films[@]}"; do
  common=(-map 0:v:0 -c:v libx264 -preset slow -b:v 14M -maxrate 20M -bufsize 28M -profile:v high -pix_fmt yuv420p -r 30
          -vf "scale=1920:1080:flags=lanczos,setsar=1,format=gray,format=yuv420p" -t "${DUR[$n]}")
  # two-pass at 14 Mb/s: the animated grain stays intact without 60 Mb/s files
  ffmpeg -v error -y -i "renders/real${n}_picture.mp4" "${common[@]}" -pass 1 -passlogfile "renders/pass${n}" -an -f mp4 /dev/null
  ffmpeg -v error -y -i "renders/real${n}_picture.mp4" -i "audio/film${n}_mix.wav" "${common[@]}" -pass 2 -passlogfile "renders/pass${n}" \
    -map 1:a:0 -c:a aac -b:a 320k -ar 48000 -ac 2 -movflags +faststart "${NAME[$n]}.mp4"
  echo "wrote ${NAME[$n]}.mp4"
done
