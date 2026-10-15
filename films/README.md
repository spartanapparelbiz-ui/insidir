# Insidir — three black-and-white films

| File | Length | Tempo | Identity |
| --- | --- | --- | --- |
| `insidir_city_never_sleeps.mp4` | 20 s | 128 BPM, F minor | Night. Anamorphic 2.39 letterbox, rain, a lamp-lit desk. Dark hypnotic house. |
| `insidir_one_who_looked_closer.mp4` | 25 s | 120 BPM, D minor | Dawn. Full frame, blind light, a wall clock that ticks on every other beat. Minimal analog arpeggio. |
| `insidir_price_of_information.mp4` | 18 s | 130 BPM, E | Hard light. Shake on impacts, 0.11–0.46 s cuts, slam captions, a calm voice in silence. Big-beat bass. |

All three are 1920×1080, 30 fps, H.264 High + AAC 320 kbps, graded to strict monochrome with animated grain in the final encode.

## What is real

- **The filing.** Every document shot is the SEC's own rendering of a real Form 4: NVIDIA director Mark A. Stevens, accession
  `0001199039-26-000016`, filed 09/22/2026. Two open-market sales on 09/18/2026: 1,356,000 shares at a weighted average $219.7219
  (footnote 1: $219.40 to $220.35) and 10,000 at $220.4199, held by the Third Millennium Trust. Source:
  `https://www.sec.gov/Archives/edgar/data/1045810/000119903926000016/`. Saved in `filing/`.
- **The product.** The Insidir screens are the real company report (`company.html?ticker=NVDA`), served by `npm run web` with live
  SEC EDGAR and Yahoo Finance data and captured at 2× in Chromium (`product2x/`). The row the films land on
  (Mark A. Stevens, Sep 18, 2026, −1,366,000 shares, $300,147,095, 2 line items, avg. $219.73) is the same two Form 4 lines summed,
  which is why each film can match-cut from the filing to the product.
- **The data on the split-flap board and ticker tape** is copied from NVIDIA's Form 4 filings (`render/data.js`).
- **The brand.** The `insidir.` wordmark is set in the site's own JetBrains Mono at 800 with −0.04em tracking, ink `#e9e4da` on
  night paper `#0c0c0b`. The end cards build it from the landing page's halftone dots, then settle on the solid mark.

## How the picture was made

- **Generated footage** (`source_clips/`): two clips from MiniMax H3 through ChatCut. One is a night aerial over Manhattan
  (Film 1's opening; the "old newspaper" halftone and the aerial montage cuts in Film 3). The other is a hand lifting a rotary
  telephone receiver (Film 1's montage; played in reverse it becomes Film 3's receiver slam). Video generation then stopped,
  because the ChatCut account ran out of credits. The prompts for all 31 planned shots are in `prompts/shots.json`.
- **Everything else is coded** in a deterministic canvas renderer (`render/`): the camera moves, depth of field and lamp light on
  the real filing, pen, pencil and highlighter marks drawn in the document's own coordinates, the split-flap board, ticker tape,
  newspaper press, wall clock, wristwatch, watch movement, the lit window in a dark tower, the rain, the shutters and the halftone
  wordmark. `render/film1.js`, `film2.js` and `film3.js` are the editable edits: each shot is one entry with its start, its end and
  how it draws, and the cuts are written on the beat grid (`b(n)`, `q(n)`).

## Sound

`scripts/synth.py` synthesizes all three scores and every effect from oscillators and filtered noise. It uses no samples and no
existing recordings: the references (Bicep "Glue", Chromatics "Tick of the Clock", Leftfield "Phat Planet") set only tempo, energy and
texture. The cue times are the same numbers as the picture's cuts. The script writes music, SFX and mix stems to `audio/` (committed as FLAC).
The Film 3 voiceover is Piper TTS (`en_US-ryan-high`, MIT-licensed engine), `audio/vo/`.

## Rebuild

```sh
npm run web                                   # from the repo root, with SEC_USER_AGENT set (for product captures)
python3 -m http.server 5300 --bind 127.0.0.1  # from the repo root (the renderer loads the fonts from web/assets)
node films/scripts/capture-product.mjs http://localhost:5199 films/product2x
node films/scripts/capture-filing.mjs films/filing/form4.html films/filing/form4_full.png
ffmpeg -i films/source_clips/A01_manhattan_aerial.mp4 -vf format=gray -q:v 2 films/frames/A01/%03d.jpg   # same for A04
cd films
node scripts/render-film.mjs 1 renders/film1_picture.mp4   # 2, 3 likewise
python3 scripts/synth.py
scripts/mux.sh
```
