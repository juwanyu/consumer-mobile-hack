"""Selectable art styles for the Cast renderer: `art_styles.apply(scene3d, style, edit)` restyles a built reel.

Styles: blocky (default, untouched), anime2d, pixel, clay, comic. Everything is material/world/light overrides on the
built 3D scene plus, for pixel, a low-res render scaled up with nearest filtering in the edit scene. No compositor.
"""
import math

import bpy

STYLES = ("blocky", "anime2d", "pixel", "clay", "comic")
PIXEL = 6


def normalize(style):
    style = str(style or "blocky").strip().lower().replace("-", "").replace("_", "").replace(" ", "")
    style = {"anime": "anime2d", "2danime": "anime2d", "pixelart": "pixel", "claymation": "clay", "blocky3d": "blocky"}.get(style, style)
    return style if style in STYLES else "blocky"


def _mats(prefix):
    return [m for m in bpy.data.materials if m.name.startswith(prefix) and m.use_nodes]


class _Tree:
    def __init__(self, nt):
        self.nt = nt
        for n in list(nt.nodes):
            nt.nodes.remove(n)

    def node(self, kind, **inputs):
        n = self.nt.nodes.new(kind)
        for k, v in inputs.items():
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, n.inputs[k])
            else:
                n.inputs[k].default_value = v
        return n

    def math(self, op, a, b=None, vector=False):
        n = self.nt.nodes.new("ShaderNodeVectorMath" if vector else "ShaderNodeMath")
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = v
        return n.outputs["Value"] if vector and op in ("LENGTH", "DOT_PRODUCT", "DISTANCE") else n.outputs[0]

    def link(self, a, b):
        self.nt.links.new(a, b)


def _light(t, gain=0.75):
    diff = t.node("ShaderNodeBsdfDiffuse", Color=(1, 1, 1, 1))
    s2r = t.node("ShaderNodeShaderToRGB", Shader=diff.outputs[0])
    bw = t.node("ShaderNodeRGBToBW", Color=s2r.outputs["Color"])
    return t.math("MULTIPLY", bw.outputs[0], gain)


def _ramp(t, value, stops):
    ramp = t.nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    for i, (pos, col) in enumerate(stops):
        e = els[i] if i < 2 else els.new(pos)
        e.position, e.color = pos, (*col, 1)
    t.link(value, ramp.inputs[0])
    return ramp.outputs["Color"]


def _base(t, sat=1.0, val=1.0):
    attr = t.nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    hsv = t.node("ShaderNodeHueSaturation", Color=attr.outputs["Color"], Saturation=sat, Value=val)
    return hsv.outputs[0]


def _emit(t, color):
    out = t.node("ShaderNodeOutputMaterial")
    em = t.node("ShaderNodeEmission", Color=color)
    t.link(em.outputs[0], out.inputs["Surface"])


def _halftone(t, light, w, h, cell, ink=0.5):
    """Screen-space dot screen: dots grow where the light is low. Returns a 0..1 darkening factor."""
    tc = t.node("ShaderNodeTexCoord")
    grid = t.math("MULTIPLY", tc.outputs["Window"], (w / cell, h / cell, 0), vector=True)
    rot = t.node("ShaderNodeVectorRotate", Vector=grid, Angle=math.radians(45))
    rot.rotation_type = "Z_AXIS"
    cellpos = t.math("FRACTION", rot.outputs[0], None, vector=True)
    centered = t.math("SUBTRACT", cellpos, (0.5, 0.5, 0), vector=True)
    dist = t.math("LENGTH", centered, None, vector=True)
    dark = t.math("SUBTRACT", 1.0, t.math("MINIMUM", light, 1.0))
    radius = t.math("ADD", t.math("MULTIPLY", dark, 0.55), 0.14)
    dot = t.math("LESS_THAN", dist, radius)
    return t.math("SUBTRACT", 1.0, t.math("MULTIPLY", dot, ink))


def _set_world(scene, horizon, zenith, lo=-0.02, hi=0.5):
    world = scene.world
    if not world or not world.use_nodes:
        return
    nt = world.node_tree
    bg = next((n for n in nt.nodes if n.type == "BACKGROUND"), None)
    if bg is None:
        return
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = lo
    mr.inputs["From Max"].default_value = hi
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (*horizon, 1)
    mix.inputs[7].default_value = (*zenith, 1)
    nt.links.new(mr.outputs["Result"], mix.inputs["Factor"])
    nt.links.new(mix.outputs[2], bg.inputs["Color"])
    if world.node_tree.animation_data:
        world.node_tree.animation_data_clear()
    bg.inputs["Strength"].default_value = 1.0


def _all_fcurves():
    for act in bpy.data.actions:
        if hasattr(act, "layers") and act.layers:
            for layer in act.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        yield from bag.fcurves
        else:
            yield from getattr(act, "fcurves", [])


def _outlines(scale=None, color=None, show=True):
    for ob in bpy.data.objects:
        for mod in ob.modifiers:
            if mod.type == "SOLIDIFY" and mod.name.startswith("Outline"):
                mod.show_render = mod.show_viewport = show
                if scale:
                    mod.thickness *= scale
    if color:
        for mat in _mats("CastOutline"):
            em = next((n for n in mat.node_tree.nodes if n.type == "EMISSION"), None)
            if em:
                em.inputs["Color"].default_value = (*color, 1)


def _no_dof(scene):
    for ob in scene.objects:
        if ob.type == "CAMERA":
            ob.data.dof.use_dof = False


def _scene_strip(edit, scene):
    if edit is None or not edit.sequence_editor:
        return None
    se = edit.sequence_editor
    strips = getattr(se, "strips_all", None) or getattr(se, "sequences_all", [])
    return next((s for s in strips if s.type == "SCENE" and s.scene == scene), None)


def _grade(edit, scene, lift=None, gamma=None, gain=None, remove=False):
    strip = _scene_strip(edit, scene)
    if strip is None:
        return
    for mod in list(strip.modifiers):
        if mod.type == "COLOR_BALANCE":
            if remove:
                strip.modifiers.remove(mod)
                continue
            cb = mod.color_balance
            if lift:
                cb.lift = lift
            if gamma:
                cb.gamma = gamma
            if gain:
                cb.gain = gain


# ---------------------------------------------------------------- styles

def anime2d(scene, edit):
    for mat in _mats("CastPlastic"):
        t = _Tree(mat.node_tree)
        base = _base(t, sat=1.35, val=1.05)
        band = _ramp(t, _light(t), [(0.0, (0.58, 0.55, 0.78)), (0.16, (1.0, 1.0, 1.0))])
        _emit(t, t.math("MULTIPLY", base, band, vector=True))
    _outlines(scale=1.7, color=(0.0, 0.0, 0.0))
    _set_world(scene, (0.62, 0.86, 1.0), (0.02, 0.24, 0.95), lo=0.0, hi=0.45)
    _no_dof(scene)
    scene.eevee.shadow_resolution_scale = 0.5
    _grade(edit, scene, remove=True)


def pixel(scene, edit):
    for mat in _mats("CastPlastic"):
        t = _Tree(mat.node_tree)
        base = _base(t, sat=1.3)
        band = _ramp(t, _light(t), [(0.0, (0.45, 0.45, 0.6)), (0.12, (0.75, 0.75, 0.82)), (0.4, (1.05, 1.05, 1.05))])
        col = t.math("MULTIPLY", base, band, vector=True)
        srgb = t.node("ShaderNodeGamma", Color=col, Gamma=1 / 2.2)
        steps = t.math("SNAP", t.math("ADD", srgb.outputs[0], (0.09, 0.09, 0.09), vector=True), (0.18, 0.18, 0.18), vector=True)
        _emit(t, t.node("ShaderNodeGamma", Color=steps, Gamma=2.2).outputs[0])
    _outlines(scale=1.6, color=(0.03, 0.02, 0.08))
    _set_world(scene, (0.98, 0.62, 0.42), (0.16, 0.18, 0.62), lo=0.0, hi=0.5)
    _no_dof(scene)
    r = scene.render
    w, h = r.resolution_x, r.resolution_y
    r.resolution_x, r.resolution_y = round(w / PIXEL), math.ceil(h / PIXEL)
    r.filter_size = 0.0
    scene.eevee.taa_render_samples = 1
    strip = _scene_strip(edit, scene)
    if strip is not None:
        tr = strip.transform
        tr.filter = "NEAREST"
        tr.scale_x = w / r.resolution_x
        tr.scale_y = tr.scale_x


def clay(scene, edit):
    for mat in _mats("CastPlastic"):
        t = _Tree(mat.node_tree)
        base = _base(t, sat=0.9, val=0.92)
        tc = t.node("ShaderNodeTexCoord")
        lumpy = t.node("ShaderNodeTexNoise", Vector=tc.outputs["Object"], Scale=7.0, Detail=2.0)
        fine = t.node("ShaderNodeTexNoise", Vector=tc.outputs["Object"], Scale=55.0, Detail=1.0)
        h = t.math("ADD", lumpy.outputs["Fac"], t.math("MULTIPLY", fine.outputs["Fac"], 0.35))
        bump = t.node("ShaderNodeBump", Strength=0.35, Distance=0.04, Height=h)
        bsdf = t.node("ShaderNodeBsdfPrincipled", **{"Base Color": base, "Roughness": 0.92, "Normal": bump.outputs[0]})
        for key in ("Specular IOR Level", "Specular"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = 0.15
                break
        out = t.node("ShaderNodeOutputMaterial")
        t.link(bsdf.outputs[0], out.inputs["Surface"])
    _outlines(show=False)
    _set_world(scene, (0.95, 0.80, 0.62), (0.45, 0.62, 0.85), lo=0.0, hi=0.6)
    for ob in scene.objects:
        if ob.type == "LIGHT" and ob.data.type == "SUN":
            d = ob.data
            if d.animation_data:
                d.animation_data_clear()
            if d.use_shadow and ob.name.startswith("CastSun"):
                d.color = (1.0, 0.82, 0.62)
                d.energy = 3.2
                d.angle = math.radians(10)
            else:
                d.color = (0.75, 0.85, 1.0)
                d.energy = 0.6
    scene.eevee.use_shadows = True
    for fc in _all_fcurves():
        if not any(m.type == "STEPPED" for m in fc.modifiers):
            m = fc.modifiers.new("STEPPED")
            m.frame_step = 2.0
            m.frame_offset = 1.0
    _grade(edit, scene, lift=(1.0, 0.98, 0.95), gamma=(1.0, 1.0, 1.0), gain=(1.08, 1.02, 0.94))


def comic(scene, edit):
    w, h = scene.render.resolution_x, scene.render.resolution_y
    for mat in _mats("CastPlastic"):
        t = _Tree(mat.node_tree)
        base = _base(t, sat=1.5, val=1.08)
        light = _light(t)
        band = _ramp(t, light, [(0.0, (0.55, 0.5, 0.62)), (0.14, (0.85, 0.85, 0.88)), (0.42, (1.08, 1.08, 1.08))])
        dots = _halftone(t, light, w, h, cell=9, ink=0.45)
        col = t.math("MULTIPLY", base, band, vector=True)
        _emit(t, _scale(t, col, dots))
    _outlines(scale=2.4, color=(0.0, 0.0, 0.0))
    _set_world(scene, (1.0, 0.86, 0.25), (0.05, 0.55, 1.0), lo=0.0, hi=0.5)
    world = scene.world
    bg = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None) if world and world.use_nodes else None
    if bg and bg.inputs["Color"].links:
        t = _Tree.__new__(_Tree)
        t.nt = world.node_tree
        sky = bg.inputs["Color"].links[0].from_socket
        _emit_world = _scale(t, sky, _halftone(t, 0.75, w, h, cell=12, ink=0.18))
        t.link(_emit_world, bg.inputs["Color"])
    _no_dof(scene)
    _grade(edit, scene, remove=True)


def _scale(t, vec, factor):
    n = t.nt.nodes.new("ShaderNodeVectorMath")
    n.operation = "SCALE"
    t.link(vec, n.inputs[0])
    t.link(factor, n.inputs["Scale"])
    return n.outputs[0]


def apply(scene, style="blocky", edit=None):
    """Restyle the built 3D scene (and its strip in the edit scene). Never raises; falls back to blocky."""
    style = normalize(style)
    if style == "blocky":
        return style
    try:
        {"anime2d": anime2d, "pixel": pixel, "clay": clay, "comic": comic}[style](scene, edit)
        print(f"[cast] art style: {style}", flush=True)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[cast] art style {style} failed, partially applied: {e}", flush=True)
    return style
