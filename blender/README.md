# Cast Blender pipeline

Headless Blender 5.x scripts that turn a shot plan into a 720x1280, 24 fps, ~9 s H.264/AAC MP4 of blocky R6-style characters.
Everything is procedural; the only inputs are `shared/assetLibrary.json` (the contract) and a plan JSON.

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender

# 1. Build the town (optional: the renderer builds it on the fly if missing). ~2 s.
$BLENDER -b --factory-startup -P blender/build_town.py            # -> blender/build/town.blend (gitignored)

# 2. Render a plan. Draft ~20 s, final ~40 s on an M5 Pro.
$BLENDER -b -P blender/render_shot_plan.py -- blender/sample_plan.json /tmp/out.mp4 \
  [--quality draft|final] [--progress-file /tmp/progress.txt]

# 3. Regenerate docs/ PNGs
$BLENDER -b -P blender/render_docs.py -- towns|characters|actions
$BLENDER -b -P blender/render_docs.py -- frame /tmp/out.mp4 150 docs/sample_shot.png
```

Progress is printed to stdout (and appended to `--progress-file`) one JSON object per line:
`PROGRESS {"stage": "building_set"|"rigging"|"rendering"|"done"|"error", "shot": 2, "of": 3, "pct": 40, ...}`.
The script exits non-zero only if even the minimal fallback plan fails to render.

## Files

| File | What it does |
| --- | --- |
| `castlib.py` | Contract loading, hex colors, the two shared materials (`CastPlastic`, `CastNeon`, both driven by a `Col` color attribute), `MeshBuilder`, progress lines. |
| `build_town.py` | One collection per location. Each has empties `<loc>.mark.<center/left/right/back>` and `<loc>.cam.<wide/medium/closeup/low_angle/overhead>` (custom props `target`, `lens`), plus lighting mood props on the collection (`sky`, `sun_color`, `sun_energy`, `sun_elev`, `sun_az`, `ambient`). |
| `character.py` | `build_character(look, name, collection=None, variant=0)`: 7-bone armature (root, torso, head, arm_L/R, leg_L/R), rigid meshes bone-parented. Hair, facial hair, glasses, shirt styles, accessories and the face are geometry. `sanitize_look` fills invalid fields with defaults. |
| `animations.py` | `apply_action(rig, action, start_frame, frame_count)` for every action in the library; unknown -> idle. walk/run/sneak move the rig forward, scared steps back, fall/sit lower it. |
| `render_shot_plan.py` | Validates the plan, instances each shot's location 400 m apart, builds characters, keys actions, cameras (one per shot, switched with timeline markers) and camera moves, then renders through a VSE edit scene with title card, subtitles, credits and a synthesized music bed. |
| `music.py` | The whole soundtrack as one mastered WAV: music bed (plan `music_path`, or a synthesized genre beat as fallback), narration, SFX, ducking, limiter, level report. |
| `render_docs.py` | Renders the PNGs in `docs/`. |

## Plan validation (never crashes on bad input)

- unknown location -> `main_street`; unknown camera mark -> `wide`; unknown move -> `static`; unknown action -> `idle`
- unknown `cast_id`s are dropped; duplicate/invalid marks get the next free mark; a shot with no valid characters gets the cast at free marks, idling
- no valid shots -> 3 shots from the genre's `default_locations`; max 3 shots, max 4 cast
- missing names/roles/titles get defaults; dialogue with an unknown speaker goes to the first character in the shot
- invalid hex colors or style names fall back per field; several default characters get different palettes
- unreadable plan file -> defaults; if a render still throws, it retries with a minimal plan

## Render settings

EEVEE (`BLENDER_EEVEE`), Standard view transform, no raytracing/GI. Draft: 6 TAA samples, 1 shadow ray at 0.75 resolution, x264 `REALTIME` preset. Final: 24 samples, softer shadows, `GOOD` preset.
The 3D scene is rendered through a scene strip, so overlays are plain VSE text strips using the bundled Inter font.

## Punchy reel mode (contract v2)

`plan.style: "punchy"` (see `blender/fate_plan.json`) switches the edit to a reel: up to `render.reel_max_shots` shots,
each `duration_s` clamped to `render.reel_shot_seconds`, extended to narration length + 0.15 s when `narration.audio_path`
points at a local mp3/wav. Overlays, all VSE strips:

- `hud`: top-left game HUD. Numeric values that change from the previous shot count over the first 0.6 s; labels containing
  `SEAL` also draw red ❖ glyphs (spent seals stay dark).
- `caption`: word-pop captions (1-2 words at a time, key word yellow: the one with "!", else the longest).
- `fx`: `magic_circle` (rotating rune circle + rising motes), `flash` (white flash + wind burst), `sparkles`,
  `speed_lines` (generated radial-line PNGs, flickered), `excalibur` (layered blade of light: white core, gold body, soft halo
  quads, on the hand of the `raise_sword`/`slash` character, gold screen flash at impact), `army` (60 low-poly YC founders,
  three rigs instanced as collections, converging on the hero or charging the wall), `army_fall` (founders are knocked back
  and flat as the impact wave reaches them), `shockwave` (expanding ring), `embers` (drifting sparks). Up to 4 fx per shot.
- Last shot: serif title slam (Times New Roman Bold, falls back to Inter) with white flash, the logline, a small
  "POWERED BY CAPY" line (a trailing "· powered by …" in the logline is moved there) and "Starring A as X · B as Y" (NPCs excluded).

`cast[].npc: true` marks a built-in character; the look is filled from `npcs.<key>`, and a shot that references `npc_<key>`
adds it even if the cast omits it. Props follow actions: `slash` gives a sword, `film` a shoulder cinema camera, `summon` a red glowing hand.
Cinematic credits list NPCs as "and Saber as Saber". Draft punchy renders use 2 TAA samples with shadows off (cinematic stays at 6).

Castle contract (v3): locations `yc_hq`, `capy_castle`, `castle_wall`; actions `charge`, `raise_sword` (overhead wind-up hold,
then the swing), `block`, `thumbs_up`, `banner` (CAPY flag); `cast[].outfit: "saber"` (from `outfits` in assetLibrary.json)
puts the member in Saber armour, cape and sword over their own face and hair. The outfit is withheld at `yc_hq` so the hero
"suits up" later. On `castle_wall`, army shots use an over-the-shoulder camera and the Excalibur shot a side angle down the wall.

## Audio mastering

`render_plan` mixes everything in numpy (`music.write_mix`) and puts one WAV in the VSE:

- Music: `plan.music_path` (mp3/wav/m4a, decoded with Blender's audaspace) starts at its first 0.5 s window above 70% of the
  loudest window, is looped or trimmed to length, fades in 0.2 s / out 0.6 s. Without it, the synthesized genre beat is used.
- Narration clips are normalized to the same speech RMS; music and crowd duck to 55% under them, and the bed is scaled so
  narration sits 6 dB over the ducked music.
- SFX: whoosh + hit on cuts, crowd roar under `army` shots, sword clashes on `slash`/`block`, riser + boom + shimmer on the
  Excalibur impact.
- Master: gain to -13 dBFS RMS through a look-ahead limiter with a -2 dBFS ceiling (AAC adds about 0.8 dB, so the MP4
  peaks near -1 dBFS). The log prints `AUDIO {"peak_dbfs", "rms_dbfs", "lufs", "music_file", "voice_over_music_db"}`.

## Render feed for the app: STAGE and PREVIEW lines

`--preview-dir DIR` (optional): before the main render, one 360x640 JPEG per shot (mid-shot, 3D only, no overlays) is
rendered into `DIR/shot<N>.jpg`. When shot N starts rendering, stdout prints

    PREVIEW <N> <absolute path to DIR/shotN.jpg>

Human-readable stage lines are printed to stdout only (never to `--progress-file`), alongside the unchanged PROGRESS lines:

    STAGE Building the set
    STAGE Lighting the set: shot 2/6 Summoning Room
    STAGE Building characters: shot 2/6
    STAGE Mixing audio
    STAGE Rendering shot 2/6
    STAGE Encoding video

## Look (v2)

- Characters (`character.py`): big-head stylised R6 proportions, rounded parts, hands with thumbs, anime eyes (iris colour,
  pupil, two highlights, lashes, brows), blush, nose, ears. Separate eyelid and open-mouth objects are keyed for blinks and a
  mouth flap. The flap plays for the shot's speaker: `dialogue.speaker_cast_id`, else `narration.speaker_cast_id`, else the
  first character when the caption or narration is a quote. Celebrate and scared keep the mouth open.
  Curly and afro hair are clusters of outlined curls. The cap is blue unless the shirt is saturated, then it matches the shirt.
  Stubble is speckled.
- Shading (`castlib.py`): `CastPlastic` is a cel shader (quantised Shader-to-RGB light × vertex colour + rim). Characters and
  sets get inverted-hull outlines (`CastOutline`). The world is a horizon-to-zenith gradient, plus a cool back rim light.
- Framing: the camera is computed from the characters' positions per shot (`FRAMING` in `render_shot_plan.py`), so subjects fill
  the 82%-wide phone-safe area. Punchy reels stagger left/right marks closer and deeper, cap forward travel, and add DoF on
  closeups (and on mediums in final quality). They also apply a vignette and a colour-balance grade.
- `town.blend` carries `build/town.blend.version`; the renderer rebuilds it when `TOWN_VERSION` changes.
