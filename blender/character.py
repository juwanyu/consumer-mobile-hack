"""R6-style blocky character: rigid parts parented to bones of a 7-bone armature (no skinning).

build_character(look, name, collection=None) -> armature object at the origin facing -Y.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import castlib  # noqa: E402
from castlib import MeshBuilder, shade  # noqa: E402

DEFAULT_LOOK = {
    "skin_tone": "#E0AC69",
    "hair_color": "#3B2417",
    "hair_style": "short",
    "facial_hair": "none",
    "glasses": "none",
    "shirt_color": "#3A86FF",
    "shirt_style": "tshirt",
    "pants_color": "#2B2D42",
    "accessory": "none",
}

BONES = {
    "root": ((0, 0, 0), (0, 0, 0.3), None),
    "torso": ((0, 0, 0.7), (0, 0, 1.4), "root"),
    "head": ((0, 0, 1.4), (0, 0, 1.82), "torso"),
    "arm_L": ((0.525, 0, 1.3), (0.525, 0, 0.7), "torso"),
    "arm_R": ((-0.525, 0, 1.3), (-0.525, 0, 0.7), "torso"),
    "leg_L": ((0.175, 0, 0.7), (0.175, 0, 0.0), "root"),
    "leg_R": ((-0.175, 0, 0.7), (-0.175, 0, 0.0), "root"),
}

HEAD_Z = 1.61
FACE_Y = -0.21
HAT_LIFT = {"afro": 0.22, "mohawk": 0.12, "spiky": 0.1, "bun": 0.06, "curly": 0.05}


def _is_hex(v):
    if not isinstance(v, str):
        return False
    s = v.strip().lstrip("#")
    return len(s) in (3, 6) and all(c in "0123456789abcdefABCDEF" for c in s)


DEFAULT_VARIANTS = [
    {},
    {"shirt_color": "#E63946", "hair_style": "spiky", "skin_tone": "#C68642", "pants_color": "#1D3557"},
    {"shirt_color": "#06D6A0", "hair_style": "long", "skin_tone": "#FFDBAC", "hair_color": "#E9C46A"},
    {"shirt_color": "#FFD166", "hair_style": "curly", "skin_tone": "#8D5524", "hair_color": "#111111"},
]


def sanitize_look(look, variant=0):
    """Return a complete look dict; every invalid/missing field falls back to a safe default.
    variant picks one of a few default palettes so several default characters don't look identical."""
    look = look if isinstance(look, dict) else {}
    defaults = dict(DEFAULT_LOOK, **DEFAULT_VARIANTS[int(variant) % len(DEFAULT_VARIANTS)])
    lib = castlib.library()["looks"]
    allowed = {
        "hair_style": lib["hair_styles"],
        "facial_hair": lib["facial_hair"],
        "glasses": lib["glasses"],
        "shirt_style": lib["shirt_styles"],
        "accessory": lib["accessories"],
    }
    out = {}
    for key, default in defaults.items():
        value = look.get(key)
        if key in allowed:
            value = value.strip().lower() if isinstance(value, str) else None
            out[key] = value if value in allowed[key] else (default if default in allowed[key] else allowed[key][0])
        else:
            out[key] = value if _is_hex(value) else default
    return out


def _face(mb):
    for sx in (-1, 1):
        mb.box((sx * 0.085, FACE_Y - 0.008, 1.645), (0.055, 0.02, 0.1), "#111111")
        mb.box((sx * 0.085 + 0.012, FACE_Y - 0.02, 1.67), (0.02, 0.01, 0.025), "#FFFFFF")
        mb.box((sx * 0.085, FACE_Y - 0.006, 1.725), (0.08, 0.016, 0.018), "#2A1A10")
    mb.box((0, FACE_Y - 0.008, 1.535), (0.11, 0.02, 0.026), "#3A1010")
    for sx in (-1, 1):
        mb.box((sx * 0.065, FACE_Y - 0.008, 1.55), (0.03, 0.02, 0.03), "#3A1010")


def _hair(mb, style, col):
    dark = shade(col, 0.85)
    if style == "bald":
        return
    if style in ("buzz", "mohawk"):
        mb.box((0, 0.005, 1.81), (0.44, 0.44, 0.045), dark if style == "mohawk" else col)
        mb.box((0, 0.215, 1.69), (0.44, 0.03, 0.24), dark if style == "mohawk" else col)
        if style == "mohawk":
            for i, y in enumerate((-0.16, -0.08, 0.0, 0.08, 0.16)):
                mb.box((0, y, 1.89 + 0.02 * (i % 2)), (0.09, 0.09, 0.17), col)
        return
    mb.box((0, 0.01, 1.835), (0.46, 0.46, 0.1), col)
    mb.box((0, 0.225, 1.66), (0.46, 0.05, 0.36), col)
    for sx in (-1, 1):
        mb.box((sx * 0.225, 0.06, 1.71), (0.03, 0.34, 0.2), col)
    mb.box((0.04, FACE_Y - 0.01, 1.785), (0.38, 0.04, 0.08), col)
    if style == "spiky":
        for x in (-0.15, 0.0, 0.15):
            for y in (-0.12, 0.05, 0.18):
                mb.cyl((x, y, 1.95), 0.08, 0.18, col, segs=4, radius2=0.0)
    elif style == "curly":
        for x in (-0.17, -0.06, 0.06, 0.17):
            for y in (-0.15, -0.03, 0.09, 0.2):
                mb.ball((x, y, 1.89), 0.075, col, subdiv=1)
        for x in (-0.17, -0.06, 0.06, 0.17):
            mb.ball((x, 0.24, 1.72), 0.07, col, subdiv=1)
    elif style == "afro":
        mb.ball((0, 0.06, 1.93), 0.36, col, subdiv=2, scale=(1.0, 0.85, 0.72))
        for sx in (-1, 1):
            mb.ball((sx * 0.25, 0.08, 1.72), 0.15, col, subdiv=1)
        mb.ball((0, 0.24, 1.7), 0.2, col, subdiv=1)
    elif style == "long":
        mb.box((0, 0.24, 1.42), (0.48, 0.07, 0.8), col)
        for sx in (-1, 1):
            mb.box((sx * 0.235, 0.05, 1.5), (0.045, 0.32, 0.62), col)
    elif style == "ponytail":
        mb.box((0, 0.26, 1.72), (0.12, 0.06, 0.08), dark)
        mb.box((0, 0.31, 1.5), (0.14, 0.12, 0.42), col, rot=(-0.25, 0, 0))
    elif style == "bun":
        mb.ball((0, 0.1, 1.95), 0.12, col, subdiv=1)


def _facial_hair(mb, style, col, skin):
    if style == "stubble":
        mix = tuple((a * 0.55 + b * 0.45) for a, b in zip(castlib.hex_to_srgb(col), castlib.hex_to_srgb(skin)))
        mb.box((0, FACE_Y - 0.003, 1.47), (0.42, 0.012, 0.12), mix)
        return
    if style in ("mustache", "beard", "goatee"):
        mb.box((0, FACE_Y - 0.02, 1.575), (0.2, 0.03, 0.04), col)
    if style == "beard":
        mb.box((0, FACE_Y - 0.02, 1.44), (0.44, 0.045, 0.14), col)
        for sx in (-1, 1):
            mb.box((sx * 0.215, -0.04, 1.55), (0.035, 0.3, 0.26), col)
            mb.box((sx * 0.14, FACE_Y - 0.02, 1.53), (0.1, 0.045, 0.06), col)
    elif style == "goatee":
        mb.box((0, FACE_Y - 0.02, 1.47), (0.12, 0.045, 0.1), col)


def _glasses(mb, style):
    frame = "#151515"
    y = FACE_Y - 0.03
    z = 1.65
    if style == "none":
        return
    for sx in (-1, 1):
        cx = sx * 0.085
        if style == "round":
            for k in range(16):
                a = 2 * math.pi * k / 16
                mb.box((cx + 0.066 * math.cos(a), y, z + 0.066 * math.sin(a)), (0.03, 0.02, 0.018), frame, rot=(0, -(a + math.pi / 2), 0))
        elif style == "square":
            mb.box((cx, y, z + 0.06), (0.15, 0.02, 0.022), frame)
            mb.box((cx, y, z - 0.06), (0.15, 0.02, 0.022), frame)
            mb.box((cx - 0.065, y, z), (0.022, 0.02, 0.14), frame)
            mb.box((cx + 0.065, y, z), (0.022, 0.02, 0.14), frame)
        else:
            mb.box((cx, y, z - 0.005), (0.15, 0.025, 0.09), "#0A0A0A")
        mb.box((sx * 0.215, -0.1, z + 0.03), (0.02, 0.22, 0.02), frame)
    mb.box((0, y, z + 0.03), (0.05, 0.02, 0.02), frame)


def _accessory_head(mb, acc, look):
    lift = HAT_LIFT.get(look["hair_style"], 0.0)
    shirt = look["shirt_color"]
    if acc == "cap":
        c = shade(shirt, 0.8)
        mb.box((0, 0.01, 1.87 + lift), (0.48, 0.48, 0.14), c)
        mb.box((0, -0.33, 1.82 + lift), (0.44, 0.26, 0.03), c)
        mb.box((0, 0.01, 1.95 + lift), (0.06, 0.06, 0.03), "#FFFFFF")
    elif acc == "beanie":
        c = shade(shirt, 0.9)
        mb.box((0, 0.01, 1.88 + lift), (0.48, 0.48, 0.2), c)
        mb.box((0, 0.01, 1.79 + lift), (0.5, 0.5, 0.07), shade(c, 0.8))
        mb.ball((0, 0.01, 2.02 + lift), 0.07, "#F8F9FA", subdiv=1)
    elif acc == "headphones":
        mb.box((0, 0, 1.87 + lift), (0.4, 0.07, 0.05), "#222222")
        for sx in (-1, 1):
            mb.box((sx * 0.245, 0, 1.76 + lift / 2), (0.04, 0.07, 0.22 + lift), "#222222")
            mb.box((sx * 0.245, 0, 1.63), (0.09, 0.17, 0.19), "#E63946")
    elif acc == "cowboy_hat":
        brown = "#8B5A2B"
        mb.cyl((0, 0, 1.84 + lift), 0.44, 0.035, brown, segs=12)
        for sx in (-1, 1):
            mb.box((sx * 0.4, 0, 1.88 + lift), (0.1, 0.5, 0.06), brown)
        mb.box((0, 0.0, 1.97 + lift), (0.32, 0.32, 0.22), brown)
        mb.box((0, 0.0, 1.9 + lift), (0.33, 0.33, 0.05), "#3D2817")
    elif acc == "crown":
        gold = "#F2C230"
        mb.cyl((0, 0, 1.87 + lift), 0.2, 0.1, gold, segs=8)
        for k in range(8):
            a = 2 * math.pi * k / 8 + math.pi / 8
            mb.cyl((0.18 * math.cos(a), 0.18 * math.sin(a), 1.97 + lift), 0.05, 0.12, gold, segs=4, radius2=0.0)
        mb.box((0, -0.19, 1.87 + lift), (0.05, 0.03, 0.05), "#E63946", mat=1)


def _arm(mb, x, look, sleeve):
    skin, shirt = look["skin_tone"], look["shirt_color"]
    if sleeve == "full":
        mb.box((x, 0, 1.11), (0.35, 0.35, 0.58), shirt)
        mb.box((x, 0, 0.76), (0.33, 0.33, 0.12), skin)
        if look["shirt_style"] == "suit":
            mb.box((x, 0, 0.83), (0.355, 0.355, 0.04), "#F8F9FA")
    elif sleeve == "short":
        mb.box((x, 0, 1.25), (0.37, 0.37, 0.3), shirt)
        mb.box((x, 0, 0.98), (0.34, 0.34, 0.56), skin)
    else:
        mb.box((x, 0, 1.05), (0.35, 0.35, 0.7), skin)


def _torso(mb, look):
    style = look["shirt_style"]
    shirt, skin = look["shirt_color"], look["skin_tone"]
    mb.box((0, 0, 1.05), (0.7, 0.35, 0.7), shirt)
    front = -0.176
    if style == "tshirt":
        mb.box((0, front, 1.38), (0.2, 0.01, 0.05), skin)
    elif style == "hoodie":
        mb.box((0, 0.2, 1.37), (0.55, 0.12, 0.22), shade(shirt, 0.82))
        mb.box((0, front - 0.004, 0.86), (0.42, 0.012, 0.17), shade(shirt, 0.85))
        for sx in (-1, 1):
            mb.box((sx * 0.07, front - 0.008, 1.25), (0.025, 0.012, 0.16), "#F8F9FA")
    elif style == "suit":
        mb.box((0, front - 0.002, 1.24), (0.2, 0.01, 0.32), "#F8F9FA")
        tie = "#1D3557" if castlib.hex_to_srgb(shirt)[0] > 0.6 else "#C1121F"
        mb.box((0, front - 0.008, 1.2), (0.06, 0.01, 0.36), tie)
        mb.box((0, front - 0.009, 1.37), (0.08, 0.012, 0.04), tie)
        for sx in (-1, 1):
            mb.box((sx * 0.13, front - 0.01, 1.24), (0.06, 0.012, 0.3), shade(shirt, 0.7), rot=(0, sx * 0.35, 0))
        mb.box((0.2, front - 0.01, 1.28), (0.08, 0.012, 0.02), "#F8F9FA")
    elif style == "jacket":
        mb.box((0, front - 0.002, 1.05), (0.18, 0.01, 0.7), "#E9ECEF")
        for sx in (-1, 1):
            mb.box((sx * 0.13, front - 0.01, 1.35), (0.12, 0.02, 0.1), shade(shirt, 0.75))
            mb.box((sx * 0.095, front - 0.006, 1.05), (0.012, 0.012, 0.68), shade(shirt, 0.6))
    elif style == "tanktop":
        for sx in (-1, 1):
            mb.box((sx * 0.25, 0, 1.36), (0.2, 0.36, 0.08), skin)
        mb.box((0, front - 0.002, 1.36), (0.18, 0.01, 0.08), skin)
    elif style == "dress":
        mb.cyl((0, 0, 0.52), 0.52, 0.42, shirt, segs=8, radius2=0.4, rot=(0, 0, math.pi / 8))
        mb.box((0, 0, 0.74), (0.72, 0.37, 0.05), shade(shirt, 0.75))
        mb.box((0, front - 0.002, 1.36), (0.24, 0.01, 0.08), skin)
    if style != "dress":
        mb.box((0, 0, 0.73), (0.71, 0.36, 0.05), "#2B2B2B")
    if look["accessory"] == "bowtie":
        bt = "#C1121F" if style != "suit" else "#111111"
        for sx in (-1, 1):
            mb.box((sx * 0.055, front - 0.03, 1.355), (0.09, 0.03, 0.08), bt, rot=(0, sx * 0.3, 0))
        mb.box((0, front - 0.035, 1.355), (0.04, 0.03, 0.04), shade(bt, 0.7))


def _leg(mb, x, look):
    if look["shirt_style"] == "dress":
        mb.box((x, 0, 0.4), (0.33, 0.33, 0.6), look["skin_tone"])
    else:
        mb.box((x, 0, 0.4), (0.35, 0.35, 0.6), look["pants_color"])
    mb.box((x, -0.02, 0.06), (0.36, 0.4, 0.12), "#2B2B2B")


def _make_armature(name, collection):
    arm_data = bpy.data.armatures.new(name + "_rig")
    rig = bpy.data.objects.new(name, arm_data)
    collection.objects.link(rig)
    view_layer = bpy.context.view_layer
    scene_coll = bpy.context.scene.collection
    temp_link = collection != scene_coll and collection not in scene_coll.children_recursive
    if temp_link:
        scene_coll.objects.link(rig)
    prev_active = view_layer.objects.active
    view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, (head, tail, parent) in BONES.items():
        eb = arm_data.edit_bones.new(bname)
        eb.head = head
        eb.tail = tail
        eb.roll = 0.0
    for bname, (_, _, parent) in BONES.items():
        if parent:
            arm_data.edit_bones[bname].parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    if temp_link:
        scene_coll.objects.unlink(rig)
    view_layer.objects.active = prev_active
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    arm_data.display_type = "STICK"
    return rig


def _attach(rig, bone_name, mb, obj_name, collection):
    obj = mb.to_object(obj_name, collection, bevel=0.012)
    bone = rig.data.bones[bone_name]
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_parent_inverse = (bone.matrix_local @ Matrix.Translation((0, bone.length, 0))).inverted()
    return obj


def build_character(look, name="Cast", collection=None, variant=0):
    collection = collection or bpy.context.scene.collection
    look = sanitize_look(look, variant)
    rig = _make_armature(name, collection)
    rig["look"] = str(look)

    head = MeshBuilder()
    head.box((0, 0, HEAD_Z), (0.42, 0.42, 0.42), look["skin_tone"])
    head.box((0, 0, 1.43), (0.24, 0.24, 0.06), look["skin_tone"])
    _face(head)
    _hair(head, look["hair_style"], look["hair_color"])
    _facial_hair(head, look["facial_hair"], look["hair_color"], look["skin_tone"])
    _glasses(head, look["glasses"])
    _accessory_head(head, look["accessory"], look)
    _attach(rig, "head", head, name + ".head", collection)

    torso = MeshBuilder()
    _torso(torso, look)
    _attach(rig, "torso", torso, name + ".torso", collection)

    style = look["shirt_style"]
    sleeve = "full" if style in ("hoodie", "suit", "jacket") else ("none" if style == "tanktop" else "short")
    for side, x in (("L", 0.525), ("R", -0.525)):
        arm = MeshBuilder()
        _arm(arm, x, look, sleeve)
        _attach(rig, "arm_" + side, arm, f"{name}.arm_{side}", collection)
        leg = MeshBuilder()
        _leg(leg, x / 3.0, look)
        _attach(rig, "leg_" + side, leg, f"{name}.leg_{side}", collection)
    return rig
