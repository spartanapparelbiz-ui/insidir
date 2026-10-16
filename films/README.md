# Insidir — three black-and-white films

| File | Length | Tempo | Story |
| --- | --- | --- | --- |
| `insidir_city_never_sleeps.mp4` | 20 s | 128 BPM, F minor | Night, rain, 2.39 letterbox. A drone push between Manhattan towers, rain in a Times Square puddle. A beat-cut montage of the real NYSE floor, newspaper presses, a telephone lifted, watches. A man working alone late, hands on the keyboard, a pen under the lamp. The real Form 4, one line underlined. The same trade in Insidir. |
| `insidir_one_who_looked_closer.mp4` | 25 s | 120 BPM, D minor | A 1950 newsroom. One deskman at his typewriter under the wall clock pulls the page and reads it closely, pencil in hand. His reading is cut against the real Form 4 being marked. Silence on his face, then the line. The trade in Insidir, then the source. |
| `insidir_price_of_information.mp4` | 18 s | 130 BPM, E | Straight onto the 1960s NYSE floor, a receiver slammed down, a man facing the lens. Presses, ticker boards, 1945 New York crowds, towers. Old and new cut faster and faster. Then silence: one hand on one page, a calm voice, the real Form 4, three cuts of the product, the mark. |

All three are 1920×1080, 30 fps, H.264 High plus AAC 320 kb/s, strict monochrome (chroma flat at 128) with grain.

## Footage: real people, real objects

Every moving shot is real live-action film. No AI-generated video is in the final cut, and the coded 3D experiment
kept in `cine/` is not used.

- **Archive film (Internet Archive, Prelinger Archives):**
  - *Vista Stock Shots: New York Stock Exchange* (1960s) has the real NYSE trading floor.
    https://archive.org/details/0803_Vista_Stock_Shots_New_York_Stock_Exchange_13_00_55_00
  - *Newspaper Story* (1950, public domain) has the newsroom, Film 2's deskman, the clock, the typewriter, the pencil and the
    rotary press. https://archive.org/details/NewspaperSto
  - *17 Days: The Story of Newspaper History in the Making* (1945, public domain) has New York crowds.
    https://archive.org/details/17DaysTh1945

  The two newspaper films carry an explicit public-domain mark. The Vista NYSE reel is in the Prelinger collection, which is
  offered for free reuse, but the item itself has no license field; confirm it before paid broadcast use.
- **Modern stock (Pixabay Content License, free commercial use, no attribution required):** the aerial, the rain, the man
  working late, hands on keyboards, the pen, the watches, the telephone, street crowds, towers. `stock/manifest.json` lists
  each clip's author, page URL and in/out points.
- **From the first version:** the real Form 4 being read and underlined, the Insidir product screens and the halftone end card
  (frames reused by `scripts/build_real.py` from the first cut).

## What is real in the story

- **The filing.** The SEC's rendering of a real Form 4: NVIDIA director Mark A. Stevens, accession `0001199039-26-000016`,
  filed 09/22/2026. On 09/18/2026 he sold 1,356,000 shares at a weighted average of $219.7219 and 10,000 shares at $220.4199,
  held by the Third Millennium Trust. https://www.sec.gov/Archives/edgar/data/1045810/000119903926000016/
- **The product.** The real Insidir company report for NVDA, captured from the running site with live SEC EDGAR data. Its row
  for Mark A. Stevens (−1,366,000 shares, $300,147,095) is the same two Form 4 lines summed.

## Sound

`scripts/synth.py` synthesizes the scores and every effect from oscillators and filtered noise, with no samples or existing
recordings. That includes formant-synthesized trading-floor crowds. Cues sit on the picture's cut times. The references
(Bicep, Chromatics, Leftfield) set only tempo, energy and texture. The Film 3 voiceover is Piper TTS (`en_US-ryan-high`).

## Rebuild

```sh
# put the clips from stock/manifest.json in stock/ and the three archive films in archive/ (see URLs above)
python3 films/scripts/build_real.py      # pictures → films/renders/realN_picture.mp4
python3 films/scripts/synth.py           # soundtracks → films/audio/
films/scripts/mux.sh                     # deliverables
```
