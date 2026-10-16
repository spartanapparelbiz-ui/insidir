# Insidir — three black-and-white VFX films

| file | length | music |
|---|---|---|
| `media/films/insidir_01_wall_street_after_dark.mp4` | 20 s, 600 frames | dark house, 120 BPM |
| `media/films/insidir_02_the_obsession.mp4` | 25 s, 750 frames | ticking suspense, beat switch at 16 s |
| `media/films/insidir_03_money_never_sleeps.mp4` | 18 s, 540 frames | relentless percussive house |

All three are 1920×1080, 16:9, 30 fps, H.264 + AAC 48 kHz, −11 LUFS. Insidir appears only in the last 2.5 s of
each, built into the scene rather than shown as a screen: lit in a tower's windows (V1), inked onto the glass hall
behind the protagonist (V2), rising behind the Brooklyn Bridge (V3). No interface or dashboard appears.

## How they were made (and what was not available)

- **Footage.** The brief asked for footage generated with an AI video model. The ChatCut connector in this
  environment refused every image/video generation (no ChatCut Pro plan, no credits), and no other video model was
  connected, so — with the owner's go-ahead — every shot is **real filmed footage**: Pixabay stock (modern New York,
  tunnels, watches, an eye) and **public-domain archive film** from the Internet Archive (the 1958 NYSE floor, 1950
  newspaper presses, ticker tape, 1921 Wall Street). See [SOURCES.md](SOURCES.md). A handful of stock clips are 3D
  renders (the alloy wheel, the doorway silhouette, the looking-up towers); they are marked there.
- **No Blender, After Effects or GPU** were available. Instead the films are composited frame by frame in Python
  (`lib/`), with OpenCV for optical flow and tracking, a monocular depth network (Depth Anything V2 Small, CPU) for
  3D, and FFmpeg for frame-accurate assembly and muxing. Remotion was not used: the Python renderer already gives
  exact frame control, and every frame is a pure function `frame(f)`.
- **Reference video.** None reached the session, so pacing follows the written brief on a 120 BPM grid
  (15 frames per beat, 16th notes every 3.75 frames).
- **Music** is real: three netlabel techno/tech-house releases (CC BY / CC BY-SA, see SOURCES.md), time-stretched
  to 120 BPM with Rubber Band (pitch preserved) and automatically phase-locked so the kicks sit on the picture's beat
  grid (measured within 0.25 frame). Each track's own drop lands on a picture event: V1 the car window, V2 the
  doorway beat switch, V3 the phone slam.
- **Sound effects** are real recordings from Freesound (NYC subway, a stock-exchange floor, a phone receiver slam,
  a newspaper press room, a steel bridge creaking, a mechanical clock...), each placed so its measured transient
  lands on its frame (`lib/realaudio.py`). The earlier synthesized score (`lib/audio.py`) is no longer used.

## The techniques (all computed from the footage, none are presets)

| technique | where | how |
|---|---|---|
| 3D camera move through live footage | V1 street, V2 corridor | per-frame depth map → every pixel lifted to 3D → re-projected for a moving camera with z-ordered splatting, footprints sized by the projection's Jacobian, disocclusions filled from an inpainted clean plate (`vfx.reproject`) |
| Dolly-zoom (vertigo) | V2 corridor | the same re-projection with the camera retreating while the output focal length grows to hold the subject's size |
| Frozen time, camera keeps moving | V2 watch, V2 pages, V3 floor | one frame held; the camera orbits / flies through it in 3D; people the camera passes drop out of the depth stack |
| Time manipulation | all | optical-flow retiming (DIS flow, bidirectional occlusion-aware in-betweens), speed ramps, clockwork stutter (V2: hold 10 frames, lurch on the tick), slow-motion into impacts (V3 slam) |
| 3D objects in the plate | V2 pages | 340 A4 quads with typeset SEC-form textures, projected with the same camera as the plate, shaded by orientation, defocused by distance, occluded by the protagonist's depth |
| Depth-sorted kinetic type | V1 WALL STREET / AFTER DARK, V2 WHO SOLD? and insidir, V3 insidir | type placed at a depth; anything nearer in the depth map covers it (street poles, towers, the protagonist, the Brooklyn Bridge) |
| Planar tracking | V1 tower, V3 facade type | KLT feature tracks, RANSAC homographies, temporally smoothed; insidir lives in the tower's windows, MONEY NEVER SLEEPS on a curtain wall |
| Portals (fly through an object) | eye → watch, tunnel → shaft, iris → hall | the camera pushes exponentially into a region while the next shot, scaled to that region, grows with it — one continuous move |
| Structure-following transitions | wheel → tunnel, crowd → phone, door → floor | the picture is its own matte: the tunnel opens in the gaps between the spokes, the floor appears inside the doorway's light |
| Reality bending | V1 skyline, V3 bridge | true 3D plane folds (rotation + perspective projection about a hinge line) and a lean warp that arcs towers over the camera, pulsed on the beat |
| Photomosaics | V1 Empire State, V3 skyline | thousands of live tiles from every clip, matched on luma structure, reveal on 16th notes, pulled toward the target and resolved into the full shot |
| Beat-driven multiplication | V3 | the trading floors split 2×2 → 32×32 (1,024 live panels) on successive beats |
| Circle-matched chain | V2 drop | dial, iris, hub, tunnel, aerial and post are each scaled so their circles share one radius, with an accelerating roll and a push that never stops, cutting on 16ths |
| Film finish | all | B&W channel mix per source, filmic S-curve, halation, luma-dependent grain, vignette, sensor-style overexposure (no white flash frames), band-limited handheld drift with impact jolts |

## Shot breakdowns (frame numbers at 30 fps; one beat = 15 frames)

### Video 1 — Wall Street After Dark
| frames | shot | effect |
|---|---|---|
| 0–90 | rain on Times Square, camera at puddle height | per-frame depth re-projection dolly racing forward; 0.45× slow-motion on the raindrop until the kick at 30, then 1.6×; WALL STREET set in depth, occluded by poles |
| 90–120 | a rain-covered car window | droplet relief from real rain-on-glass footage refracts the street (gradient displacement), then the droplets burst past the lens |
| 120–172 | spinning wheel hub | 3.4× push on the hub, rotation accelerating; the tunnel opens in the dark gaps between the spokes, the spin carries into the tunnel |
| 172–246 | subway tunnel | flow-retimed speed, the roll decays then turns 90°; portal through the light at the end of the tunnel |
| 246–300 | elevator shaft | 4× hyperlapse, push to the top, exposure burst |
| 300–375 | above the city | towers lean and the sky folds over the camera on each beat; AFTER DARK behind the towers |
| 375–480 | mosaic | 2,304 live tiles snap in on 16ths, assemble the Empire State aerial, and melt into it as the camera pulls back |
| 480–512 | dive | portal from the aerial into a night facade |
| 512–600 | the tower | a band of floors goes dark and insidir switches on in the tower's own windows, mapped onto the face in perspective and planar-tracked as the camera drifts in |

### Video 2 — The Obsession
| frames | shot | effect |
|---|---|---|
| 0–105 | the protagonist walks | clockwork time (holds, then lurches on each tick); depth dolly-zoom bends the hall around him; WHO SOLD? behind him in depth |
| 105–165 | into his eye | template-tracked push into his eye; a macro iris is scaled to his iris and takes over |
| 165–226 | through the pupil | portal from the pupil into a watch dial |
| 226–330 | the watch freezes | the second hand stops on beat 17; the ticking stops; the camera keeps orbiting the frozen watch in 3D |
| 330–480 | pages | the frozen protagonist; 340 filing pages tumble in and lock mid-air on the beat; the camera orbits; the room rolls 180° |
| 480–540 | beat switch | a figure walks into a doorway of light; the light becomes the 1958 NYSE floor |
| 540–675 | acceleration | 17 circle-matched shots on a 16th-note grid, each shorter than the last, rolling faster and faster |
| 675–750 | found | the last iris opens back onto him; insidir assembles dot by dot in ink on the glass hall behind him, occluded by him in depth |

### Video 3 — Money Never Sleeps
| frames | shot | effect |
|---|---|---|
| 0–30 | 1958 | a broker on the phone, the NYSE floor in full cry |
| 30–104 | freeze | first bass hit: time stops; the camera flies through the frozen crowd and people pass the lens |
| 104–135 | the phone | the crowd's shadows open onto a telephone; the hand brings the receiver down in slow motion |
| 135–200 | the slam | on the hit the receiver's downward motion continues as the tunnel's light streaks; out under an elevated road |
| 200–255 | the bridge | a steel truss bridge folds up and over the camera; the skyscrapers behind it rise into view |
| 255–300 | presses | the newspaper web swings vertical and becomes a glass curtain wall; MONEY NEVER SLEEPS tracked onto it |
| 300–390 | multiplication | 4 → 16 → 64 → 256 → 1,024 live trading-floor panels, one subdivision per beat |
| 390–465 | collapse | the panels become a photomosaic of the night skyline and resolve into it |
| 465–540 | reveal | the halftone insidir rises behind the Brooklyn Bridge and the towers, occluded by the deck in depth |

## Rebuilding

```
pip install opencv-python-headless torch transformers numba scipy soundfile librosa fonttools brotli
python3 -c "import sys; sys.path.insert(0,'film'); from lib import render as R; R.render('v1_wall_street', 'out.mp4')"
```

The film modules read source clips from `FILM_MEDIA` (`pix/`, `arc/`) and interface recordings from `FILM_UI`;
the clip URLs are in `sources/`. Depth maps, tracks and decoded clips are cached in `FILM_CACHE`.
