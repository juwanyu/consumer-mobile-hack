"""Render documentation PNGs into docs/.

blender -b -P blender/render_docs.py -- towns|characters|actions|frame [args]
  towns                      docs/town_<location>.png from each wide camera mark
  characters                 docs/characters.png lineup of varied looks
  actions                    docs/actions.png grid of every action
  frame <in.mp4> <frame> <out.png>   grab a frame from a rendered MP4
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import castlib  # noqa: E402
import render_shot_plan as rsp  # noqa: E402
from animations import ACTIONS, apply_action  # noqa: E402
from build_town import text_object  # noqa: E402
from character import build_character  # noqa: E402

DOCS = os.path.join(castlib.REPO, "docs")

LOOKS = [
    {"skin_tone": "#C68642", "hair_color": "#2B1B10", "hair_style": "ponytail", "glasses": "round",
     "shirt_color": "#E63946", "shirt_style": "jacket", "pants_color": "#1D3557"},
    {"skin_tone": "#8D5524", "hair_color": "#111111", "hair_style": "afro", "facial_hair": "beard",
     "shirt_color": "#F4A261", "shirt_style": "hoodie", "pants_color": "#264653", "accessory": "headphones"},
    {"skin_tone": "#FFDBAC", "hair_color": "#E9C46A", "hair_style": "long", "glasses": "sunglasses",
     "shirt_color": "#9B5DE5", "shirt_style": "dress", "accessory": "crown"},
    {"skin_tone": "#F1C27D", "hair_color": "#6F4E37", "hair_style": "spiky", "facial_hair": "mustache",
     "glasses": "square", "shirt_color": "#2B2D42", "shirt_style": "suit", "pants_color": "#2B2D42", "accessory": "bowtie"},
    {"skin_tone": "#E0AC69", "hair_color": "#A52A2A", "hair_style": "mohawk", "facial_hair": "goatee",
     "shirt_color": "#06D6A0", "shirt_style": "tanktop", "pants_color": "#3A86FF", "accessory": "none"},
    {"skin_tone": "#5C3A21", "hair_color": "#1B1B1B", "hair_style": "curly", "facial_hair": "stubble",
     "shirt_color": "#FFD166", "shirt_style": "tshirt", "pants_color": "#6C757D", "accessory": "cap"},
    {"skin_tone": "#FAD7B5", "hair_color": "#3B2417", "hair_style": "bun", "shirt_color": "#118AB2",
     "shirt_style": "tshirt", "pants_color": "#073B4C", "accessory": "beanie"},
    {"skin_tone": "#D2A679", "hair_color": "#3B2417", "hair_style": "buzz", "facial_hair": "beard",
     "shirt_color": "#B5651D", "shirt_style": "jacket", "pants_color": "#4A3B2A", "accessory": "cowboy_hat"},
]


def _render_still(scene, path, frame):
    scene.frame_set(frame)
    r = scene.render
    r.image_settings.media_type = "IMAGE" if "media_type" in r.image_settings.bl_rna.properties else None
    r.image_settings.file_format = "PNG"
    r.filepath = path
    r.use_file_extension = False
    bpy.ops.render.render(write_still=True, scene=scene.name)
    print("wrote", path, flush=True)


def towns():
    rsp.ensure_town()
    for loc in castlib.library()["locations"]:
        plan = rsp.sanitize_plan({
            "quality": "final", "genre": "heist", "title": loc,
            "cast": [{"id": "c1", "name": "Star", "look": LOOKS[0]}],
            "shots": [{"location": loc, "camera": {"mark": "wide", "move": "static"},
                       "characters": [{"cast_id": "c1", "mark": "center", "action": "wave"}]}],
        })
        built = rsp.build_scene(plan)
        _render_still(built["scene"], os.path.join(DOCS, f"town_{loc}.png"), 30)


def _studio(width, height, quality="final"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    rsp.configure_render(scene, quality)
    scene.render.resolution_x, scene.render.resolution_y = width, height
    bg, sun = rsp.make_world(scene)
    bg.inputs["Color"].default_value = castlib.color("#BDE0FE")
    bg.inputs["Strength"].default_value = 1.0
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(45), 0, math.radians(-30))
    mb = castlib.MeshBuilder()
    mb.box((0, 2, -0.1), (40, 30, 0.2), "#FFC8DD")
    mb.box((0, 6, 5), (40, 0.4, 10), "#CDB4DB")
    mb.to_object("studio", scene.collection)
    return scene


def _camera(scene, eye, target, lens):
    cam = rsp.make_camera(scene, "doc.cam", eye, target, lens, "static", 1, 1)
    cam.data.sensor_fit = "AUTO"
    scene.camera = cam
    return cam


def characters():
    scene = _studio(1600, 900)
    xs = [-3.0, -1.0, 1.0, 3.0]
    for i, x in enumerate(xs):
        rig = build_character(LOOKS[i], f"char{i}")
        rig.location = (x, 0, 0)
        rig.rotation_euler = (0, 0, -x * 0.06)
        bpy.context.view_layer.update()
        apply_action(rig, ["wave", "idle", "celebrate", "point"][i], 1, 48)
    _camera(scene, (0, -9.5, 1.7), (0, 0, 1.0), 40)
    _render_still(scene, os.path.join(DOCS, "characters.png"), 12)


ACTION_PEAK = {"idle": 0.5, "walk": 0.25, "run": 0.15, "jump": 0.9, "wave": 1.0, "point": 1.0, "punch": 0.15,
               "dance": 0.25, "celebrate": 0.2, "fall": 1.5, "sneak": 0.4, "talk": 0.6, "scared": 0.8, "sit": 1.0}


def actions():
    scene = _studio(1920, 1080)
    acts = castlib.library()["actions"]
    per_row = 7
    frame = 60
    for i, act in enumerate(acts):
        row, col = divmod(i, per_row)
        x = (col - (per_row - 1) / 2) * 2.0 + row * 1.0
        y = row * 4.2
        peak = ACTION_PEAK.get(act, 0.5)
        drift = ACTIONS[act](peak, 3.0)[1] if act in ACTIONS else 0.0
        rig = build_character(LOOKS[i % len(LOOKS)], f"act_{act}")
        rig.location = (x, y + drift, 0)
        bpy.context.view_layer.update()
        apply_action(rig, act, frame - int(peak * 24), 72)
        text_object("label_" + act, act.upper(), scene.collection, (x, y - 1.15, 0.03), 0.34, "#3A0CA3", rot=(0, 0, 0), extrude=0.01)
    _camera(scene, (0.5, -12.0, 11.0), (0.5, 2.4, 0.4), 34)
    _render_still(scene, os.path.join(DOCS, "actions.png"), frame)


def frame(mp4, frame_no, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    se = scene.sequence_editor_create()
    strip = se.strips.new_movie(name="mp4", filepath=os.path.abspath(mp4), channel=1, frame_start=1)
    scene.render.resolution_x = strip.elements[0].orig_width if strip.elements else 720
    scene.render.resolution_y = strip.elements[0].orig_height if strip.elements else 1280
    print("movie size", scene.render.resolution_x, scene.render.resolution_y, "frames", strip.frame_final_duration, flush=True)
    scene.render.resolution_percentage = 100
    scene.render.use_sequencer = True
    scene.frame_end = strip.frame_final_duration
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    _render_still(scene, os.path.abspath(out), int(frame_no))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    os.makedirs(DOCS, exist_ok=True)
    cmd = argv[0] if argv else "towns"
    if cmd == "frame":
        frame(argv[1], argv[2], argv[3])
    else:
        {"towns": towns, "characters": characters, "actions": actions}[cmd]()
