"""Stylised R6-style character: rigid parts parented to bones of a 7-bone armature (no skinning).

build_character(look, name, collection=None, variant=0, props=()) -> armature object at the origin facing -Y.
Toon material + inverted-hull outlines; the face has separate eyelid and open-mouth objects
(rig["lids"], rig["mouth_open"]) so the renderer can blink and flap the mouth with hide_render keys.
"""
import math
import os
import random
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

HIP_Z = 0.8
SHOULDER_Z = 1.36
ARM_X = 0.44
HAND_Z = 0.75
HEAD_Z = 1.75
HEAD_W = 0.56
FACE_Y = -0.26
TOP_Z = 2.03
EYE_X, EYE_Z = 0.12, 1.73
HAND_R = (-ARM_X, -0.01, HAND_Z)

BONES = {
    "root": ((0, 0, 0), (0, 0, 0.3), None),
    "torso": ((0, 0, HIP_Z), (0, 0, 1.42), "root"),
    "head": ((0, 0, 1.43), (0, 0, TOP_Z), "torso"),
    "arm_L": ((ARM_X, 0, SHOULDER_Z), (ARM_X, 0, HAND_Z), "torso"),
    "arm_R": ((-ARM_X, 0, SHOULDER_Z), (-ARM_X, 0, HAND_Z), "torso"),
    "leg_L": ((0.155, 0, HIP_Z), (0.155, 0, 0.0), "root"),
    "leg_R": ((-0.155, 0, HIP_Z), (-0.155, 0, 0.0), "root"),
}

SILVER = "#C9D3DE"
GOLD = "#E8B931"
INK = "#1A1214"


def mix(a, b, t):
    a = castlib.hex_to_srgb(a) if isinstance(a, str) else a
    b = castlib.hex_to_srgb(b) if isinstance(b, str) else b
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def luma(c):
    r, g, b = castlib.hex_to_srgb(c) if isinstance(c, str) else c
    return 0.3 * r + 0.59 * g + 0.11 * b


def saturation(c):
    r, g, b = castlib.hex_to_srgb(c) if isinstance(c, str) else c
    return max(r, g, b) - min(r, g, b)


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



# ---------------------------------------------------------------- head

def _head_base(mb, look):
    skin = look["skin_tone"]
    mb.rbox((0, 0, HEAD_Z), (HEAD_W, 0.52, 0.56), skin, radius=0.07, segments=2)
    mb.rbox((0, 0.0, 1.47), (0.2, 0.2, 0.1), shade(skin, 0.85), radius=0.03)
    for sx in (-1, 1):
        mb.rbox((sx * 0.29, 0.02, 1.72), (0.05, 0.11, 0.14), skin, radius=0.02)
    mb.box((0, FACE_Y - 0.004, 1.645), (0.035, 0.012, 0.025), shade(skin, 0.82))
    blush = mix(skin, "#FF6F86", 0.35)
    for sx in (-1, 1):
        mb.box((sx * 0.175, FACE_Y - 0.002, 1.645), (0.075, 0.008, 0.03), blush)


def _eyes(mb, look, iris):
    brow = shade(look["hair_color"], 0.8) if look["hair_style"] != "bald" else shade(look["skin_tone"], 0.55)
    for sx in (-1, 1):
        x = sx * EYE_X
        mb.box((x, FACE_Y - 0.004, EYE_Z), (0.13, 0.012, 0.16), "#FFFFFF")
        mb.box((x + sx * 0.004, FACE_Y - 0.009, EYE_Z - 0.008), (0.095, 0.012, 0.13), iris)
        mb.box((x + sx * 0.004, FACE_Y - 0.013, EYE_Z - 0.012), (0.05, 0.01, 0.075), "#0B0B12")
        mb.box((x - 0.02, FACE_Y - 0.017, EYE_Z + 0.03), (0.034, 0.008, 0.034), "#FFFFFF", mat=1)
        mb.box((x + 0.026, FACE_Y - 0.017, EYE_Z - 0.04), (0.018, 0.008, 0.018), "#FFFFFF", mat=1)
        mb.box((x, FACE_Y - 0.012, EYE_Z + 0.08), (0.155, 0.014, 0.03), INK)
        mb.box((x + sx * 0.085, FACE_Y - 0.012, EYE_Z + 0.065), (0.045, 0.014, 0.022), INK, rot=(0, -sx * 0.5, 0))



def _mouth_closed(mb):
    m = "#5A1F24"
    mb.box((0, FACE_Y - 0.006, 1.583), (0.08, 0.012, 0.018), m)
    for sx in (-1, 1):
        mb.box((sx * 0.05, FACE_Y - 0.006, 1.594), (0.035, 0.012, 0.016), m, rot=(0, -sx * 0.55, 0))


def _brows(mb, look, kind):
    brow = shade(look["hair_color"], 0.8) if look["hair_style"] != "bald" else shade(look["skin_tone"], 0.55)
    for sx in (-1, 1):
        x = sx * EYE_X
        if kind == "angry":
            mb.box((x, FACE_Y - 0.008, EYE_Z + 0.135), (0.15, 0.018, 0.038), brow, rot=(0, -sx * 0.38, 0))
        elif kind == "up":
            mb.box((x, FACE_Y - 0.008, EYE_Z + 0.2), (0.14, 0.016, 0.032), brow, rot=(0, sx * 0.22, 0))
        else:
            mb.box((x, FACE_Y - 0.008, EYE_Z + 0.155), (0.14, 0.016, 0.032), brow, rot=(0, sx * 0.1, 0))


def _mouth_kind(mb, kind):
    m, dark = "#5A1F24", "#3E1016"
    if kind == "grit":
        mb.rbox((0, FACE_Y - 0.008, 1.585), (0.15, 0.012, 0.045), dark, radius=0.006, segments=1)
        mb.box((0, FACE_Y - 0.014, 1.585), (0.13, 0.008, 0.024), "#FFFFFF")
    elif kind == "smirk":
        mb.box((0.01, FACE_Y - 0.006, 1.585), (0.09, 0.012, 0.018), m, rot=(0, -0.18, 0))
        mb.box((0.065, FACE_Y - 0.006, 1.6), (0.035, 0.012, 0.016), m, rot=(0, -0.7, 0))
    elif kind == "shout":
        mb.rbox((0, FACE_Y - 0.012, 1.565), (0.15, 0.014, 0.13), dark, radius=0.01, segments=1)
        mb.box((0, FACE_Y - 0.02, 1.525), (0.1, 0.008, 0.035), "#E0697A")
        mb.box((0, FACE_Y - 0.02, 1.62), (0.12, 0.008, 0.018), "#FFFFFF")
    elif kind == "o":
        mb.rbox((0, FACE_Y - 0.012, 1.575), (0.07, 0.014, 0.085), dark, radius=0.01, segments=1)
    else:
        _mouth_closed(mb)


BROW_KINDS = ("neutral", "angry", "up")
MOUTH_KINDS = ("neutral", "grit", "smirk", "shout", "o")


def _mouth_open(mb):
    mb.rbox((0, FACE_Y - 0.012, 1.578), (0.11, 0.014, 0.075), "#3E1016", radius=0.006, segments=1)
    mb.box((0, FACE_Y - 0.02, 1.553), (0.07, 0.008, 0.024), "#E0697A")
    mb.box((0, FACE_Y - 0.02, 1.605), (0.085, 0.008, 0.016), "#FFFFFF")


def _lids(mb, look):
    skin = shade(look["skin_tone"], 0.93)
    for sx in (-1, 1):
        x = sx * EYE_X
        mb.box((x, FACE_Y - 0.024, EYE_Z + 0.005), (0.165, 0.01, 0.185), skin)
        mb.box((x, FACE_Y - 0.03, EYE_Z - 0.03), (0.15, 0.01, 0.025), INK)


def _curl_points(radii, center, count, keep, seed):
    rnd = random.Random(seed)
    pts = []
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(count):
        z = 1 - 2 * (i + 0.5) / count
        r = math.sqrt(1 - z * z)
        th = golden * i
        d = (math.cos(th) * r, math.sin(th) * r, z)
        p = (center[0] + d[0] * radii[0], center[1] + d[1] * radii[1], center[2] + d[2] * radii[2])
        if keep(p, d):
            pts.append((p, rnd.uniform(0.85, 1.15)))
    return pts


def _hair(mb, look, hat):
    style, col = look["hair_style"], look["hair_color"]
    if style == "bald":
        return
    dark, light = shade(col, 0.7), mix(col, "#8A7A9A", 0.22)
    cap_line = 1.97 if hat else 9.0
    if style in ("buzz", "mohawk"):
        mb.rbox((0, 0.01, TOP_Z - 0.01), (0.585, 0.545, 0.07), dark, radius=0.03)
        mb.rbox((0, 0.18, 1.82), (0.585, 0.2, 0.36), dark, radius=0.03)
        if style == "mohawk":
            for i, y in enumerate((-0.2, -0.1, 0.0, 0.1, 0.2)):
                mb.rbox((0, y, TOP_Z + 0.1 + 0.03 * (i % 2)), (0.11, 0.11, 0.22), col, radius=0.025)
        return
    if style in ("curly", "afro"):
        big = style == "afro"
        radii = (0.46, 0.44, 0.38) if big else (0.335, 0.325, 0.27)
        center = (0, 0.04, 1.87 if not big else 1.92)
        mb.rbox((0, 0.06, 1.86), (0.58, 0.52, 0.32), dark, radius=0.06)

        def keep(p, d):
            if p[2] > cap_line and hat:
                return False
            if d[1] < -0.55:
                return p[2] > 1.93
            if d[1] < -0.2:
                return p[2] > 1.86
            return p[2] > (1.55 if not big else 1.5)
        pts = _curl_points(radii, center, 150 if big else 110, keep, 7)
        for k, (p, s) in enumerate(pts):
            mb.ball(p, (0.105 if big else 0.085) * s, (col, light, dark)[k % 3], subdiv=2)
        if not hat:
            for k, x in enumerate((-0.2, -0.1, 0.0, 0.1, 0.2)):
                mb.ball((x, FACE_Y - 0.01, 1.95 + 0.02 * (k % 2)), 0.072, (col, light)[k % 2], subdiv=2)
        return
    mb.rbox((0, 0.02, TOP_Z - 0.005), (0.6, 0.57, 0.12), col, radius=0.05)
    mb.rbox((0, 0.18, 1.8), (0.6, 0.24, 0.42), col, radius=0.05)
    for sx in (-1, 1):
        mb.rbox((sx * 0.29, 0.02, 1.86), (0.06, 0.42, 0.24), col, radius=0.02)
    if not hat:
        for k, x in enumerate((-0.21, -0.07, 0.07, 0.21)):
            mb.rbox((x, FACE_Y - 0.015, 1.94 - 0.015 * (k % 2)), (0.16, 0.07, 0.14), (col, dark)[k % 2],
                    radius=0.02, rot=(0.15, 0, (k - 1.5) * 0.12))
    if style == "spiky":
        for x in (-0.18, 0.0, 0.18):
            for y in (-0.14, 0.05, 0.2):
                mb.cyl((x, y, TOP_Z + 0.11), 0.1, 0.24, col, segs=4, radius2=0.0, rot=(y * 1.2, -x * 1.5, 0))
    elif style == "long":
        mb.rbox((0, 0.29, 1.5), (0.62, 0.09, 0.82), col, radius=0.04)
        for sx in (-1, 1):
            mb.rbox((sx * 0.3, -0.06, 1.58), (0.07, 0.32, 0.6), col, radius=0.03)
    elif style == "ponytail":
        mb.box((0, 0.3, 1.86), (0.14, 0.06, 0.09), dark)
        mb.rbox((0, 0.38, 1.6), (0.17, 0.15, 0.5), col, radius=0.05, rot=(-0.25, 0, 0))
    elif style == "bun":
        mb.ball((0, 0.17, TOP_Z + 0.07), 0.14, col, subdiv=2)
        mb.box((0, 0.16, TOP_Z + 0.0), (0.2, 0.18, 0.04), dark)


def _saber_hair(mb, col):
    for sx in (-1, 1):
        mb.rbox((sx * 0.25, FACE_Y - 0.02, 1.64), (0.07, 0.07, 0.3), col, radius=0.025)
    mb.rbox((0, FACE_Y - 0.03, 1.88), (0.08, 0.06, 0.16), col, radius=0.02)
    mb.box((0.03, -0.06, TOP_Z + 0.08), (0.035, 0.16, 0.13), col, rot=(0.6, 0, 0))
    mb.box((0, 0.22, TOP_Z + 0.02), (0.26, 0.06, 0.07), "#1F3A93")


def _facial_hair(mb, style, look):
    col, skin = look["hair_color"], look["skin_tone"]
    if style == "stubble":
        rnd = random.Random(3)
        dot = mix(col, skin, 0.5)
        mb.box((0, FACE_Y - 0.001, 1.53), (0.44, 0.004, 0.11), mix(skin, col, 0.18))
        for _ in range(80):
            x = rnd.uniform(-0.24, 0.24)
            z = rnd.uniform(1.48, 1.63 - 0.12 * (abs(x) / 0.24) ** 2)
            if abs(x) < 0.07 and 1.565 < z < 1.6:
                continue
            mb.box((x, FACE_Y - 0.004, z), (0.011, 0.006, 0.011), dot)
        for sx in (-1, 1):
            for _ in range(18):
                mb.box((sx * 0.281, rnd.uniform(-0.2, 0.05), rnd.uniform(1.5, 1.66)), (0.006, 0.011, 0.011), dot)
        return
    if style in ("mustache", "beard", "goatee"):
        mb.rbox((0, FACE_Y - 0.014, 1.615), (0.18, 0.03, 0.035), col, radius=0.012)
    if style == "beard":
        mb.rbox((0, FACE_Y - 0.01, 1.51), (0.54, 0.05, 0.13), col, radius=0.03)
        for sx in (-1, 1):
            mb.rbox((sx * 0.27, -0.06, 1.6), (0.05, 0.36, 0.28), col, radius=0.02)
            mb.box((sx * 0.15, FACE_Y - 0.012, 1.575), (0.1, 0.03, 0.06), col)
    elif style == "goatee":
        mb.rbox((0, FACE_Y - 0.012, 1.525), (0.13, 0.035, 0.09), col, radius=0.015)


def _glasses(mb, style):
    frame = "#141414"
    y, z = FACE_Y - 0.035, EYE_Z
    if style == "none":
        return
    for sx in (-1, 1):
        cx = sx * EYE_X
        if style == "round":
            for k in range(20):
                a = 2 * math.pi * k / 20
                mb.box((cx + 0.098 * math.cos(a), y, z + 0.098 * math.sin(a)), (0.036, 0.02, 0.02), frame,
                       rot=(0, -(a + math.pi / 2), 0))
        elif style == "square":
            mb.box((cx, y, z + 0.085), (0.2, 0.02, 0.026), frame)
            mb.box((cx, y, z - 0.085), (0.2, 0.02, 0.026), frame)
            mb.box((cx - 0.1, y, z), (0.026, 0.02, 0.19), frame)
            mb.box((cx + 0.1, y, z), (0.026, 0.02, 0.19), frame)
        else:
            mb.rbox((cx, y, z - 0.005), (0.2, 0.025, 0.13), "#0A0A10", radius=0.025)
            mb.box((cx - 0.04, y - 0.014, z + 0.03), (0.05, 0.004, 0.015), "#9AA6C8", mat=1)
        mb.box((sx * 0.285, -0.12, z + 0.04), (0.02, 0.3, 0.02), frame)
        mb.box((sx * 0.218, y, z + 0.04), (0.04, 0.02, 0.02), frame)
    mb.box((0, y, z + 0.035), (0.05, 0.02, 0.02), frame)


def cap_color(look):
    shirt = look["shirt_color"]
    return shirt if saturation(shirt) > 0.25 else "#2563EB"


def _accessory_head(mb, acc, look):
    big = {"afro": 0.12, "curly": 0.04, "mohawk": 0.1, "spiky": 0.08, "bun": 0.0}.get(look["hair_style"], 0.0)
    top = TOP_Z + big * 0.5
    if acc == "cap":
        c = cap_color(look)
        w = 0.64 + big
        mb.rbox((0, 0.02, top + 0.03), (w, w - 0.02, 0.2), c, radius=0.08, segments=3)
        mb.rbox((0, -0.38 - big * 0.5, top - 0.045), (w * 0.82, 0.34, 0.035), shade(c, 0.8), radius=0.015,
                rot=(0.12, 0, 0))
        mb.box((0, FACE_Y - 0.06 - big * 0.5, top + 0.0), (w * 0.9, 0.02, 0.1), c)
        mb.ball((0, 0.02, top + 0.14), 0.035, shade(c, 0.8), subdiv=1)
        mb.box((0, FACE_Y - 0.075 - big * 0.5, top + 0.03), (0.12, 0.01, 0.06), "#FFFFFF")
    elif acc == "beanie":
        c = cap_color(look)
        mb.rbox((0, 0.02, top + 0.05), (0.64 + big, 0.6 + big, 0.26), c, radius=0.1, segments=3)
        mb.rbox((0, 0.02, top - 0.07), (0.66 + big, 0.62 + big, 0.09), shade(c, 0.8), radius=0.03)
        mb.ball((0, 0.02, top + 0.22), 0.08, "#F8F9FA", subdiv=1)
    elif acc == "headphones":
        mb.rbox((0, 0, top + 0.06), (0.52 + big, 0.08, 0.06), "#222222", radius=0.02)
        for sx in (-1, 1):
            mb.box((sx * (0.31 + big * 0.5), 0, 1.92 + big * 0.3), (0.05, 0.08, 0.26 + big), "#222222")
            mb.rbox((sx * (0.31 + big * 0.5), 0, 1.74), (0.1, 0.2, 0.22), "#E63946", radius=0.03)
    elif acc == "cowboy_hat":
        brown = "#8B5A2B"
        mb.cyl((0, 0, top + 0.01), 0.58 + big, 0.04, brown, segs=14)
        for sx in (-1, 1):
            mb.box((sx * (0.52 + big), 0, top + 0.06), (0.12, 0.6, 0.07), brown)
        mb.rbox((0, 0, top + 0.13), (0.42, 0.42, 0.26), brown, radius=0.05)
        mb.box((0, 0, top + 0.05), (0.43, 0.43, 0.06), "#3D2817")
    elif acc == "crown":
        mb.cyl((0, 0, top + 0.04), 0.26, 0.12, GOLD, segs=8)
        for k in range(8):
            a = 2 * math.pi * k / 8 + math.pi / 8
            mb.cyl((0.24 * math.cos(a), 0.24 * math.sin(a), top + 0.16), 0.06, 0.14, GOLD, segs=4, radius2=0.0)
        mb.box((0, -0.25, top + 0.04), (0.06, 0.03, 0.06), "#E63946", mat=1)


# ---------------------------------------------------------------- body

def _hand(mb, x, skin):
    inward = 1 if x < 0 else -1
    mb.rbox((x, -0.01, HAND_Z), (0.2, 0.21, 0.17), skin, radius=0.04)
    mb.rbox((x + inward * 0.08, -0.09, HAND_Z + 0.04), (0.07, 0.08, 0.1), skin, radius=0.02)


def _arm(mb, x, look, sleeve):
    skin, shirt = look["skin_tone"], look["shirt_color"]
    style = look["shirt_style"]
    if sleeve == "full":
        mb.rbox((x, 0, 1.13), (0.24, 0.26, 0.6), shirt, radius=0.05)
        mb.box((x, 0, 0.855), (0.25, 0.27, 0.05), shade(shirt, 0.75) if style != "suit" else "#F8F9FA")
        if style == "jacket":
            mb.box((x, -0.132, 1.1), (0.012, 0.01, 0.3), SILVER)
    elif sleeve == "short":
        mb.rbox((x, 0, 1.28), (0.26, 0.28, 0.28), shirt, radius=0.05)
        mb.box((x, 0, 1.15), (0.265, 0.285, 0.03), shade(shirt, 0.85))
        mb.rbox((x, 0, 1.0), (0.21, 0.23, 0.42), skin, radius=0.04)
    else:
        mb.rbox((x, 0, 1.1), (0.22, 0.24, 0.62), skin, radius=0.05)
    if style == "armor":
        mb.rbox((x * 1.03, 0, 1.36), (0.32, 0.33, 0.15), SILVER, radius=0.05)
        mb.rbox((x, 0, 0.9), (0.27, 0.29, 0.16), SILVER, radius=0.03)
        mb.box((x, -0.15, 0.9), (0.1, 0.02, 0.08), GOLD)
    _hand(mb, x, skin)


def _torso(mb, look):
    style = look["shirt_style"]
    shirt, skin = look["shirt_color"], look["skin_tone"]
    mb.rbox((0, 0, 1.11), (0.64, 0.34, 0.62), shirt, radius=0.05)
    front = -0.172
    if style == "tshirt":
        mb.box((0, front, 1.395), (0.2, 0.012, 0.05), skin)
        mb.box((0, front - 0.002, 1.41), (0.26, 0.012, 0.03), shade(shirt, 0.86))
        mb.box((0, front - 0.002, 0.83), (0.62, 0.012, 0.025), shade(shirt, 0.9))
        mb.box((-0.17, front - 0.003, 1.26), (0.1, 0.01, 0.1), shade(shirt, 0.92))
    elif style == "hoodie":
        mb.rbox((0, 0.18, 1.4), (0.5, 0.14, 0.2), shade(shirt, 0.82), radius=0.04)
        mb.box((0, front - 0.004, 0.92), (0.4, 0.012, 0.16), shade(shirt, 0.85))
        for sx in (-1, 1):
            mb.box((sx * 0.06, front - 0.008, 1.27), (0.022, 0.012, 0.16), "#F8F9FA")
    elif style == "suit":
        mb.box((0, front - 0.002, 1.25), (0.2, 0.01, 0.32), "#F8F9FA")
        tie = "#1D3557" if castlib.hex_to_srgb(shirt)[0] > 0.6 else "#C1121F"
        mb.box((0, front - 0.008, 1.2), (0.06, 0.01, 0.36), tie)
        mb.box((0, front - 0.009, 1.38), (0.08, 0.012, 0.045), tie)
        for sx in (-1, 1):
            mb.box((sx * 0.13, front - 0.012, 1.25), (0.07, 0.014, 0.32), shade(shirt, 0.7), rot=(0, sx * 0.35, 0))
    elif style == "jacket":
        inner = "#E9E9EC" if luma(shirt) < 0.55 else "#2B2D42"
        mb.box((0, front - 0.002, 1.1), (0.2, 0.012, 0.6), inner)
        mb.box((0, front - 0.004, 1.22), (0.13, 0.012, 0.012), shade(inner, 0.8))
        for sx in (-1, 1):
            mb.box((sx * 0.108, front - 0.008, 1.0), (0.014, 0.012, 0.36), SILVER)
            mb.box((sx * 0.14, front - 0.014, 1.29), (0.08, 0.016, 0.24), shade(shirt, 0.72), rot=(0, sx * 0.4, 0))
            mb.rbox((sx * 0.15, -0.06, 1.45), (0.14, 0.2, 0.09), shade(shirt, 0.82), radius=0.02)
            mb.box((sx * 0.2, front - 0.006, 0.92), (0.13, 0.01, 0.02), shade(shirt, 0.6))
        mb.box((0, front - 0.004, 0.83), (0.63, 0.014, 0.05), shade(shirt, 0.78))
    elif style == "tanktop":
        for sx in (-1, 1):
            mb.box((sx * 0.24, 0, 1.37), (0.18, 0.35, 0.09), skin)
        mb.box((0, front - 0.002, 1.37), (0.18, 0.01, 0.09), skin)
    elif style == "armor":
        mb.cyl((0, 0, 0.5), 0.5, 0.58, shirt, segs=10, radius2=0.36, rot=(0, 0, math.pi / 10))
        mb.cyl((0, 0, 0.23), 0.505, 0.05, "#F2F2F2", segs=10, rot=(0, 0, math.pi / 10))
        mb.rbox((0, front - 0.02, 1.17), (0.6, 0.06, 0.38), SILVER, radius=0.03)
        mb.box((0, front - 0.05, 1.3), (0.46, 0.02, 0.08), "#E3E9F0")
        mb.box((0, front - 0.055, 1.12), (0.05, 0.02, 0.28), GOLD)
        mb.rbox((0, 0.185, 1.17), (0.6, 0.04, 0.38), SILVER, radius=0.02)
        mb.box((0, 0, 0.82), (0.66, 0.36, 0.07), SILVER)
        mb.box((0, front - 0.03, 0.82), (0.12, 0.03, 0.08), GOLD)
        mb.box((0, front - 0.004, 1.4), (0.2, 0.01, 0.05), skin)
    elif style == "dress":
        mb.cyl((0, 0, 0.56), 0.48, 0.48, shirt, segs=10, radius2=0.36, rot=(0, 0, math.pi / 10))
        mb.box((0, 0, 0.82), (0.66, 0.36, 0.05), shade(shirt, 0.75))
        mb.box((0, front - 0.002, 1.38), (0.24, 0.01, 0.08), skin)
    if style not in ("dress", "armor", "jacket"):
        mb.box((0, 0, 0.83), (0.65, 0.35, 0.05), "#2B2B2B")


def _leg(mb, x, look):
    style = look["shirt_style"]
    leg = look["skin_tone"] if style == "dress" else look["pants_color"]
    mb.rbox((x, 0, 0.46), (0.29, 0.31, 0.7), leg, radius=0.04)
    if style == "armor":
        mb.rbox((x, -0.02, 0.17), (0.32, 0.36, 0.34), SILVER, radius=0.04)
        mb.box((x, -0.2, 0.3), (0.08, 0.02, 0.08), GOLD)
    else:
        mb.rbox((x, -0.04, 0.07), (0.31, 0.4, 0.14), "#242428", radius=0.04)
        mb.box((x, -0.04, 0.012), (0.315, 0.405, 0.025), "#ECECEC")


def _sword(mb):
    x, _, z = HAND_R
    mb.cyl((x, -0.04, z), 0.035, 0.32, "#1F3A93", segs=6, rot=(math.pi / 2, 0, 0))
    mb.ball((x, 0.14, z), 0.05, GOLD, subdiv=1)
    mb.rbox((x, -0.22, z), (0.07, 0.07, 0.38), GOLD, radius=0.015)
    mb.box((x, -0.22, z), (0.09, 0.09, 0.09), "#2A4FB5")
    mb.box((x, -0.82, z), (0.035, 1.1, 0.11), "#E6EEF5")
    mb.box((x, -0.82, z), (0.04, 1.0, 0.03), "#9DB4CC")
    mb.cyl((x, -1.42, z), 0.055, 0.12, "#E6EEF5", segs=4, radius2=0.0, rot=(math.pi / 2, 0, 0))


def _camera_rig(mb):
    body, x, z = "#1B1B1F", -0.42, 1.6
    mb.rbox((x, -0.1, z - 0.15), (0.24, 0.32, 0.05), "#3A3A40", radius=0.01)
    mb.rbox((x, -0.14, z), (0.22, 0.46, 0.28), body, radius=0.03)
    mb.cyl((x, -0.46, z), 0.095, 0.22, "#2B2B30", segs=12, rot=(math.pi / 2, 0, 0))
    mb.cyl((x, -0.575, z), 0.075, 0.02, "#5BC0EB", segs=12, rot=(math.pi / 2, 0, 0), mat=1)
    mb.box((x, -0.6, z), (0.28, 0.05, 0.24), body)
    mb.box((x, -0.15, z + 0.18), (0.04, 0.34, 0.04), "#3A3A40")
    mb.box((x + 0.14, -0.28, z + 0.12), (0.02, 0.16, 0.11), "#111111")
    mb.box((x + 0.151, -0.28, z + 0.12), (0.005, 0.13, 0.085), "#7CFF4F", mat=1)
    mb.box((x - 0.11, -0.34, z + 0.08), (0.03, 0.03, 0.03), "#FF2020", mat=1)


def _cape(mb):
    mb.rbox((0, 0.22, 0.98), (0.66, 0.05, 0.92), "#1F3A93", radius=0.02, rot=(-0.12, 0, 0))
    mb.box((0, 0.25, 0.53), (0.68, 0.05, 0.06), GOLD, rot=(-0.12, 0, 0))
    mb.rbox((0, 0.2, 1.42), (0.7, 0.12, 0.08), GOLD, radius=0.02)
    for sx in (-1, 1):
        mb.ball((sx * 0.25, -0.18, 1.38), 0.05, GOLD, subdiv=1)


PIXEL_FONT = {"C": ("111", "100", "100", "100", "111"), "A": ("010", "101", "111", "101", "101"),
              "P": ("110", "101", "110", "100", "100"), "Y": ("101", "101", "010", "010", "010")}


def _banner(mb):
    x, _, z = HAND_R
    mb.cyl((x, -1.0, z), 0.03, 2.6, "#6B4A2B", segs=6, rot=(math.pi / 2, 0, 0))
    mb.ball((x, -2.32, z), 0.07, GOLD, subdiv=1)
    mb.box((x - 0.55, -1.75, z), (1.1, 1.0, 0.04), "#F2994A", rot=(0, 0, 0))
    for side in (1, -1):
        mb.box((x - 0.55, -1.75, z + side * 0.025), (0.98, 0.88, 0.01), "#E07A1F")
        px = 0.07
        for i, ch in enumerate("CAPY"):
            for r, row in enumerate(PIXEL_FONT[ch]):
                for c, on in enumerate(row):
                    if on != "1":
                        continue
                    off = -0.525 + i * 0.28 + c * px + px / 2
                    mb.box((x - 0.55 - side * off, -1.75 - 0.175 + r * px + px / 2, z + side * 0.032),
                           (px, px, 0.01), "#FFFFFF")


def _laptop(mb):
    x, _, z = (ARM_X, -0.01, HAND_Z)
    mb.rbox((x - 0.05, -0.25, z + 0.05), (0.42, 0.3, 0.03), "#C9CDD3", radius=0.01)
    mb.box((x - 0.05, -0.12, z + 0.2), (0.42, 0.02, 0.28), "#B5BAC2", rot=(-0.3, 0, 0))
    mb.box((x - 0.05, -0.14, z + 0.22), (0.1, 0.01, 0.1), "#F26522", rot=(-0.3, 0, 0))


def _lanyard(mb):
    for sx in (-1, 1):
        mb.box((sx * 0.1, -0.176, 1.27), (0.025, 0.01, 0.28), "#2F6FDB", rot=(0, sx * 0.3, 0))
    mb.rbox((0, -0.185, 1.08), (0.13, 0.015, 0.17), "#FFFFFF", radius=0.01)
    mb.box((0, -0.195, 1.12), (0.1, 0.006, 0.03), "#F26522")


def _y_logo(mb):
    w = 0.045
    for sx in (-1, 1):
        mb.box((sx * 0.055, -0.176, 1.2), (w, 0.012, 0.16), "#FFFFFF", rot=(0, sx * 0.6, 0))
    mb.box((0, -0.176, 1.07), (w, 0.012, 0.14), "#FFFFFF")


GLOVE = "#1E1E24"
BIKE_FRAME = "#A3E635"
BIKE_DARK = "#1C1C22"


SQUIRE_BLUE = "#2A4FB5"
LEATHER = "#7A4A24"


def _tabard(mb):
    """Squire's tabard over the shirt: blue panels front and back with gold trim and a CAPY crest, leather belt."""
    for y, sgn in ((-0.178, -1), (0.178, 1)):
        mb.box((0, y, 1.06), (0.44, 0.012, 0.7), SQUIRE_BLUE)
        for sx in (-1, 1):
            mb.box((sx * 0.215, y + sgn * 0.003, 1.06), (0.03, 0.012, 0.7), GOLD)
        mb.box((0, y + sgn * 0.003, 0.72), (0.44, 0.012, 0.03), GOLD)
    mb.rbox((0, -0.19, 1.16), (0.2, 0.014, 0.24), GOLD, radius=0.02)
    mb.rbox((0, -0.196, 1.17), (0.15, 0.012, 0.18), "#F2994A", radius=0.015)
    mb.box((0.0, -0.2, 1.17), (0.03, 0.01, 0.12), "#FFFFFF")
    mb.box((0.035, -0.2, 1.215), (0.06, 0.01, 0.025), "#FFFFFF")
    mb.box((0.035, -0.2, 1.125), (0.06, 0.01, 0.025), "#FFFFFF")
    mb.box((0, 0, 0.86), (0.66, 0.37, 0.07), LEATHER)
    mb.box((0, -0.188, 0.86), (0.09, 0.012, 0.08), GOLD)


def _satchel(mb):
    """Leather satchel on the back-left hip with a strap across the chest."""
    mb.box((0, -0.192, 1.1), (0.065, 0.012, 0.8), LEATHER, rot=(0, -0.7, 0))
    mb.box((0, 0.192, 1.1), (0.065, 0.012, 0.8), LEATHER, rot=(0, 0.7, 0))
    mb.rbox((0.17, 0.25, 0.9), (0.3, 0.13, 0.27), "#8B5A2B", radius=0.03)
    mb.box((0.17, 0.315, 0.96), (0.3, 0.012, 0.13), "#6B3F1D")
    mb.box((0.17, 0.322, 0.92), (0.05, 0.01, 0.04), GOLD)
    mb.cyl((0.08, 0.27, 1.06), 0.03, 0.12, "#E8D9B0", segs=6)


def _pennant(mb):
    """Small CAPY pennant on a pole strapped to the back."""
    mb.cyl((-0.16, 0.26, 1.55), 0.025, 1.7, "#6B4A2B", segs=6)
    mb.ball((-0.16, 0.26, 2.42), 0.05, GOLD, subdiv=1)
    mb.box((0.05, 0.26, 2.2), (0.42, 0.02, 0.3), "#F2994A")
    mb.box((0.05, 0.26, 2.2), (0.36, 0.025, 0.06), "#FFFFFF")


KARATE = {"karate": ("#F4F2EC", "#151515", "#FA4616"), "karate_black": ("#1A1A1D", "#8B1E1E", "#D62828")}


def _gi(mb, gi):
    for sx in (-1, 1):
        mb.box((sx * 0.07, -0.178, 1.2), (0.06, 0.012, 0.46), shade(gi, 0.78), rot=(0, sx * 0.42, 0))
    mb.box((0, 0, 0.79), (0.68, 0.38, 0.14), gi)


def _belt(mb, col):
    mb.box((0, 0, 0.9), (0.68, 0.385, 0.08), col)
    mb.box((0, -0.2, 0.9), (0.1, 0.03, 0.09), shade(col, 1.25))
    for sx in (-1, 1):
        mb.box((sx * 0.045, -0.2, 0.79), (0.05, 0.015, 0.2), col, rot=(0, sx * 0.25, 0))


def _headband(mb, col):
    mb.rbox((0, 0.0, 1.9), (HEAD_W + 0.04, 0.56, 0.08), col, radius=0.015)
    for sx in (-1, 1):
        mb.box((sx * 0.06, 0.32, 1.84), (0.06, 0.1, 0.2), col, rot=(0.3, sx * 0.3, 0))


def _trophy(mb, x):
    mb.cyl((x, -0.01, HAND_Z - 0.12), 0.08, 0.06, GOLD, segs=8)
    mb.cyl((x, -0.01, HAND_Z - 0.2), 0.03, 0.12, GOLD, segs=6)
    mb.cyl((x, -0.01, HAND_Z - 0.38), 0.17, 0.26, GOLD, segs=10, radius2=0.1)
    for sx in (-1, 1):
        mb.box((x + sx * 0.19, -0.01, HAND_Z - 0.36), (0.05, 0.03, 0.14), GOLD)
    mb.ball((x, -0.01, HAND_Z - 0.52), 0.05, "#FFF3B0", subdiv=1, mat=1)


def _helmet(mb, look):
    """Trail helmet: shell, lime stripe, vents and a visor peak; face and mustache stay visible."""
    c = "#24232B"
    mb.rbox((0, 0.04, TOP_Z - 0.04), (0.68, 0.66, 0.34), c, radius=0.1, segments=3)
    mb.rbox((0, 0.06, TOP_Z - 0.2), (0.7, 0.62, 0.16), c, radius=0.05)
    mb.box((0, 0.04, TOP_Z + 0.135), (0.12, 0.62, 0.02), BIKE_FRAME)
    for sx in (-0.18, 0.18):
        mb.box((sx, -0.05, TOP_Z + 0.13), (0.07, 0.3, 0.012), "#0E0E12")
    mb.rbox((0, -0.36, TOP_Z - 0.1), (0.62, 0.24, 0.045), c, radius=0.015, rot=(0.28, 0, 0))
    mb.box((0, -0.27, TOP_Z - 0.2), (0.6, 0.02, 0.03), BIKE_FRAME)


def _windbreaker(mb, look):
    shirt = look["shirt_color"]
    mb.box((0, -0.178, 1.08), (0.022, 0.01, 0.52), "#E8E8F0")
    mb.box((0, -0.177, 1.3), (0.6, 0.008, 0.07), mix(shirt, "#FFFFFF", 0.35))
    mb.box((0.17, -0.179, 1.18), (0.1, 0.006, 0.05), "#FFFFFF")


def _glove(mb, x):
    mb.rbox((x, -0.01, HAND_Z), (0.215, 0.225, 0.185), GLOVE, radius=0.04)


def _horns(mb, x, col):
    """Index and pinky up (they point along the arm, away from the fist) with silver rings."""
    for dx in (-0.065, 0.065):
        mb.rbox((x + dx, -0.03, HAND_Z - 0.17), (0.055, 0.055, 0.2), col, radius=0.015)
        mb.box((x + dx, -0.03, HAND_Z - 0.115), (0.064, 0.064, 0.025), SILVER)


def _tube(mb, a, b, w, col, x=0.0):
    dy, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dy, dz)
    mb.box((x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), (w, L + w * 0.6, w), col, rot=(math.atan2(dz, dy), 0, 0))


def _bike(rig, name, collection, outline):
    """Hardtail MTB in rig space (rider seated, rig lifted by BIKE_LIFT): frame on the root bone, two spinning wheels."""
    from animations import BIKE_LIFT, WHEEL_R
    az = WHEEL_R - BIKE_LIFT
    front, rear, bb = (-1.0, az), (0.72, az), (0.02, az + 0.08)
    head_top, head_bot, seat = (-0.72, 0.9), (-0.7, 0.74), (0.12, 0.72)
    mb = MeshBuilder()
    _tube(mb, head_top, seat, 0.075, BIKE_FRAME)
    _tube(mb, head_bot, bb, 0.085, BIKE_FRAME)
    _tube(mb, bb, seat, 0.07, BIKE_FRAME)
    _tube(mb, head_bot, head_top, 0.09, BIKE_DARK)
    for sx in (-0.07, 0.07):
        _tube(mb, bb, rear, 0.045, BIKE_FRAME, x=sx)
        _tube(mb, seat, rear, 0.04, BIKE_FRAME, x=sx)
        _tube(mb, head_bot, ((head_bot[0] + front[0]) / 2, (head_bot[1] + front[1]) / 2), 0.07, "#F2B705", x=sx * 1.2)
        _tube(mb, ((head_bot[0] + front[0]) / 2, (head_bot[1] + front[1]) / 2), front, 0.05, BIKE_DARK, x=sx * 1.2)
    _tube(mb, head_top, (-0.7, 0.98), 0.06, BIKE_DARK)
    mb.box((0, -0.7, 0.98), (0.96, 0.05, 0.05), BIKE_DARK)
    for sx in (-1, 1):
        mb.rbox((sx * 0.42, -0.7, 0.98), (0.12, 0.08, 0.08), "#6A4BD8", radius=0.02)
    mb.box((0, seat[0] + 0.02, seat[1] + 0.04), (0.05, 0.05, 0.1), BIKE_DARK)
    mb.rbox((0, seat[0] + 0.04, seat[1] + 0.09), (0.15, 0.32, 0.06), BIKE_DARK, radius=0.02)
    mb.cyl((0.09, bb[0], bb[1]), 0.1, 0.03, "#C9D3DE", segs=10, rot=(0, math.pi / 2, 0))
    for sx in (-1, 1):
        mb.box((sx * 0.2, bb[0], bb[1]), (0.12, 0.09, 0.03), BIKE_DARK)
    frame = attach(rig, "root", mb, name + ".bike", collection, outline=outline)
    for tag, (y, z) in (("wheelF", front), ("wheelR", rear)):
        w = MeshBuilder()
        w.cyl((0, 0, 0), WHEEL_R, 0.11, BIKE_DARK, segs=18, rot=(0, math.pi / 2, 0))
        w.cyl((0, 0, 0), WHEEL_R * 0.78, 0.115, "#4A4A55", segs=18, rot=(0, math.pi / 2, 0))
        for k in range(3):
            w.box((0, 0, 0), (0.125, WHEEL_R * 1.5, 0.03), "#D8DEE6", rot=(k * math.pi / 3, 0, 0))
        w.cyl((0, 0, 0), 0.06, 0.15, "#C9D3DE", segs=8, rot=(0, math.pi / 2, 0))
        obj = w.to_object(f"{name}.{tag}", collection)
        if outline:
            castlib.add_outline(obj, outline)
        obj.parent = frame
        obj.location = (0, y, z)
    return frame


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



def attach(rig, bone_name, mb, obj_name, collection, bevel=0.0, outline=0.0):
    obj = mb.to_object(obj_name, collection, bevel=bevel)
    if outline:
        castlib.add_outline(obj, outline)
    bone = rig.data.bones[bone_name]
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_parent_inverse = (bone.matrix_local @ Matrix.Translation((0, bone.length, 0))).inverted()
    return obj


EYE_COLORS = {"armor": "#2E8B57"}


SABER_OUTFIT = {"shirt_style": "armor", "shirt_color": "#2A4FB5", "pants_color": "#2A4FB5"}
MTB_PROPS = {"helmet", "gloves", "windbreaker", "bike"}
SQUIRE_PROPS = {"tabard", "satchel", "pennant"}


def build_character(look, name="Cast", collection=None, variant=0, props=(), outfit=None, outline=True):
    """props: extra items for this shot ("sword", "camera", "glow", "cape", "banner", "laptop", "lanyard", "ylogo"),
    on top of look["accessory"]. outfit="saber" swaps in the armour, cape and sword but keeps face and hair; outfit="mtb" adds a trail helmet, gloves,
    a windbreaker in the look's shirt colour and the bike (on the root bone, see animations.apply_action(mounted=True))."""
    collection = collection or bpy.context.scene.collection
    look = sanitize_look(look, variant)
    if outfit == "saber":
        look.update(SABER_OUTFIT)
        if look["accessory"] in ("bowtie", "camera"):
            look["accessory"] = "none"
        props = set(props or ()) | {"sword", "cape"}
    if outfit == "squire":
        look["pants_color"] = look["pants_color"] if luma(look["pants_color"]) < 0.4 else "#3A2A1F"
        props = set(props or ()) | SQUIRE_PROPS
        if "banner" in props:
            props.discard("pennant")
    if outfit in KARATE:
        gi, belt, band = KARATE[outfit]
        look.update({"shirt_style": "tshirt", "shirt_color": gi, "pants_color": gi})
        if look["accessory"] in ("cap", "beanie", "cowboy_hat", "crown", "headphones", "bowtie", "camera", "sword"):
            look["accessory"] = "none"
        props = set(props or ()) | {"gi", "belt:" + belt, "headband:" + band}
    if outfit == "mtb":
        look["shirt_style"] = "hoodie"
        if look["accessory"] in ("cap", "beanie", "cowboy_hat", "crown", "headphones", "bowtie", "camera", "sword"):
            look["accessory"] = "none"
        props = set(props or ()) | MTB_PROPS
    props = set(props or ()) | {look["accessory"]}
    rig = _make_armature(name, collection)
    rig["look"] = str(look)
    rig["mounted"] = "bike" in props
    OUT = 0.011 if outline else 0.0
    hat = look["accessory"] in ("cap", "beanie", "cowboy_hat") or "helmet" in props

    head = MeshBuilder()
    _head_base(head, look)
    _eyes(head, look, EYE_COLORS.get(look["shirt_style"], "#4A2C1A" if luma(look["skin_tone"]) < 0.8 else "#3B6EA5"))
    _facial_hair(head, look["facial_hair"], look)
    _glasses(head, look["glasses"])
    attach(rig, "head", head, name + ".head", collection, outline=OUT)

    hair = MeshBuilder()
    _hair(hair, look, hat)
    if look["shirt_style"] == "armor" and look["hair_style"] in ("bun", "ponytail", "long"):
        _saber_hair(hair, look["hair_color"])
    _accessory_head(hair, look["accessory"], look)
    if "helmet" in props:
        _helmet(hair, look)
    for pr in props:
        if pr.startswith("headband:"):
            _headband(hair, pr[9:])
    if hair.bm.verts:
        attach(rig, "head", hair, name + ".hair", collection, outline=OUT)
    else:
        hair.bm.free()

    lids = MeshBuilder()
    _lids(lids, look)
    lid_obj = attach(rig, "head", lids, name + ".lids", collection)
    lid_obj.hide_render = True
    mouth = MeshBuilder()
    _mouth_open(mouth)
    mouth_obj = attach(rig, "head", mouth, name + ".mouth_open", collection)
    mouth_obj.hide_render = True
    rig["lids"] = lid_obj.name
    for group, kinds, build in (("brows", BROW_KINDS, lambda m, k: _brows(m, look, k)), ("mouth", MOUTH_KINDS, _mouth_kind)):
        for k in kinds:
            mb = MeshBuilder()
            build(mb, k)
            o = attach(rig, "head", mb, f"{name}.{group}_{k}", collection)
            o.hide_render = k != "neutral"
            rig[f"{group}_{k}"] = o.name
    rig["mouth_open"] = mouth_obj.name

    torso = MeshBuilder()
    _torso(torso, look)
    if "camera" in props:
        _camera_rig(torso)
    if "cape" in props:
        _cape(torso)
    if "lanyard" in props:
        _lanyard(torso)
    if "ylogo" in props:
        _y_logo(torso)
    if "windbreaker" in props:
        _windbreaker(torso, look)
    if "gi" in props:
        _gi(torso, look["shirt_color"])
    for pr in props:
        if pr.startswith("belt:"):
            _belt(torso, pr[5:])
    if "tabard" in props:
        _tabard(torso)
    if "satchel" in props:
        _satchel(torso)
    if "pennant" in props:
        _pennant(torso)
    if look["accessory"] == "bowtie":
        bt = "#C1121F" if look["shirt_style"] != "suit" else "#111111"
        for sx in (-1, 1):
            torso.box((sx * 0.06, -0.2, 1.39), (0.1, 0.03, 0.09), bt, rot=(0, sx * 0.3, 0))
        torso.box((0, -0.205, 1.39), (0.045, 0.03, 0.045), shade(bt, 0.7))
    attach(rig, "torso", torso, name + ".torso", collection, outline=OUT)

    style = look["shirt_style"]
    sleeve = "full" if style in ("hoodie", "suit", "jacket", "armor") else ("none" if style == "tanktop" else "short")
    for side, x in (("L", ARM_X), ("R", -ARM_X)):
        arm = MeshBuilder()
        _arm(arm, x, look, sleeve)
        if side == "R" and "sword" in props and "banner" not in props:
            _sword(arm)
        if side == "R" and "banner" in props:
            _banner(arm)
        if "gloves" in props:
            _glove(arm, x)
        if side == "R" and "trophy" in props:
            _trophy(arm, x)
        if side == "R" and "ball" in props:
            arm.ball((x, -0.08, HAND_Z - 0.12), 0.22, "#E2711D", subdiv=2)
        if side == "L" and "horns" in props:
            _horns(arm, x, GLOVE if "gloves" in props else look["skin_tone"])
        if side == "L" and "laptop" in props:
            _laptop(arm)
        if side == "R" and "glow" in props:
            arm.ball((x, -0.01, HAND_Z), 0.15, "#FF1E3C", subdiv=1, mat=1)
            arm.box((x, -0.13, HAND_Z + 0.16), (0.16, 0.02, 0.16), "#FF1E3C", rot=(0, 0.785, 0), mat=1)
        attach(rig, "arm_" + side, arm, f"{name}.arm_{side}", collection, outline=OUT)
        leg = MeshBuilder()
        _leg(leg, x * 0.155 / ARM_X, look)
        attach(rig, "leg_" + side, leg, f"{name}.leg_{side}", collection, outline=OUT)
    if "bike" in props:
        _bike(rig, name, collection, OUT)
    return rig
