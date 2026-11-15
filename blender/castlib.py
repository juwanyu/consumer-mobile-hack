"""Shared helpers for the Cast Blender pipeline: contract loading, colors, materials, mesh building."""
import json
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
LIBRARY_PATH = os.path.join(REPO, "shared", "assetLibrary.json")
TOWN_PATH = os.path.join(HERE, "build", "town.blend")

_library = None


def library():
    global _library
    if _library is None:
        with open(LIBRARY_PATH, "r", encoding="utf-8") as f:
            _library = json.load(f)
    return _library


def hex_to_srgb(value, default="#888888"):
    for candidate in (value, default):
        if not isinstance(candidate, str):
            continue
        s = candidate.strip().lstrip("#")
        if len(s) == 3:
            s = "".join(c * 2 for c in s)
        if len(s) != 6:
            continue
        try:
            return tuple(int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
        except ValueError:
            continue
    return (0.5, 0.5, 0.5)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def color(value, default="#888888"):
    """Hex (or rgb tuple in 0..1 sRGB) -> linear RGBA tuple."""
    if isinstance(value, (tuple, list)):
        rgb = tuple(value[:3])
    else:
        rgb = hex_to_srgb(value, default)
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


def shade(value, factor):
    r, g, b = hex_to_srgb(value) if isinstance(value, str) else value[:3]
    return tuple(max(0.0, min(1.0, c * factor)) for c in (r, g, b))


def materials():
    """Two shared materials driven by the 'Col' color attribute: glossy plastic and neon emission."""
    plastic = bpy.data.materials.get("CastPlastic")
    if plastic is None:
        plastic = bpy.data.materials.new("CastPlastic")
        plastic.use_nodes = True
        nt = plastic.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        attr = nt.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.38
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.6
    neon = bpy.data.materials.get("CastNeon")
    if neon is None:
        neon = bpy.data.materials.new("CastNeon")
        neon.use_nodes = True
        nt = neon.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        attr = nt.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = 3.0
        nt.links.new(attr.outputs["Color"], em.inputs["Color"])
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return plastic, neon


def _matrix(center, rot):
    m = Matrix.Translation(Vector(center))
    if rot is not None:
        m = m @ Euler(rot).to_matrix().to_4x4()
    return m


class MeshBuilder:
    """Accumulates colored primitives into one bmesh; material index 0 = plastic, 1 = neon."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new("Col")

    def _paint(self, verts, rgba, mat):
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = mat
            for loop in f.loops:
                loop[self.col] = rgba

    def box(self, center, size, col, rot=None, mat=0):
        m = _matrix(center, rot) @ Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0)))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._paint(res["verts"], color(col), mat)

    def cyl(self, center, radius, depth, col, segs=8, rot=None, mat=0, radius2=None):
        res = bmesh.ops.create_cone(
            self.bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=radius, radius2=radius if radius2 is None else radius2,
            depth=depth, matrix=_matrix(center, rot))
        self._paint(res["verts"], color(col), mat)

    def ball(self, center, radius, col, subdiv=1, mat=0, scale=(1, 1, 1)):
        m = _matrix(center, None) @ Matrix.Diagonal(Vector((scale[0], scale[1], scale[2], 1.0)))
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=radius, matrix=m)
        self._paint(res["verts"], color(col), mat)

    def to_object(self, name, collection, bevel=0.0):
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        plastic, neon = materials()
        mesh.materials.append(plastic)
        mesh.materials.append(neon)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        if bevel > 0:
            mod = obj.modifiers.new("Bevel", "BEVEL")
            mod.width = bevel
            mod.segments = 1
            mod.limit_method = "ANGLE"
        return obj


def magic_circle(mb, center, radius, col, mat=1, runes=True):
    """Neon ring + hexagram + rune ticks lying flat on the floor."""
    cx, cy, cz = center
    for r, segs, w in ((radius, 48, 0.07), (radius * 0.86, 40, 0.05), (radius * 0.34, 20, 0.05)):
        for k in range(segs):
            a = 2 * math.pi * k / segs
            mb.box((cx + r * math.cos(a), cy + r * math.sin(a), cz), (w, 2 * math.pi * r / segs * 1.08, 0.02), col, rot=(0, 0, a), mat=mat)
    pts = [(cx + radius * 0.84 * math.cos(math.pi / 2 + k * math.pi / 3), cy + radius * 0.84 * math.sin(math.pi / 2 + k * math.pi / 3)) for k in range(6)]
    for tri in ((0, 2, 4), (1, 3, 5)):
        for j in range(3):
            (x0, y0), (x1, y1) = pts[tri[j]], pts[tri[(j + 1) % 3]]
            length = math.hypot(x1 - x0, y1 - y0)
            mb.box(((x0 + x1) / 2, (y0 + y1) / 2, cz), (length, 0.045, 0.02), col, rot=(0, 0, math.atan2(y1 - y0, x1 - x0)), mat=mat)
    if runes:
        for k in range(16):
            a = 2 * math.pi * (k + 0.5) / 16
            r = radius * 0.93
            mb.box((cx + r * math.cos(a), cy + r * math.sin(a), cz), (0.16 if k % 2 else 0.08, 0.1 if k % 3 else 0.18, 0.02), col, rot=(0, 0, a), mat=mat)


def look_at_rotation(eye, target):
    d = Vector(target) - Vector(eye)
    return d.to_track_quat("-Z", "Y").to_euler()


def progress(stage, pct, shot=None, of=None, progress_file=None, **extra):
    payload = {"stage": stage}
    if shot is not None:
        payload["shot"] = shot
        payload["of"] = of
    payload["pct"] = int(max(0, min(100, pct)))
    payload.update(extra)
    line = "PROGRESS " + json.dumps(payload)
    print(line, flush=True)
    if progress_file:
        try:
            with open(progress_file, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass
