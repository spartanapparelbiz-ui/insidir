# Insidir video ads

A standalone production system that turns a JSON script and brand assets into a finished
1080×1920, 30 fps, H.264 MP4 advertisement. It is not part of the website or the engine:
it has its own `package.json`, reads the site's files only to copy brand assets and to
photograph pages, and changes nothing outside `videos/`.

Built with [Remotion](https://www.remotion.dev) 4 (React, frame rendering), FFmpeg (score
mastering, final encode, verification) and Playwright (product footage).

## Finished videos

| File | Spot | Length |
| --- | --- | --- |
| `output/insidir-sec-filings.mp4` | SEC filings: Form 4, trade and filing dates, codes in words | 15.000 s, 450 frames |
| `output/insidir-financial-intelligence.mp4` | Financial intelligence: original sources, the 10-K, company reports, no made-up numbers | 15.000 s, 450 frames |
| `output/insidir-market-research.mp4` | Market research: search, read the evidence, decide | 15.000 s, 450 frames |

Each has a `.verify.json` beside it with the FFprobe measurements.

## Quick start

```sh
cd videos
npm install
npm run render:all          # every script in ads/  ->  output/insidir-<id>.mp4 (+ .verify.json)
node tools/render.mjs ads/sec-filings.json              # one ad
node tools/render.mjs ads/sec-filings.json --stills 0,90,300   # QA frames in output/qa/
npm run verify -- output/*.mp4                          # re-run the checks
npm run studio                                          # Remotion Studio: every script, scrubbable, with its score
```

Rendering one ad takes 4–8 minutes on 4 CPU cores. The renderer uses the Chrome headless shell at
`REMOTION_BROWSER_EXECUTABLE` (or `/opt/pw-browsers/...` when present; otherwise Remotion
downloads its own) and the system `ffmpeg`/`ffprobe` (override with `FFMPEG`/`FFPROBE`).

## Making a new video

1. **Assets.** Photographs go in `public/photos/` (run `npm run assets` to copy and grade the site's
   own photographs), product screenshots in `public/screens/` (`npm run screens` photographs the
   real pages listed in `tools/capture-screens.mjs`; add a shot there to capture a new section).
2. **Script.** Copy a file in `ads/` and edit it. The schema is `src/engine/schema.mjs`; the
   render refuses a script whose scene beats do not add up to its length (at 120 bpm a 15-second
   spot is exactly 30 beats; one beat is 15 frames).
3. **Render** it with `node tools/render.mjs ads/<id>.json`. The score is generated from the
   same script, so the music follows the edit.

### Script reference

```jsonc
{
  "id": "sec-filings",            // output/insidir-<id>.mp4
  "title": "…", "notes": "where every claim comes from",
  "bpm": 120, "seconds": 15,      // beats × 60 / bpm must equal seconds
  "score": { "key": "D", "mood": "ticker" | "pulse" | "drive", "seed": 11 },
  "scenes": [ { "type": "…", "beats": 4, "transition": { … }, "label": "masthead section", "chrome": true, … } ]
}
```

Scenes (every scene has `beats`, an optional `transition` in, `label` and `chrome`):

| type | what it is | main fields |
| --- | --- | --- |
| `photo` | full-bleed photograph, continuous camera move, newspaper copy | `src`, `focus`, `camera {from,to,ease}`, `copy`, `shade`, `halftone` |
| `headline` | a front page: double rule, photo above the fold with caption, display-serif headline | `theme` paper/night, `section`, `photo {src,focus,caption}`, `copy` |
| `document` | a blank official SEC form (`form4`, `10k`, `8k`) on paper under a tilted camera, one phrase marked in ink | `form`, `highlight`, `caption`, `camera`, `tilt` |
| `screen` | a real Insidir page: `phone` scrolls a phone capture, `card` flies the camera across a desktop section | `src`, `mode`, `from`, `to` (`[cx, cy, width]` for cards), `highlight {rect, at}`, `copy` |
| `mosaic` | a wall of full-frame cells (photos or filing-type cards); the camera pulls back while cells land staggered, then pushes into one cell, which fills the frame exactly for a seamless cut | `cols`, `rows`, `cells`, `order`, `path [{at, view: "all" \| index}]`, `reveal` |
| `statement` | words rising out of their masks, one after another | `words`, `soft`, `kicker`, `theme` |
| `endcard` | the landing page's halftone `insidir` wordmark assembling from dots, tagline, call to action | `kicker`, `tagline`, `cta`, `url`, `fineprint` |

`copy` is `{ kicker, headline: [lines], deck, soft: [line indexes in the softer ink], position, at (beat), size, face }`.

Transitions (the `transition` of the incoming scene; the outgoing scene keeps moving underneath):

| type | effect | fields |
| --- | --- | --- |
| `cut` | a hard cut on the beat | |
| `tiles` | the frame splits into a grid; each tile flips, scales, rises, drops or snaps to the next scene on a staggered order | `cols`, `rows`, `motion` flip/flipX/scale/rise/drop/cut, `order` diagonal/antidiagonal/center/edges/random/rows/columns, `spread`, `beats` |
| `shutter` | vertical strips push the old scene out and the new one in, alternating up and down | `cols`, `direction`, `spread`, `beats` |
| `halftone` | a screen of brand dots grows until it covers the frame, then shrinks away over the next scene | `cell`, `ink` night/paper, `from`, `beats` |

## Brand rules followed

From `web/assets/css/v13-halftone.css` and `docs/WEBSITE.md` (V13 "Halftone"):

- Night paper `#0c0c0b`, warm ink `#e9e4da` and blends of the two. No orange anywhere; nothing glows.
- The logo is the `insidir.` wordmark in JetBrains Mono 800, tracked −0.04em; the end card is the landing
  page's halftone wordmark, drawn with the site engine's own coverage and dot-radius formulas.
- JetBrains Mono for labels, data and body; Source Serif 4 (shipped with the site) at its display
  optical size for the newspaper headlines.
- Photographs graded exactly like the site: `grayscale(1) sepia(.12) contrast(1.05)`; print grain over
  everything; motion uses the site's ease-out curve, without overshoot.

## Content rules

- Every claim comes from the live site's own copy; each script's `notes` lists the source page.
- No figures, tickers, filers or prices appear anywhere. The SEC forms are the blank official forms.
- Product footage is the real site, photographed from this checkout. Pages that need account data
  (dashboard, company reports with numbers) are not shown, because nothing is mocked; the
  "Familiar faces" section of the People page is cropped out so no real person or company logo is
  borrowed for an advertisement.
- The score is synthesized by `tools/score.mjs` (no samples, no licensed music).

## Pipeline

```
ads/<id>.json ──zod──▶ beat grid (src/engine/timeline.mjs)
      │                    ├─▶ tools/score.mjs ─▶ WAV ─▶ FFmpeg loudnorm (−14 LUFS, −1.5 dBTP, two pass)
      │                    └─▶ Remotion (src/InsidirAd.tsx) ─▶ ProRes 422 HQ master
      └──────────────────────────────▶ FFmpeg: H.264 High@4.1, yuv420p, BT.709, CRF 17, AAC 192k, faststart
                                         └─▶ tools/verify.mjs (FFprobe + full decode + bar detection)
```

`tools/verify.mjs` fails a file unless it is MP4/H.264 High, 1080×1920 with square pixels (9:16),
constant 30 fps, yuv420p, BT.709-tagged, exactly the expected frame count and duration, with AAC
stereo 48 kHz audio of the same length, `moov` before `mdat`, an error-free full decode, and no
letterbox or pillarbox (the outer 4 px rows and columns are measured on every frame).

### Photograph super-resolution (optional)

The site's photographs are 500–2400 px wide. `tools/upscale/upscale.py` runs Real-ESRGAN x4plus
(BSD-3-Clause) on the CPU through onnxruntime without PyTorch, reading the official weights with an
allow-list unpickler. Its output feeds `npm run assets -- --sr <dir>`; the graded results are what
`public/photos/` holds, so rendering does not need Python.

```sh
pip install -r tools/upscale/requirements.txt
curl -LO https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
python3 -I tools/upscale/upscale.py --model RealESRGAN_x4plus.pth --out /tmp/sr ../web/assets/img/*.jpg
npm run assets -- --sr /tmp/sr
```

## Licences

Fonts: JetBrains Mono and Source Serif 4, SIL Open Font License (`public/fonts/OFL.txt`).
Remotion is free for individuals and companies of up to three people; larger companies need a
[Remotion company licence](https://www.remotion.dev/license).
