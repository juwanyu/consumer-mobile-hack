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
| `music.py` | numpy + `wave` genre-flavoured beat (kick/snare/hat/bass/lead), whooshes at cuts, hits at start and end. |
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
points at a local mp3/wav. Music is ducked to ~30% under narration. Overlays, all VSE strips:

- `hud`: top-left game HUD. Numeric values that change from the previous shot count over the first 0.6 s; labels containing
  `SEAL` also draw red ❖ glyphs (spent seals stay dark).
- `caption`: word-pop captions (1-2 words at a time, key word yellow: the one with "!", else the longest).
- `fx`: `magic_circle` (rotating rune circle + rising motes), `flash` (white flash + wind burst), `sparkles`,
  `speed_lines` (generated radial-line PNGs, flickered), `excalibur` (golden beam on the sword hand during `slash`, gold screen flash at impact).
- Last shot: serif title slam (Times New Roman Bold, falls back to Inter) with white flash, the logline, a small
  "POWERED BY CAPY" line (a trailing "· powered by …" in the logline is moved there) and "Starring A as X · B as Y" (NPCs excluded).

`cast[].npc: true` marks a built-in character; the look is filled from `npcs.<key>`, and a shot that references `npc_<key>`
adds it even if the cast omits it. Props follow actions: `slash` gives a sword, `film` a shoulder cinema camera, `summon` a red glowing hand.
Cinematic credits list NPCs as "and Saber as Saber". Draft punchy renders use 4 TAA samples (cinematic stays at 6).
