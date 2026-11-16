"""Build the procedural blocky town: one collection per location in shared/assetLibrary.json.

Usage: blender -b --factory-startup -P blender/build_town.py [-- out.blend]
Each collection <loc> holds geometry plus empties:
  <loc>.mark.<character_mark>  where characters stand (facing -Y, toward the cameras)
  <loc>.cam.<camera_mark>      camera position; custom prop "target" is the look-at point
Lighting mood lives in collection custom props (sky, sun_color, sun_energy, sun_elev, sun_az, ambient).
"""
import math
import os
import random
import sys
import zlib

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import castlib  # noqa: E402
from castlib import MeshBuilder  # noqa: E402

TOWN_VERSION = 9

CHAR_MARKS = {
    "center": (0.0, 0.0, 0.0),
    "left": (-1.7, 0.4, 0.0),
    "right": (1.7, 0.4, 0.0),
    "back": (0.0, 2.6, 0.0),
}
CAM_MARKS = {
    "wide": ((0.0, -12.0, 3.2), (0.0, 1.5, 2.4), 26),
    "medium": ((0.0, -4.6, 1.7), (0.0, 0.0, 1.15), 38),
    "closeup": ((0.0, -3.0, 1.65), (0.0, 0.0, 1.35), 30),
    "low_angle": ((1.1, -3.6, 0.3), (0.0, 0.0, 1.45), 24),
    "overhead": ((0.0, -3.4, 8.5), (0.0, 0.4, 0.4), 30),
}

WHITE = "#F4F1EA"
DARK = "#2B2D42"


# ---------------------------------------------------------------- props

def building(mb, x, y, w, d, h, col, win="#9AD1F5", lit=False, roof=None, door=True):
    mb.box((x, y + d / 2, h / 2), (w, d, h), col)
    mb.box((x, y + d / 2, h + 0.15), (w + 0.3, d + 0.3, 0.3), roof or castlib.shade(col, 0.7))
    cols = max(1, int(w / 1.6))
    rows = max(1, int((h - 1.2) / 1.8))
    for r in range(rows):
        for c in range(cols):
            wx = x - w / 2 + (c + 0.5) * w / cols
            wz = 2.0 + r * 1.8
            if wz > h - 0.6:
                continue
            if door and r == 0 and c == cols // 2:
                continue
            on = lit and random.random() < 0.6
            mb.box((wx, y - 0.05, wz), (0.8, 0.12, 0.9), "#FFE58A" if on else win, mat=1 if on else 0)
    if door:
        mb.box((x, y - 0.05, 0.9), (1.0, 0.14, 1.8), castlib.shade(col, 0.45))


def tree(mb, x, y, s=1.0, leaf="#3FA34D"):
    mb.box((x, y, 0.9 * s), (0.4 * s, 0.4 * s, 1.8 * s), "#7A4E2D")
    mb.box((x, y, 2.3 * s), (1.8 * s, 1.8 * s, 1.4 * s), leaf)
    mb.box((x, y, 3.2 * s), (1.1 * s, 1.1 * s, 0.8 * s), castlib.shade(leaf, 1.15))


def lamp(mb, x, y, h=3.6, glow="#FFE9A8"):
    mb.box((x, y, h / 2), (0.16, 0.16, h), DARK)
    mb.box((x, y - 0.3, h), (0.12, 0.7, 0.12), DARK)
    mb.box((x, y - 0.6, h - 0.15), (0.35, 0.35, 0.25), glow, mat=1)


def car(mb, x, y, col, rot=0.0):
    ca, sa = math.cos(rot), math.sin(rot)

    def p(dx, dy, z):
        return (x + dx * ca - dy * sa, y + dx * sa + dy * ca, z)
    mb.box(p(0, 0, 0.6), (3.4, 1.6, 0.7), col, rot=(0, 0, rot))
    mb.box(p(-0.2, 0, 1.2), (1.9, 1.45, 0.6), castlib.shade(col, 0.9), rot=(0, 0, rot))
    mb.box(p(-0.2, -0.74, 1.2), (1.6, 0.05, 0.45), "#A8DDF7", rot=(0, 0, rot))
    for dx in (-1.1, 1.1):
        for dy in (-0.8, 0.8):
            mb.cyl(p(dx, dy, 0.38), 0.38, 0.3, "#222222", segs=8, rot=(math.pi / 2, 0, rot))
    mb.box(p(1.72, -0.5, 0.65), (0.05, 0.3, 0.2), "#FFF6C2", rot=(0, 0, rot), mat=1)
    mb.box(p(1.72, 0.5, 0.65), (0.05, 0.3, 0.2), "#FFF6C2", rot=(0, 0, rot), mat=1)


def blocky_figure(mb, x, y, skin, shirt, pants, arms_forward=False, rot=0.0):
    mb.box((x - 0.2, y, 0.35), (0.34, 0.34, 0.7), pants, rot=(0, 0, rot))
    mb.box((x + 0.2, y, 0.35), (0.34, 0.34, 0.7), pants, rot=(0, 0, rot))
    mb.box((x, y, 1.05), (0.75, 0.38, 0.7), shirt, rot=(0, 0, rot))
    mb.box((x, y, 1.62), (0.42, 0.42, 0.42), skin, rot=(0, 0, rot))
    mb.box((x - 0.09, y - 0.215, 1.66), (0.07, 0.02, 0.07), "#E0201B", mat=1)
    mb.box((x + 0.09, y - 0.215, 1.66), (0.07, 0.02, 0.07), "#E0201B", mat=1)
    for sx in (-0.55, 0.55):
        if arms_forward:
            mb.box((x + sx * 0.97, y - 0.35, 1.3), (0.32, 0.7, 0.32), skin)
        else:
            mb.box((x + sx * 0.97, y, 1.05), (0.32, 0.32, 0.7), skin)


def text_object(name, body, collection, loc, size, col, rot=(math.pi / 2, 0, 0), neon=False, extrude=0.05):
    """Text is converted to a vertex-colored mesh so it shares the plastic/neon materials."""
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = size
    curve.extrude = extrude
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    tmp = bpy.data.objects.new(name + "_tmp", curve)
    bpy.context.scene.collection.objects.link(tmp)
    deps = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(deps))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(curve)
    attr = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    rgba = castlib.color(col)
    for d in attr.data:
        d.color = rgba
    plastic, neon_mat = castlib.materials()
    mesh.materials.append(plastic)
    mesh.materials.append(neon_mat)
    for poly in mesh.polygons:
        poly.material_index = 1 if neon else 0
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    collection.objects.link(obj)
    return obj


def ground(mb, col, w=70, d=70, y0=-20):
    mb.box((0, y0 + d / 2, -0.1), (w, d, 0.2), col)


# ---------------------------------------------------------------- locations

def loc_main_street(mb, coll):
    ground(mb, "#7BC86C")
    mb.box((0, 0, 0.0), (70, 6.0, 0.06), "#4A4E5A")
    for x in range(-30, 31, 4):
        mb.box((x, -0.0, 0.04), (1.6, 0.18, 0.02), "#F7D046")
    mb.box((0, 4.5, 0.08), (70, 3.0, 0.16), "#D9D4C7")
    mb.box((0, -4.5, 0.08), (70, 3.0, 0.16), "#D9D4C7")
    palette = ["#F28482", "#84A59D", "#F6BD60", "#7FB7BE", "#B5838D", "#90BE6D", "#F9844A"]
    x = -24
    i = 0
    while x < 24:
        w = random.choice([4, 5, 6])
        h = random.choice([5, 6.5, 8, 10])
        building(mb, x + w / 2, 6.2, w - 0.3, 5, h, palette[i % len(palette)])
        x += w
        i += 1
    for lx in (-6, 6):
        lamp(mb, lx, 3.4)
    tree(mb, -9.5, 4.2, 0.9)
    tree(mb, 9.5, 4.2, 0.9)
    car(mb, -5.5, 1.4, "#E63946")
    car(mb, 7.5, -1.4, "#3A86FF", rot=math.pi)
    mb.box((3.5, 3.8, 0.7), (0.8, 0.8, 1.4), "#3A86FF")


def loc_bank(mb, coll):
    ground(mb, "#9CC47A")
    mb.box((0, 0, 0.0), (70, 7.0, 0.06), "#4A4E5A")
    mb.box((0, 4.0, 0.08), (70, 2.0, 0.16), "#D9D4C7")
    mb.box((0, 9, 3.5), (16, 8, 7), "#ECE6D6")
    for i in range(3):
        mb.box((0, 4.6 + i * 0.35, 0.15 + i * 0.3), (12 - i * 0.6, 0.6, 0.3), "#D8D1BE")
    for cx in (-5, -3, -1, 1, 3, 5):
        mb.cyl((cx, 4.6, 3.6), 0.38, 5.4, WHITE, segs=10)
        mb.box((cx, 4.6, 6.4), (1.0, 1.0, 0.3), WHITE)
    mb.box((0, 4.9, 7.0), (14, 1.6, 0.8), "#E4DCC6")
    for k, w in enumerate((13.0, 10.0, 7.0, 4.0)):
        mb.box((0, 5.2, 7.65 + k * 0.45), (w, 1.4, 0.45), "#E4DCC6")
    mb.box((0, 5.1, 2.0), (2.4, 0.3, 3.6), "#5B4636")
    mb.cyl((0, 4.92, 2.0), 0.9, 0.1, "#C9A227", segs=12, rot=(math.pi / 2, 0, 0))
    text_object("bank_sign", "BANK", coll, (0, 4.05, 7.0), 0.75, "#C9A227")
    for gx in (-7.5, 7.5):
        mb.box((gx, 4.0, 0.7), (1.0, 1.0, 1.4), "#ECE6D6")
        mb.box((gx, 4.0, 1.6), (0.7, 0.7, 0.5), "#C9A227")
    car(mb, 6.5, -1.6, "#111111", rot=math.pi)
    building(mb, -15, 6, 9, 6, 9, "#B8C0FF")
    building(mb, 15, 6, 9, 6, 11, "#FFC8DD")
    lamp(mb, -4.0, 3.2)
    lamp(mb, 4.0, 3.2)


def loc_park(mb, coll):
    ground(mb, "#6CC551")
    mb.box((0, 4, 0.02), (3, 40, 0.04), "#E9D8A6")
    mb.box((0, -1.5, 0.02), (40, 2.5, 0.04), "#E9D8A6")
    random.seed(7)
    for (tx, ty, s) in [(-6, 5, 1.2), (-9, 10, 1.4), (6.5, 6, 1.1), (10, 11, 1.5), (-12, 2, 1.0),
                        (12, 2.5, 1.0), (-4, 14, 1.3), (4.5, 15, 1.2), (0, 20, 1.6)]:
        tree(mb, tx, ty, s, random.choice(["#3FA34D", "#52B788", "#2D6A4F", "#80B918"]))
    mb.box((-4.0, 2.4, 0.45), (2.4, 0.6, 0.1), "#A0522D")
    mb.box((-4.0, 2.7, 0.8), (2.4, 0.1, 0.6), "#A0522D")
    for bx in (-5.0, -3.0):
        mb.box((bx, 2.5, 0.2), (0.12, 0.5, 0.4), DARK)
    mb.cyl((4.5, 3.5, 0.3), 1.6, 0.6, "#CED4DA", segs=12)
    mb.cyl((4.5, 3.5, 0.62), 1.4, 0.06, "#4CC9F0", segs=12)
    mb.cyl((4.5, 3.5, 1.1), 0.25, 1.4, "#CED4DA", segs=8)
    mb.cyl((4.5, 3.5, 1.85), 0.7, 0.2, "#CED4DA", segs=8)
    mb.cyl((-7, 9, 0.03), 3.0, 0.06, "#4CC9F0", segs=12)
    for i in range(40):
        fx, fy = random.uniform(-14, 14), random.uniform(1.5, 16)
        if abs(fx) < 2:
            continue
        mb.box((fx, fy, 0.15), (0.25, 0.25, 0.25), random.choice(["#FF5D8F", "#FFD166", "#F8F9FA", "#C77DFF"]))
    lamp(mb, 2.5, 1.0)


def loc_rooftop(mb, coll):
    mb.box((0, 4, -0.2), (16, 20, 0.4), "#A9B4C9")
    mb.cyl((-2.5, 7.5, 0.01), 2.2, 0.02, "#FFD166", segs=16)
    mb.cyl((-2.5, 7.5, 0.02), 1.9, 0.02, "#A9B4C9", segs=16)
    mb.box((-3.1, 7.5, 0.03), (0.25, 1.6, 0.02), "#FFD166")
    mb.box((-1.9, 7.5, 0.03), (0.25, 1.6, 0.02), "#FFD166")
    mb.box((-2.5, 7.5, 0.03), (1.2, 0.25, 0.02), "#FFD166")
    for k in range(9):
        mb.ball((-7.6 + k * 1.9, 13.6, 2.4 - 0.3 * math.sin(k * 0.9)), 0.12, ["#FF5D8F", "#FFD166", "#4CC9F0"][k % 3], mat=1)
    mb.box((0, 13.6, 2.3), (16, 0.03, 0.03), DARK)
    for x in (-8, 8):
        mb.box((x, 4, 0.4), (0.4, 20, 0.8), "#6C757D")
    mb.box((0, 14, 0.4), (16, 0.4, 0.8), "#6C757D")
    mb.box((-5, 6, 0.6), (2.0, 1.4, 1.2), "#ADB5BD")
    mb.box((-5, 5.25, 0.6), (1.2, 0.1, 0.8), "#6C757D")
    mb.box((5.5, 8, 2.5), (0.2, 0.2, 5), "#5C4033")
    mb.cyl((5.5, 9, 4.6), 1.5, 2.6, "#A0522D", segs=10)
    mb.cyl((5.5, 9, 6.3), 1.6, 0.9, "#6B3E26", segs=10, radius2=0.1)
    mb.box((3, 3.5, 1.0), (1.2, 1.2, 2.0), "#CED4DA")
    mb.box((3, 2.85, 1.3), (0.6, 0.08, 1.4), "#495057")
    mb.box((-6, 12, 3.0), (0.15, 0.15, 6), "#ADB5BD")
    mb.box((-6, 12, 6.0), (1.2, 0.1, 0.1), "#E63946", mat=1)


def loc_alley(mb, coll):
    ground(mb, "#4B4B55", w=14, d=50)
    for side in (-1, 1):
        x = side * 3.8
        mb.box((x + side * 1.0, 10, 6), (2.0, 40, 12), "#9C4A3C")
        for yy in range(-6, 26, 2):
            for zz in range(1, 12, 2):
                mb.box((x - side * 0.02, yy + (zz % 4) * 0.25, zz), (0.06, 1.7, 0.08), "#7D3B2F")
        for yy in (2, 9, 16):
            mb.box((x - side * 0.05, yy, 3.5), (0.12, 1.1, 1.3), "#2E3A59")
            mb.box((x - side * 0.05, yy, 6.5), (0.12, 1.1, 1.3), "#FFD166" if yy == 9 else "#2E3A59",
                   mat=1 if yy == 9 else 0)
        for zz in (3.0, 6.0):
            mb.box((x - side * 0.8, 9, zz - 0.8), (1.4, 3.0, 0.08), "#343A40")
            mb.box((x - side * 1.45, 9, zz - 0.3), (0.06, 3.0, 0.9), "#343A40")
    mb.box((-2.3, 4, 0.7), (1.6, 2.6, 1.4), "#2D6A4F")
    mb.box((-2.3, 4, 1.45), (1.7, 2.7, 0.12), "#1B4332")
    for (bx, by) in [(2.4, 3.0), (2.8, 3.8), (2.2, 4.4)]:
        mb.ball((bx, by, 0.35), 0.45, "#212529", subdiv=1)
    mb.box((2.6, 7.5, 0.5), (0.8, 0.8, 1.0), "#6C757D")
    mb.box((0, 25, 6), (8, 1, 12), "#5E2F25")
    mb.box((-2.7, 6, 3.2), (0.6, 0.15, 0.3), "#FFE9A8", mat=1)
    for i in range(6):
        mb.box((random.uniform(-2, 2), random.uniform(1, 12), 0.02), (random.uniform(0.6, 1.5), random.uniform(0.6, 1.5), 0.02), "#2F3E46")


def loc_casino(mb, coll):
    mb.box((0, 8, -0.1), (40, 30, 0.2), "#7B1E3A")
    for i in range(-16, 17, 4):
        mb.box((i, 8, 0.01), (0.3, 30, 0.02), "#C9A227")
    mb.box((0, 14, 5), (40, 0.4, 10), "#1A1033")
    for side in (-1, 1):
        mb.box((side * 12, 8, 5), (0.4, 14, 10), "#1A1033")
    text_object("casino_sign", "CASINO", coll, (0, 13.7, 6.3), 2.2, "#FF2E97", neon=True)
    mb.box((0, 13.75, 6.3), (10.5, 0.1, 0.12), "#00F5FF", mat=1)
    mb.box((0, 13.75, 7.8), (10.5, 0.1, 0.12), "#00F5FF", mat=1)
    neon_cols = ["#FF2E97", "#00F5FF", "#FFE600", "#7CFF4F"]
    for i, sx in enumerate((-8, -5.5, 5.5, 8)):
        mb.box((sx, 10.5, 1.1), (1.6, 1.2, 2.2), "#2B2D42")
        mb.box((sx, 9.85, 1.5), (1.2, 0.08, 0.7), neon_cols[i], mat=1)
        mb.box((sx, 10.5, 2.4), (1.6, 1.2, 0.35), neon_cols[(i + 1) % 4], mat=1)
        mb.box((sx + 0.9, 10.5, 1.3), (0.1, 0.1, 0.8), "#C0C0C0")
    for tx in (-4.5, 4.5):
        mb.cyl((tx, 5.5, 0.4), 0.3, 0.8, "#3D2817", segs=8)
        mb.cyl((tx, 5.5, 0.85), 1.6, 0.12, "#1E7B3B", segs=16)
        mb.cyl((tx, 5.5, 0.8), 1.75, 0.14, "#5C3A21", segs=16)
        for k in range(5):
            mb.cyl((tx - 0.6 + k * 0.3, 5.0, 0.95 + 0.0), 0.12, 0.08 + k * 0.05, neon_cols[k % 4], segs=8)
    for side in (-1, 1):
        mb.box((side * 11.7, 8, 3.5), (0.1, 13, 0.12), "#FF2E97", mat=1)
        mb.box((side * 11.7, 8, 7.0), (0.1, 13, 0.12), "#00F5FF", mat=1)
    mb.box((0, 13.6, 2.2), (2.6, 0.2, 4.4), "#C9A227")
    mb.cyl((0, 13.45, 2.2), 1.0, 0.15, "#E9C46A", segs=12, rot=(math.pi / 2, 0, 0))
    for (cx, cy) in [(-1.5, -1.0), (1.2, -1.6), (2.0, 2.0)]:
        mb.cyl((cx, cy, 0.03), 0.18, 0.06, random.choice(neon_cols), segs=8)


def loc_wasteland(mb, coll):
    ground(mb, "#9C6644")
    random.seed(3)
    for i in range(30):
        mb.box((random.uniform(-25, 25), random.uniform(-2, 30), 0.0),
               (random.uniform(1, 4), random.uniform(1, 4), random.uniform(0.1, 0.4)), "#7F5539")
    for (bx, by, w, h) in [(-11, 14, 6, 9), (-3, 20, 5, 13), (8, 16, 7, 7), (15, 24, 6, 12), (-18, 22, 6, 6)]:
        mb.box((bx, by, h / 2), (w, 4, h), "#6D6875")
        for k in range(4):
            mb.box((bx + random.uniform(-w / 2, w / 2), by - 2.05, random.uniform(1, h - 1)), (0.9, 0.12, 1.0), "#1B1B1E")
        mb.box((bx + w / 3, by, h + 0.6), (w / 3, 4, 1.2), "#6D6875")
    car(mb, -5.5, 3.5, "#5E503F", rot=0.4)
    for tx, ty in [(6, 4), (-9, 7), (11, 9)]:
        mb.box((tx, ty, 1.4), (0.3, 0.3, 2.8), "#3E2C1C")
        mb.box((tx + 0.4, ty, 2.2), (0.8, 0.2, 0.2), "#3E2C1C", rot=(0, 0.5, 0))
        mb.box((tx - 0.35, ty, 1.8), (0.7, 0.2, 0.2), "#3E2C1C", rot=(0, -0.6, 0))
    for (zx, zy, rot) in [(-4, 6, 0.2), (4.5, 7, -0.3), (-1.5, 10, 0.0), (8, 11, -0.5), (-8, 11, 0.4)]:
        blocky_figure(mb, zx, zy, "#7FB069", random.choice(["#4A4E69", "#6B705C", "#9A8C98"]), "#3D405B", arms_forward=True, rot=rot)
    for i in range(6):
        mb.box((random.uniform(-14, 14), random.uniform(3, 14), 0.25), (0.5, 0.5, 0.5), "#B08968")
    mb.box((3, 3, 0.45), (0.7, 0.7, 0.9), "#E63946")
    mb.box((3, 3, 0.95), (0.4, 0.4, 0.1), "#222222")


def loc_spaceship(mb, coll):
    mb.box((0, 5, -0.1), (16, 22, 0.2), "#ADB5BD")
    for i in range(-7, 8, 2):
        mb.box((i, 5, 0.01), (0.06, 22, 0.02), "#6C757D")
    mb.box((0, 12, 6), (16, 0.4, 12), "#DEE2E6")
    mb.box((0, 11.75, 4.0), (11, 0.1, 5.0), "#05060F")
    random.seed(5)
    for i in range(70):
        mb.box((random.uniform(-5.3, 5.3), 11.65, random.uniform(1.7, 6.3)), (0.05, 0.02, 0.05), "#FFFFFF", mat=1)
    mb.ball((3.0, 11.6, 5.0), 1.2, "#F77F00", subdiv=2, scale=(1, 0.1, 1))
    mb.ball((-3.5, 11.6, 2.6), 0.5, "#4CC9F0", subdiv=2, scale=(1, 0.1, 1))
    for side in (-1, 1):
        mb.box((side * 8, 5, 4), (0.4, 22, 8), "#CED4DA")
        for yy in (0, 4, 8):
            mb.box((side * 7.75, yy, 2.5), (0.1, 2.6, 1.5), "#0B132B")
            mb.box((side * 7.7, yy, 2.5), (0.05, 2.2, 1.1), "#3A86FF", mat=1)
            mb.box((side * 7.7, yy + 1.5, 4.5), (0.05, 0.2, 2.5), "#E63946", mat=1)
        mb.box((side * 7.8, 5, 0.3), (0.2, 22, 0.08), "#00F5FF", mat=1)
    for cx in (-4.0, 4.0):
        mb.box((cx, 7.6, 0.5), (3.4, 1.4, 1.0), "#495057")
        mb.box((cx, 7.3, 1.05), (3.2, 1.0, 0.1), "#212529", rot=(-0.3, 0, 0))
        for k in range(6):
            mb.box((cx - 1.2 + k * 0.48, 7.0, 1.12), (0.25, 0.25, 0.06), ["#E63946", "#FFD166", "#06D6A0"][k % 3], mat=1, rot=(-0.3, 0, 0))
        mb.box((cx, 8.1, 1.6), (2.0, 0.1, 1.0), "#0B132B", rot=(0.2, 0, 0))
        mb.box((cx, 8.05, 1.6), (1.8, 0.05, 0.85), "#06D6A0", rot=(0.2, 0, 0), mat=1)
    mb.box((0, 4.5, 0.25), (1.4, 1.4, 0.5), "#6C757D")
    mb.box((0, 5.3, 1.2), (1.4, 0.3, 1.6), "#E63946")
    mb.box((0, 4.5, 0.6), (1.3, 1.3, 0.2), "#E63946")
    for z, y in ((9.5, 4), (9.5, 8)):
        mb.box((0, y, z), (16, 0.6, 0.6), "#CED4DA")
        mb.box((0, y - 0.31, z - 0.2), (12, 0.04, 0.08), "#00F5FF", mat=1)


def loc_cafe(mb, coll):
    mb.box((0, 6, -0.1), (20, 20, 0.2), "#B07D62")
    for i in range(-9, 10):
        mb.box((i, 6, 0.005), (0.04, 20, 0.02), "#8A5A44")
    mb.box((0, 11, 4), (20, 0.4, 8), "#F3D5B5")
    mb.box((0, 10.75, 0.6), (20, 0.1, 1.2), "#8A5A44")
    for side in (-1, 1):
        mb.box((side * 9, 6, 4), (0.4, 14, 8), "#E8C39E")
    mb.box((-4.5, 10.7, 4.0), (4.5, 0.1, 2.6), "#A8DADC")
    mb.box((-4.5, 10.65, 4.0), (0.1, 0.1, 2.6), "#FFFFFF")
    mb.box((-4.5, 10.65, 4.0), (4.5, 0.1, 0.1), "#FFFFFF")
    mb.box((4.0, 10.7, 4.2), (3.4, 0.1, 2.2), "#2B2D42")
    for k in range(4):
        mb.box((4.0, 10.6, 4.9 - k * 0.45), (2.4 - (k % 2) * 0.6, 0.02, 0.1), "#F8F9FA")
    text_object("cafe_sign", "CAFE", coll, (4.0, 10.6, 5.7), 0.45, "#FFD166")
    mb.box((3.0, 8.2, 0.55), (7, 1.0, 1.1), "#6F4518")
    mb.box((3.0, 8.2, 1.15), (7.2, 1.2, 0.1), "#DDB892")
    mb.box((4.5, 8.3, 1.55), (0.8, 0.6, 0.7), "#ADB5BD")
    mb.box((4.5, 8.0, 1.35), (0.2, 0.15, 0.1), "#212529")
    for k in range(3):
        mb.cyl((1.6 + k * 0.5, 8.0, 1.3), 0.1, 0.2, ["#FFFFFF", "#E76F51", "#2A9D8F"][k], segs=8)
    for (tx, ty) in [(-4.5, 3.5), (4.5, 3.0)]:
        mb.cyl((tx, ty, 0.4), 0.08, 0.8, DARK, segs=6)
        mb.cyl((tx, ty, 0.82), 0.8, 0.08, "#F8F9FA", segs=12)
        mb.cyl((tx + 0.2, ty, 0.92), 0.1, 0.14, "#FFFFFF", segs=8)
        for dx in (-1.1, 1.1):
            mb.box((tx + dx, ty, 0.45), (0.5, 0.5, 0.08), "#C1121F")
            mb.box((tx + dx * 1.2, ty, 0.8), (0.08, 0.5, 0.7), "#C1121F")
            mb.box((tx + dx, ty, 0.2), (0.06, 0.06, 0.4), DARK)
    for lx in (-3, 0, 3):
        mb.box((lx, 6, 7), (0.03, 0.03, 2.0), DARK)
        mb.cyl((lx, 6, 5.85), 0.35, 0.3, "#E9C46A", segs=8, radius2=0.12)
        mb.ball((lx, 6, 5.65), 0.14, "#FFF3B0", mat=1)
    for px in (-8, 8):
        mb.cyl((px, 9.5, 0.35), 0.35, 0.7, "#BC6C25", segs=8)
        mb.ball((px, 9.5, 1.1), 0.6, "#40916C", subdiv=1)


def kaiju(k):
    green, belly = "#3BB273", "#C5E063"
    kx, ky = 0.0, 0.0
    k.box((kx - 2.2, ky, 4), (2.4, 2.6, 8), green)
    k.box((kx + 2.2, ky, 4), (2.4, 2.6, 8), green)
    k.box((kx, ky, 13), (7.5, 5, 10), green)
    k.box((kx, ky - 2.55, 12.5), (5, 0.2, 8), belly)
    k.box((kx, ky + 4, 9), (3, 6, 3), green, rot=(0.3, 0, 0))
    k.box((kx, ky + 8, 7.5), (2, 5, 2), green, rot=(0.3, 0, 0))
    k.box((kx, ky - 1.2, 20.5), (4.8, 5.5, 4.0), green)
    k.box((kx, ky - 4.2, 19.6), (4.2, 2.0, 2.2), green)
    k.box((kx, ky - 4.3, 18.4), (4.0, 1.8, 0.6), "#F8F9FA")
    k.box((kx, ky - 4.0, 18.0), (3.8, 1.8, 0.8), green)
    for ex in (-1.4, 1.4):
        k.box((kx + ex, ky - 4.0, 21.6), (0.9, 0.2, 0.6), "#FFEE32", mat=1)
    for side in (-1, 1):
        k.box((kx + side * 4.6, ky - 2.0, 14.5), (1.6, 4.0, 1.6), green, rot=(0.6, 0, 0))
        for c in (-0.5, 0.0, 0.5):
            k.box((kx + side * 4.6 + c, ky - 4.3, 13.4), (0.25, 0.6, 0.25), "#F8F9FA")
    for i in range(6):
        k.box((kx, ky + 2.0 + i * 1.2, 18.5 - i * 1.5), (0.6, 1.0, 1.6), "#F77F00", rot=(0.785, 0, 0))


def loc_kaiju_city(mb, coll):
    ground(mb, "#5C677D")
    mb.box((0, 0, 0.0), (70, 6.0, 0.06), "#3D405B")
    random.seed(13)
    palette = ["#E5989B", "#B5838D", "#6D6875", "#FFB4A2", "#83C5BE", "#006D77"]
    for (bx, by, w, h) in [(-12, 8, 5, 12), (-6.5, 12, 4, 16), (7, 10, 5, 14), (13, 7, 5, 9), (-16, 15, 6, 20), (17, 16, 6, 18)]:
        building(mb, bx, by, w, 4, h, random.choice(palette), lit=True, door=False)
    building(mb, 3.6, 6, 3.4, 3, 6, "#E5989B", door=False)
    mb.box((3.6, 6.5, 6.5), (2.2, 2.6, 1.0), "#6D6875", rot=(0.2, 0.3, 0.1))
    k = MeshBuilder()
    kaiju(k)
    obj = k.to_object("kaiju_city.kaiju", coll)
    obj.location = (-0.5, 27.0, 0.0)
    obj.scale = (0.78, 0.78, 0.78)
    for i in range(6):
        mb.ball((random.choice([-1, 1]) * random.uniform(5, 12), random.uniform(18, 26), random.uniform(1, 4)), random.uniform(1.2, 2.0), "#ADB5BD", subdiv=1)
    for i in range(3):
        mb.ball((random.uniform(-9, 9), random.uniform(16, 22), random.uniform(0.5, 1.5)), random.uniform(0.6, 1.0), "#FF7B00", subdiv=1, mat=1)
    car(mb, 6, -1.4, "#FFBE0B", rot=math.pi + 0.3)
    car(mb, -6.5, 1.0, "#3A86FF", rot=-0.2)


def loc_saloon(mb, coll):
    ground(mb, "#E3B778")
    random.seed(17)
    mb.box((0, 9, 3.5), (12, 6, 7), "#9C6644")
    mb.box((0, 5.95, 8.0), (12, 0.3, 3.0), "#7F5539")
    for k in range(14):
        mb.box((-5.6 + k * 0.86, 5.98, 3.5), (0.05, 0.08, 7.0), "#7F5539")
    mb.box((0, 4.6, 3.3), (12.4, 3.0, 0.2), "#B08968")
    for px in (-5.8, -2, 2, 5.8):
        mb.box((px, 3.3, 1.6), (0.25, 0.25, 3.2), "#7F5539")
    mb.box((0, 4.5, 0.15), (12.4, 3.0, 0.3), "#B08968")
    text_object("saloon_sign", "SALOON", coll, (0, 5.75, 8.0), 1.3, "#FFF1C1")
    mb.box((-0.55, 5.95, 1.6), (1.0, 0.1, 1.2), "#DDB892")
    mb.box((0.55, 5.95, 1.6), (1.0, 0.1, 1.2), "#DDB892")
    for wx in (-4, 4):
        mb.box((wx, 5.95, 2.0), (2.0, 0.1, 1.4), "#FFD166", mat=1)
    building(mb, -12, 7, 7, 5, 6, "#B5838D", win="#FFE8A3", door=True)
    building(mb, 12, 7, 7, 5, 5, "#A3B18A", win="#FFE8A3", door=True)
    mb.box((-4.5, 1.5, 0.9), (2.6, 0.12, 0.12), "#7F5539")
    for hx in (-5.7, -3.3):
        mb.box((hx, 1.5, 0.5), (0.15, 0.15, 1.0), "#7F5539")
    for (bx, by) in [(4.2, 2.0), (4.9, 2.5)]:
        mb.cyl((bx, by, 0.5), 0.4, 1.0, "#7F4F24", segs=8)
        mb.cyl((bx, by, 0.5), 0.42, 0.08, "#343A40", segs=8)
    for (cx, cy, s) in [(-9, 2, 1.0), (10, 3, 1.3), (-15, 13, 1.6), (16, 14, 1.4), (7, 16, 1.1)]:
        mb.box((cx, cy, 1.2 * s), (0.6 * s, 0.6 * s, 2.4 * s), "#2D6A4F")
        mb.box((cx + 0.6 * s, cy, 1.3 * s), (0.6 * s, 0.4 * s, 0.4 * s), "#2D6A4F")
        mb.box((cx + 0.8 * s, cy, 1.8 * s), (0.4 * s, 0.4 * s, 1.0 * s), "#2D6A4F")
        mb.box((cx - 0.6 * s, cy, 1.6 * s), (0.6 * s, 0.4 * s, 0.4 * s), "#2D6A4F")
        mb.box((cx - 0.8 * s, cy, 2.0 * s), (0.4 * s, 0.4 * s, 0.8 * s), "#2D6A4F")
    for i in range(8):
        mb.box((random.uniform(-25, 25), random.uniform(25, 45), 2), (random.uniform(6, 14), 6, random.uniform(3, 8)), "#C97C5D")
    mb.ball((-2.5, 2.5, 0.35), 0.4, "#A98467", subdiv=1)


def point_light(coll, name, loc, color, energy, radius=0.3, shadow=False):
    data = bpy.data.lights.new(name, "POINT")
    data.color = castlib.color(color)[:3]
    data.energy = energy
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    data.use_shadow = shadow
    obj.location = loc
    coll.objects.link(obj)
    return obj


def loc_summoning_room(mb, coll):
    random.seed(21)
    for ix in range(-9, 10):
        for iy in range(-8, 9):
            c = random.choice(["#2A2833", "#302D3A", "#26232E", "#34313F"])
            mb.box((ix * 1.5, iy * 1.5 - 1.0, -0.1), (1.46, 1.46, 0.2), c)
    mb.box((0, 11.0, 5), (30, 1.0, 10), "#1E1B25")
    for k in range(-6, 7):
        for row in range(5):
            mb.box((k * 2.2 + (row % 2) * 1.1, 10.45, 0.6 + row * 2.0), (2.1, 0.12, 0.08), "#2E2A38")
    for px in (-7.5, -3.6, 3.6, 7.5):
        mb.box((px, 9.9, 4.5), (1.3, 1.3, 9), "#3A3645")
        mb.box((px, 9.9, 0.3), (1.7, 1.7, 0.6), "#433E52")
        mb.box((px, 9.2, 5.6), (0.9, 0.08, 3.2), "#7A1022")
        mb.box((px, 9.18, 4.2), (0.9, 0.08, 0.3), "#C9A227")
    for wx in (-5.5, 0.0, 5.5):
        mb.box((wx, 10.45, 6.0), (0.7, 0.1, 2.4), "#3F6FD8", mat=1)
        mb.box((wx, 10.45, 7.3), (0.4, 0.1, 0.3), "#3F6FD8", mat=1)
    for side in (-1, 1):
        mb.box((side * 12, 2, 5), (1.0, 20, 10), "#1E1B25")
    castlib.magic_circle(mb, (0, 0.3, 0.01), 3.3, "#9FD8FF")
    for k in range(10):
        a = 2 * math.pi * k / 10 + 0.2
        cx, cy = 4.3 * math.cos(a), 0.3 + 4.3 * math.sin(a)
        if cy < -2.0:
            continue
        for j in range(random.randint(1, 3)):
            ox, oy = random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25)
            h = random.uniform(0.25, 0.7)
            mb.cyl((cx + ox, cy + oy, h / 2), 0.07, h, "#EFE6D2", segs=6)
            mb.ball((cx + ox, cy + oy, h + 0.07), 0.055, "#FFB347", subdiv=1, mat=1)
    for (cx, cy) in [(-9, 7), (9, 7), (-9.5, 2), (9.5, 2)]:
        mb.cyl((cx, cy, 0.6), 0.3, 1.2, "#3A3645", segs=8)
        for j in range(3):
            mb.cyl((cx - 0.15 + j * 0.15, cy, 1.4), 0.06, 0.4, "#EFE6D2", segs=6)
            mb.ball((cx - 0.15 + j * 0.15, cy, 1.66), 0.05, "#FFB347", subdiv=1, mat=1)
    point_light(coll, "summoning_room.circle_light", (0, 0.3, 1.2), "#9FD8FF", 500, 1.0)
    point_light(coll, "summoning_room.candles_L", (-5, 3, 1.5), "#FFA040", 150, 0.5)
    point_light(coll, "summoning_room.candles_R", (5, 3, 1.5), "#FFA040", 150, 0.5)


def y_logo(mb, center, size, bg="#F26522", fg="#FFFFFF", mat_bg=0, mat_fg=0, plane="xz"):
    """Square YC-style badge with a blocky Y, facing -Y."""
    x, y, z = center
    mb.rbox((x, y, z), (size, 0.12, size), bg, radius=size * 0.06, mat=mat_bg)
    w = size * 0.13
    for sx in (-1, 1):
        mb.box((x + sx * size * 0.14, y - 0.08, z + size * 0.15), (w, 0.04, size * 0.4), fg, rot=(0, sx * 0.62, 0), mat=mat_fg)
    mb.box((x, y - 0.08, z - size * 0.17), (w, 0.04, size * 0.36), fg, mat=mat_fg)


def loc_yc_hq(mb, coll):
    mb.box((0, 6, -0.1), (30, 26, 0.2), "#D9D4CC")
    for i in range(-14, 15, 2):
        mb.box((i, 6, 0.005), (0.04, 26, 0.01), "#C8C2B8")
    mb.box((0, 12, 5), (30, 0.4, 10), "#F4F1EA")
    mb.box((0, 11.75, 1.0), (30, 0.1, 2.0), "#E9E4DA")
    for side in (-1, 1):
        mb.box((side * 13, 6, 5), (0.4, 14, 10), "#EDE8DF")
    mb.box((0, 8.5, 0.35), (12, 4, 0.7), "#2B2D42")
    mb.box((0, 6.48, 0.35), (12, 0.04, 0.7), "#F26522", mat=1)
    y_logo(mb, (0, 11.5, 5.2), 4.0, mat_fg=1)
    mb.box((0, 11.4, 8.3), (11, 0.1, 1.5), "#F26522")
    text_object("yc_hq_demo_day", "DEMO DAY", coll, (0, 11.3, 8.25), 1.05, "#FFFFFF", extrude=0.03)
    for sx in (-1, 1):
        mb.box((sx * 8.5, 11.45, 4.5), (3.2, 0.08, 4.5), "#FFF4E6")
        mb.box((sx * 8.5, 11.4, 4.5), (2.8, 0.06, 0.12), "#F26522")
        for k in range(3):
            mb.box((sx * 8.5, 11.4, 3.6 + k * 0.45), (2.4, 0.06, 0.08), "#9AA0A6")
    for row in range(2):
        for k in range(-5, 6):
            if abs(k) < 2:
                continue
            x, y = k * 1.3, 3.0 + row * 1.6
            mb.rbox((x, y, 0.45), (0.8, 0.8, 0.12), "#2B2D42", radius=0.04)
            mb.rbox((x, y + 0.35, 0.85), (0.8, 0.12, 0.8), "#2B2D42", radius=0.04)
            mb.box((x, y, 0.2), (0.1, 0.1, 0.4), "#555B66")
    for sx in (-1, 1):
        mb.box((sx * 4.2, 7.6, 1.15), (1.6, 0.8, 0.06), "#C9CDD3")
        mb.box((sx * 4.2, 7.9, 1.4), (1.5, 0.05, 0.9), "#1B1B1F", rot=(-0.25, 0, 0))
        mb.box((sx * 4.2, 7.87, 1.42), (1.3, 0.02, 0.7), "#58C4F6", rot=(-0.25, 0, 0), mat=1)
    for k in range(-3, 4):
        mb.cyl((k * 3.2, 7.0, 9.6), 0.25, 0.4, "#2B2D42", segs=8)
        mb.cyl((k * 3.2, 7.0, 9.35), 0.18, 0.05, "#FFF3C4", segs=8, mat=1)
    for px in (-11.5, 11.5):
        mb.cyl((px, 10.5, 0.45), 0.45, 0.9, "#E9E4DA", segs=8)
        mb.ball((px, 10.5, 1.5), 0.8, "#3FA34D", subdiv=1)
    point_light(coll, "yc_hq.stage", (0, 5, 5), "#FFE2C4", 1500, 2.0)


def merlons(mb, x0, x1, y, z, depth, col, w=1.0, h=1.0):
    n = int((x1 - x0) / (w * 2))
    for k in range(n + 1):
        mb.box((x0 + k * w * 2, y, z + h / 2), (w, depth, h), col)


def capy_banner(coll, mb, x, y, z, h=6.0, w=2.2, name="banner"):
    mb.box((x, y, z - h / 2), (w, 0.08, h), "#F2994A")
    mb.box((x, y - 0.03, z - h / 2), (w * 0.82, 0.04, h * 0.92), "#E07A1F")
    mb.box((x, y - 0.06, z - h + 0.25), (w, 0.04, 0.3), "#FFF1D6")
    mb.box((x, y + 0.1, z + 0.1), (w + 0.4, 0.15, 0.15), "#5B3A1E")
    text_object(name, "C\nA\nP\nY", coll, (x, y - 0.09, z - h * 0.45), w * 0.5, "#FFFFFF", extrude=0.02)


def castle_keep(mb, coll, y0=14.0, base_z=0.0, stone="#8E8A9C", dark="#5F5A70"):
    mb.box((0, y0 + 1.5, base_z + 4.5), (30, 3, 9), stone)
    merlons(mb, -15, 15, y0, base_z + 9, 3.0, stone)
    for k in range(-14, 15, 2):
        mb.box((k, y0 - 0.02, base_z + 1 + (k % 4)), (1.6, 0.04, 0.06), dark)
    for tx in (-11, 11):
        mb.cyl((tx, y0 + 1.5, base_z + 6.5), 3.0, 13, stone, segs=10)
        mb.cyl((tx, y0 + 1.5, base_z + 15.5), 3.4, 5, "#2B4FA8", segs=10, radius2=0.0)
        for k in range(3):
            mb.box((tx, y0 - 1.5, base_z + 4 + k * 3), (0.5, 0.2, 1.0), "#FFC66B", mat=1)
    mb.box((0, y0 + 1.5, base_z + 6.5), (8, 4, 13), stone)
    merlons(mb, -4, 4, y0 - 0.4, base_z + 13, 4.6, stone, w=0.9)
    mb.box((0, y0 - 0.55, base_z + 2.6), (3.6, 0.2, 5.2), "#2A1E17")
    for k in range(-3, 4):
        mb.box((k * 0.5, y0 - 0.7, base_z + 2.6), (0.08, 0.08, 5.0), "#3D3D46")
    for k in range(6):
        mb.box((0, y0 - 0.7, base_z + 0.5 + k * 0.9), (3.4, 0.08, 0.08), "#3D3D46")
    for bx in (-6.5, 6.5):
        capy_banner(coll, mb, bx, y0 - 0.1, base_z + 8.6, name=f"{coll.name}.banner{int(bx)}")
    capy_banner(coll, mb, 0, y0 - 0.75, base_z + 12.5, h=4.4, w=2.6, name=f"{coll.name}.banner_gate")
    for tx in (-3.2, 3.2):
        mb.box((tx, y0 - 0.7, base_z + 3.5), (0.15, 0.3, 0.6), "#5B3A1E")
        mb.ball((tx, y0 - 0.8, base_z + 4.0), 0.22, "#FF9F1C", subdiv=1, mat=1)


def loc_capy_castle(mb, coll):
    mb.box((0, 10, -0.1), (90, 80, 0.2), "#5E7F3A")
    mb.box((0, 7, 0.0), (4, 14, 0.04), "#B79B6B")
    random.seed(31)
    for i in range(60):
        mb.box((random.uniform(-40, 40), random.uniform(-15, 40), 0.03),
               (random.uniform(0.6, 2.5), random.uniform(0.6, 2.5), 0.05), random.choice(["#4F6E30", "#6D8F45", "#58783A"]))
    castle_keep(mb, coll, y0=16.0)
    for (hx, hy, hw, hh) in [(-40, 50, 30, 10), (0, 60, 40, 14), (40, 52, 30, 9)]:
        mb.ball((hx, hy, 0), hw / 2, "#3E4A6B", subdiv=2, scale=(1, 0.5, hh / (hw / 2)))
    for (rx, ry) in [(-6, 2), (7, 3), (-12, 6), (13, 7)]:
        mb.ball((rx, ry, 0.2), 0.6, "#7D7A86", subdiv=1, scale=(1.3, 1, 0.7))
    for k in range(-6, 7):
        mb.box((k * 1.2 - 14, 1.0, 0.45), (0.1, 0.1, 0.9), "#6B4A2B")
    mb.box((-14, 1.0, 0.75), (14.4, 0.06, 0.08), "#6B4A2B")


def loc_castle_wall(mb, coll):
    stone, dark = "#8E8A9C", "#5F5A70"
    mb.box((0, 0.2, -0.15), (44, 5.6, 0.3), "#76728A")
    for k in range(-21, 22, 2):
        mb.box((k, 0.6, 0.0), (0.04, 4.2, 0.02), dark)
    mb.box((0, -2.6, -4.6), (44, 0.6, 9.2), stone)
    merlons(mb, -21, 21, -2.6, 0.0, 0.6, stone, w=1.0, h=1.1)
    mb.box((0, -2.6, 0.25), (44, 0.6, 0.5), stone)
    mb.box((0, 2.75, 0.45), (44, 0.3, 0.9), stone)
    for bx in (-8, 8):
        capy_banner(coll, mb, bx, -3.0, -0.5, h=6.0, w=2.4, name=f"castle_wall.banner{bx}")
    for tx in (-5.5, 5.5):
        mb.box((tx, 2.4, 0.9), (0.15, 0.3, 1.8), "#5B3A1E")
        mb.ball((tx, 2.3, 1.9), 0.22, "#FF9F1C", subdiv=1, mat=1)
    for tx in (-16, 16):
        mb.cyl((tx, 1.0, 2.0), 2.6, 13, stone, segs=10)
        mb.cyl((tx, 1.0, 10.0), 3.0, 4.5, "#2B4FA8", segs=10, radius2=0.0)
    castle_keep(mb, coll, y0=9.0, base_z=0.0)
    mb.box((0, -30, -9.1), (120, 60, 0.2), "#5E7F3A")
    random.seed(41)
    for i in range(50):
        mb.box((random.uniform(-50, 50), random.uniform(-58, -4), -8.98),
               (random.uniform(0.8, 3), random.uniform(0.8, 3), 0.05), random.choice(["#4F6E30", "#6D8F45", "#58783A"]))
    for (hx, hy, hw, hh) in [(-50, -70, 40, 14), (10, -80, 50, 18), (55, -68, 40, 12)]:
        mb.ball((hx, hy, -9), hw / 2, "#3E4A6B", subdiv=2, scale=(1, 0.5, hh / (hw / 2)))


def pine(mb, x, y, z, h, rnd):
    green = rnd.choice(["#2F5D3A", "#3A6B40", "#27503A", "#356245"])
    mb.box((x, y, z + h * 0.12), (0.35, 0.35, h * 0.25), "#5B3A1E")
    for k, (r, f) in enumerate(((0.36, 0.42), (0.28, 0.36), (0.19, 0.3))):
        mb.cyl((x, y, z + h * (0.2 + 0.24 * k) + h * f / 2), h * r, h * f, castlib.shade(green, 1.0 + 0.08 * k),
               segs=7, radius2=0.0)


def loc_mountain_trail(mb, coll):
    """Downhill singletrack along a pine mountainside: riders travel toward -Y; uphill slope at +X, valley at -X."""
    rnd = random.Random(77)
    slope_up, slope_dn = math.atan(0.32), math.atan(0.45)
    y0, y1 = -140.0, 40.0
    L, yc = y1 - y0, (y0 + y1) / 2
    mb.box((0, yc, -0.1), (8.0, L, 0.2), "#6E8B3D")
    mb.box((0, yc, 0.0), (2.4, L, 0.04), "#9C6B43")
    mb.box((0, yc, 0.025), (0.9, L, 0.02), "#B07E52")
    mb.box((4.0 + 30 * math.cos(slope_up), yc, 30 * math.sin(slope_up) - 0.1), (60, L, 0.2), "#5F7F36", rot=(0, -slope_up, 0))
    mb.box((-4.0 - 30 * math.cos(slope_dn), yc, -30 * math.sin(slope_dn) - 0.1), (60, L, 0.2), "#58773A", rot=(0, slope_dn, 0))
    for i in range(70):
        y = rnd.uniform(y0, y1)
        x = rnd.choice((-1, 1)) * rnd.uniform(1.35, 3.6)
        mb.box((x, y, 0.03), (rnd.uniform(0.2, 0.6), rnd.uniform(0.2, 0.8), 0.06), rnd.choice(["#7A5230", "#8B6A45", "#6B7A3A"]))
    for i in range(40):
        y = rnd.uniform(y0, y1)
        x = rnd.choice((-1, 1)) * rnd.uniform(1.6, 4.0)
        mb.ball((x, y, 0.1), rnd.uniform(0.18, 0.45), "#8A8794", subdiv=1, scale=(1.2, 1.0, 0.6))
    for i in range(260):
        side = 1 if i % 2 else -1
        x = rnd.uniform(9.0, 40.0) if side > 0 else -rnd.uniform(4.5, 38.0)
        y = rnd.uniform(y0, y1 + 20)
        z = (x - 4.0) * 0.32 if side > 0 else (x + 4.0) * 0.45
        pine(mb, x, y, z, rnd.uniform(6.0, 11.0), rnd)
    for i in range(10):
        pine(mb, -rnd.uniform(2.8, 4.4), rnd.uniform(y0 + 20, y1), 0.0, rnd.uniform(5.0, 8.0), rnd)
    mb.box((-160, -40, -38), (220, 400, 0.4), "#6C8F4A")
    mb.box((-120, -30, -37.7), (30, 120, 0.2), "#5DA9E9")
    for (hx, hy, hw, hh, col) in [(-230, -60, 160, 70, "#7C8DB5"), (-200, 90, 140, 55, "#8C9CC2"), (-210, -200, 150, 60, "#7486AE"),
                                  (-150, 170, 90, 40, "#93A3C8")]:
        mb.ball((hx, hy, -38), hw / 2, col, subdiv=2, scale=(0.6, 1, hh / (hw / 2)))
        mb.ball((hx + hw * 0.08, hy, -38 + hh * 0.86), hw * 0.13, "#F4F1EA", subdiv=1, scale=(0.6, 1, 0.5))
    for k in range(-6, 7):
        mb.box((-1.35, k * 2.2 + 6.0, 0.4), (0.08, 0.08, 0.8), "#6B4A2B")
    mb.box((-1.35, 6.0, 0.7), (0.06, 26.4, 0.06), "#6B4A2B")


def shoji(mb, x, y, w, h, z0=0.0, rot=0.0, glow=False):
    """Paper screen: lit paper panel with a dark wooden lattice (wall along X when rot=0, along Y when rot=pi/2)."""
    import math as _m
    c, s = _m.cos(rot), _m.sin(rot)

    def at(u, v):
        return (x + u * c, y + u * s, z0 + v)
    mb.box(at(0, h / 2), (w, 0.06, h) if rot == 0 else (0.06, w, h), "#FFE2B0" if glow else "#F3E9D2", mat=1 if glow else 0)
    cols, rows = max(2, int(w / 0.6)), max(3, int(h / 0.6))
    for k in range(cols + 1):
        u = -w / 2 + k * w / cols
        mb.box(at(u, h / 2), (0.06, 0.1, h) if rot == 0 else (0.1, 0.06, h), "#4A2E1A")
    for k in range(rows + 1):
        v = k * h / rows
        mb.box(at(0, v), (w, 0.1, 0.05) if rot == 0 else (0.1, w, 0.05), "#4A2E1A")


def loc_dojo(mb, coll):
    """Wooden dojo at sunset: plank floor, glowing paper screens, scroll alcove, bonsai, staff rack, lanterns."""
    for k in range(-9, 10):
        mb.box((k * 0.8, 1.0, -0.05), (0.78, 16, 0.1), "#B07A45" if k % 2 else "#A06C3B")
    mb.box((0, 1.0, -0.12), (16, 16, 0.1), "#6B4423")
    for x in (-5.4, -1.8, 1.8, 5.4):
        shoji(mb, x, 6.0, 3.4, 3.6, glow=True)
    for y in (-2.5, 1.0, 4.5):
        shoji(mb, -7.2, y, 3.4, 3.6, rot=math.pi / 2, glow=True)
        shoji(mb, 7.2, y, 3.4, 3.6, rot=math.pi / 2)
    for x in (-7.2, -3.6, 3.6, 7.2):
        mb.box((x, 6.0, 1.9), (0.3, 0.3, 3.8), "#4A2E1A")
    mb.box((0, 6.0, 3.75), (15, 0.35, 0.3), "#4A2E1A")
    for sx in (-1, 1):
        mb.box((sx * 7.2, 1.0, 3.75), (0.35, 11, 0.3), "#4A2E1A")
    mb.box((0, 5.55, 0.25), (3.0, 0.8, 0.5), "#5B3A1E")
    mb.box((0, 5.9, 2.0), (0.9, 0.04, 2.0), "#EDE3CC")
    for k in range(4):
        mb.box((0.0 + (k % 2) * 0.08 - 0.04, 5.86, 2.5 - k * 0.32), (0.12 + 0.05 * (k % 3), 0.02, 0.18), "#1A1214",
               rot=(0, 0.3 * (k % 2) - 0.15, 0))
    mb.cyl((0.9, 5.5, 0.62), 0.2, 0.25, "#3E5C76", segs=8)
    mb.cyl((0.9, 5.5, 0.95), 0.05, 0.5, "#5B3A1E", segs=5, rot=(0, 0.25, 0))
    for (bx, bz, br) in ((0.75, 1.25, 0.24), (1.1, 1.15, 0.2), (0.95, 1.4, 0.18)):
        mb.ball((bx, 5.5, bz), br, "#3A6B40", subdiv=1, scale=(1.3, 1, 0.7))
    mb.box((-5.2, 5.55, 1.2), (2.2, 0.3, 0.12), "#4A2E1A")
    mb.box((-5.2, 5.55, 0.4), (2.2, 0.3, 0.12), "#4A2E1A")
    for k in range(5):
        mb.cyl((-6.1 + k * 0.45, 5.45, 1.1), 0.035, 2.0, "#C9A26B", segs=6)
    for x in (-4.5, 4.5):
        mb.box((x, 3.0, 3.1), (0.02, 0.02, 0.7), "#1A1214")
        mb.cyl((x, 3.0, 2.6), 0.22, 0.45, "#FF8F3F", segs=8, mat=1)
    mb.box((0, 0.3, 0.005), (3.6, 3.6, 0.02), "#C8A27A")


def loc_tournament_arena(mb, coll):
    """Tournament mat under spotlights with tiered bleachers (crowd instanced on top by the renderer)."""
    mb.box((0, 2.0, -0.1), (40, 40, 0.2), "#1D2033")
    mb.box((0, 0.5, 0.06), (7.0, 7.0, 0.12), "#C1121F")
    mb.box((0, 0.5, 0.075), (6.0, 6.0, 0.12), "#1E5AA8")
    for sx in (-1, 1):
        mb.box((sx * 0.9, 0.5, 0.14), (0.1, 0.6, 0.01), "#FFFFFF")
    mb.box((0, 0.5, 0.135), (2.6, 2.6, 0.005), "#3A78C8")
    for row in range(4):
        mb.box((0, 7.6 + row * 1.2, 0.25 * (row + 1)), (20, 1.2, 0.5 * (row + 1)), ("#3C4157", "#343950")[row % 2])
        mb.box((0, 7.0 + row * 1.2, 0.5 * (row + 1) + 0.02), (20, 0.06, 0.04), "#F2C14E")
    for sx in (-1, 1):
        mb.box((sx * 10.5, 9.4, 1.5), (1.0, 5.0, 3.0), "#2A2E42")
    mb.box((0, 13.0, 4.0), (24, 0.4, 8.0), "#14162A")
    mb.box((0, 12.7, 5.6), (10, 0.1, 1.6), "#F2C14E", mat=1)
    mb.box((0, 12.6, 5.6), (9.6, 0.1, 1.3), "#14162A")
    mb.box((0, 4.0, 7.5), (16, 0.3, 0.3), "#555A70")
    for x in (-6, -2, 2, 6):
        mb.box((x, 4.0, 7.15), (0.5, 0.5, 0.5), "#22242E")
        mb.cyl((x, 3.9, 6.88), 0.18, 0.05, "#FFF6D8", segs=10, mat=1)
    import bpy as _bpy
    for k, x in enumerate((-3.0, 3.0)):
        ld = _bpy.data.lights.new(f"tournament_arena.spot{k}", "SPOT")
        ld.energy = 1800
        ld.spot_size = 0.9
        ld.color = (1.0, 0.95, 0.85)
        ld.use_shadow = False
        lo = _bpy.data.objects.new(f"tournament_arena.spot{k}", ld)
        lo.location = (x, -1.0, 7.0)
        lo.rotation_euler = castlib.look_at_rotation(Vector((x, -1.0, 7.0)), Vector((0, 0.5, 0)))
        coll.objects.link(lo)


def loc_basketball_court(mb, coll):
    """Indoor hardwood court: painted key, arcs, a full hoop with backboard and net, bleachers and arena lights."""
    for k in range(-12, 13):
        mb.box((k * 0.7, 3.0, -0.05), (0.68, 24, 0.1), "#D9A066" if k % 2 else "#C98F55")
    mb.box((0, 3.0, -0.12), (40, 40, 0.1), "#20233A")
    mb.box((0, 1.6, 0.003), (4.9, 5.8, 0.01), "#1D4E89")
    for sx in (-1, 1):
        mb.box((sx * 2.45, 1.6, 0.012), (0.08, 5.8, 0.01), "#FFFFFF")
    mb.box((0, -1.3, 0.012), (4.9, 0.08, 0.01), "#FFFFFF")
    for k in range(25):
        a = math.pi * (k / 24)
        mb.box((math.cos(a) * 7.0, 4.4 - math.sin(a) * 7.0, 0.012), (0.12, 0.12, 0.01), "#FFFFFF")
    for k in range(16):
        a = 2 * math.pi * k / 16
        mb.box((math.cos(a) * 1.8, -1.3 + math.sin(a) * 1.8, 0.012), (0.1, 0.1, 0.01), "#FFFFFF")
    hy = -3.0
    mb.box((0, 5.6 + hy, 2.2), (0.35, 0.35, 4.4), "#3A3F55")
    mb.box((0, 5.1 + hy, 4.1), (0.25, 1.0, 0.25), "#3A3F55")
    mb.box((0, 4.55 + hy, 3.95), (2.6, 0.08, 1.6), "#F4F6FA")
    for (cx, cz, sx, sz) in ((0, 4.35, 0.9, 0.06), (0, 3.75, 0.9, 0.06), (-0.45, 4.05, 0.06, 0.66), (0.45, 4.05, 0.06, 0.66)):
        mb.box((cx, 4.5 + hy, cz), (sx, 0.02, sz), "#E63946")
    rim_c = (0.0, 3.95 + hy, 3.35)
    for k in range(14):
        a = 2 * math.pi * k / 14
        mb.box((rim_c[0] + math.cos(a) * 0.42, rim_c[1] + math.sin(a) * 0.42, rim_c[2]), (0.2, 0.2, 0.06), "#FF7A1A", rot=(0, 0, a))
    for k in range(10):
        a = 2 * math.pi * k / 10
        mb.box((rim_c[0] + math.cos(a) * 0.33, rim_c[1] + math.sin(a) * 0.33, rim_c[2] - 0.32), (0.03, 0.03, 0.6), "#FFFFFF",
               rot=(0.25 * math.sin(a), -0.25 * math.cos(a), 0))
    for row in range(4):
        mb.box((0, 10.6 + row * 1.2, 0.25 * (row + 1)), (24, 1.2, 0.5 * (row + 1)), ("#3C4157", "#343950")[row % 2])
    mb.box((0, 16.0, 4.0), (30, 0.4, 8.0), "#14162A")
    mb.box((0, 15.7, 6.2), (11, 0.1, 1.8), "#FF7A1A", mat=1)
    mb.box((0, 15.6, 6.2), (10.6, 0.1, 1.5), "#14162A")
    for (x, y) in ((-7.5, 2.5), (7.5, 2.5)):
        mb.box((x, y, 0.5), (0.9, 0.9, 1.0), "#2A2E42")
        for j in range(3):
            mb.ball((x - 0.25 + j * 0.25, y, 1.15), 0.12, "#E2711D", subdiv=1)
    text_object("court.title", "1 V 1", coll, (0, 15.5, 6.2), 1.1, "#FFD166", neon=True)
    import bpy as _bpy
    for k, x in enumerate((-3.5, 3.5)):
        ld = _bpy.data.lights.new(f"basketball_court.spot{k}", "SPOT")
        ld.energy = 1600
        ld.spot_size = 1.0
        ld.color = (1.0, 0.96, 0.88)
        ld.use_shadow = False
        lo = _bpy.data.objects.new(f"basketball_court.spot{k}", ld)
        lo.location = (x, -2.0, 7.5)
        lo.rotation_euler = castlib.look_at_rotation(Vector((x, -2.0, 7.5)), Vector((0, 1.5, 1.0)))
        coll.objects.link(lo)


MOODS = {
    "basketball_court": dict(sky="#1B1F36", sun_color="#FFE6C2", sun_energy=2.6, sun_elev=60, sun_az=-15, ambient=0.85),
    "dojo": dict(sky="#F4A261", sun_color="#FFB37A", sun_energy=3.4, sun_elev=14, sun_az=60, ambient=0.95),
    "tournament_arena": dict(sky="#20233A", sun_color="#C9D6FF", sun_energy=2.2, sun_elev=55, sun_az=-20, ambient=0.75),
    "mountain_trail": dict(sky="#F5B971", sun_color="#FFD49A", sun_energy=4.2, sun_elev=20, sun_az=-55, ambient=0.95),
    "main_street": dict(sky="#8ECDF7", sun_color="#FFF4E0", sun_energy=4.0, sun_elev=50, sun_az=-35, ambient=1.0),
    "bank": dict(sky="#9AD3F7", sun_color="#FFF4E0", sun_energy=4.0, sun_elev=55, sun_az=30, ambient=1.0),
    "park": dict(sky="#9BE0FF", sun_color="#FFF1D0", sun_energy=4.2, sun_elev=55, sun_az=-30, ambient=1.0),
    "rooftop": dict(sky="#F4A261", sun_color="#FFB27A", sun_energy=3.2, sun_elev=18, sun_az=40, ambient=0.8),
    "alley": dict(sky="#4A4870", sun_color="#C8CFFF", sun_energy=2.6, sun_elev=65, sun_az=10, ambient=1.0),
    "casino": dict(sky="#120A26", sun_color="#C77DFF", sun_energy=1.4, sun_elev=60, sun_az=-20, ambient=0.5),
    "wasteland": dict(sky="#E07A5F", sun_color="#FFB085", sun_energy=3.5, sun_elev=25, sun_az=-50, ambient=0.8),
    "spaceship": dict(sky="#1B263B", sun_color="#E0F2FF", sun_energy=2.6, sun_elev=70, sun_az=0, ambient=0.8),
    "cafe": dict(sky="#FFE8CC", sun_color="#FFD9A0", sun_energy=3.0, sun_elev=50, sun_az=25, ambient=0.9),
    "kaiju_city": dict(sky="#F28F3B", sun_color="#FFC07A", sun_energy=3.2, sun_elev=30, sun_az=35, ambient=0.8),
    "summoning_room": dict(sky="#07070F", sun_color="#8FB8FF", sun_energy=1.3, sun_elev=65, sun_az=15, ambient=0.55),
    "yc_hq": dict(sky="#FFE8D2", sun_color="#FFE6C8", sun_energy=3.4, sun_elev=55, sun_az=20, ambient=1.0),
    "capy_castle": dict(sky="#F28B3B", sun_color="#FFB070", sun_energy=3.6, sun_elev=16, sun_az=-35, ambient=0.75),
    "castle_wall": dict(sky="#7484D2", sun_color="#FFE2BC", sun_energy=3.8, sun_elev=22, sun_az=35, ambient=0.85),
    "saloon": dict(sky="#FFB86B", sun_color="#FFD29D", sun_energy=4.0, sun_elev=30, sun_az=-40, ambient=0.9),
}

BUILDERS = {
    "main_street": loc_main_street, "bank": loc_bank, "park": loc_park, "rooftop": loc_rooftop,
    "alley": loc_alley, "casino": loc_casino, "wasteland": loc_wasteland, "spaceship": loc_spaceship,
    "cafe": loc_cafe, "kaiju_city": loc_kaiju_city, "saloon": loc_saloon,
    "summoning_room": loc_summoning_room,
    "yc_hq": loc_yc_hq, "capy_castle": loc_capy_castle, "castle_wall": loc_castle_wall,
    "mountain_trail": loc_mountain_trail, "dojo": loc_dojo, "tournament_arena": loc_tournament_arena,
    "basketball_court": loc_basketball_court,
}


def generic_location(mb, coll):
    loc_main_street(mb, coll)


def build_location(name):
    random.seed(zlib.crc32(name.encode()))
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    mb = MeshBuilder()
    BUILDERS.get(name, generic_location)(mb, coll)
    obj = mb.to_object(name + ".set", coll)
    castlib.add_outline(obj, 0.03)
    if name == "rooftop":
        sky = MeshBuilder()
        random.seed(11)
        for i in range(40):
            bx, by = random.uniform(-45, 45), random.uniform(20, 70)
            w = random.uniform(4, 9)
            h = random.uniform(26, 46)
            building(sky, bx, by, w, w, h, random.choice(["#4361EE", "#7209B7", "#3A0CA3", "#4895EF", "#F72585", "#560BAD"]), lit=True, door=False)
        skyline = sky.to_object("rooftop.skyline", coll)
        skyline.location.z = -32
    for k, v in MOODS.get(name, MOODS["main_street"]).items():
        coll[k] = v
    coll["label"] = castlib.library()["locations"].get(name, {}).get("label", name)
    for mark, pos in CHAR_MARKS.items():
        e = bpy.data.objects.new(f"{name}.mark.{mark}", None)
        e.empty_display_type = "SINGLE_ARROW"
        e.location = pos
        coll.objects.link(e)
    for mark, (eye, target, lens) in CAM_MARKS.items():
        e = bpy.data.objects.new(f"{name}.cam.{mark}", None)
        e.empty_display_type = "CONE"
        e.location = eye
        e.rotation_euler = castlib.look_at_rotation(eye, target)
        e["target"] = list(target)
        e["lens"] = float(lens)
        coll.objects.link(e)
    return coll


def build_town(out_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lib = castlib.library()
    for name in lib["locations"].keys():
        build_location(name)
    for coll in list(bpy.context.scene.collection.children):
        bpy.context.scene.collection.children.unlink(coll)
        coll.use_fake_user = True
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=False)
    with open(out_path + ".version", "w") as f:
        f.write(str(TOWN_VERSION))
    print(f"Saved town with {len(lib['locations'])} locations to {out_path}")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    build_town(os.path.abspath(argv[0]) if argv else castlib.TOWN_PATH)
