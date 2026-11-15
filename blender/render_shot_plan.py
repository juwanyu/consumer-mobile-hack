"""Render a Cast shot plan to a 720x1280 24fps H.264/AAC MP4.

blender -b -P blender/render_shot_plan.py -- plan.json out.mp4 [--quality draft|final] [--progress-file path]
"""
import json
import math
import os
import random
import re
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
from animations import (ACTION_PROPS, RAISE_HOLD, RAISE_IMPACT, SLASH_IMPACT, SLASH_PERIOD, SLASH_RAISED,  # noqa: E402
                        apply_action)
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
    styles = lib.get("styles", {"cinematic": {}})
    style = plan.get("style") if plan.get("style") in styles else "cinematic"
    npcs = lib.get("npcs", {})
    rcfg = lib.get("render", {})

    def npc_entry(key, cid=None, member=None):
        base = npcs[key]
        member = member or {}
        look = dict(base.get("look", {}))
        if isinstance(member.get("look"), dict):
            look.update({k: v for k, v in member["look"].items() if v not in (None, "")})
        return {"id": cid or f"npc_{key}", "name": _str(member.get("name"), base.get("name", key.title()), 32),
                "role": _str(member.get("role"), base.get("role", key.title()), 40), "look": look, "npc": True}

    def npc_key(value):
        if not isinstance(value, str):
            return None
        v = value.strip().lower()
        v = v[4:] if v.startswith("npc_") else v
        return v if v in npcs else None

    cast = []
    raw_cast = plan.get("cast") if isinstance(plan.get("cast"), list) else []
    humans = 0
    for i, member in enumerate([m for m in raw_cast if isinstance(m, dict)]):
        is_npc = member.get("npc") is True
        if (is_npc and len(cast) - humans >= 2) or (not is_npc and humans >= 4):
            continue
        cid = _str(member.get("id"), f"c{i + 1}", 40)
        if any(c["id"] == cid for c in cast):
            cid = f"{cid}_{i + 1}"
        key = npc_key(member.get("id")) or npc_key(member.get("name"))
        if is_npc and key:
            cast.append(npc_entry(key, cid, member))
            continue
        humans += 0 if is_npc else 1
        cast.append({
            "id": cid,
            "name": _str(member.get("name"), f"Star {i + 1}" if i else "The Star", 32),
            "role": _str(member.get("role"), roles[i % len(roles)], 40),
            "look": member.get("look") if isinstance(member.get("look"), dict) else {},
            "npc": is_npc,
            "outfit": member.get("outfit") if member.get("outfit") in lib.get("outfits", {}) else None,
        })
    if not cast:
        cast = [{"id": "c1", "name": "The Star", "role": roles[0], "look": {}, "npc": False}]
    by_id = {c["id"]: c for c in cast}
    raw_shots = plan.get("shots") if isinstance(plan.get("shots"), list) else []
    for shot in raw_shots:
        for ch in (shot.get("characters") if isinstance(shot, dict) and isinstance(shot.get("characters"), list) else []):
            cid = ch.get("cast_id") if isinstance(ch, dict) else None
            key = npc_key(cid)
            if isinstance(cid, str) and cid not in by_id and key and len(cast) < 6:
                cast.append(npc_entry(key, cid))
                by_id[cid] = cast[-1]
    fps = int(rcfg.get("fps", 24))
    durs = rcfg.get("reel_shot_seconds", {}) if isinstance(rcfg.get("reel_shot_seconds"), dict) else {}
    dmin, dmax = float(durs.get("min", 1.5)), float(durs.get("max", 4))
    ddefault = float(durs.get("default", 2.5)) if style == "punchy" else float(rcfg.get("shot_seconds", 3))
    fx_names = lib.get("fx", ["none"])

    locations = list(lib["locations"].keys())
    default_locs = genres.get(genre, {}).get("default_locations", []) or ["main_street"]
    max_shots = int(rcfg.get("reel_max_shots" if style == "punchy" else "max_shots", 3) or 3)
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
        d = shot.get("duration_s")
        duration = min(dmax, max(dmin, float(d))) if isinstance(d, (int, float)) and not isinstance(d, bool) and math.isfinite(d) else ddefault
        fx = shot.get("fx")
        fx = [f for f in (fx if isinstance(fx, list) else [fx]) if f in fx_names and f != "none"][:4]
        hud = []
        for item in (shot.get("hud") if isinstance(shot.get("hud"), list) else [])[:3]:
            if isinstance(item, dict) and _str(item.get("label")):
                hud.append({"label": _str(item.get("label"), "", 24).upper(), "value": _str(item.get("value"), "", 12)})
        narr = shot.get("narration") if isinstance(shot.get("narration"), dict) else {}
        audio = narr.get("audio_path")
        audio = os.path.abspath(os.path.expanduser(audio)) if isinstance(audio, str) and audio.strip() else None
        if audio and not (os.path.isfile(audio) and audio.lower().endswith((".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"))):
            print(f"[cast] narration audio not usable, ignoring: {audio}", flush=True)
            audio = None
        shots.append({"location": loc, "camera": {"mark": mark, "move": move}, "characters": chars, "dialogue": dialogue,
                      "duration_s": round(duration, 3), "fx": fx, "hud": hud, "caption": _str(shot.get("caption"), "", 80),
                      "narration": {"text": _str(narr.get("text"), "", 300), "audio_path": audio}})
    music_path = plan.get("music_path")
    music_path = os.path.abspath(os.path.expanduser(music_path)) if isinstance(music_path, str) and music_path.strip() else None
    if music_path and not (os.path.isfile(music_path) and music_path.lower().endswith((".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"))):
        print(f"[cast] music_path not usable, using the synth bed: {music_path}", flush=True)
        music_path = None
    if not shots:
        fallback = [("wide", "dolly_in", "wave"), ("medium", "orbit", "talk"), ("low_angle", "push_in", "celebrate")]
        for k, (mark, move, action) in enumerate(fallback[:max_shots]):
            loc = default_locs[k % len(default_locs)]
            shots.append({
                "location": loc if loc in locations else locations[0],
                "camera": {"mark": mark, "move": move},
                "characters": [{"cast_id": c["id"], "mark": m, "action": action} for c, m in zip(cast, lib["character_marks"])],
                "dialogue": None, "duration_s": ddefault, "fx": [], "hud": [], "caption": "",
                "narration": {"text": "", "audio_path": None},
            })
    return {
        "style": style,
        "quality": quality,
        "genre": genre,
        "title": _str(plan.get("title"), "Untitled Blockbuster", 60),
        "logline": _str(plan.get("logline"), "", 110),
        "cast": cast,
        "shots": shots,
        "music_path": music_path,
    }


# ---------------------------------------------------------------- scene setup

def ensure_town():
    """Build town.blend if it is missing or predates a location added to the contract."""
    import build_town
    try:
        with open(castlib.TOWN_PATH + ".version") as f:
            current = f.read().strip() == str(build_town.TOWN_VERSION)
    except OSError:
        current = False
    if os.path.exists(castlib.TOWN_PATH) and current:
        try:
            with bpy.data.libraries.load(castlib.TOWN_PATH, link=False) as (src, dst):
                have = set(src.collections)
            if all(loc in have for loc in castlib.library()["locations"]):
                return
            print("[cast] town.blend is missing locations; rebuilding", flush=True)
        except Exception as e:
            print(f"[cast] town.blend unreadable ({e}); rebuilding", flush=True)
    import build_town
    build_town.build_town(castlib.TOWN_PATH)


def load_locations(names):
    names = sorted(set(names))
    with bpy.data.libraries.load(castlib.TOWN_PATH, link=False) as (src, dst):
        dst.collections = [n for n in names if n in src.collections]
    return {c.name: c for c in dst.collections if c is not None}


def configure_render(scene, quality, style="cinematic"):
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
    ee.taa_render_samples = 12 if final else (2 if style == "punchy" else 6)
    ee.use_shadows = final or style != "punchy"
    ee.shadow_ray_count = 2 if final else 1
    ee.shadow_step_count = 2 if final else 1
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
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = -0.02
    mr.inputs["From Max"].default_value = 0.55
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    hor = nt.nodes.new("ShaderNodeRGB")
    hor.name = "horizon"
    zen = nt.nodes.new("ShaderNodeRGB")
    zen.name = "zenith"
    mixn = nt.nodes.new("ShaderNodeMix")
    mixn.data_type = "RGBA"
    nt.links.new(mr.outputs["Result"], mixn.inputs["Factor"])
    nt.links.new(hor.outputs[0], mixn.inputs[6])
    nt.links.new(zen.outputs[0], mixn.inputs[7])
    nt.links.new(mixn.outputs[2], bg.inputs["Color"])
    sun_data = bpy.data.lights.new("CastSun", "SUN")
    sun_data.angle = math.radians(3)
    sun = bpy.data.objects.new("CastSun", sun_data)
    scene.collection.objects.link(sun)
    rim_data = bpy.data.lights.new("CastRim", "SUN")
    rim_data.use_shadow = False
    rim = bpy.data.objects.new("CastRim", rim_data)
    rim.rotation_euler = (-math.radians(62), 0, math.radians(15))
    scene.collection.objects.link(rim)
    sun["rim"] = rim.name
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
    sky_hex = coll.get("sky", "#8ECDF7")
    nt = bg.id_data
    hor, zen = nt.nodes.get("horizon"), nt.nodes.get("zenith")
    if hor and zen:
        hor.outputs[0].default_value = castlib.color(castlib.shade(castlib.hex_to_srgb(sky_hex), 1.15))
        zen.outputs[0].default_value = castlib.color(castlib.shade(castlib.hex_to_srgb(sky_hex), 0.42))
        hor.outputs[0].keyframe_insert("default_value", frame=frame)
        zen.outputs[0].keyframe_insert("default_value", frame=frame)
    rim = bpy.data.objects.get(sun.get("rim", ""))
    if rim:
        rim.data.color = castlib.color(castlib.shade(castlib.hex_to_srgb(sky_hex), 1.0))[:3]
        rim.data.color = tuple(0.5 + 0.5 * c for c in rim.data.color)
        rim.data.energy = 2.2
        rim.data.keyframe_insert("color", frame=frame)
        rim.data.keyframe_insert("energy", frame=frame)
    sky = castlib.color(sky_hex)
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
        key(f1, eye + d * 0.06, target, base * 1.2)
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


def audio_seconds(path):
    """Length of an audio file in seconds via a throwaway sequencer strip (handles mp3/wav)."""
    probe = bpy.data.scenes.new("cast_audio_probe")
    try:
        probe.render.fps = 24
        strip = probe.sequence_editor_create().strips.new_sound(name="probe", filepath=path, channel=1, frame_start=1)
        return strip.frame_final_duration / 24.0
    except Exception as e:
        print(f"[cast] could not read narration {path}: {e}", flush=True)
        return 0.0
    finally:
        bpy.data.scenes.remove(probe)


def shot_frame_counts(plan, fps):
    counts = []
    for shot in plan["shots"]:
        seconds = float(shot.get("duration_s") or castlib.library().get("render", {}).get("shot_seconds", 3))
        audio = (shot.get("narration") or {}).get("audio_path")
        shot["_audio_s"] = audio_seconds(audio) if audio else 0.0
        if shot["_audio_s"] > 0:
            seconds = max(seconds, shot["_audio_s"] + 0.15)
        counts.append(max(12, int(round(seconds * fps))))
    return counts


def _key_linear(*ids):
    for id_data in ids:
        for fc in iter_fcurves(id_data):
            for k in fc.keyframe_points:
                k.interpolation = "LINEAR"


def fx_magic_circle(scene, name, center, f0, n, fps):
    objs = []
    for k, (radius, col, speed) in enumerate(((1.75, "#BFE6FF", 0.35), (1.05, "#7FC8FF", -0.6))):
        mb = castlib.MeshBuilder()
        castlib.magic_circle(mb, (0, 0, 0), radius, col, runes=(k == 0))
        obj = mb.to_object(f"{name}.circle{k}", scene.collection)
        obj.location = center + Vector((0, 0, 0.05 + 0.01 * k))
        obj.rotation_euler = (0, 0, 0)
        obj.keyframe_insert("rotation_euler", frame=f0)
        obj.rotation_euler = (0, 0, 2 * math.pi * speed * n / fps)
        obj.keyframe_insert("rotation_euler", frame=f0 + n)
        _key_linear(obj)
        objs.append(obj)
    mb = castlib.MeshBuilder()
    rnd = random.Random(f0)
    for j in range(12):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.4, 1.7)
        mb.box((r * math.cos(a), r * math.sin(a), rnd.uniform(0.1, 1.2)), (0.02, 0.02, rnd.uniform(0.12, 0.3)), "#CFEFFF", mat=1)
    motes = mb.to_object(f"{name}.motes", scene.collection)
    motes.location = center
    motes.keyframe_insert("location", frame=f0)
    motes.location = center + Vector((0, 0, 1.6))
    motes.keyframe_insert("location", frame=f0 + n)
    _key_linear(motes)
    return objs


def fx_wind_burst(scene, name, center, f0):
    mb = castlib.MeshBuilder()
    rnd = random.Random(f0 + 7)
    for k in range(44):
        a = rnd.uniform(0, 2 * math.pi)
        mb.box((math.cos(a), math.sin(a), rnd.uniform(0.2, 2.4)), (rnd.uniform(0.4, 0.9), 0.03, 0.03),
               rnd.choice(["#FFFFFF", "#DDF1FF", "#FFF4C2"]), rot=(0, 0, a), mat=1)
    obj = mb.to_object(name + ".wind", scene.collection)
    obj.location = center
    for f, sc in ((f0, 0.3), (f0 + 14, 4.5), (f0 + 15, 0.0)):
        obj.scale = (sc, sc, 1.0 if sc else 0.0)
        obj.keyframe_insert("scale", frame=f)
    return obj


def fx_sparkles(scene, name, center, f0, n, fps):
    mb = castlib.MeshBuilder()
    rnd = random.Random(f0 + 3)
    for k in range(46):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.6, 2.6)
        mb.ball((r * math.cos(a), r * math.sin(a), rnd.uniform(0.2, 2.9)), rnd.uniform(0.018, 0.04),
                rnd.choice(["#FFF3B0", "#FFFFFF", "#FFD166", "#BDE0FE"]), subdiv=1, mat=1)
    obj = mb.to_object(name + ".sparkles", scene.collection)
    obj.location = center
    obj.keyframe_insert("rotation_euler", frame=f0)
    obj.keyframe_insert("location", frame=f0)
    obj.rotation_euler = (0, 0, 0.5 * n / fps)
    obj.location = center + Vector((0, 0, 0.35))
    obj.keyframe_insert("rotation_euler", frame=f0 + n)
    obj.keyframe_insert("location", frame=f0 + n)
    _key_linear(obj)
    return obj


def glow_material():
    """Additive-looking soft glow: emission weighted by the colour attribute's alpha, alpha-blended."""
    mat = bpy.data.materials.get("CastGlow")
    if mat:
        return mat
    mat = bpy.data.materials.new("CastGlow")
    mat.use_nodes = True
    nt = mat.node_tree
    for n_ in list(nt.nodes):
        nt.nodes.remove(n_)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 4.0
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(attr.outputs["Color"], em.inputs["Color"])
    nt.links.new(attr.outputs["Alpha"], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    try:
        mat.surface_render_method = "BLENDED"
    except Exception:
        mat.blend_method = "BLEND"
    mat.use_backface_culling = False
    return mat


def glow_strip(name, collection, length, width, col, y0=-1.0, cross=True, peak=0.85):
    """Soft beam halo: crossed quads along -Y whose alpha fades to 0 at the edges."""
    import bmesh
    bm = bmesh.new()
    lay = bm.loops.layers.float_color.new("Col")
    rgb = castlib.color(col)[:3]
    for axis in ((1, 0), (0, 1)) if cross else ((1, 0),):
        cols = []
        for k, (off, a) in enumerate(((-1, 0.0), (0, peak), (1, 0.0))):
            row = []
            for y in (y0, y0 - length):
                v = bm.verts.new((off * width / 2 * axis[0], y, off * width / 2 * axis[1]))
                row.append((v, a))
            cols.append(row)
        for c in range(2):
            vs = [cols[c][0], cols[c + 1][0], cols[c + 1][1], cols[c][1]]
            f = bm.faces.new([v for v, _ in vs])
            for loop, (_, a) in zip(f.loops, vs):
                loop[lay] = rgb + (a,)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(glow_material())
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def _vis_keys(obj, keys):
    for f, hidden in keys:
        obj.hide_render = hidden
        obj.hide_viewport = hidden
        obj.keyframe_insert("hide_render", frame=f)
        obj.keyframe_insert("hide_viewport", frame=f)


def fx_excalibur(scene, rig, name, f0, n, fps, action="slash"):
    """Layered blade of light on the sword hand (white core, gold body, soft halo). Returns the impact frame."""
    from character import HAND_R, attach
    x, z = HAND_R[0], HAND_R[2]
    mb = castlib.MeshBuilder()
    L = 70.0
    mb.cyl((x, -1.3 - L / 2, z), 0.55, L, "#FFB627", segs=10, rot=(math.pi / 2, 0, 0), mat=1, radius2=1.4)
    mb.cyl((x, -1.3 - L / 2, z), 0.2, L + 0.5, "#FFFFFF", segs=8, rot=(math.pi / 2, 0, 0), mat=1, radius2=0.5)
    mb.box((x, -0.8, z), (0.22, 1.4, 0.36), "#FFF6C8", mat=1)
    beam = attach(rig, "arm_R", mb, name + ".excalibur", scene.collection, bevel=0.0)
    halo = glow_strip(name + ".halo", scene.collection, L, 7.0, "#FFC84A", y0=-0.6)
    halo2 = glow_strip(name + ".halo2", scene.collection, L, 2.6, "#FFF1C0", y0=-0.6, peak=1.0)
    from mathutils import Matrix
    bone = rig.data.bones["arm_R"]
    inv = (bone.matrix_local @ Matrix.Translation((0, bone.length, 0))).inverted()
    for h in (halo, halo2):
        h.parent = rig
        h.parent_type = "BONE"
        h.parent_bone = "arm_R"
        h.matrix_parent_inverse = inv @ Matrix.Translation((x, 0, z))
    if action == "raise_sword":
        on = f0 + int(n * RAISE_HOLD[0] * 0.75)
        impact = f0 + int(n * RAISE_IMPACT)
        off = min(f0 + n - 1, impact + int(0.55 * fps))
    else:
        on = f0 + int(SLASH_PERIOD * SLASH_RAISED * 0.6 * fps)
        impact = f0 + int(SLASH_PERIOD * SLASH_IMPACT * fps)
        off = min(f0 + n - 1, impact + int(0.35 * fps))
    for o in (beam, halo, halo2):
        _vis_keys(o, ((f0, True), (on, False), (off, True)))
    return impact


_FOUNDERS = {}


def founder_variants(scene, total, fps):
    """Three low-poly YC founder rigs (orange Y hoodie, lanyard, laptop) running in place, each in its own collection."""
    if _FOUNDERS:
        return _FOUNDERS["colls"]
    looks = [
        {"skin_tone": "#F1C27D", "hair_color": "#3B2417", "hair_style": "short", "shirt_color": "#F26522", "shirt_style": "hoodie", "pants_color": "#30343F"},
        {"skin_tone": "#C68642", "hair_color": "#111111", "hair_style": "bun", "shirt_color": "#F47B36", "shirt_style": "hoodie", "pants_color": "#3A3F4B", "glasses": "square"},
        {"skin_tone": "#8D5524", "hair_color": "#1B1B1B", "hair_style": "buzz", "shirt_color": "#E8591A", "shirt_style": "hoodie", "pants_color": "#2B2D42", "facial_hair": "beard"},
    ]
    colls = []
    for k, look in enumerate(looks):
        coll = bpy.data.collections.new(f"founders_v{k}")
        scene.collection.children.link(coll)
        home = Vector((-3000.0 - k * 10, 0.0, -500.0))
        rig = build_character(look, f"founder{k}", collection=coll, props={"laptop", "lanyard", "ylogo"})
        rig.location = home
        bpy.context.view_layer.update()
        apply_action(rig, "run", 1 - k * 5, total + 10, step=3, travel=0.0)
        coll.instance_offset = home
        colls.append(coll)
    _FOUNDERS["colls"] = colls
    return colls


ARMY_ZONES = {
    "capy_castle": ((-16.0, 16.0), (2.5, 13.0), 0.0, None, 3.2),
    "castle_wall": ((-12.0, 12.0), (-24.0, -8.0), -9.0, (0.0, 1.0), 2.6),
}


def fx_army(scene, name, loc, offset, f0, n, fps, total, hero, fall_frame=None, count=60):
    zone = ARMY_ZONES.get(loc, ((-12.0, 12.0), (5.0, 16.0), 0.0, (0.0, -1.0), 2.8))
    (x0, x1), (y0, y1), gz, d, speed = zone
    converge = d is None
    colls = founder_variants(scene, total, fps)
    rnd = random.Random(f0)
    epi = Vector((hero.x, hero.y, gz)) if loc != "castle_wall" else offset + Vector((0, -16.0, gz))
    for k in range(count):
        e = bpy.data.objects.new(f"{name}.founder{k}", None)
        e.instance_type = "COLLECTION"
        e.instance_collection = colls[k % len(colls)]
        scene.collection.objects.link(e)
        lx = rnd.uniform(x0, x1)
        if converge and abs(lx) < 2.5:
            lx = math.copysign(2.5 + abs(lx) * 3, lx or 1.0)
        p0 = offset + Vector((lx, rnd.uniform(y0, y1), gz))
        d = Vector((-math.copysign(1.0, lx), 0.25, 0)).normalized() if converge else Vector((zone[3][0], zone[3][1], 0)).normalized()
        heading = math.atan2(d.x, -d.y)
        sp = speed * rnd.uniform(0.8, 1.2)
        rot = (0.0, 0.0, heading + rnd.uniform(-0.25, 0.25))
        def at(f):
            return p0 + d * sp * (f - f0) / fps
        e.location, e.rotation_euler = at(f0), rot
        e.keyframe_insert("location", frame=f0)
        e.keyframe_insert("rotation_euler", frame=f0)
        if fall_frame is not None:
            dist = (at(fall_frame).xy - epi.xy).length
            ff = min(f0 + n - 6, fall_frame + int(dist / 30.0 * fps))
            hit = at(ff)
            e.location = hit
            e.keyframe_insert("location", frame=ff)
            e.keyframe_insert("rotation_euler", frame=ff)
            away = (hit - epi)
            away.z = 0
            away = away.normalized() if away.length > 1e-3 else -d
            e.location = hit + away * 2.2 + Vector((0, 0, 1.2))
            e.keyframe_insert("location", frame=ff + 5)
            e.location = hit + away * 3.4
            e.rotation_euler = (-1.45, rnd.uniform(-0.4, 0.4), rot[2])
            e.keyframe_insert("location", frame=ff + 10)
            e.keyframe_insert("rotation_euler", frame=ff + 10)
        else:
            e.location = at(f0 + n)
            e.keyframe_insert("location", frame=f0 + n)
        _key_linear(e)
    return epi


def fx_shockwave(scene, name, center, f, fps):
    mb = castlib.MeshBuilder()
    for k in range(40):
        a = 2 * math.pi * k / 40
        mb.box((math.cos(a), math.sin(a), 0.15), (0.06, 0.2, 0.25), "#FFF3C4", rot=(0, 0, a), mat=1)
    ring = mb.to_object(name + ".shockwave", scene.collection)
    ring.location = center
    for fr, sc in ((f - 1, 0.0), (f, 0.5), (f + 14, 28.0), (f + 15, 0.0)):
        ring.scale = (sc, sc, 1.0 + sc * 0.05 if sc else 0.0)
        ring.keyframe_insert("scale", frame=fr)
    halo = glow_strip(name + ".shock_glow", scene.collection, 2.0, 2.0, "#FFE7A0", y0=1.0, cross=False, peak=0.0)
    return ring


def fx_embers(scene, name, center, f0, n, fps):
    mb = castlib.MeshBuilder()
    rnd = random.Random(f0 + 11)
    for k in range(70):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.8, 7.0)
        mb.box((r * math.cos(a), r * math.sin(a) + 1.0, rnd.uniform(0.0, 5.0)), (0.04, 0.04, 0.04),
               rnd.choice(["#FF8A1F", "#FFB347", "#FF5E1A", "#FFD27A"]), rot=(rnd.random(), rnd.random(), 0), mat=1)
    obj = mb.to_object(name + ".embers", scene.collection)
    obj.location = center
    obj.keyframe_insert("location", frame=f0)
    obj.keyframe_insert("rotation_euler", frame=f0)
    obj.location = center + Vector((0.6, 0, 2.2))
    obj.rotation_euler = (0, 0, 0.25)
    obj.keyframe_insert("location", frame=f0 + n)
    obj.keyframe_insert("rotation_euler", frame=f0 + n)
    _key_linear(obj)
    return obj


TALKY = {"celebrate", "scared", "raise_sword", "charge"}


def speaker_for(shot, chars):
    """Who is talking in this shot: dialogue speaker, narration.speaker_cast_id, or a quoted caption's NPC/first character."""
    dlg = shot.get("dialogue") or {}
    narr = shot.get("narration") or {}
    for cid in (dlg.get("speaker_cast_id"), narr.get("speaker_cast_id")):
        if cid and any(c["cast_id"] == cid for c in chars):
            return cid
    text = (shot.get("caption") or "") + " " + (narr.get("text") or "")
    if any(q in text for q in ("\u201c", "\"", "\u300c")) and chars:
        return chars[0]["cast_id"]
    return None


def animate_face(rig, f0, n, fps, talk_frames=0, open_whole=False, seed=0):
    lids = bpy.data.objects.get(rig.get("lids", ""))
    mouth = bpy.data.objects.get(rig.get("mouth_open", ""))
    rnd = random.Random(seed)
    if lids:
        lids.hide_render = True
        lids.keyframe_insert("hide_render", frame=f0)
        f = f0 + rnd.randint(int(0.5 * fps), int(1.4 * fps))
        while f < f0 + n - 3:
            lids.hide_render = False
            lids.keyframe_insert("hide_render", frame=f)
            lids.hide_render = True
            lids.keyframe_insert("hide_render", frame=f + 3)
            f += rnd.randint(int(1.4 * fps), int(2.8 * fps))
    if mouth:
        mouth.hide_render = not open_whole
        mouth.keyframe_insert("hide_render", frame=f0)
        f, end = f0 + 2, min(f0 + n - 1, f0 + talk_frames)
        while talk_frames and f < end:
            mouth.hide_render = False
            mouth.keyframe_insert("hide_render", frame=f)
            mouth.hide_render = True
            f += rnd.choice((3, 3, 4, 5))
            mouth.keyframe_insert("hide_render", frame=min(f, end))
            f += rnd.choice((2, 2, 3))
        if talk_frames:
            mouth.hide_render = not open_whole
            mouth.keyframe_insert("hide_render", frame=end + 1)


# camera framing: (visible height m, look-at z, camera z, lens mm, camera x offset)
FRAMING = {
    "wide": (6.0, 2.4, 2.6, 30, 0.0),
    "medium": (2.7, 1.32, 1.55, 40, 0.0),
    "closeup": (1.8, 1.62, 1.72, 55, 0.0),
    "low_angle": (3.1, 1.45, 0.35, 26, 0.7),
    "overhead": (4.0, 0.8, 7.5, 32, 0.0),
}


def frame_subjects(mark, positions, focus=None):
    """Eye/target/lens that fit the characters inside the phone-safe area (82% width, top 12% clear)."""
    h, tz, cz, lens, cx = FRAMING.get(mark, FRAMING["wide"])
    pts = [focus] if (mark == "closeup" and focus is not None) else positions
    xs = [p.x for p in pts]
    c = Vector((sum(xs) / len(xs), sum(p.y for p in pts) / len(pts), 0))
    width = (max(xs) - min(xs)) + (1.1 if mark != "closeup" else 0.7)
    h = max(h, width / (0.5625 * 0.8))
    if mark != "closeup" and len(pts) > 1:
        tz = max(tz, h * 0.42)
    d = h * lens / 24.0
    if mark == "overhead":
        eye = c + Vector((0, -d * 0.45, d * 0.9))
    else:
        eye = c + Vector((cx * d / 4, -d, cz))
    target = c + Vector((0, 0, tz))
    return eye, target, lens


def build_scene(plan, progress_file=None, offset_frames=0):
    """Build the 3D scene for a sanitized plan.
    Returns dict(scene, frames, shots=[(start, n)], cameras, rigs, events) where events holds per-shot fx timing for overlays."""
    lib = castlib.library()
    fps = int(lib.get("render", {}).get("fps", 24))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Cast3D"
    configure_render(scene, plan["quality"], plan.get("style", "cinematic"))
    nshots = len(plan["shots"])
    progress("building_set", 2, 0, nshots, progress_file)
    counts = shot_frame_counts(plan, fps)
    total_frames = sum(counts)
    _FOUNDERS.clear()
    colls = load_locations([s["location"] for s in plan["shots"]])
    bg, sun = make_world(scene)
    cast = {c["id"]: c for c in plan["cast"]}
    variant = {c["id"]: i for i, c in enumerate(plan["cast"])}
    shot_ranges, cameras, rigs, events = [], [], [], []
    f0 = 1
    for i, shot in enumerate(plan["shots"]):
        shot_frames = counts[i]
        offset = Vector((i * SET_SPACING, 0.0, 0.0))
        coll = colls.get(shot["location"]) or colls.get("main_street") or next(iter(colls.values()))
        loc = coll.name
        inst = bpy.data.objects.new(f"shot{i + 1}.set", None)
        inst.instance_type = "COLLECTION"
        inst.instance_collection = coll
        inst.location = offset
        scene.collection.objects.link(inst)
        print(f"STAGE Lighting the set: shot {i + 1}/{nshots} {coll.get('label', loc)}", flush=True)
        key_mood(bg, sun, coll, f0)
        progress("building_set", 3 + 32 * (i + 0.5) / nshots, i + 1, nshots, progress_file, location=loc)

        def obj(kind, name):
            return coll.objects.get(f"{loc}.{kind}.{name}")

        fx = shot.get("fx") or []
        shot_rigs = []
        print(f"STAGE Building characters: shot {i + 1}/{nshots}", flush=True)
        for ch in shot["characters"]:
            member = cast[ch["cast_id"]]
            mark = obj("mark", ch["mark"])
            pos = (mark.location if mark else Vector((0, 0, 0))).copy()
            if plan.get("style") == "punchy" and ch["mark"] in ("left", "right"):
                pos = Vector((pos.x * 0.52, pos.y + 0.7, pos.z))
            pos = pos + offset
            props = {ACTION_PROPS[ch["action"]]} if ch["action"] in ACTION_PROPS else set()
            if "excalibur" in fx and member.get("look", {}).get("accessory") == "sword":
                props.add("sword")
            rig = build_character(member["look"], f"s{i + 1}.{member['id']}", variant=variant[member["id"]], props=props,
                                  outfit=member.get("outfit") if loc != "yc_hq" else None)
            rig.location = pos
            rig.rotation_euler = (0.0, 0.0, MARK_YAW.get(ch["mark"], 0.0))
            bpy.context.view_layer.update()
            apply_action(rig, ch["action"], f0, shot_frames, travel=0.0 if ch["action"] == "charge" else 0.35 if plan.get("style") == "punchy" else 1.0)
            rigs.append(rig)
            talking = speaker_for(shot, shot["characters"]) == ch["cast_id"]
            talk_s = shot.get("_audio_s") or len((shot.get("narration") or {}).get("text") or shot.get("caption") or "") / 14.0
            animate_face(rig, f0, shot_frames, fps, int(talk_s * fps) if talking else 0,
                         open_whole=ch["action"] in TALKY, seed=i * 7 + len(rigs))
            shot_rigs.append((ch, rig, props))
        progress("rigging", 3 + 32 * (i + 1) / nshots, i + 1, nshots, progress_file)

        center_mark = obj("mark", "center")
        center = (center_mark.location if center_mark else Vector((0, 0, 0))) + offset
        ev = {}
        if "magic_circle" in fx:
            fx_magic_circle(scene, f"shot{i + 1}", center, f0, shot_frames, fps)
        if "flash" in fx:
            fx_wind_burst(scene, f"shot{i + 1}", center, f0)
        if "sparkles" in fx:
            fx_sparkles(scene, f"shot{i + 1}", center, f0, shot_frames, fps)
        if "excalibur" in fx and shot_rigs:
            wc = next(((c, r) for c, r, p in shot_rigs if c["action"] in ("raise_sword", "slash")), None) \
                or next(((c, r) for c, r, p in shot_rigs if "sword" in p), (shot_rigs[0][0], shot_rigs[0][1]))
            ev["impact"] = fx_excalibur(scene, wc[1], f"shot{i + 1}", f0, shot_frames, fps, wc[0]["action"])
        ev["clash"] = []
        for c, r, p in shot_rigs:
            if c["action"] == "slash":
                ev["clash"] += [f0 + int((k * SLASH_PERIOD + SLASH_PERIOD * SLASH_IMPACT) * fps)
                                for k in range(3) if (k * SLASH_PERIOD + SLASH_PERIOD * SLASH_IMPACT) * fps < shot_frames]
            if c["action"] == "block":
                ev["clash"] += [f0 + int(h * fps) for h in (0.45, 1.2, 1.8) if h * fps < shot_frames]
        hero_pos = shot_rigs[0][1].location.copy() if shot_rigs else center
        if "army" in fx:
            fall = ev.get("impact", f0 + shot_frames // 2) if "army_fall" in fx else None
            epi = fx_army(scene, f"shot{i + 1}", loc, offset, f0, shot_frames, fps, total_frames, hero_pos, fall)
            ev["army"] = True
            if "shockwave" in fx:
                fx_shockwave(scene, f"shot{i + 1}", epi + Vector((0, 0, 0.05)), fall or f0 + shot_frames // 2, fps)
        elif "shockwave" in fx:
            fx_shockwave(scene, f"shot{i + 1}", hero_pos, ev.get("impact", f0 + shot_frames // 3), fps)
        if "embers" in fx:
            fx_embers(scene, f"shot{i + 1}", center, f0, shot_frames, fps)
        events.append(ev)

        cam_mark = obj("cam", shot["camera"]["mark"])
        positions = [r.location.copy() for _, r, _ in shot_rigs]
        for (_, r, _), p in zip(shot_rigs, positions):
            p.z = 0.0
        if positions:
            spk = speaker_for(shot, shot["characters"])
            focus = next((r.location.copy() for c, r, _ in shot_rigs if c["cast_id"] == spk), None) \
                or next((r.location.copy() for c, r, _ in shot_rigs if c["mark"] == "center"), positions[0])
            focus.z = 0.0
            eye, target, lens = frame_subjects(shot["camera"]["mark"], positions, focus)
            move = shot["camera"]["move"]
            if loc == "castle_wall" and "excalibur" in fx:
                focus = focus if focus is not None else positions[0]
                eye = focus + Vector((-9.0, -1.5, 1.8))
                target = focus + Vector((0.0, -2.6, -0.6))
                lens = 16
            elif loc == "castle_wall" and "army" in fx:
                focus = focus if focus is not None else positions[0]
                eye = focus + Vector((1.6, 3.6, 4.4))
                target = focus + Vector((-0.6, -9.0, -5.5))
                lens = 20
                move = "push_in" if move == "orbit" else move
        else:
            move = shot["camera"]["move"]
            eye = (cam_mark.location if cam_mark else Vector((0, -12, 3))) + offset
            target = Vector(cam_mark["target"] if cam_mark and "target" in cam_mark else (0, 0, 1.2)) + offset
            lens = float(cam_mark.get("lens", 30.0)) if cam_mark else 30.0
        cam = make_camera(scene, f"shot{i + 1}.cam", eye, target, lens, move, f0, shot_frames)
        if plan.get("style") == "punchy" and (shot["camera"]["mark"] == "closeup" or
                                              (shot["camera"]["mark"] == "medium" and plan["quality"] == "final")):
            cam.data.dof.use_dof = True
            cam.data.dof.focus_distance = (target - eye).length
            cam.data.dof.aperture_fstop = 2.0 if shot["camera"]["mark"] == "closeup" else 3.5
        marker = scene.timeline_markers.new(f"shot{i + 1}", frame=f0)
        marker.camera = cam
        cameras.append(cam)
        shot_ranges.append((f0, shot_frames))
        f0 += shot_frames
    make_constant(scene.world.node_tree, sun, sun.data)
    rim = bpy.data.objects.get(sun.get("rim", ""))
    if rim:
        make_constant(rim.data)
    scene.camera = cameras[0]
    scene.frame_start = 1
    total = f0 - 1
    scene.frame_end = total
    return {"scene": scene, "frames": total, "shots": shot_ranges, "cameras": cameras, "rigs": rigs, "events": events}


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
    lines = "\n".join([f"Starring {c['name']} as {c['role']}" for c in plan["cast"] if not c.get("npc")]
                      + [f"and {c['name']} as {c['role']}" for c in plan["cast"] if c.get("npc")])
    t = _text(se, "credits", lines, credits_f0, credits_n, 9, 0.52, 46, wrap=0.86)
    _fade(t, credits_f0, credits_n, 5, 0)
    t = _text(se, "credits_title", plan["title"].upper(), credits_f0, credits_n, 10, 0.38 if len(plan["cast"]) < 3 else 0.33, 30, ACCENT)
    _fade(t, credits_f0, credits_n, 5, 0)

    add_audio(se, plan, built, wav_path, 11)
    return edit


def add_audio(se, plan, built, wav_path, channel):
    total = built["frames"]
    if wav_path:
        snd = se.strips.new_sound(name="music", filepath=wav_path, channel=channel, frame_start=1)
        if snd.frame_final_end > total + 1:
            snd.frame_final_end = total + 1
    for i, ((f0, n), shot) in enumerate(zip(built["shots"], plan["shots"])):
        audio = (shot.get("narration") or {}).get("audio_path")
        if plan.get("_voice_mixed") or not audio or not shot.get("_audio_s"):
            continue
        try:
            v = se.strips.new_sound(name=f"narration{i + 1}", filepath=audio, channel=channel + 1, frame_start=f0)
            v.volume = 1.0
            if v.frame_final_end > f0 + n:
                v.frame_final_end = f0 + n
        except Exception as e:
            print(f"[cast] narration {audio} skipped: {e}", flush=True)


# ---------------------------------------------------------------- punchy reel overlays

YELLOW = (1.0, 0.86, 0.12, 1.0)
SEAL_RED = (0.95, 0.08, 0.16, 1.0)
SERIF_FONTS = ["/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
               "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"]
SERIF_ITALIC_FONTS = ["/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf",
                      "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"]


def _load_font(paths, name):
    font = bpy.data.fonts.get(name)
    if font:
        return font
    for path in paths:
        if os.path.exists(path):
            try:
                font = bpy.data.fonts.load(path)
                font.name = name
                return font
            except Exception:
                continue
    return _font()


class Channels:
    def __init__(self, start):
        self.next = start
        self.named = {}

    def __call__(self, key):
        if key not in self.named:
            self.named[key] = self.next
            self.next += 1
        return self.named[key]


def _plain_text(se, name, body, f0, n, channel, x, y, size, color=(1, 1, 1, 1), align="LEFT", font=None,
                outline=0.08, box=None, wrap=0.92, anchor_y="CENTER"):
    t = se.strips.new_effect(name=name, type="TEXT", channel=channel, frame_start=f0, length=max(1, n))
    t.font = font or _font() or t.font
    t.text = body
    t.font_size = size
    t.use_bold = True
    t.color = color
    t.location = (x, y)
    t.alignment_x = align
    t.anchor_x = align
    t.anchor_y = anchor_y
    t.wrap_width = wrap
    t.use_outline = outline > 0
    t.outline_color = (0.02, 0.02, 0.05, 1)
    t.outline_width = outline
    t.use_shadow = True
    t.shadow_color = (0, 0, 0, 0.7)
    if box:
        t.use_box = True
        t.box_color = box
        t.box_margin = 0.012
    t.blend_type = "ALPHA_OVER"
    return t


def _pop(strip, f, size, scale=1.45, frames=4):
    strip.font_size = size * scale
    strip.keyframe_insert("font_size", frame=f)
    strip.font_size = size * 0.94
    strip.keyframe_insert("font_size", frame=f + frames - 1)
    strip.font_size = size
    strip.keyframe_insert("font_size", frame=f + frames + 1)


def _flash(se, name, f, n, channel, color=(1, 1, 1), peak=1.0):
    c = se.strips.new_effect(name=name, type="COLOR", channel=channel, frame_start=f, length=max(2, n))
    c.color = color
    c.blend_type = "ALPHA_OVER"
    c.blend_alpha = peak
    c.keyframe_insert("blend_alpha", frame=f)
    c.blend_alpha = 0.0
    c.keyframe_insert("blend_alpha", frame=f + max(2, n) - 1)
    return c


def _int(v):
    try:
        return int(str(v).replace(",", "").strip())
    except ValueError:
        return None


def make_vignette(tmpdir, w, h):
    import numpy as np
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2)) / 1.414
    alpha = np.clip((r - 0.45) / 0.55, 0, 1) ** 1.6 * 0.6
    rgba = np.zeros((h, w, 4), np.float32)
    rgba[..., 3] = alpha
    img = bpy.data.images.new("vignette", w, h, alpha=True)
    img.pixels.foreach_set(rgba.ravel())
    path = os.path.join(tmpdir, "vignette.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


def make_speed_lines(tmpdir, w, h, variants=3):
    import numpy as np
    paths = []
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h * 0.55
    ang = np.arctan2(yy - cy, xx - cx)
    rad = np.hypot((xx - cx) / w, (yy - cy) / h)
    bins = 720
    idx = ((ang + np.pi) / (2 * np.pi) * bins).astype(np.int32) % bins
    for v in range(variants):
        rng = np.random.default_rng(100 + v)
        prof = np.zeros(bins, np.float32)
        for _ in range(110):
            c = rng.integers(bins)
            width = rng.integers(1, 4)
            prof[np.arange(c - width, c + width + 1) % bins] = rng.uniform(0.55, 0.95)
        inner = rng.uniform(0.27, 0.32)
        fall = np.clip((rad - inner) / 0.22, 0, 1)
        alpha = prof[idx] * fall
        rgba = np.zeros((h, w, 4), np.float32)
        rgba[..., 0:3] = 1.0
        rgba[..., 3] = alpha
        img = bpy.data.images.new(f"speed_lines_{v}", w, h, alpha=True)
        img.pixels.foreach_set(rgba[::-1].ravel())
        path = os.path.join(tmpdir, f"speed_lines_{v}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        paths.append(path)
    return paths


def _speed_lines(se, paths, f0, n, channel, every=2):
    for k, f in enumerate(range(f0, f0 + n, every)):
        p = paths[k % len(paths)]
        st = se.strips.new_image(name=f"speed{f}", filepath=p, channel=channel, frame_start=f)
        st.frame_final_duration = min(every, f0 + n - f)
        st.blend_type = "ALPHA_OVER"
        st.blend_alpha = 0.55


def _caption_chunks(text):
    words = text.upper().split()
    if not words:
        return [], -1
    clean = [w.strip(".,!?\u201c\u201d\"'\u2026:;") for w in words]
    bang = [k for k, w in enumerate(words) if "!" in w]
    key = bang[0] if bang else max(range(len(words)), key=lambda k: (len(clean[k]), k))
    chunks, cur = [], []
    for k, w in enumerate(words):
        if k == key:
            if cur:
                chunks.append(cur)
            chunks.append([w])
            cur = []
            continue
        cur.append(w)
        if len(cur) == 2 or w.endswith((".", ",", "?", "\u2026")):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    key_chunk = next(i for i, c in enumerate(chunks) if words[key] in c and len(c) == 1)
    return [" ".join(c) for c in chunks], key_chunk


def build_edit_punchy(plan, built, wav_path, tmpdir):
    scene3d = built["scene"]
    fps = scene3d.render.fps
    total = built["frames"]
    edit = bpy.data.scenes.new("CastEdit")
    configure_render(edit, plan["quality"], "punchy")
    edit.frame_start, edit.frame_end = 1, total
    se = edit.sequence_editor_create()
    main = se.strips.new_scene(name="Cast3D", scene=scene3d, channel=1, frame_start=1)
    main.scene_input = "CAMERA"
    if main.frame_final_end != total + 1:
        main.frame_final_end = total + 1
    try:
        cb = main.modifiers.new(name="grade", type="COLOR_BALANCE")
        cb.color_balance.lift = (0.97, 0.98, 1.06)
        cb.color_balance.gamma = (1.0, 1.0, 1.02)
        cb.color_balance.gain = (1.08, 1.03, 0.97)
    except Exception as e:
        print(f"[cast] grade skipped: {e}", flush=True)
    ch = Channels(2)
    try:
        vig = se.strips.new_image(name="vignette", filepath=make_vignette(tmpdir, edit.render.resolution_x, edit.render.resolution_y),
                                  channel=ch("vignette"), frame_start=1)
        vig.frame_final_duration = total
        vig.blend_type = "ALPHA_OVER"
    except Exception as e:
        print(f"[cast] vignette skipped: {e}", flush=True)
    for key in ("speed", "flash", "flash2", "title_dim", "hud0", "seal0", "sealfg0", "hud1", "seal1", "sealfg1",
                "hud2", "seal2", "sealfg2", "caption", "title", "title_rule", "logline", "powered", "credits", "title_flash"):
        ch(key)
    W, H = edit.render.resolution_x, edit.render.resolution_y
    speed_paths = None
    last = len(plan["shots"]) - 1
    title_f = None
    prev_hud = {}
    seal_max = {}
    for shot in plan["shots"]:
        for item in shot["hud"]:
            v = _int(item["value"])
            if "SEAL" in item["label"] and v is not None and 0 <= v <= 9:
                seal_max[item["label"]] = max(seal_max.get(item["label"], 0), v)

    for i, ((f0, n), shot) in enumerate(zip(built["shots"], plan["shots"])):
        fx = shot.get("fx") or []
        f_end = f0 + n
        if i == last:
            title_f = f0 + max(int(n * 0.45), n - int(1.7 * fps))
        if "speed_lines" in fx:
            speed_paths = speed_paths or make_speed_lines(tmpdir, W, H)
            _speed_lines(se, speed_paths, f0, n, ch("speed"))
        if "flash" in fx:
            _flash(se, f"flash{i + 1}", f0, 9, ch("flash"))
        if "excalibur" in fx and built["events"][i].get("impact"):
            imp = built["events"][i]["impact"]
            _flash(se, f"excal{i + 1}", imp, 10, ch("flash2"), color=(1.0, 0.9, 0.55), peak=0.9)

        y = 0.875
        for j, item in enumerate(shot["hud"]):
            label, value = item["label"], item["value"]
            cur, prev = _int(value), _int(prev_hud.get(label))
            size = 46
            steps = []
            if cur is not None and prev is not None and cur != prev:
                cf = min(int(0.6 * fps), n - 1)
                for k in range(cf):
                    a = k / max(1, cf - 1)
                    a = a * a * (3 - 2 * a)
                    steps.append(str(int(round(prev + (cur - prev) * a))))
            segs = []
            for k, txt in enumerate(steps):
                if segs and segs[-1][1] == txt:
                    segs[-1][2] += 1
                else:
                    segs.append([f0 + k, txt, 1])
            start_rest = f0 + len(steps)
            hud_end = title_f if (i == last and title_f) else f_end
            segs.append([start_rest, value if cur is None else str(cur), max(1, hud_end - start_rest)])
            chan = ch(f"hud{j}")
            for k, (sf, txt, ln) in enumerate(segs):
                t = _plain_text(se, f"hud{i + 1}_{j}_{k}", f"{label}  {txt}", sf, ln, chan, 0.12, y, size,
                                anchor_y="TOP", box=(0.02, 0.0, 0.08, 0.55), outline=0.05)
                if k == len(segs) - 1 and steps:
                    _pop(t, sf, size, 1.35, 5)
            y -= 0.052
            if label in seal_max and cur is not None:
                schan = ch(f"seal{j}")
                _plain_text(se, f"sealbg{i + 1}_{j}", "\u2756" * seal_max[label], f0, max(1, hud_end - f0), schan, 0.125, y, 52,
                            color=(0.25, 0.05, 0.08, 0.85), anchor_y="TOP", outline=0.04)
                if cur > 0:
                    t = _plain_text(se, f"seal{i + 1}_{j}", "\u2756" * cur, f0, max(1, hud_end - f0), ch(f"sealfg{j}"), 0.125, y, 52,
                                    color=SEAL_RED, anchor_y="TOP", outline=0.04)
                    if prev is not None and cur != prev:
                        _pop(t, f0 + min(int(0.6 * fps), n - 4), 52, 1.3, 4)
                y -= 0.05
            y -= 0.01
            prev_hud[label] = value

        chunks, key = _caption_chunks(shot.get("caption") or "")
        if chunks:
            c_start = f0 + 2
            c_end = (title_f if i == last else f_end) - 1
            weights = [len(c) + 6 for c in chunks]
            span = max(len(chunks) * 4, c_end - c_start)
            acc = c_start
            for k, text in enumerate(chunks):
                ln = max(4, int(round(span * weights[k] / sum(weights))))
                if k == len(chunks) - 1:
                    ln = max(4, c_end - acc)
                size = min(92, int(1150 / max(4, len(text))))
                t = _plain_text(se, f"cap{i + 1}_{k}", text, acc, ln, ch("caption"), 0.5, 0.235, size,
                                color=YELLOW if k == key else (1, 1, 1, 1), align="CENTER", outline=0.14)
                _pop(t, acc, size)
                acc += ln

    if title_f is not None:
        n_t = total - title_f + 1
        dim = _shade_overlay(se, "title_dim", title_f, n_t, 0.0, ch("title_dim"))
        dim.keyframe_insert("blend_alpha", frame=title_f)
        dim.blend_alpha = 0.5
        dim.keyframe_insert("blend_alpha", frame=title_f + 4)
        serif = _load_font(SERIF_FONTS, "CastSerif")
        serif_it = _load_font(SERIF_ITALIC_FONTS, "CastSerifItalic")
        t = _plain_text(se, "title_slam", plan["title"].upper(), title_f, n_t, ch("title"), 0.5, 0.56, 112,
                        align="CENTER", font=serif, outline=0.1, wrap=0.94)
        _pop(t, title_f, 112, 2.6, 4)
        _plain_text(se, "title_rule", "\u2014\u2014  \u2756  \u2014\u2014", title_f + 3, n_t - 3, ch("title_rule"), 0.5, 0.445, 30,
                    color=(0.95, 0.75, 0.3, 1), align="CENTER", outline=0.0)
        logline, powered = plan["logline"], "powered by Capy"
        m = re.search(r"\s*[\u00b7|\-\u2013\u2014]?\s*(powered by .+)$", logline, re.I)
        if m:
            logline, powered = logline[: m.start()].strip(), m.group(1).strip()
        pw = _plain_text(se, "title_powered", powered.upper(), title_f + 6, n_t - 6, ch("powered"), 0.5, 0.35, 26,
                         color=(0.92, 0.92, 1.0, 1), align="CENTER", outline=0.04)
        _fade(pw, title_f + 6, n_t - 6, 5, 0)
        if logline:
            lg = _plain_text(se, "title_logline", logline, title_f + 4, n_t - 4, ch("logline"), 0.5, 0.4, 50,
                             color=(1.0, 0.83, 0.38, 1), align="CENTER", font=serif_it, outline=0.06)
            _fade(lg, title_f + 4, n_t - 4, 5, 0)
        stars = [f"{c['name']} as {c['role']}" for c in plan["cast"] if not c.get("npc")]
        if stars:
            cr = _plain_text(se, "credits", "Starring " + " \u00b7 ".join(stars), title_f + 8, n_t - 8, ch("credits"),
                             0.5, 0.1, 26 if len(stars) < 3 else 22, align="CENTER", outline=0.06, wrap=0.97)
            _fade(cr, title_f + 8, n_t - 8, 5, 0)
        _flash(se, "title_flash", title_f, 8, ch("title_flash"))

    add_audio(se, plan, built, wav_path, ch("music"))
    ch("narration")
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


def stage(msg):
    print(f"STAGE {msg}", flush=True)


def make_previews(built, preview_dir):
    """Render one ~360px JPEG per shot (mid-shot, 3D only) up front; announced as each shot starts rendering."""
    scene = built["scene"]
    r = scene.render
    saved = (r.resolution_percentage, r.filepath, r.image_settings.file_format, scene.eevee.taa_render_samples,
             scene.frame_current)
    paths = {}
    try:
        os.makedirs(preview_dir, exist_ok=True)
        r.resolution_percentage = 50
        r.image_settings.file_format = "JPEG"
        r.image_settings.quality = 80
        scene.eevee.taa_render_samples = 2
        for k, (f0, n) in enumerate(built["shots"]):
            out = os.path.abspath(os.path.join(preview_dir, f"shot{k + 1}.jpg"))
            scene.frame_set(f0 + n // 2)
            r.filepath = out
            bpy.ops.render.render(write_still=True, scene=scene.name)
            paths[k + 1] = out
    except Exception as e:
        print(f"[cast] previews failed: {e}", flush=True)
    finally:
        (r.resolution_percentage, r.filepath, r.image_settings.file_format, scene.eevee.taa_render_samples) = saved[:4]
        scene.frame_set(saved[4])
    return paths


def render_plan(plan, out_path, progress_file=None, preview_dir=None):
    t0 = time.time()
    stage("Building the set")
    ensure_town()
    built = build_scene(plan, progress_file)
    total = built["frames"]
    seconds = total / built["scene"].render.fps
    wav_path = os.path.join(tempfile.gettempdir(), f"cast_music_{os.getpid()}.wav")
    try:
        fps = built["scene"].render.fps
        narration = [((f0 - 1) / fps, shot["narration"]["audio_path"], n / fps)
                     for (f0, n), shot in zip(built["shots"], plan["shots"]) if shot.get("_audio_s")]
        evs = built["events"]
        events = {"impacts": [(e["impact"] - 1) / fps for e in evs if e.get("impact")],
                  "clashes": [(c - 1) / fps for e in evs for c in e.get("clash", ())],
                  "army": [((f0 - 1) / fps, (f0 - 1 + n) / fps) for (f0, n), e in zip(built["shots"], evs) if e.get("army")]}
        levels = music.write_mix(wav_path, plan["genre"], seconds, [(f0 - 1) / fps for f0, _ in built["shots"][1:]],
                                 narration=narration, events=events, punchy=plan.get("style") == "punchy",
                                 music_path=plan.get("music_path"))
        plan["_voice_mixed"] = True
        print(f"AUDIO {json.dumps(levels)}", flush=True)
    except Exception:
        traceback.print_exc()
        wav_path = None
    stage("Mixing audio")
    tmpdir = tempfile.mkdtemp(prefix="cast_")
    edit = build_edit_punchy(plan, built, wav_path, tmpdir) if plan.get("style") == "punchy" else build_edit(plan, built, wav_path)
    configure_output(edit, out_path, plan["quality"])
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    progress("rendering", 40, None, None, progress_file, frame=0, frames=total)
    previews = make_previews(built, preview_dir) if preview_dir else {}
    state = {"n": 0, "last": -1, "shot": 0}
    nshots = len(built["shots"])

    def on_frame(scene, *_):
        if scene.name != edit.name:
            return
        state["n"] += 1
        pct = 40 + 59 * state["n"] / total
        shot = sum(1 for f0, _ in built["shots"] if f0 <= scene.frame_current) or 1
        if shot != state["shot"]:
            state["shot"] = shot
            stage(f"Rendering shot {shot}/{nshots}")
            if shot in previews:
                print(f"PREVIEW {shot} {previews[shot]}", flush=True)
        if int(pct) != state["last"]:
            state["last"] = int(pct)
            progress("rendering", pct, shot, len(built["shots"]), progress_file, frame=state["n"], frames=total)

    bpy.app.handlers.render_post.append(on_frame)
    print(f"[cast] scene built in {time.time() - t0:.1f}s; rendering {total} frames", flush=True)
    bpy.ops.render.render(animation=True, scene=edit.name)
    bpy.app.handlers.render_post.remove(on_frame)
    stage("Encoding video")
    if wav_path and os.path.exists(wav_path):
        os.remove(wav_path)
    import shutil
    shutil.rmtree(tmpdir, ignore_errors=True)
    progress("done", 100, None, None, progress_file, output=out_path, seconds=round(time.time() - t0, 1))
    print(f"[cast] wrote {out_path} in {time.time() - t0:.1f}s", flush=True)


def parse_args(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    opts = {"quality": None, "progress_file": None, "preview_dir": None}
    pos = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--quality", "--progress-file", "--preview-dir") and i + 1 < len(args):
            opts[a[2:].replace("-", "_")] = args[i + 1]
            i += 2
            continue
        if a.startswith("--preview-dir="):
            opts["preview_dir"] = a.split("=", 1)[1]
            i += 1
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
        render_plan(plan, out_path, opts["progress_file"], opts["preview_dir"])
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
