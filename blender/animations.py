"""Procedural keyframed actions for R6 rigs built by character.py.

apply_action(rig, action_name, start_frame, frame_count)
Bone conventions (Euler XYZ, local):
  arm/leg X < 0 swings the limb forward (toward -Y, the character's front); Z moves the tail sideways.
  torso/head/root X > 0 leans forward, Y twists, Z tilts sideways.
Walk/run/sneak translate the rig object along its facing direction.
"""
import math
import os
import random
import sys

from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import castlib  # noqa: E402

FPS = 24
BONE_NAMES = ("root", "torso", "head", "arm_L", "arm_R", "leg_L", "leg_R")


def _arm(fwd=0.0, out=0.0, side=1, twist=0.0):
    return (-fwd, twist, -out * side)


def _ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _blank():
    return {b: [0.0, 0.0, 0.0] for b in BONE_NAMES}


def _set(pose, bone, rot):
    pose[bone] = list(rot)


def pose_idle(t, T):
    p = _blank()
    b = math.sin(2 * math.pi * 0.5 * t)
    p["torso"][0] = 0.02 * b
    p["head"][1] = 0.18 * math.sin(2 * math.pi * 0.3 * t)
    p["head"][0] = -0.03 * b
    _set(p, "arm_L", _arm(0.05 * b, 0.07, 1))
    _set(p, "arm_R", _arm(-0.05 * b, 0.07, -1))
    return p, 0.0, 0.0


def _gait(t, freq, leg_amp, arm_amp, lean, speed, bob):
    p = _blank()
    s = math.sin(2 * math.pi * freq * t)
    p["leg_L"][0] = leg_amp * s
    p["leg_R"][0] = -leg_amp * s
    _set(p, "arm_L", _arm(arm_amp * s, 0.08, 1))
    _set(p, "arm_R", _arm(-arm_amp * s, 0.08, -1))
    p["torso"][0] = lean
    p["torso"][1] = 0.08 * s
    p["head"][0] = -lean * 0.6
    up = bob * abs(math.sin(2 * math.pi * freq * t))
    return p, speed * t, up


def pose_walk(t, T):
    return _gait(t, 0.9, 0.55, 0.5, 0.04, 0.5, 0.04)


def pose_run(t, T):
    p, fwd, up = _gait(t, 1.5, 0.95, 1.0, 0.25, 1.1, 0.09)
    for side in ("arm_L", "arm_R"):
        p[side][1] = 0.0
    return p, fwd, up


def pose_sneak(t, T):
    p, fwd, up = _gait(t, 0.55, 0.35, 0.15, 0.4, 0.3, 0.02)
    _set(p, "arm_L", _arm(1.0 + 0.1 * math.sin(4 * t), 0.15, 1))
    _set(p, "arm_R", _arm(1.0 + 0.1 * math.sin(4 * t + 1), 0.15, -1))
    p["head"][0] = -0.3
    p["head"][1] = 0.45 * math.sin(2 * math.pi * 0.4 * t)
    return p, fwd, up


def pose_jump(t, T):
    p = _blank()
    period = 1.5
    ph = (t % period) / period
    up = 0.0
    if ph < 0.25:
        k = math.sin(ph / 0.25 * math.pi)
        p["torso"][0] = 0.3 * k
        _set(p, "arm_L", _arm(-0.6 * k, 0.1, 1))
        _set(p, "arm_R", _arm(-0.6 * k, 0.1, -1))
    elif ph < 0.8:
        a = (ph - 0.25) / 0.55
        up = 4 * 0.9 * a * (1 - a)
        _set(p, "arm_L", _arm(0.3, 2.6, 1))
        _set(p, "arm_R", _arm(0.3, 2.6, -1))
        p["leg_L"][0] = -0.5
        p["leg_R"][0] = 0.3
        p["head"][0] = -0.15
    else:
        k = math.sin((ph - 0.8) / 0.2 * math.pi)
        p["torso"][0] = 0.25 * k
        _set(p, "arm_L", _arm(0.2, 0.4, 1))
        _set(p, "arm_R", _arm(0.2, 0.4, -1))
    return p, 0.0, up


def pose_wave(t, T):
    p, _, _ = pose_idle(t, T)
    k = _ease(t / 0.35)
    _set(p, "arm_R", _arm(0.15 * k, k * (2.5 + 0.35 * math.sin(2 * math.pi * 2.2 * t)), -1))
    p["head"][2] = 0.1 * k
    p["torso"][2] = -0.04 * k
    return p, 0.0, 0.0


def pose_point(t, T):
    p, _, _ = pose_idle(t, T)
    k = _ease(t / 0.3)
    pulse = 0.06 * math.sin(2 * math.pi * 1.5 * t) * k
    _set(p, "arm_R", _arm(1.55 * k + pulse, 0.12 * k, -1))
    _set(p, "arm_L", _arm(-0.25 * k, 0.35 * k, 1))
    p["torso"][1] = -0.15 * k
    p["head"][0] = 0.05 * k
    return p, 0.0, 0.0


def pose_punch(t, T):
    p = _blank()
    period = 0.6
    n = int(t / period)
    ph = (t % period) / period
    jab = math.sin(min(1.0, ph / 0.5) * math.pi)
    hit, guard = ("arm_R", "arm_L") if n % 2 == 0 else ("arm_L", "arm_R")
    hs = -1 if hit == "arm_R" else 1
    _set(p, hit, _arm(0.9 + 0.7 * jab, 0.05, hs))
    _set(p, guard, _arm(1.1, 0.05, -hs))
    p["torso"][1] = 0.3 * jab * (-hs)
    p["torso"][0] = 0.1
    p["leg_L"][0] = -0.25
    p["leg_R"][0] = 0.25
    p["leg_L"][2] = -0.08
    p["leg_R"][2] = 0.08
    return p, 0.05 * jab, 0.0


def pose_dance(t, T):
    p = _blank()
    beat = 2 * math.pi * 1.0 * t
    s = math.sin(beat)
    p["torso"][2] = 0.18 * s
    p["head"][2] = -0.2 * s
    p["head"][0] = 0.1 * math.sin(2 * beat)
    _set(p, "arm_L", _arm(0.3, 1.2 + 1.2 * max(0.0, s), 1))
    _set(p, "arm_R", _arm(0.3, 1.2 + 1.2 * max(0.0, -s), -1))
    p["leg_L"][2] = -0.25 * max(0.0, s)
    p["leg_R"][2] = 0.25 * max(0.0, -s)
    p["root"][1] = 0.3 * math.sin(beat / 2)
    return p, 0.0, 0.08 * abs(math.sin(2 * beat))


def pose_celebrate(t, T):
    p = _blank()
    s = math.sin(2 * math.pi * 2.0 * t)
    _set(p, "arm_L", _arm(0.2, 2.6 + 0.25 * s, 1))
    _set(p, "arm_R", _arm(0.2, 2.6 + 0.25 * s, -1))
    p["head"][0] = -0.2
    p["torso"][0] = -0.08
    p["leg_L"][2] = -0.1
    p["leg_R"][2] = 0.1
    return p, 0.0, 0.22 * abs(math.sin(2 * math.pi * 1.0 * t))


def pose_fall(t, T):
    p = _blank()
    k = _ease(t / 0.7)
    p["root"][0] = -1.5 * k
    _set(p, "arm_L", _arm(1.6 * k + 0.2 * math.sin(10 * t) * (1 - k), 1.2 * k, 1))
    _set(p, "arm_R", _arm(1.6 * k - 0.2 * math.sin(10 * t) * (1 - k), 1.2 * k, -1))
    p["leg_L"][0] = -0.4 * k
    p["head"][0] = 0.3 * k
    twitch = 0.08 * math.sin(2 * math.pi * 1.5 * t) if t > 1.2 else 0.0
    p["arm_R"][0] += twitch
    return p, -0.3 * k, 0.18 * k


def pose_talk(t, T):
    p, _, _ = pose_idle(t, T)
    p["head"][0] = 0.07 * math.sin(2 * math.pi * 2.3 * t)
    p["head"][1] = 0.12 * math.sin(2 * math.pi * 0.6 * t)
    g = math.sin(2 * math.pi * 0.8 * t)
    _set(p, "arm_R", _arm(0.75 + 0.3 * g, 0.25 + 0.15 * g, -1))
    _set(p, "arm_L", _arm(0.3 + 0.2 * max(0.0, -g), 0.12, 1))
    p["torso"][1] = 0.08 * g
    return p, 0.0, 0.0


def pose_scared(t, T):
    p = _blank()
    k = _ease(t / 0.3)
    r = random.Random(int(t * FPS))
    j = lambda: (r.random() - 0.5) * 0.07 * k  # noqa: E731
    _set(p, "arm_L", _arm(2.3 * k + j(), -0.35 * k, 1))
    _set(p, "arm_R", _arm(2.3 * k + j(), -0.35 * k, -1))
    p["torso"][0] = -0.18 * k + j()
    p["head"][0] = 0.15 * k + j()
    p["head"][1] = j() * 3
    p["leg_L"][2] = -0.06 * k
    p["leg_R"][2] = 0.06 * k
    return p, -0.35 * _ease(t / 2.0), 0.0


def pose_sit(t, T):
    p, _, _ = pose_idle(t, T)
    k = _ease(t / 0.45)
    p["leg_L"][0] = -1.57 * k
    p["leg_R"][0] = -1.57 * k
    p["leg_L"][2] = -0.1 * k
    p["leg_R"][2] = 0.1 * k
    _set(p, "arm_L", _arm(0.5 * k, 0.1, 1))
    _set(p, "arm_R", _arm(0.5 * k, 0.1, -1))
    p["torso"][0] = -0.08 * k
    return p, 0.0, -0.62 * k


def pose_summon(t, T):
    p, _, _ = pose_idle(t, T)
    k = _ease(t / 0.4)
    tremble = 0.05 * math.sin(2 * math.pi * 7 * t) * k
    _set(p, "arm_R", _arm(0.3 * k, 2.85 * k + tremble, -1))
    _set(p, "arm_L", _arm(0.45 * k, 0.5 * k, 1))
    p["head"][0] = -0.3 * k
    p["torso"][0] = -0.1 * k
    p["leg_L"][2] = -0.1 * k
    p["leg_R"][2] = 0.1 * k
    return p, 0.0, 0.0


SLASH_PERIOD = 1.4
SLASH_RAISED = 0.25
SLASH_IMPACT = 0.55


def pose_slash(t, T):
    p = _blank()
    ph = (t % SLASH_PERIOD) / SLASH_PERIOD
    if ph < SLASH_RAISED:
        theta = 0.3 + 2.3 * _ease(ph / SLASH_RAISED)
        swing = 0.0
    elif ph < 0.4:
        theta, swing = 2.6, 0.0
    elif ph < SLASH_IMPACT:
        a = _ease((ph - 0.4) / (SLASH_IMPACT - 0.4))
        theta, swing = 2.6 - 2.45 * a, a
    else:
        a = _ease((ph - SLASH_IMPACT) / (1 - SLASH_IMPACT))
        theta, swing = 0.15 + 0.15 * a, 1 - a
    _set(p, "arm_R", _arm(theta, 0.08, -1))
    _set(p, "arm_L", _arm(theta * 0.85, -0.3, 1))
    p["torso"][0] = 0.3 * swing - 0.1 * (1 - swing) * (theta > 2)
    p["torso"][1] = -0.25 * swing
    p["head"][0] = -0.1 * swing
    p["leg_L"][0] = -0.35
    p["leg_R"][0] = 0.3
    return p, 0.12 * swing, 0.0


def pose_film(t, T):
    p = _blank()
    k = _ease(t / 0.3)
    _set(p, "arm_R", _arm(1.45 * k, 0.05, -1))
    _set(p, "arm_L", _arm(1.25 * k, -0.4 * k, 1))
    p["root"][1] = 0.35 * math.sin(2 * math.pi * 0.18 * t)
    p["head"][2] = 0.14 * k
    p["head"][0] = 0.05 * k
    p["torso"][0] = 0.05 * math.sin(2 * math.pi * 0.5 * t)
    p["leg_L"][2] = -0.07
    p["leg_R"][2] = 0.07
    return p, 0.0, 0.0


def pose_charge(t, T):
    p, fwd, up = _gait(t, 1.45, 0.85, 0.0, 0.32, 1.0, 0.08)
    s = math.sin(2 * math.pi * 1.45 * t)
    _set(p, "arm_R", _arm(0.95 + 0.08 * s, 0.05, -1))
    _set(p, "arm_L", _arm(-0.6 * s + 0.2, 0.12, 1))
    p["head"][0] = -0.25
    return p, fwd, up


RAISE_HOLD = (0.22, 0.52)
RAISE_IMPACT = 0.66


def raise_sword_angles(u):
    """u = normalised shot time -> (arm angle, body yaw) for the Excalibur swing."""
    a0, a1 = RAISE_HOLD
    if u < a0:
        k = _ease(u / a0)
        return 0.4 + 1.85 * k, 0.0
    if u < a1:
        return 2.25 + 0.04 * math.sin(40 * u), 0.0
    if u < RAISE_IMPACT:
        k = _ease((u - a1) / (RAISE_IMPACT - a1))
        return 2.25 - 2.25 * k, 0.55 - 1.1 * k
    k = _ease((u - RAISE_IMPACT) / (1 - RAISE_IMPACT))
    return 0.35 - 0.1 * k, -0.55 - 0.1 * k


def pose_raise_sword(t, T):
    p = _blank()
    u = t / max(T, 1e-3)
    theta, yaw = raise_sword_angles(u)
    if RAISE_HOLD[1] <= u < RAISE_IMPACT:
        yaw = 0.55 * (1 - 2 * _ease((u - RAISE_HOLD[1]) / (RAISE_IMPACT - RAISE_HOLD[1])))
    _set(p, "arm_R", _arm(theta, -0.12, -1))
    _set(p, "arm_L", _arm(theta, -0.32, 1))
    p["root"][1] = yaw if u >= RAISE_HOLD[1] else 0.0
    p["torso"][0] = -0.12 if u < RAISE_HOLD[1] else 0.45 * min(1.0, (u - RAISE_HOLD[1]) * 4)
    p["head"][0] = -0.25 if u < RAISE_HOLD[1] else 0.05
    p["leg_L"][0] = -0.35
    p["leg_R"][0] = 0.3
    p["leg_L"][2] = -0.08
    p["leg_R"][2] = 0.08
    return p, 0.0, 0.0


def pose_block(t, T):
    p = _blank()
    k = _ease(t / 0.25)
    hit = 0.0
    for h in (0.45, 1.2, 1.8):
        d = t - h
        if 0 <= d < 0.25:
            hit = max(hit, math.sin(d / 0.25 * math.pi))
    _set(p, "arm_R", _arm(1.45 * k - 0.15 * hit, -0.35 * k, -1))
    _set(p, "arm_L", _arm(1.35 * k - 0.15 * hit, -0.45 * k, 1))
    p["torso"][0] = 0.15 * k - 0.15 * hit
    p["head"][0] = 0.1 * k
    p["leg_L"][0] = -0.35 * k
    p["leg_R"][0] = 0.35 * k
    return p, -0.12 * hit, 0.0


def pose_thumbs_up(t, T):
    p, _, _ = pose_idle(t, T)
    k = _ease(t / 0.35)
    bounce = 0.05 * math.sin(2 * math.pi * 1.6 * t) * k
    _set(p, "arm_R", _arm(1.2 * k + bounce, 0.25 * k, -1))
    _set(p, "arm_L", _arm(0.0, -0.05 * k, 1))
    p["arm_L"][0] = 0.0
    _set(p, "arm_L", (0.0, 0.0, 0.35 * k))
    p["head"][2] = 0.12 * k
    p["torso"][1] = -0.12 * k
    return p, 0.0, 0.02 * abs(math.sin(2 * math.pi * 1.6 * t)) * k


def pose_banner(t, T):
    p, _, _ = pose_idle(t, T)
    k = _ease(t / 0.3)
    wave = math.sin(2 * math.pi * 1.1 * t)
    _set(p, "arm_R", _arm((1.45 + 0.35 * wave) * k, 0.25 * k, -1))
    _set(p, "arm_L", _arm(1.3 * k, -0.3 * k, 1))
    p["torso"][2] = -0.08 * wave * k
    p["head"][0] = -0.2 * k
    return p, 0.0, 0.0


ACTIONS = {
    "idle": pose_idle, "walk": pose_walk, "run": pose_run, "jump": pose_jump, "wave": pose_wave,
    "point": pose_point, "punch": pose_punch, "dance": pose_dance, "celebrate": pose_celebrate,
    "fall": pose_fall, "sneak": pose_sneak, "talk": pose_talk, "scared": pose_scared, "sit": pose_sit,
    "summon": pose_summon, "slash": pose_slash, "film": pose_film,
    "charge": pose_charge, "raise_sword": pose_raise_sword, "block": pose_block, "thumbs_up": pose_thumbs_up,
    "banner": pose_banner,
}

ACTION_PROPS = {"slash": "sword", "film": "camera", "summon": "glow", "charge": "sword", "raise_sword": "sword",
                "block": "sword", "banner": "banner"}


def supported_actions():
    return [a for a in castlib.library()["actions"] if a in ACTIONS]


def apply_action(rig, action_name, start_frame, frame_count, step=2, travel=1.0):
    """Keyframe action_name on rig for frame_count frames from start_frame. Unknown actions fall back to idle."""
    fn = ACTIONS.get(action_name if isinstance(action_name, str) else "", pose_idle)
    frame_count = max(1, int(frame_count))
    base = rig.location.copy()
    forward = rig.matrix_world.to_3x3().normalized() @ Vector((0, -1, 0))
    forward.z = 0
    forward = forward.normalized() if forward.length > 1e-6 else Vector((0, -1, 0))
    T = frame_count / FPS
    frames = list(range(0, frame_count, step))
    if frames[-1] != frame_count - 1:
        frames.append(frame_count - 1)
    for i in frames:
        t = i / FPS
        pose, fwd, up = fn(t, T)
        f = start_frame + i
        rig.location = base + forward * (fwd * travel) + Vector((0, 0, up))
        rig.keyframe_insert("location", frame=f)
        for bname in BONE_NAMES:
            pb = rig.pose.bones.get(bname)
            if pb is None:
                continue
            pb.rotation_euler = Euler(pose.get(bname, (0, 0, 0)))
            pb.keyframe_insert("rotation_euler", frame=f)
    rig.location = base
    return rig
