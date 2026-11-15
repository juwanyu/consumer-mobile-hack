"""Render a Cast shot plan to a 720x1280 24fps H.264/AAC MP4.

blender -b -P blender/render_shot_plan.py -- plan.json out.mp4 [--quality draft|final] [--progress-file path]
"""
import json
import math
import os
import random
import sys
import tempfile
import time
import traceback

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import castlib  # noqa: E402
from castlib import progress  # noqa: E402
from character import build_character  # noqa: E402
from animations import apply_action  # noqa: E402
import music  # noqa: E402

SET_SPACING = 400.0
MARK_YAW = {"center": 0.0, "left": -0.25, "right": 0.25, "back": 0.0}


# ---------------------------------------------------------------- plan validation

def _str(v, default="", limit=140):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        v = str(v)
    if not isinstance(v, str) or not v.strip():
        return default
    v = " ".join(v.split())
    return v if len(v) <= limit else v[: limit - 1].rstrip() + "\u2026"


def sanitize_plan(plan, quality_override=None):
    lib = castlib.library()
    plan = plan if isinstance(plan, dict) else {}
    genres = lib.get("genres", {})
    genre = plan.get("genre") if plan.get("genre") in genres else next(iter(genres), "heist")
    roles = genres.get(genre, {}).get("roles", ["Star"])
    quality = quality_override or plan.get("quality")
    quality = quality if quality in ("draft", "final") else "draft"

    cast = []
    raw_cast = plan.get("cast") if isinstance(plan.get("cast"), list) else []
    for i, member in enumerate([m for m in raw_cast if isinstance(m, dict)][:4]):
        cid = _str(member.get("id"), f"c{i + 1}", 40)
        if any(c["id"] == cid for c in cast):
            cid = f"{cid}_{i + 1}"
        cast.append({
            "id": cid,
            "name": _str(member.get("name"), f"Star {i + 1}" if i else "The Star", 32),
            "role": _str(member.get("role"), roles[i % len(roles)], 40),
            "look": member.get("look") if isinstance(member.get("look"), dict) else {},
        })
    if not cast:
        cast = [{"id": "c1", "name": "The Star", "role": roles[0], "look": {}}]
    by_id = {c["id"]: c for c in cast}

    locations = list(lib["locations"].keys())
    default_locs = genres.get(genre, {}).get("default_locations", []) or ["main_street"]
    max_shots = int(lib.get("render", {}).get("max_shots", 3))
    raw_shots = plan.get("shots") if isinstance(plan.get("shots"), list) else []
    shots = []
    for i, shot in enumerate([s for s in raw_shots if isinstance(s, dict)][:max_shots]):
        loc = shot.get("location")
        if loc not in locations:
            loc = "main_street" if "main_street" in locations else locations[0]
        cam = shot.get("camera") if isinstance(shot.get("camera"), dict) else {}
        mark = cam.get("mark") if cam.get("mark") in lib["camera_marks"] else "wide"
        move = cam.get("move") if cam.get("move") in lib["camera_moves"] else "static"
        chars = []
        used_marks = set()
        raw_chars = shot.get("characters") if isinstance(shot.get("characters"), list) else []
        for j, ch in enumerate([c for c in raw_chars if isinstance(c, dict)]):
            cid = ch.get("cast_id")
            if cid not in by_id:
                continue
            if any(c["cast_id"] == cid for c in chars):
                continue
            cmark = ch.get("mark")
            if cmark not in lib["character_marks"] or cmark in used_marks:
                cmark = next((m for m in lib["character_marks"] if m not in used_marks), None)
                if cmark is None:
                    continue
            used_marks.add(cmark)
            action = ch.get("action") if ch.get("action") in lib["actions"] else "idle"
            chars.append({"cast_id": cid, "mark": cmark, "action": action})
        if not chars:
            free = [m for m in lib["character_marks"]]
            chars = [{"cast_id": c["id"], "mark": free[k], "action": "idle"} for k, c in enumerate(cast[: len(free)])]
        dlg = shot.get("dialogue")
        dialogue = None
        if isinstance(dlg, dict) and _str(dlg.get("text")):
            speaker = dlg.get("speaker_cast_id")
            speaker = speaker if speaker in by_id else chars[0]["cast_id"]
            dialogue = {"speaker_cast_id": speaker, "text": _str(dlg.get("text"), "", 120)}
        shots.append({"location": loc, "camera": {"mark": mark, "move": move}, "characters": chars, "dialogue": dialogue})
    if not shots:
        fallback = [("wide", "dolly_in", "wave"), ("medium", "orbit", "talk"), ("low_angle", "push_in", "celebrate")]
        for k, (mark, move, action) in enumerate(fallback[:max_shots]):
            loc = default_locs[k % len(default_locs)]
            shots.append({
                "location": loc if loc in locations else locations[0],
                "camera": {"mark": mark, "move": move},
                "characters": [{"cast_id": c["id"], "mark": m, "action": action} for c, m in zip(cast, lib["character_marks"])],
                "dialogue": None,
            })
    return {
        "quality": quality,
        "genre": genre,
        "title": _str(plan.get("title"), "Untitled Blockbuster", 60),
        "logline": _str(plan.get("logline"), "", 110),
        "cast": cast,
        "shots": shots,
    }


# ---------------------------------------------------------------- scene setup

def ensure_town():
    if os.path.exists(castlib.TOWN_PATH):
        return
    import build_town
    build_town.build_town(castlib.TOWN_PATH)


def load_locations(names):
    names = sorted(set(names))
    with bpy.data.libraries.load(castlib.TOWN_PATH, link=False) as (src, dst):
        dst.collections = [n for n in names if n in src.collections]
    return {c.name: c for c in dst.collections if c is not None}


def configure_render(scene, quality):
    lib = castlib.library().get("render", {})
    r = scene.render
    r.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in {e.identifier for e in r.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE_NEXT"
    r.resolution_x = int(lib.get("width", 720))
    r.resolution_y = int(lib.get("height", 1280))
    r.resolution_percentage = 100
    r.fps = int(lib.get("fps", 24))
    r.fps_base = 1.0
    r.film_transparent = False
    ee = scene.eevee
    final = quality == "final"
    ee.taa_render_samples = 24 if final else 6
    ee.use_shadows = True
    ee.shadow_ray_count = 2 if final else 1
    ee.shadow_step_count = 4 if final else 1
    ee.shadow_resolution_scale = 1.0 if final else 0.75
    ee.use_raytracing = False
    ee.use_fast_gi = False
    ee.gi_diffuse_bounces = 1 if final else 0
    r.use_motion_blur = False
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0


def make_world(scene):
    world = bpy.data.worlds.new("CastWorld")
    world.use_nodes = True
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    sun_data = bpy.data.lights.new("CastSun", "SUN")
    sun_data.angle = math.radians(3)
    sun = bpy.data.objects.new("CastSun", sun_data)
    scene.collection.objects.link(sun)
    return bg, sun


def iter_fcurves(id_data):
    ad = getattr(id_data, "animation_data", None)
    act = ad.action if ad else None
    if act is None:
        return
    if getattr(act, "layers", None):
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves
    else:
        yield from getattr(act, "fcurves", [])


def make_constant(*ids):
    for id_data in ids:
        for fc in iter_fcurves(id_data):
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"


def key_mood(bg, sun, coll, frame):
    sky = castlib.color(coll.get("sky", "#8ECDF7"))
    bg.inputs["Color"].default_value = sky
    bg.inputs["Strength"].default_value = float(coll.get("ambient", 1.0))
    sun.data.color = castlib.color(coll.get("sun_color", "#FFFFFF"))[:3]
    sun.data.energy = float(coll.get("sun_energy", 4.0))
    elev = math.radians(float(coll.get("sun_elev", 45)))
    az = math.radians(float(coll.get("sun_az", 0)))
    sun.rotation_euler = (math.pi / 2 - elev, 0.0, az)
    bg.inputs["Color"].keyframe_insert("default_value", frame=frame)
    bg.inputs["Strength"].keyframe_insert("default_value", frame=frame)
    sun.data.keyframe_insert("color", frame=frame)
    sun.data.keyframe_insert("energy", frame=frame)
    sun.keyframe_insert("rotation_euler", frame=frame)


def make_camera(scene, name, eye, target, lens, move, f0, n):
    cam_data = bpy.data.cameras.new(name)
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = 24.0
    cam_data.lens = lens * 24.0 / 36.0 * 1.5
    cam_data.clip_start = 0.05
    cam_data.clip_end = 250.0
    cam = bpy.data.objects.new(name, cam_data)
    scene.collection.objects.link(cam)
    tgt = bpy.data.objects.new(name + ".target", None)
    scene.collection.objects.link(tgt)
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    eye, target = Vector(eye), Vector(target)
    f1 = f0 + n - 1
    cam.location, tgt.location = eye, target

    def key(f, e, t, lens_mm=None):
        cam.location, tgt.location = e, t
        cam.keyframe_insert("location", frame=f)
        tgt.keyframe_insert("location", frame=f)
        if lens_mm is not None:
            cam_data.lens = lens_mm
            cam_data.keyframe_insert("lens", frame=f)

    d = target - eye
    if move == "dolly_in":
        key(f0, eye, target)
        key(f1, eye + d * 0.35, target)
    elif move == "dolly_out":
        key(f0, eye + d * 0.25, target)
        key(f1, eye - d * 0.3, target)
    elif move == "push_in":
        base = cam_data.lens
        key(f0, eye, target, base)
        key(f1, eye + d * 0.08, target, base * 1.3)
    elif move == "orbit":
        flat = Vector((eye.x - target.x, eye.y - target.y))
        radius, a0 = flat.length, math.atan2(flat.y, flat.x)
        for i in range(0, n, 3):
            a = a0 + math.radians(-35 + 70 * i / max(1, n - 1))
            key(f0 + i, Vector((target.x + radius * math.cos(a), target.y + radius * math.sin(a), eye.z)), target)
        a = a0 + math.radians(35)
        key(f1, Vector((target.x + radius * math.cos(a), target.y + radius * math.sin(a), eye.z)), target)
    elif move == "pan":
        side = Vector((1.0, 0.0, 0.0))
        span = max(1.0, d.length * 0.25)
        key(f0, eye - side * span * 0.3, target - side * span)
        key(f1, eye + side * span * 0.3, target + side * span)
    elif move == "shake":
        rnd = random.Random(f0)
        amp = 0.04 + 0.01 * d.length
        for i in range(0, n, 2):
            jitter = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * amp
            key(f0 + i, eye + jitter, target + jitter * 0.4)
        key(f1, eye, target)
    return cam


def build_scene(plan, progress_file=None, offset_frames=0):
    """Build the 3D scene for a sanitized plan. Returns dict(scene, frames, shots=[(start, n)], cameras, rigs)."""
    lib = castlib.library()
    fps = int(lib.get("render", {}).get("fps", 24))
    shot_frames = int(lib.get("render", {}).get("shot_seconds", 3) * fps)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Cast3D"
    configure_render(scene, plan["quality"])
    nshots = len(plan["shots"])
    progress("building_set", 2, 0, nshots, progress_file)
    colls = load_locations([s["location"] for s in plan["shots"]])
    bg, sun = make_world(scene)
    cast = {c["id"]: c for c in plan["cast"]}
    variant = {c["id"]: i for i, c in enumerate(plan["cast"])}
    shot_ranges, cameras, rigs = [], [], []
    for i, shot in enumerate(plan["shots"]):
        f0 = 1 + i * shot_frames
        offset = Vector((i * SET_SPACING, 0.0, 0.0))
        coll = colls.get(shot["location"]) or colls.get("main_street") or next(iter(colls.values()))
        loc = coll.name
        inst = bpy.data.objects.new(f"shot{i + 1}.set", None)
        inst.instance_type = "COLLECTION"
        inst.instance_collection = coll
        inst.location = offset
        scene.collection.objects.link(inst)
        key_mood(bg, sun, coll, f0)
        progress("building_set", 3 + 32 * (i + 0.5) / nshots, i + 1, nshots, progress_file, location=loc)

        def obj(kind, name):
            return coll.objects.get(f"{loc}.{kind}.{name}")

        for ch in shot["characters"]:
            member = cast[ch["cast_id"]]
            mark = obj("mark", ch["mark"])
            pos = (mark.location if mark else Vector((0, 0, 0))) + offset
            rig = build_character(member["look"], f"s{i + 1}.{member['id']}", variant=variant[member["id"]])
            rig.location = pos
            rig.rotation_euler = (0.0, 0.0, MARK_YAW.get(ch["mark"], 0.0))
            bpy.context.view_layer.update()
            apply_action(rig, ch["action"], f0, shot_frames)
            rigs.append(rig)
        progress("rigging", 3 + 32 * (i + 1) / nshots, i + 1, nshots, progress_file)

        cam_mark = obj("cam", shot["camera"]["mark"])
        eye = (cam_mark.location if cam_mark else Vector((0, -12, 3))) + offset
        target = Vector(cam_mark["target"] if cam_mark and "target" in cam_mark else (0, 0, 1.2)) + offset
        lens = float(cam_mark.get("lens", 30.0)) if cam_mark else 30.0
        cam = make_camera(scene, f"shot{i + 1}.cam", eye, target, lens, shot["camera"]["move"], f0, shot_frames)
        marker = scene.timeline_markers.new(f"shot{i + 1}", frame=f0)
        marker.camera = cam
        cameras.append(cam)
        shot_ranges.append((f0, shot_frames))
    make_constant(scene.world.node_tree, sun, sun.data)
    scene.camera = cameras[0]
    scene.frame_start = 1
    scene.frame_end = nshots * shot_frames
    return {"scene": scene, "frames": nshots * shot_frames, "shots": shot_ranges, "cameras": cameras, "rigs": rigs}


# ---------------------------------------------------------------- overlays / edit

def _font():
    font = bpy.data.fonts.get("CastInter")
    if font is None:
        path = os.path.join(bpy.utils.system_resource("DATAFILES"), "fonts", "Inter.woff2")
        try:
            font = bpy.data.fonts.load(path)
            font.name = "CastInter"
        except Exception:
            font = None
    return font


def _text(se, name, body, f0, n, channel, y, size, color=(1, 1, 1, 1), bold=True, box=None, wrap=0.86):
    s = se.strips.new_effect(name=name, type="TEXT", channel=channel, frame_start=f0, length=n)
    font = _font()
    if font is not None:
        s.font = font
    s.text = body
    s.font_size = size
    s.use_bold = bold
    s.color = color
    s.location = (0.5, y)
    s.alignment_x = "CENTER"
    s.anchor_x = "CENTER"
    s.anchor_y = "CENTER"
    s.wrap_width = wrap
    s.use_shadow = True
    s.shadow_color = (0, 0, 0, 0.8)
    s.use_outline = True
    s.outline_color = (0, 0, 0, 1)
    s.outline_width = 0.06
    if box is not None:
        s.use_box = True
        s.box_color = box
        s.box_margin = 0.025
        try:
            s.box_roundness = 0.4
        except (AttributeError, TypeError):
            pass
    s.blend_type = "ALPHA_OVER"
    return s


def _fade(strip, f0, n, fade_in=0, fade_out=6):
    strip.blend_alpha = 0.0 if fade_in else 1.0
    if fade_in:
        strip.keyframe_insert("blend_alpha", frame=f0)
        strip.blend_alpha = 1.0
        strip.keyframe_insert("blend_alpha", frame=f0 + fade_in)
    if fade_out:
        strip.blend_alpha = 1.0
        strip.keyframe_insert("blend_alpha", frame=f0 + n - fade_out - 1)
        strip.blend_alpha = 0.0
        strip.keyframe_insert("blend_alpha", frame=f0 + n - 1)


def _shade_overlay(se, name, f0, n, alpha, channel):
    s = se.strips.new_effect(name=name, type="COLOR", channel=channel, frame_start=f0, length=n)
    s.color = (0.0, 0.0, 0.03)
    s.blend_type = "ALPHA_OVER"
    s.blend_alpha = alpha
    return s


ACCENT = (1.0, 0.82, 0.25, 1.0)


def build_edit(plan, built, wav_path):
    scene3d = built["scene"]
    total = built["frames"]
    edit = bpy.data.scenes.new("CastEdit")
    configure_render(edit, plan["quality"])
    edit.frame_start, edit.frame_end = 1, total
    se = edit.sequence_editor_create()
    main = se.strips.new_scene(name="Cast3D", scene=scene3d, channel=1, frame_start=1)
    main.scene_input = "CAMERA"
    if main.frame_final_end != total + 1:
        main.frame_final_end = total + 1

    names = {c["id"]: c["name"] for c in plan["cast"]}
    title_n = min(44, total // 3)
    ov = _shade_overlay(se, "title_dim", 1, title_n, 0.5, 2)
    ov.blend_alpha = 0.5
    ov.keyframe_insert("blend_alpha", frame=title_n - 8)
    ov.blend_alpha = 0.0
    ov.keyframe_insert("blend_alpha", frame=title_n)
    genre_label = castlib.library().get("genres", {}).get(plan["genre"], {}).get("label", "")
    t = _text(se, "kicker", ("A CAST ORIGINAL  \u2022  " + genre_label.upper()).strip(" \u2022"), 1, title_n, 3, 0.66, 26, ACCENT)
    _fade(t, 1, title_n, 0, 8)
    t = _text(se, "title", plan["title"].upper(), 1, title_n, 4, 0.58, 76, wrap=0.9)
    _fade(t, 1, title_n, 0, 8)
    if plan["logline"]:
        t = _text(se, "logline", plan["logline"], 1, title_n, 5, 0.47, 36, bold=False, wrap=0.8)
        _fade(t, 1, title_n, 0, 8)

    credits_n = min(24, total // 4)
    credits_f0 = total - credits_n + 1
    for i, (f0, n) in enumerate(built["shots"]):
        dlg = plan["shots"][i]["dialogue"]
        if not dlg:
            continue
        end = min(f0 + n, credits_f0) if i == len(built["shots"]) - 1 else f0 + n
        start = f0 + (title_n if i == 0 and len(built["shots"]) == 1 else 0) + 3
        dn = max(6, end - start)
        _text(se, f"sub{i + 1}_name", names.get(dlg["speaker_cast_id"], "").upper(), start, dn, 6, 0.205, 30, ACCENT)
        _text(se, f"sub{i + 1}_line", "\u201c" + dlg["text"] + "\u201d", start, dn, 7, 0.15, 44,
              box=(0.0, 0.0, 0.0, 0.55), wrap=0.84)

    ov = _shade_overlay(se, "credits_dim", credits_f0, credits_n, 0.0, 8)
    ov.keyframe_insert("blend_alpha", frame=credits_f0)
    ov.blend_alpha = 0.62
    ov.keyframe_insert("blend_alpha", frame=credits_f0 + 5)
    lines = "\n".join(f"Starring {c['name']} as {c['role']}" for c in plan["cast"])
    t = _text(se, "credits", lines, credits_f0, credits_n, 9, 0.52, 46, wrap=0.86)
    _fade(t, credits_f0, credits_n, 5, 0)
    t = _text(se, "credits_title", plan["title"].upper(), credits_f0, credits_n, 10, 0.38 if len(plan["cast"]) < 3 else 0.33, 30, ACCENT)
    _fade(t, credits_f0, credits_n, 5, 0)

    if wav_path:
        snd = se.strips.new_sound(name="music", filepath=wav_path, channel=11, frame_start=1)
        if snd.frame_final_end > total + 1:
            snd.frame_final_end = total + 1
    return edit


def configure_output(edit, out_path, quality):
    r = edit.render
    im = r.image_settings
    if "media_type" in im.bl_rna.properties:
        im.media_type = "VIDEO"
    im.file_format = "FFMPEG"
    ff = r.ffmpeg
    ff.format = "MPEG4"
    ff.codec = "H264"
    ff.constant_rate_factor = "HIGH" if quality == "final" else "MEDIUM"
    ff.ffmpeg_preset = "GOOD" if quality == "final" else "REALTIME"
    ff.gopsize = 24
    ff.audio_codec = "AAC"
    ff.audio_bitrate = 192
    ff.audio_channels = "STEREO"
    ff.audio_mixrate = 44100
    r.use_file_extension = False
    r.filepath = out_path
    r.use_sequencer = True
    r.use_compositing = False


def render_plan(plan, out_path, progress_file=None):
    t0 = time.time()
    ensure_town()
    built = build_scene(plan, progress_file)
    total = built["frames"]
    seconds = total / built["scene"].render.fps
    wav_path = os.path.join(tempfile.gettempdir(), f"cast_music_{os.getpid()}.wav")
    try:
        music.write_music(wav_path, plan["genre"], seconds, [f0 / built["scene"].render.fps for f0, _ in built["shots"][1:]])
    except Exception:
        traceback.print_exc()
        wav_path = None
    edit = build_edit(plan, built, wav_path)
    configure_output(edit, out_path, plan["quality"])
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    progress("rendering", 40, None, None, progress_file, frame=0, frames=total)
    state = {"n": 0, "last": -1}

    def on_frame(scene, *_):
        if scene.name != edit.name:
            return
        state["n"] += 1
        pct = 40 + 59 * state["n"] / total
        shot = min(len(built["shots"]), 1 + (scene.frame_current - 1) // built["shots"][0][1])
        if int(pct) != state["last"]:
            state["last"] = int(pct)
            progress("rendering", pct, shot, len(built["shots"]), progress_file, frame=state["n"], frames=total)

    bpy.app.handlers.render_post.append(on_frame)
    print(f"[cast] scene built in {time.time() - t0:.1f}s; rendering {total} frames", flush=True)
    bpy.ops.render.render(animation=True, scene=edit.name)
    bpy.app.handlers.render_post.remove(on_frame)
    if wav_path and os.path.exists(wav_path):
        os.remove(wav_path)
    progress("done", 100, None, None, progress_file, output=out_path, seconds=round(time.time() - t0, 1))
    print(f"[cast] wrote {out_path} in {time.time() - t0:.1f}s", flush=True)


def parse_args(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    opts = {"quality": None, "progress_file": None}
    pos = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--quality", "--progress-file") and i + 1 < len(args):
            opts["quality" if a == "--quality" else "progress_file"] = args[i + 1]
            i += 2
            continue
        if a.startswith("--quality="):
            opts["quality"] = a.split("=", 1)[1]
        elif a.startswith("--progress-file="):
            opts["progress_file"] = a.split("=", 1)[1]
        else:
            pos.append(a)
        i += 1
    if opts["quality"] not in (None, "draft", "final"):
        opts["quality"] = None
    plan_path = pos[0] if pos else os.path.join(HERE, "sample_plan.json")
    out_path = pos[1] if len(pos) > 1 else os.path.abspath("cast_out.mp4")
    return plan_path, os.path.abspath(out_path), opts


def main():
    plan_path, out_path, opts = parse_args(sys.argv)
    try:
        with open(plan_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception as e:
        print(f"[cast] could not read plan {plan_path}: {e}; using defaults", flush=True)
        raw = {}
    plan = sanitize_plan(raw, opts["quality"])
    print("[cast] plan: " + json.dumps(plan), flush=True)
    try:
        render_plan(plan, out_path, opts["progress_file"])
    except Exception:
        traceback.print_exc()
        print("[cast] render failed; retrying with a minimal safe plan", flush=True)
        try:
            render_plan(sanitize_plan({"title": plan["title"], "cast": [{"id": "c1", "name": plan["cast"][0]["name"]}]}, "draft"),
                        out_path, opts["progress_file"])
        except Exception:
            traceback.print_exc()
            progress("error", 100, None, None, opts["progress_file"])
            sys.exit(1)


if __name__ == "__main__":
    main()
